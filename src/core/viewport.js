/**
 * Viewport sizing: the single place that turns a display size into the three
 * independent resolutions the engine renders at.
 *
 * The engine deliberately keeps three sizes apart, because they answer three
 * different questions:
 *
 * 1. **View size** (world units) — *how much world is visible*. A design
 *    decision, fixed by `options.width/height`. Changing the render resolution
 *    must never change it, or lowering resolution would zoom the camera out and
 *    reveal whatever lies past the edge of the map.
 * 2. **World surface** (pixels) — *how many pixels that view is rasterized
 *    into*. This is the resolution setting: a pure fidelity/performance knob.
 *    The surface is upscaled to the content rect when it is presented.
 * 3. **UI space** (UI units, rasterized at native pixels) — the screen-space
 *    layer. It is always drawn at the display's full pixel density, so the HUD
 *    stays sharp no matter how low the world resolution is, and it always fills
 *    the screen so an element anchored right sits at the real right edge.
 *
 * ## Aspect ratio
 *
 * Only an aspect-ratio change can alter how much world is visible, and the
 * choice belongs to the game:
 *
 * - `'letterbox'` (default) — the view keeps its designed aspect and is
 *   centred with bars. Nothing beyond the designed view is ever revealed.
 * - `'expand'` — the view grows along the wide axis to fill the display, at the
 *   same scale. More world becomes visible, which suits games whose maps and
 *   parallax can take it.
 *
 * The UI layer fills the display in both modes.
 *
 * ## UI space
 *
 * `uiScale` is a *fit* scale: the design box always fits inside UI space, and
 * the surplus extends along the wide axis. So UI space is at least
 * design-sized, anchored elements reach the true screen edges, and a
 * design-aspect box centred in UI space is always fully on screen.
 */

/** Hard ceiling on device pixel ratio; past this the cost buys no visible sharpness. */
export const MAX_PIXEL_RATIO = 3;

/** @typedef {'letterbox'|'expand'} AspectMode */

/**
 * The computed sizes for one display configuration. Plain data: renderers
 * consume it, nothing mutates it.
 *
 * @typedef {Object} Viewport
 * @property {number} backingWidth - Canvas backing-store width in device pixels
 * @property {number} backingHeight - Canvas backing-store height in device pixels
 * @property {number} pixelRatio - Device pixels per CSS pixel, capped
 * @property {number} viewWidth - Visible world width in world units
 * @property {number} viewHeight - Visible world height in world units
 * @property {number} worldWidth - World render-surface width in pixels
 * @property {number} worldHeight - World render-surface height in pixels
 * @property {number} worldScale - World surface pixels per world unit
 * @property {number} contentX - Left edge of the presented world, in backing pixels
 * @property {number} contentY - Top edge of the presented world, in backing pixels
 * @property {number} contentWidth - Presented world width, in backing pixels
 * @property {number} contentHeight - Presented world height, in backing pixels
 * @property {number} uiWidth - UI coordinate-space width in UI units
 * @property {number} uiHeight - UI coordinate-space height in UI units
 * @property {number} uiScale - Backing pixels per UI unit
 */

/**
 * Resolve the resolution setting into world-surface pixels per world unit.
 *
 * @param {'native'|number|{width?: number, height: number}} resolution
 * @param {number} designHeight - Reference height in world units
 * @param {number} nativeScale - Scale that makes the surface match its presented size
 * @returns {number} World surface pixels per world unit
 */
function resolveWorldScale(resolution, designHeight, nativeScale) {
  if (resolution === 'native' || resolution == null) return nativeScale;
  if (typeof resolution === 'number') return resolution;
  if (typeof resolution === 'object' && resolution.height > 0) {
    return resolution.height / designHeight;
  }
  return nativeScale;
}

/**
 * Compute every size the renderers need from the current display state.
 *
 * @param {Object} params
 * @param {number} params.displayWidth - Canvas CSS width
 * @param {number} params.displayHeight - Canvas CSS height
 * @param {number} params.designWidth - Reference view width in world units
 * @param {number} params.designHeight - Reference view height in world units
 * @param {number} [params.pixelRatio=1] - Raw device pixel ratio; capped internally
 * @param {AspectMode} [params.aspectMode='letterbox'] - Behaviour when the display aspect differs
 * @param {'native'|number|{height: number}} [params.resolution='native'] - World render resolution
 * @param {number} [params.maxPixelRatio=MAX_PIXEL_RATIO] - Ceiling on pixel ratio
 * @returns {Viewport} The resolved sizes
 */
export function computeViewport({
  displayWidth,
  displayHeight,
  designWidth,
  designHeight,
  pixelRatio = 1,
  aspectMode = 'letterbox',
  resolution = 'native',
  maxPixelRatio = MAX_PIXEL_RATIO
}) {
  // A detached or display:none canvas reports zero; fall back to the design
  // size so the engine still has a coherent viewport to render into.
  const cssWidth = displayWidth > 0 ? displayWidth : designWidth;
  const cssHeight = displayHeight > 0 ? displayHeight : designHeight;

  const ratio = Math.min(Math.max(pixelRatio || 1, 1), maxPixelRatio);
  const backingWidth = Math.max(1, Math.round(cssWidth * ratio));
  const backingHeight = Math.max(1, Math.round(cssHeight * ratio));

  // Fit scale: the design box always fits, surplus extends the wide axis.
  const uiScale = Math.min(backingWidth / designWidth, backingHeight / designHeight);
  const uiWidth = backingWidth / uiScale;
  const uiHeight = backingHeight / uiScale;

  const expand = aspectMode === 'expand';
  const viewWidth = expand ? uiWidth : designWidth;
  const viewHeight = expand ? uiHeight : designHeight;

  // Where the world lands on screen: the whole surface when expanded,
  // otherwise the design-aspect box centred inside it.
  const contentWidth = expand ? backingWidth : designWidth * uiScale;
  const contentHeight = expand ? backingHeight : designHeight * uiScale;
  const contentX = (backingWidth - contentWidth) / 2;
  const contentY = (backingHeight - contentHeight) / 2;

  // 'native' means one world pixel per presented pixel — no resampling.
  const nativeScale = contentHeight / viewHeight;
  const worldScale = Math.max(resolveWorldScale(resolution, designHeight, nativeScale), 0.01);

  return {
    backingWidth,
    backingHeight,
    pixelRatio: ratio,
    viewWidth,
    viewHeight,
    worldWidth: Math.max(1, Math.round(viewWidth * worldScale)),
    worldHeight: Math.max(1, Math.round(viewHeight * worldScale)),
    worldScale,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    uiWidth,
    uiHeight,
    uiScale
  };
}

/**
 * Whether two resolution settings mean the same thing.
 *
 * Settings are often object literals (`{width, height}`), so identity
 * comparison never matches a value that was set earlier — anything cycling
 * through presets (the settings menu, a hotkey) needs structural equality.
 * `'native'` and `null`/`undefined` are the same setting; see
 * `resolveWorldScale`.
 *
 * @param {'native'|number|{width?: number, height: number}|null} a
 * @param {'native'|number|{width?: number, height: number}|null} b
 * @returns {boolean}
 */
export function sameResolution(a, b) {
  const nativeA = a === 'native' || a == null;
  const nativeB = b === 'native' || b == null;
  if (nativeA || nativeB) return nativeA && nativeB;
  if (typeof a === 'object' && typeof b === 'object') {
    return a.width === b.width && a.height === b.height;
  }
  return a === b;
}

/**
 * A viewport with no scaling anywhere: view, world surface, UI and backing
 * store all the same size. This is what the bare `renderer.resize(w, h)`
 * contract means, and the baseline the conformance suite tests against.
 *
 * @param {number} width - Size in pixels, used for every layer
 * @param {number} height - Size in pixels, used for every layer
 * @returns {Viewport} An unscaled viewport
 */
export function identityViewport(width, height) {
  return {
    backingWidth: width,
    backingHeight: height,
    pixelRatio: 1,
    viewWidth: width,
    viewHeight: height,
    worldWidth: width,
    worldHeight: height,
    worldScale: 1,
    contentX: 0,
    contentY: 0,
    contentWidth: width,
    contentHeight: height,
    uiWidth: width,
    uiHeight: height,
    uiScale: 1
  };
}

/**
 * Whether two viewports describe the same sizing.
 *
 * Used to drop no-op resizes. That matters for more than efficiency: the
 * engine sets `canvas.width`/`height` from the element's measured size, and
 * if a page lets the canvas size itself from those attributes, acting on an
 * unchanged measurement would feed the ResizeObserver back into itself.
 *
 * @param {Viewport|null} a
 * @param {Viewport|null} b
 * @returns {boolean} True when every field matches
 */
export function sameViewport(a, b) {
  if (!a || !b) return false;
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Map a point in view space — world units, origin at the view's top-left
 * corner, the space `camera.worldToScreen` returns — into UI coordinates.
 *
 * This is the inverse of the `view` mapping in `mapPointer`: pointer input
 * travels UI -> view -> world, and world-anchored screen content (a label
 * pinned to an entity, a marker over a world object) travels world -> view ->
 * UI through here. Going through the content rect matters: in letterbox mode
 * the view does not start at the UI origin, and a naive 1:1 copy would park
 * every label one bar-width away from its entity.
 *
 * @param {Object} params
 * @param {number} params.x - View-space X in world units
 * @param {number} params.y - View-space Y in world units
 * @param {Viewport} params.viewport - Current viewport
 * @returns {{x: number, y: number}} The same point in UI units
 */
export function viewToUI({ x, y, viewport }) {
  return {
    x: (viewport.contentX + x * (viewport.contentWidth / viewport.viewWidth)) / viewport.uiScale,
    y: (viewport.contentY + y * (viewport.contentHeight / viewport.viewHeight)) / viewport.uiScale
  };
}

/**
 * Map a pointer event's client coordinates into UI space and world-view space.
 *
 * The canvas is letterboxed by CSS (`object-fit: contain`), so its bounding
 * rect can be larger than the pixels actually drawn; mapping through the rect
 * alone misplaces clicks near the edges. This resolves the drawn area first,
 * then converts.
 *
 * @param {Object} params
 * @param {number} params.clientX - Pointer X in client coordinates
 * @param {number} params.clientY - Pointer Y in client coordinates
 * @param {DOMRect|{left: number, top: number, width: number, height: number}} params.rect - Canvas bounding rect
 * @param {Viewport} params.viewport - Current viewport
 * @returns {{ui: {x: number, y: number}, view: {x: number, y: number}, inContent: boolean}}
 *   `ui` is in UI units, `view` is in world units relative to the view's top-left
 *   corner (feed it to `camera.screenToWorld`), and `inContent` is false when the
 *   pointer is over a letterbox bar.
 */
export function mapPointer({ clientX, clientY, rect, viewport }) {
  // CSS pixels -> backing pixels. The canvas is presented into its rect
  // preserving aspect (object-fit: contain), so resolve that box first.
  const rectAspect = rect.width / rect.height;
  const backingAspect = viewport.backingWidth / viewport.backingHeight;
  const presentedWidth = rectAspect > backingAspect ? rect.height * backingAspect : rect.width;
  const presentedHeight = rectAspect > backingAspect ? rect.height : rect.width / backingAspect;
  const presentedX = rect.left + (rect.width - presentedWidth) / 2;
  const presentedY = rect.top + (rect.height - presentedHeight) / 2;

  const scale = viewport.backingWidth / presentedWidth;
  const backingX = (clientX - presentedX) * scale;
  const backingY = (clientY - presentedY) * scale;

  const inContent =
    backingX >= viewport.contentX &&
    backingX <= viewport.contentX + viewport.contentWidth &&
    backingY >= viewport.contentY &&
    backingY <= viewport.contentY + viewport.contentHeight;

  return {
    ui: {
      x: backingX / viewport.uiScale,
      y: backingY / viewport.uiScale
    },
    view: {
      x: (backingX - viewport.contentX) / viewport.contentWidth * viewport.viewWidth,
      y: (backingY - viewport.contentY) / viewport.contentHeight * viewport.viewHeight
    },
    inContent
  };
}
