import { UIElement } from 'm2d-engine/core/ui/uiElement.js';

/**
 * Stats and controls overlay.
 *
 * The showcase's whole argument lives in two numbers: `primitives` (what the
 * scene asked for) against `drawCalls` (what the backend submitted). They are
 * printed next to each other with the ratio spelled out, because that ratio is
 * what batching buys and it is otherwise invisible.
 */
export class Hud extends UIElement {
  /**
   * @param {Object} game - M2D instance
   * @param {Object} showcase - Showcase director (for layer state and counts)
   */
  constructor(game, showcase) {
    super({});
    this.game = game;
    this.showcase = showcase;
    this.visible = true;
  }

  /**
   * Backend name as registered, derived from the class name so a new backend
   * needs no change here.
   * @returns {string} Lowercased backend name, e.g. 'webgl'
   */
  backendName() {
    return this.game.renderer.constructor.name.replace(/Renderer$/, '').toLowerCase();
  }

  /**
   * World render resolution. Printed next to the view size (its own line),
   * because the two are deliberately independent: lowering the resolution
   * must not change how much world is on screen.
   * @returns {string}
   */
  resolutionLabel() {
    const view = this.game.viewport;
    const native = this.game.resolution === 'native' ? ' (native)' : '';
    return `${view.worldWidth}x${view.worldHeight}${native}`;
  }

  draw() {
    if (!this.visible) return;

    const renderer = this.game.uiRenderer;
    const backend = this.game.renderer;
    const stats = this.showcase.worldStats;
    if (!stats) return;
    const view = this.game.viewport;

    const padding = 12;
    const lineHeight = 17;

    const ratio = stats.drawCalls > 0
      ? (stats.primitives / stats.drawCalls).toFixed(1)
      : '0.0';

    const lines = [
      `backend     ${this.backendName()}`,
      `fps         ${backend.getFPS()}   avg ${backend.getAverageFPS()}`,
      '',
      'world pass',
      `primitives  ${stats.primitives.toLocaleString()}`,
      `draw calls  ${stats.drawCalls.toLocaleString()}   (${ratio} per call)`,
      `state chg   ${stats.stateChanges.toLocaleString()}`,
      // What the view cull saved this frame: entities off screen that
      // issued nothing at all. `r_cull 0` turns it off and they come back.
      `culled      ${stats.culled.toLocaleString()}`,
      '',
      `sprites     ${stats.spritesDrawn.toLocaleString()}`,
      `text        ${stats.textDrawn.toLocaleString()}`,
      `shapes      ${stats.shapesDrawn.toLocaleString()}`,
      '',
      `load        ${this.showcase.loadLabel()}   ([ or ] to change)`,
      `harbour     ${this.showcase.weather.name} · ${this.showcase.weather.hour}${this.showcase.weather.held ? '   (held: C, W)' : ''}`,
      '',
      'display',
      `world res   ${this.resolutionLabel()}`,
      `view        ${Math.round(view.viewWidth)}x${Math.round(view.viewHeight)}`,
      `ui res      ${Math.round(view.uiWidth)}x${Math.round(view.uiHeight)} @ ${view.pixelRatio}x`,
      `aspect      ${this.game.aspectMode}`,
      `fullscreen  ${this.game.isFullscreen ? 'on' : 'off'}`
    ];

    const width = 330;
    const height = padding * 2 + lines.length * lineHeight;

    renderer.drawRect({
      x: padding,
      y: padding,
      width,
      height,
      fillStyle: 'rgba(6, 14, 22, 0.82)',
      strokeStyle: 'rgba(120, 200, 255, 0.4)',
      lineWidth: 1,
      cornerRadius: 8
    });

    lines.forEach((line, index) => {
      if (!line) return;
      renderer.drawText({
        text: line,
        x: padding * 2,
        y: padding * 2 + index * lineHeight,
        fillStyle: index === 5 ? '#7CFFB2' : '#CFE8FF',
        fontSize: '13px',
        fontFamily: 'monospace',
        textAlign: 'left',
        textBaseline: 'top'
      });
    });

    this.drawLayers(renderer, padding, padding + height + 10);
  }

  /**
   * Print the layer toggles and their live counts.
   */
  drawLayers(renderer, x, y) {
    const layers = this.showcase.layerSummary();
    const lineHeight = 16;
    const height = 20 + layers.length * lineHeight + 8;

    renderer.drawRect({
      x,
      y,
      width: 330,
      height,
      fillStyle: 'rgba(6, 14, 22, 0.82)',
      strokeStyle: 'rgba(120, 200, 255, 0.4)',
      lineWidth: 1,
      cornerRadius: 8
    });

    renderer.drawText({
      text: 'layers   (1-9 to toggle, P pauses camera)',
      x: x + 12,
      y: y + 8,
      fillStyle: 'rgba(160, 220, 255, 0.8)',
      fontSize: '12px',
      fontFamily: 'monospace',
      textAlign: 'left',
      textBaseline: 'top'
    });

    layers.forEach((layer, index) => {
      renderer.drawText({
        text: `${index + 1} ${layer.enabled ? '[x]' : '[ ]'} ${layer.name.padEnd(10)} ${layer.count}`,
        x: x + 12,
        y: y + 26 + index * lineHeight,
        fillStyle: layer.enabled ? '#CFE8FF' : 'rgba(200, 200, 200, 0.45)',
        fontSize: '12px',
        fontFamily: 'monospace',
        textAlign: 'left',
        textBaseline: 'top'
      });
    });

    return height;
  }
}
