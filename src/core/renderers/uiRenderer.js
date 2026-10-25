/**
 * Screen-space (UI) view over a renderer backend.
 *
 * Wraps any BaseRenderer and forwards draw calls with `isScreenSpace: true`,
 * so UI code never needs to know which backend is in use. Backends only have
 * to implement BaseRenderer; the UI layer comes for free.
 */
export class UIRenderer {
  /**
   * @param {import('./baseRenderer.js').BaseRenderer} renderer - Backend renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * Width of the UI coordinate space, in UI units.
   *
   * This is *not* the renderer's world size and *not* a pixel count. UI space
   * always covers the whole display, so this grows and shrinks with the
   * display's aspect ratio while the height stays put — which is what lets an
   * element anchored to the right edge sit at the real right edge. UI is
   * rasterized at the display's full pixel density regardless of the world's
   * render resolution, so it stays sharp. See `viewport.js`.
   * @type {number}
   */
  get width() {
    return this.renderer.viewport.uiWidth;
  }

  /**
   * Height of the UI coordinate space, in UI units. Fixed at the design
   * height, so UI layout is stable as the window changes.
   * @type {number}
   */
  get height() {
    return this.renderer.viewport.uiHeight;
  }

  /** Optional features of the backing renderer. @type {Record<string, boolean>} */
  get capabilities() {
    return this.renderer.capabilities;
  }

  /**
   * Whether the backing renderer supports an optional feature.
   * @param {string} feature - Capability name
   * @returns {boolean} Whether the backend implements it
   */
  supports(feature) {
    return this.renderer.supports(feature);
  }

  /**
   * Clear the presented surface (e.g. to paint a full-screen menu background).
   * @param {string} [color] - Background colour; transparent clear if omitted
   */
  clear(color) {
    this.renderer.clear(color);
  }

  beginFrame() {
    this.renderer.beginScreenFrame();
  }

  endFrame() {
    this.renderer.endScreenFrame();
  }

  drawRect(options) {
    this.renderer.drawRect({ ...options, isScreenSpace: true });
  }

  drawText(options) {
    this.renderer.drawText({ ...options, isScreenSpace: true });
  }

  drawImage(options) {
    this.renderer.drawImage({ ...options, isScreenSpace: true });
  }

  drawSprite(options) {
    this.renderer.drawSprite({ ...options, isScreenSpace: true });
  }

  drawParticles(options) {
    this.renderer.drawParticles({ ...options, isScreenSpace: true });
  }

  drawLine(options) {
    this.renderer.drawLine({ ...options, isScreenSpace: true });
  }

  drawArc(options) {
    this.renderer.drawArc({ ...options, isScreenSpace: true });
  }

  drawPath(options) {
    this.renderer.drawPath({ ...options, isScreenSpace: true });
  }

  pushTransform(transform = {}) {
    this.renderer.pushTransform({ ...transform, isScreenSpace: true });
  }

  popTransform() {
    this.renderer.popTransform();
  }

  pushClip(rect) {
    this.renderer.pushClip({ ...rect, isScreenSpace: true });
  }

  popClip() {
    this.renderer.popClip();
  }

  measureText(text, style) {
    return this.renderer.measureText(text, style);
  }

  hitTest(x, y, shape) {
    return this.renderer.hitTest(x, y, shape);
  }

  setCursor(style) {
    this.renderer.setCursor(style);
  }
}
