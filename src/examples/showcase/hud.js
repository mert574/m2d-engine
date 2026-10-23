import { UIElement } from '../../core/ui/uiElement.js';
import { OPTIONAL_CAPABILITIES } from '../../core/renderers/baseRenderer.js';

/**
 * Stats and controls overlay.
 *
 * The showcase's whole argument lives in two numbers: `primitives` (what the
 * scene asked for) against `drawCalls` (what the backend submitted). They are
 * printed next to each other with the ratio spelled out, because that ratio is
 * the difference between the backends and it is otherwise invisible.
 *
 * The capability list is printed too, so a viewer on the Canvas backend can
 * see which parts of the scene are missing rather than wondering.
 */
export class Hud extends UIElement {
  /**
   * @param {Object} game - M2D instance
   * @param {Object} showcase - Showcase director (for layer state and counts)
   */
  constructor(game, showcase) {
    super(0, 0, 0, 0);
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

  draw() {
    if (!this.visible) return;

    const renderer = this.game.uiRenderer;
    const backend = this.game.renderer;
    const stats = this.showcase.worldStats;
    if (!stats) return;

    const padding = 12;
    const lineHeight = 17;

    const ratio = stats.drawCalls > 0
      ? (stats.primitives / stats.drawCalls).toFixed(1)
      : '0.0';

    const lines = [
      `backend     ${this.backendName()}   (B to swap)`,
      `fps         ${backend.getFPS()}   avg ${backend.getAverageFPS()}`,
      '',
      'world pass',
      `primitives  ${stats.primitives.toLocaleString()}`,
      `draw calls  ${stats.drawCalls.toLocaleString()}   (${ratio} primitives per call)`,
      `state chg   ${stats.stateChanges.toLocaleString()}`,
      '',
      `sprites     ${stats.spritesDrawn.toLocaleString()}`,
      `text        ${stats.textDrawn.toLocaleString()}`,
      `shapes      ${stats.shapesDrawn.toLocaleString()}`,
      '',
      `load        ${this.showcase.loadLabel()}   ([ / ] to change)`
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

    this.drawCapabilities(renderer, padding, padding + height + 10);
    this.drawLayers(renderer, padding, padding + height + 10 + 108);
  }

  /**
   * Print every optional capability with a tick or cross. Reading the list
   * from OPTIONAL_CAPABILITIES rather than a local copy means features added
   * to the contract show up here automatically, unsupported until claimed.
   */
  drawCapabilities(renderer, x, y) {
    const names = Object.keys(OPTIONAL_CAPABILITIES);
    const lineHeight = 16;
    const height = 20 + names.length * lineHeight + 8;

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
      text: 'optional capabilities',
      x: x + 12,
      y: y + 8,
      fillStyle: 'rgba(160, 220, 255, 0.8)',
      fontSize: '12px',
      fontFamily: 'monospace',
      textAlign: 'left',
      textBaseline: 'top'
    });

    names.forEach((name, index) => {
      const supported = this.game.renderer.supports(name);
      renderer.drawText({
        text: `${supported ? '+' : '-'} ${name}`,
        x: x + 12,
        y: y + 26 + index * lineHeight,
        fillStyle: supported ? '#7CFFB2' : 'rgba(200, 200, 200, 0.45)',
        fontSize: '12px',
        fontFamily: 'monospace',
        textAlign: 'left',
        textBaseline: 'top'
      });
    });
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
      text: 'layers   (1-7 to toggle, P pauses camera)',
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
  }
}
