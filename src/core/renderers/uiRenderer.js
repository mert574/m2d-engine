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

  get width() {
    return this.renderer.width;
  }

  get height() {
    return this.renderer.height;
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
