import { UIElement } from './uiElement.js';

/**
 * The frame-rate and draw-call readout.
 *
 * ## Why it looks like the rest of the UI now
 *
 * This used to be one line of `#00ff00` monospace with `·` separators,
 * pasted across the bottom of the screen. It was the only piece of engine
 * UI that did not sit on a surface, did not use the theme's type, and did
 * not agree with the settings menu about what a panel looks like — which is
 * exactly what "the debug line does not follow the UI standard" meant. It
 * now reads from the same tokens as everything else, so restyling the game
 * restyles the readout.
 *
 * ## Two sizes
 *
 * Collapsed, it is a pill with the only two numbers that matter while you
 * are playing: frame rate and frame time. Expanded, it adds the counters the
 * renderer tracks and a frame-time trace, which is what you want while you
 * are optimizing and emphatically not what you want behind a boss fight.
 *
 * A hotkey to toggle between them, and a home outside the scene's own UI
 * container, arrive with the debug layer.
 */

/** Frame rates above and below which the readout changes colour. */
const FPS_GOOD = 55;
const FPS_FAIR = 30;

/** Rows shown when expanded: label, and how to read it off the stats. */
const DETAIL_ROWS = [
  ['primitives', (s) => s.primitives],
  ['draw calls', (s) => s.drawCalls],
  ['per call', (s) => (s.drawCalls > 0 ? (s.primitives / s.drawCalls).toFixed(1) : '0.0')],
  ['state chg', (s) => s.stateChanges],
  ['sprites', (s) => s.spritesDrawn],
  ['text', (s) => s.textDrawn],
  ['shapes', (s) => s.shapesDrawn]
];

/**
 * Rows for a 3D renderer, whose counts the GPU decides: instances
 * submitted, drawn after culling, shadow casters, triangles drawn, and
 * the GPU's own frame time where the adapter reports it.
 */
const DETAIL_ROWS_3D = [
  ['instances', (s) => s.instances],
  ['drawn', (s) => s.drawn],
  ['casters', (s) => s.casters],
  ['triangles', (s) => s.triangles],
  ['draw calls', (s) => s.drawCalls],
  ['state chg', (s) => s.stateChanges],
  ['gpu', (s) => (s.gpuMs > 0 ? `${s.gpuMs.toFixed(2)} ms` : '—')]
];

export class PerformanceStats extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {boolean} [options.expanded=false] - Show the full counter list
   * @param {boolean} [options.graph=true] - Draw the frame-time trace when
   *   expanded
   */
  constructor(options = {}) {
    super({ pivot: 'top-left', ...options });
    this.expanded = options.expanded ?? false;
    this.graph = options.graph ?? true;

    /** Geometry, in UI units. Not themed: this is a fixed-pitch readout. */
    this.lineHeight = 15;
    this.labelWidth = 78;
    this.panelWidth = 168;
    this.graphHeight = 28;
  }

  /** Toggle between the pill and the full list. */
  toggle() {
    this.expanded = !this.expanded;
    return this.expanded;
  }

  /** Height the panel needs at the current size. */
  /** The rows for the renderer in use: a 3D renderer counts differently. */
  get rows() {
    return this.game?.renderer?.dimensions === 3 ? DETAIL_ROWS_3D : DETAIL_ROWS;
  }

  get panelHeight() {
    if (!this.expanded) return 24;
    const rows = 1 + this.rows.length;
    return 10 + rows * this.lineHeight + (this.graph ? this.graphHeight + 8 : 0) + 6;
  }

  update() {
    // Keep the box current so the element can be anchored, nested and — once
    // layout lands — measured like anything else.
    this.width = this.panelWidth;
    this.height = this.panelHeight;
  }

  draw() {
    if (!this.game || !this.visible) return;
    this.update();

    const renderer = this.game.renderer;
    const fps = renderer.getFPS();
    const frame = this.frame;

    this.paint.drawRect({
      ...frame,
      fillStyle: '$color.surface.default',
      strokeStyle: '$color.border.subtle',
      lineWidth: '$border.hairline',
      cornerRadius: this.expanded ? '$radius.md' : '$radius.pill'
    });

    const left = frame.x + 10;
    let y = frame.y + (this.expanded ? 8 : 5);

    this.#row(left, y, 'fps', `${fps}`, fpsColour(fps));
    this.#value(frame.x + frame.width - 10, y, `${frameMs(fps)} ms`, '$color.debug.label', 'right');
    y += this.lineHeight;

    if (!this.expanded) return;

    const stats = renderer.getStats();
    for (const [label, read] of this.rows) {
      this.#row(left, y, label, format(read(stats)), '$color.debug.value');
      y += this.lineHeight;
    }

    if (this.graph) this.#drawGraph(left, y + 4, frame.width - 20, this.graphHeight);
  }

  /** One `label   value` line. */
  #row(x, y, label, value, valueColour) {
    this.#value(x, y, label, '$color.debug.label', 'left');
    this.#value(x + this.labelWidth, y, value, valueColour, 'left');
  }

  #value(x, y, text, fillStyle, textAlign) {
    this.paint.drawText({
      text,
      x,
      y,
      fillStyle,
      fontSize: '$font.size.micro',
      fontFamily: this.theme?.get('font.mono'),
      textAlign,
      textBaseline: 'top'
    });
  }

  /**
   * The frame-rate trace. Drawn against a fixed ceiling rather than the
   * window's own maximum, so a dip is a dip and not a rescaled flat line.
   */
  #drawGraph(x, y, width, height) {
    const history = this.game.renderer.getFPSHistory();
    if (!history?.length) return;

    const ceiling = 120;
    const step = width / (history.length - 1);
    const points = history.map((value, index) => ({
      x: x + index * step,
      y: y + height - Math.min(value, ceiling) / ceiling * height
    }));

    this.paint.drawRect({
      x, y, width, height,
      fillStyle: '$color.surface.sunken',
      cornerRadius: '$radius.sm'
    });
    this.paint.drawPath({
      points,
      strokeStyle: '$color.debug.graph',
      lineWidth: 1
    });
  }
}

/** Green while the frame budget is being met, amber when it slips, red when it is gone. */
function fpsColour(fps) {
  if (fps >= FPS_GOOD) return '$color.debug.good';
  if (fps >= FPS_FAIR) return '$color.debug.warn';
  return '$color.debug.bad';
}

/** Milliseconds per frame at a given rate, to one decimal. */
function frameMs(fps) {
  return fps > 0 ? (1000 / fps).toFixed(1) : '--';
}

function format(value) {
  return typeof value === 'number' ? value.toLocaleString() : String(value);
}
