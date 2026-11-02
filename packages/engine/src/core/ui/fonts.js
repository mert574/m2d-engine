/**
 * The engine's UI typeface.
 *
 * ## Why the engine ships a font at all
 *
 * `system-ui` is whatever the player's OS picked for dialog boxes. It is a
 * different face on every machine, it carries no weight range worth using,
 * and a menu set in it reads as a web page rather than as a game. A game
 * engine that wants its menus to look designed has to bring its own type, so
 * this one vendors Exo (SIL OFL 1.1) as a variable font covering weights
 * 100-900 in upright and italic. See `THIRD_PARTY_NOTICES.md`.
 *
 * ## Why loading is a gate and not fire-and-forget
 *
 * Both backends rasterize text through the browser, and the WebGL backend
 * caches the result as a texture keyed by the text and its style
 * (`renderers/webgl/textLabels.js`). A label drawn before the font arrives is
 * rasterized in the fallback face *and cached that way*, so it never
 * corrects itself — the menu stays in the wrong font until the cache is
 * evicted. `M2D.start()` therefore awaits `loadUIFonts()` before the first
 * frame, and `drawText` callers need not think about it again.
 *
 * ## Lifetime
 *
 * Faces are added to `document.fonts` once per page and deliberately not
 * removed by `game.destroy()`. Unlike a listener, a font face is immutable
 * shared state: a second engine instance on the same page wants the same
 * faces, and removing them underneath it would re-trigger the problem above.
 * The load is memoized, so constructing ten games fetches nothing extra.
 */

/** Family name UI text is set in. Fallbacks cover the pre-load frame. */
export const UI_FONT_FAMILY = "Exo, system-ui, sans-serif";

/**
 * Family for readouts that must align in columns — the debug panel, the
 * developer console. Deliberately a system stack: a vendored mono would
 * double the font payload to set text the player mostly does not see.
 */
export const UI_MONO_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/**
 * The vendored subsets. Latin and Latin Extended only: they cover every
 * language the engine's own strings use and every Western European locale a
 * game is likely to ship, at a quarter the size of the full face. The ranges
 * are Google Fonts' own, so a glyph outside them falls back per-character
 * rather than switching the whole run.
 */
const SUBSETS = [
  {
    file: 'exo-latin.woff2',
    style: 'normal',
    unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, ' +
      'U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, ' +
      'U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
  },
  {
    file: 'exo-latin-ext.woff2',
    style: 'normal',
    unicodeRange: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, ' +
      'U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, ' +
      'U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF'
  },
  {
    file: 'exo-italic-latin.woff2',
    style: 'italic',
    unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, ' +
      'U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, ' +
      'U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
  },
  {
    file: 'exo-italic-latin-ext.woff2',
    style: 'italic',
    unicodeRange: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, ' +
      'U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, ' +
      'U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF'
  }
];

/** Memoized result, so repeated calls share one fetch. @type {Promise|null} */
let pending = null;

/**
 * Load the UI typeface, once per page.
 *
 * Resolves on environments without a document (the node test suite) and on
 * failure: a missing font is a cosmetic problem, and a game that refuses to
 * start because a woff2 404'd is a worse one. Check the resolved value when
 * the distinction matters.
 *
 * @returns {Promise<{loaded: boolean, reason?: string}>}
 */
export function loadUIFonts() {
  if (pending) return pending;

  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    pending = Promise.resolve({ loaded: false, reason: 'no document' });
    return pending;
  }

  pending = Promise.all(SUBSETS.map(async (subset) => {
    // Resolved against this module rather than the page, so the engine works
    // from a subdirectory, from a CDN and through a bundler — Vite and
    // Rollup both rewrite `new URL(..., import.meta.url)` into an emitted
    // asset. A string path would break in all three.
    const url = new URL(`./fonts/${subset.file}`, import.meta.url).href;
    const face = new FontFace('Exo', `url(${url}) format('woff2')`, {
      // One variable face per subset covers the whole weight range, so
      // `fontWeight: 600` is a real weight and not a synthesized smear.
      weight: '100 900',
      style: subset.style,
      unicodeRange: subset.unicodeRange,
      display: 'swap'
    });
    await face.load();
    document.fonts.add(face);
  }))
    .then(() => ({ loaded: true }))
    .catch((error) => {
      console.warn(`M2D: UI font unavailable (${error.message}); falling back to system-ui`);
      return { loaded: false, reason: error.message };
    });

  return pending;
}

/**
 * Whether the face is available right now, without waiting.
 * @returns {boolean}
 */
export function uiFontsReady() {
  if (typeof document === 'undefined' || !document.fonts?.check) return false;
  return document.fonts.check('16px Exo');
}
