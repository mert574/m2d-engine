import { BaseRenderer } from '../../src/core/renderers/baseRenderer.js';

/**
 * A renderer backend that records calls instead of rasterizing.
 *
 * Two uses:
 * 1. Verifying that engine/game code emits the correct abstract draw calls
 *    (entity placeholders, health bars, debug overlays, UI widgets).
 * 2. Verifying that UIRenderer forwards to the backend correctly.
 *
 * It deliberately inherits BaseRenderer's real shared logic (hitTest, debug
 * flags, stats, drawAnimation), so those behaviors are exercised for real.
 */
export class RecordingRenderer extends BaseRenderer {
  constructor() {
    super();
    /** @type {Array<{method: string, args: any[]}>} */
    this.calls = [];
    this.width = 800;
    this.height = 600;
    this.cursor = 'default';
    this.destroyed = false;
  }

  #record(method, ...args) {
    this.calls.push({ method, args });
  }

  /** All recorded calls for a method name. */
  callsTo(method) {
    return this.calls.filter(call => call.method === method);
  }

  /** First argument of each recorded call to a method (the options object). */
  optionsFor(method) {
    return this.callsTo(method).map(call => call.args[0]);
  }

  /** Ordered list of method names, for sequencing assertions. */
  sequence() {
    return this.calls.map(call => call.method);
  }

  reset() {
    this.calls = [];
  }

  // === Lifecycle ===
  init(element, options = {}) {
    this.element = element;
    this.width = options.width ?? this.width;
    this.height = options.height ?? this.height;
    this.#record('init', element, options);
  }

  destroy() {
    this.destroyed = true;
    this.#record('destroy');
  }

  resize(width, height) {
    if (width !== undefined) this.width = width;
    if (height !== undefined) this.height = height;
    this.#record('resize', width, height);
  }

  clear(color) { this.#record('clear', color); }
  clearScreen(color) { this.#record('clearScreen', color); }

  // === Frame control ===
  beginFrame() {
    super.beginFrame();
    this.#record('beginFrame');
  }
  endFrame() { this.#record('endFrame'); }
  beginScreenFrame() { this.#record('beginScreenFrame'); }
  endScreenFrame() { this.#record('endScreenFrame'); }
  applyCamera(camera) { this.#record('applyCamera', camera); }

  // === Primitives ===
  drawSprite(options) {
    this.stats.drawCalls++;
    this.stats.spritesDrawn++;
    this.#record('drawSprite', options);
  }

  drawImage(options) {
    this.stats.drawCalls++;
    this.stats.spritesDrawn++;
    this.#record('drawImage', options);
  }

  drawRect(options) {
    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.#record('drawRect', options);
  }

  drawLine(options) {
    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.#record('drawLine', options);
  }

  drawArc(options) {
    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.#record('drawArc', options);
  }

  drawPath(options) {
    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.#record('drawPath', options);
  }

  drawText(options) {
    this.stats.drawCalls++;
    this.stats.textDrawn++;
    this.#record('drawText', options);
  }

  // === Transform & clip ===
  pushTransform(transform) { this.#record('pushTransform', transform); }
  popTransform() { this.#record('popTransform'); }
  pushClip(rect) { this.#record('pushClip', rect); }
  popClip() { this.#record('popClip'); }

  // === Queries ===
  measureText(text, style) {
    this.#record('measureText', text, style);
    // Deterministic stand-in: proportional to length and font size.
    const size = parseInt(style?.fontSize) || 16;
    return { width: String(text).length * size * 0.5, height: size };
  }

  setCursor(style) {
    this.cursor = style;
    this.#record('setCursor', style);
  }
}
