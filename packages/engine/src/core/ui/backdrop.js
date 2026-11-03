import { UIElement } from './uiElement.js';

/**
 * The thing a menu sits on.
 *
 * ## Why a flat rectangle was the problem
 *
 * Every demo menu was one `fill: true` rect in a single colour with text on
 * top. That is the single biggest reason they read as a web page rather than
 * as a game: a real main menu has depth behind the type — a graded sky, a
 * drifting still, motes in the air, darkness closing in at the corners —
 * and none of it needs to be expensive or bespoke.
 *
 * A backdrop composes those layers, drawn back to front, all of them
 * optional:
 *
 *   1. `image` — a still, drifting slowly (a Ken Burns move)
 *   2. `gradient` — a graded wash, the cheapest possible depth
 *   3. `layers` — anything the game draws itself: a skyline, a radar sweep,
 *      a simulation. This is where a menu stops being a colour scheme and
 *      starts being a place
 *   4. `motes` — slow particles, so the frame is never completely static
 *   5. `scanlines` — a fine horizontal grille
 *   6. `vignette` — darkness at the edges, pulling the eye to the middle
 *
 * ## Why custom layers are objects, not a subclass
 *
 * The built-in layers are private so the drawing order stays fixed; a
 * subclass that overrode `draw` would have to redo all of them to add one.
 * A layer is instead a small object with `draw(paint, frame)` and an
 * optional `update(deltaTime, frame)`, or a bare function for the common
 * case of something stateless. It draws through the backdrop's painter, so
 * tokens resolve and it fades with the screen like everything else.
 *
 * ## Why it is not a shader
 *
 * All of it is drawn through the ordinary renderer contract — gradient
 * descriptors, arcs, lines — so it looks identical on both backends and
 * needs no capability. The world's post-effect blur is the only part of
 * phase 3 that is backend-dependent, and that applies to the *game* behind
 * a modal rather than to a menu's own background.
 *
 * Everything is sized against live UI space every frame, because UI space
 * grows with the aspect ratio and no fixed rectangle can be relied on to
 * cover it.
 */

/**
 * @typedef {Object} BackdropLayer
 * @property {(paint: import('./painter.js').UIPainter, frame: BackdropFrame) => void} [draw]
 * @property {(deltaTime: number, frame: BackdropFrame) => void} [update]
 */

/**
 * @typedef {Object} BackdropFrame
 * @property {number} width - Live UI width, in UI units
 * @property {number} height - Live UI height, in UI units
 * @property {number} elapsed - Seconds since the backdrop appeared
 */

/** Motes are decorative; past this many the menu is paying for nothing. */
const MAX_MOTES = 240;

export class UIBackdrop extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {Object|string|null} [options.gradient] - A gradient descriptor,
   *   a flat colour, or `{from, to, angle}` as a shorthand. Defaults to a
   *   wash from `$color.bg.base`
   * @param {CanvasImageSource|null} [options.image] - A still behind the
   *   gradient's transparency
   * @param {number} [options.imageOpacity=1]
   * @param {boolean} [options.drift=true] - Slowly pan and zoom the image
   * @param {number} [options.driftScale=1.08] - How far the zoom reaches
   * @param {number} [options.driftPeriod=24] - Seconds for one full cycle
   * @param {Array<BackdropLayer|Function>} [options.layers=[]] - Custom
   *   layers drawn between the gradient and the motes, in order. A function
   *   is treated as a `draw`
   * @param {number} [options.motes=0] - How many drifting particles
   * @param {string} [options.moteColor='$color.text.accent']
   * @param {number} [options.scanlines=0] - Opacity of the grille, 0 for none
   * @param {number} [options.vignette=0] - Strength of the edge darkening
   * @param {number} [options.seed=1] - Fixes the mote layout, so a menu looks
   *   the same every time it is opened
   */
  constructor(options = {}) {
    super({ pivot: 'top-left', ...options });

    this.gradient = options.gradient === undefined
      ? { from: '$color.bg.base', to: '$color.palette.ink.800', angle: 90 }
      : options.gradient;
    this.image = options.image ?? null;
    this.imageOpacity = options.imageOpacity ?? 1;
    this.drift = options.drift ?? true;
    this.driftScale = options.driftScale ?? 1.08;
    this.driftPeriod = options.driftPeriod ?? 24;
    this.moteColor = options.moteColor ?? '$color.text.accent';
    this.scanlines = options.scanlines ?? 0;
    this.vignette = options.vignette ?? 0;
    this.layers = (options.layers ?? []).map((layer) =>
      typeof layer === 'function' ? { draw: layer } : layer
    );

    /** Seconds since the backdrop appeared, driving the drift and the motes. */
    this.elapsed = 0;

    this.motes = [];
    this.#seedMotes(Math.min(MAX_MOTES, options.motes ?? 0), options.seed ?? 1);
  }

  /** A backdrop is the whole display, whatever the aspect ratio. */
  get frame() {
    const ui = this.game?.uiRenderer;
    if (!ui) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: 0, y: 0, width: ui.width, height: ui.height };
  }

  /** Decorative, and behind everything: never a hit target. */
  contains() {
    return false;
  }

  /**
   * Lay the motes out once from a fixed seed, in normalized coordinates so
   * the field survives a resize without reshuffling.
   */
  #seedMotes(count, seed) {
    // A small deterministic generator: a menu that reshuffles its motes
    // every time it opens looks like a glitch rather than a place.
    let state = seed >>> 0 || 1;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };

    this.motes = Array.from({ length: count }, () => ({
      x: random(),
      y: random(),
      radius: 0.6 + random() * 1.8,
      speed: 0.004 + random() * 0.012,
      drift: (random() - 0.5) * 0.01,
      alpha: 0.12 + random() * 0.35,
      phase: random() * Math.PI * 2
    }));
  }

  update(deltaTime) {
    this.elapsed += deltaTime;
    if (this.layers.length > 0) {
      const frame = this.#layerFrame();
      for (const layer of this.layers) layer.update?.(deltaTime, frame);
    }
    for (const mote of this.motes) {
      // Upward, wrapping. Normalized, so the field is aspect-independent.
      mote.y -= mote.speed * deltaTime;
      if (mote.y < -0.02) {
        mote.y = 1.02;
        mote.x = (mote.x + 0.37) % 1;
      }
    }
  }

  draw() {
    if (!this.game) return;
    const { width, height } = this.frame;
    if (!(width > 0) || !(height > 0)) return;

    this.#drawImage(width, height);
    this.#drawGradient(width, height);
    this.#drawLayers();
    this.#drawMotes(width, height);
    this.#drawScanlines(width, height);
    this.#drawVignette(width, height);
  }

  /**
   * What a custom layer is told about the frame it draws into. Built once
   * per call so a layer can hold on to it without seeing it change.
   */
  #layerFrame() {
    const { width, height } = this.frame;
    return { width, height, elapsed: this.elapsed };
  }

  #drawLayers() {
    if (this.layers.length === 0) return;
    const frame = this.#layerFrame();
    for (const layer of this.layers) layer.draw?.(this.paint, frame);
  }

  #drawGradient(width, height) {
    const style = this.#gradientStyle(width, height);
    if (!style) return;
    this.paint.drawRect({ x: 0, y: 0, width, height, fillStyle: style });
  }

  /** Expand the `{from, to, angle}` shorthand into a gradient descriptor. */
  #gradientStyle(width, height) {
    const value = this.gradient;
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value.type) return value;
    if (!value.from && !value.to) return null;

    const radians = ((value.angle ?? 90) * Math.PI) / 180;
    const halfX = (Math.cos(radians) * width) / 2;
    const halfY = (Math.sin(radians) * height) / 2;
    return {
      type: 'linear',
      x0: width / 2 - halfX,
      y0: height / 2 - halfY,
      x1: width / 2 + halfX,
      y1: height / 2 + halfY,
      stops: [
        { offset: 0, color: value.from ?? 'rgba(0,0,0,0)' },
        { offset: 1, color: value.to ?? 'rgba(0,0,0,0)' }
      ]
    };
  }

  /**
   * The still, oversized and slowly moving. The overscan is what lets it
   * pan without ever revealing an edge.
   */
  #drawImage(width, height) {
    if (!this.image) return;

    // Always oversized by `driftScale`, with a gentle zoom on top of that.
    // The pan is then expressed as a fraction of the *current* overscan,
    // which is what guarantees an edge can never come into view — sizing
    // the pan against the maximum scale instead lets the image slide off
    // its own margin at the bottom of the zoom.
    let scale = this.driftScale;
    let offsetX = 0;
    let offsetY = 0;

    if (this.drift && this.driftPeriod > 0) {
      // A cosine, so the move eases at both ends of its travel rather than
      // snapping back when the cycle wraps.
      const phase = (this.elapsed / this.driftPeriod) * Math.PI * 2;
      const zoom = (1 - Math.cos(phase)) / 2;
      scale = this.driftScale * (1 + 0.05 * zoom);

      const overscanX = (width * scale - width) / 2;
      const overscanY = (height * scale - height) / 2;
      // Four fifths of the available margin: enough travel to read as
      // movement, with room left over so rounding never bites.
      offsetX = Math.sin(phase) * overscanX * 0.8;
      offsetY = Math.cos(phase * 0.7) * overscanY * 0.8;
    }

    const drawWidth = width * scale;
    const drawHeight = height * scale;
    this.paint.drawImage({
      image: this.image,
      x: (width - drawWidth) / 2 + offsetX,
      y: (height - drawHeight) / 2 + offsetY,
      width: drawWidth,
      height: drawHeight,
      ...(this.imageOpacity < 1 ? { globalAlpha: this.imageOpacity } : {})
    });
  }

  #drawMotes(width, height) {
    if (this.motes.length === 0) return;
    for (const mote of this.motes) {
      // A slow sine on the alpha, so the field breathes instead of sitting
      // there as a fixed pattern of dots.
      const twinkle = 0.65 + 0.35 * Math.sin(this.elapsed * 0.8 + mote.phase);
      this.paint.drawArc({
        x: (mote.x + Math.sin(this.elapsed * 0.3 + mote.phase) * mote.drift) * width,
        y: mote.y * height,
        radius: mote.radius,
        fillStyle: this.moteColor,
        globalAlpha: mote.alpha * twinkle
      });
    }
  }

  #drawScanlines(width, height) {
    if (!(this.scanlines > 0)) return;
    // Every third row: dense enough to read as a grille, sparse enough that
    // it is a few dozen lines rather than a few hundred.
    for (let y = 0; y < height; y += 3) {
      this.paint.drawLine({
        x1: 0, y1: y, x2: width, y2: y,
        strokeStyle: '$color.bg.base',
        lineWidth: 1,
        globalAlpha: this.scanlines
      });
    }
  }

  #drawVignette(width, height) {
    if (!(this.vignette > 0)) return;
    const radius = Math.max(width, height) * 0.75;
    this.paint.drawRect({
      x: 0, y: 0, width, height,
      fillStyle: {
        type: 'radial',
        x: width / 2,
        y: height / 2,
        r0: radius * 0.45,
        r1: radius,
        stops: [
          { offset: 0, color: 'rgba(0, 0, 0, 0)' },
          { offset: 1, color: `rgba(0, 0, 0, ${Math.min(1, this.vignette)})` }
        ]
      }
    });
  }
}
