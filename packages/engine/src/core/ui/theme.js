/**
 * Design tokens for every piece of engine UI.
 *
 * ## Why tokens instead of colours in components
 *
 * Before this existed, each component carried its own literals: the button
 * defaulted to `#000` on `#333`, the settings menu to `rgba(12,20,30,0.95)`
 * with `#cfe8ff` labels, and the performance readout to `#00ff00` monospace.
 * Three pieces of engine UI, three unrelated looks, and no way for a game to
 * restyle any of them short of passing colours to every constructor. The
 * readout "not following the UI standard" was really the absence of one.
 *
 * A token is a *named decision*. Components ask for `$color.surface.default`
 * or `$font.size.body`; the theme decides what those are. Restyling a whole
 * game is then one `createTheme({...})` call, and new components inherit the
 * look by construction rather than by the author copying hex codes.
 *
 * ## Referencing tokens
 *
 * Any string beginning with `$` is a dotted path into the theme and is
 * resolved wherever a colour, size, family or weight is accepted — including
 * inside gradient stops (see `painter.js`, which resolves on the way to the
 * renderer so components never call `resolve` themselves).
 *
 *   fillStyle: '$color.accent.default'
 *   fontSize:  '$font.size.heading'
 *
 * Tokens may reference other tokens, which is how the semantic layer
 * (`color.text.primary`) is expressed in terms of the raw ramp
 * (`color.palette.slate.50`). A game overriding one palette entry moves
 * everything built on it.
 *
 * ## Scales, not arbitrary numbers
 *
 * Spacing, radii and type are small ordered sets. That is the point: a menu
 * laid out from a four-step spacing scale looks deliberate, and one laid out
 * from `y: -280, -80, -10, 80` looks like whatever fit at the time.
 */

import { UI_FONT_FAMILY, UI_MONO_FAMILY } from './fonts.js';

/**
 * The engine's default look: cool, near-black surfaces, hairline borders and
 * one restrained accent, so game art stays the brightest thing on screen.
 */
export const DEFAULT_THEME = Object.freeze({
  color: {
    /**
     * The raw ramp. Nothing outside this file should reference it directly —
     * components use the semantic names below, which is what makes a
     * retheme a change of palette rather than a search and replace.
     */
    palette: {
      ink: { 950: '#05080c', 900: '#0a0f16', 800: '#111823', 700: '#1a2430', 600: '#26323f', 500: '#3a4855' },
      slate: { 400: '#5d6f80', 300: '#8499ab', 200: '#aebecd', 100: '#d6e2ec', 50: '#f1f6fa' },
      cyan: { 600: '#0a7fc4', 500: '#1b9ae0', 400: '#45b6f2', 300: '#7cd0ff', 200: '#b3e4ff' },
      green: { 400: '#4fd99b' },
      amber: { 400: '#ffc85c' },
      red: { 400: '#ff6b6b' }
    },

    bg: {
      base: '$color.palette.ink.950',
      /** Dim behind a modal, so the game reads as "behind" rather than "off". */
      scrim: 'rgba(5, 8, 12, 0.74)'
    },

    surface: {
      sunken: 'rgba(255, 255, 255, 0.035)',
      default: 'rgba(17, 24, 35, 0.92)',
      raised: 'rgba(26, 36, 48, 0.95)',
      hover: 'rgba(124, 208, 255, 0.10)',
      active: 'rgba(124, 208, 255, 0.18)',
      selected: 'rgba(27, 154, 224, 0.22)'
    },

    border: {
      subtle: 'rgba(255, 255, 255, 0.07)',
      default: 'rgba(124, 208, 255, 0.20)',
      strong: 'rgba(124, 208, 255, 0.42)',
      focus: '$color.palette.cyan.300'
    },

    text: {
      primary: '$color.palette.slate.50',
      secondary: '$color.palette.slate.200',
      muted: '$color.palette.slate.400',
      inverse: '$color.palette.ink.950',
      accent: '$color.palette.cyan.300'
    },

    accent: {
      default: '$color.palette.cyan.500',
      hover: '$color.palette.cyan.400',
      active: '$color.palette.cyan.600',
      muted: 'rgba(27, 154, 224, 0.18)',
      /** Text drawn *on* an accent fill. */
      contrast: '$color.palette.ink.950'
    },

    status: {
      success: '$color.palette.green.400',
      warning: '$color.palette.amber.400',
      danger: '$color.palette.red.400',
      info: '$color.palette.cyan.300'
    },

    /** Diagnostics read against thresholds, so they get their own names. */
    debug: {
      good: '$color.palette.green.400',
      warn: '$color.palette.amber.400',
      bad: '$color.palette.red.400',
      label: '$color.palette.slate.400',
      value: '$color.palette.slate.100',
      graph: 'rgba(124, 208, 255, 0.55)'
    }
  },

  font: {
    family: UI_FONT_FAMILY,
    mono: UI_MONO_FAMILY,
    /**
     * A ratio-based scale rather than round numbers. Sizes are in UI units,
     * which are display-density independent (see `viewport.js`).
     */
    size: {
      display: '72px',
      title: '44px',
      heading: '28px',
      subheading: '20px',
      body: '16px',
      label: '14px',
      caption: '12px',
      micro: '11px'
    },
    /**
     * Numeric weights, because the vendored face is variable: `'600'` is a
     * real semibold, not the browser smearing a regular toward bold.
     */
    weight: {
      thin: '200',
      light: '300',
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      black: '900'
    },
    style: {
      normal: 'normal',
      italic: 'italic'
    },
    /**
     * Letter spacing, in UI units. Tracked-out uppercase is half of why
     * game UI reads as game UI rather than as a web page; `tight` is for
     * large display type, which needs pulling in rather than opening up.
     */
    tracking: {
      tight: -1,
      none: 0,
      wide: 1.5,
      wider: 3,
      widest: 5
    }
  },

  /** Spacing scale, in UI units. Layout in phase 2 consumes these directly. */
  space: {
    none: 0,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48
  },

  radius: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 14,
    xl: 20,
    /** Larger than any sensible element, so a rect renders as a capsule. */
    pill: 999
  },

  border: {
    hairline: 1,
    thick: 2
  },

  /**
   * Drop shadows, in the shape `drawRect` and friends accept. `null` means
   * no shadow at all, which is cheaper than a transparent one: the Canvas
   * backend routes anything with a shadow through a scratch canvas.
   */
  elevation: {
    none: null,
    low: { color: 'rgba(0, 0, 0, 0.35)', blur: 10, offsetX: 0, offsetY: 3 },
    medium: { color: 'rgba(0, 0, 0, 0.45)', blur: 22, offsetX: 0, offsetY: 8 },
    high: { color: 'rgba(0, 0, 0, 0.55)', blur: 40, offsetX: 0, offsetY: 16 }
  },

  /**
   * Motion tokens. Phase 1 only stores them; the tween driver arrives with
   * the motion system. Durations are seconds, matching engine units.
   */
  motion: {
    duration: {
      instant: 0,
      fast: 0.12,
      normal: 0.22,
      slow: 0.4,
      slower: 0.7
    },
    easing: {
      linear: (t) => t,
      /** General purpose: quick to leave, settles gently. */
      standard: (t) => 1 - Math.pow(1 - t, 3),
      /** Entering the screen. */
      decelerate: (t) => 1 - Math.pow(1 - t, 4),
      /** Leaving the screen. */
      accelerate: (t) => t * t * t,
      /** Both ends eased, for things that move and stop within view. */
      emphasized: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      /** One overshoot, for a press release or a panel landing. */
      overshoot: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2)
    }
  },

  /** Multipliers applied to an element's own opacity. */
  opacity: {
    disabled: 0.38,
    muted: 0.6,
    full: 1
  }
});

/** Deepest chain of `$token` indirections before we call it a cycle. */
const MAX_REF_DEPTH = 8;

/**
 * Resolved design tokens, with the lookups components make on every draw.
 *
 * One instance lives on the game as `game.theme`. Elements reach it through
 * `element.theme`, which walks to the root rather than storing a copy, so a
 * theme swapped at runtime takes effect everywhere on the next frame.
 */
export class Theme {
  /**
   * @param {Object} [overrides] - Partial token tree merged over the default
   */
  constructor(overrides = {}) {
    /** The merged token tree. Treat as read-only. */
    this.tokens = mergeTokens(DEFAULT_THEME, overrides);
    /**
     * Resolution is on the hot path — every draw call of every element — and
     * the answer only changes when the theme does, which is never for a
     * given instance.
     * @type {Map<string, any>}
     */
    this.cache = new Map();
  }

  /**
   * Read a token by dotted path.
   * @param {string} path - e.g. `'color.text.primary'`
   * @param {*} [fallback] - Returned when the path does not exist
   */
  get(path, fallback = undefined) {
    let node = this.tokens;
    for (const key of path.split('.')) {
      if (node == null || typeof node !== 'object') return fallback;
      node = node[key];
    }
    return node === undefined ? fallback : node;
  }

  /**
   * Resolve a value that *may* be a token reference.
   *
   * Anything not a `$`-prefixed string is returned untouched, so a component
   * accepting `'$color.accent.default'` equally accepts `'#ff0000'` and a
   * game can always drop to a literal.
   *
   * @param {*} value
   * @returns {*} The resolved value, or the input unchanged
   */
  resolve(value) {
    if (typeof value !== 'string' || value.charCodeAt(0) !== 36 /* $ */) return value;

    const hit = this.cache.get(value);
    if (hit !== undefined) return hit;

    let current = value;
    let depth = 0;
    while (typeof current === 'string' && current.charCodeAt(0) === 36) {
      if (++depth > MAX_REF_DEPTH) {
        console.warn(`M2D theme: '${value}' does not terminate (cycle?)`);
        current = undefined;
        break;
      }
      current = this.get(current.slice(1));
    }

    if (current === undefined) {
      console.warn(`M2D theme: unknown token '${value}'`);
      current = null;
    }
    this.cache.set(value, current);
    return current;
  }

  /**
   * A new theme with further overrides applied over this one's tokens. Used
   * by a scene or screen that wants a variant without mutating the game's.
   * @param {Object} overrides
   * @returns {Theme}
   */
  extend(overrides) {
    return new Theme(mergeTokens(this.tokens, overrides));
  }
}

/**
 * Build a theme.
 * @param {Object} [overrides] - Partial token tree merged over the default
 * @returns {Theme}
 */
export function createTheme(overrides) {
  return new Theme(overrides);
}

/**
 * Deep-merge token trees. Plain objects merge key by key; everything else —
 * strings, numbers, arrays, the easing functions — replaces wholesale, which
 * is what an override of `elevation.low` or `motion.easing.standard` means.
 */
function mergeTokens(base, overrides) {
  if (!overrides) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    out[key] = isPlainObject(value) && isPlainObject(base?.[key])
      ? mergeTokens(base[key], value)
      : value;
  }
  return out;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Flatten a style declaration for one interaction state.
 *
 * A component declares its look once, with per-state deltas nested under the
 * state name:
 *
 *   { background: '$color.surface.default',
 *     hovered: { background: '$color.surface.hover' },
 *     disabled: { textColor: '$color.text.muted' } }
 *
 * `resolveStateStyle(style, 'hovered')` returns the base with the `hovered`
 * delta applied. States other than the requested one are stripped, so the
 * result is a flat style object a component can read fields off directly.
 *
 * `pressed`, `focused` and `hovered` layer onto each other rather than
 * replacing: a pressed button is still hovered, and should keep whatever the
 * hover state changed unless `pressed` says otherwise.
 *
 * @param {Object} style - Declaration with optional per-state deltas
 * @param {'normal'|'hovered'|'pressed'|'disabled'} state
 * @returns {Object} Flat style
 */
export function resolveStateStyle(style, state) {
  const out = {};
  for (const [key, value] of Object.entries(style)) {
    if (!STATE_KEYS.has(key)) out[key] = value;
  }
  // Disabled is terminal — a disabled control is not also hovered, because
  // the router should not be giving it hover states in the first place.
  const chain = state === 'disabled' ? ['disabled'] : STATE_LAYERS[state] || [];
  for (const layer of chain) Object.assign(out, style[layer]);
  return out;
}

/**
 * Keys in a style declaration that name a state rather than a property.
 *
 * There is no `focused`: a keyboard-selected control renders as hovered,
 * because to a player those mean the same thing. `focused` stays in the set
 * so an old declaration is stripped rather than leaking through as a
 * property named "focused".
 */
const STATE_KEYS = new Set(['normal', 'hovered', 'pressed', 'focused', 'disabled']);

/** Which deltas apply, in order, for each state. */
const STATE_LAYERS = Object.freeze({
  normal: ['normal'],
  hovered: ['normal', 'hovered'],
  pressed: ['normal', 'hovered', 'pressed'],
  disabled: ['disabled']
});
