import { UIElement } from '../../core/ui/uiElement.js';

/**
 * Harbour chart: the world in miniature, with the lighthouse beam on it.
 *
 * This is the screen-space clipping layer. It nests three clips deep — a
 * rounded panel clip, then a rotated transform, then a rectangular clip inside
 * it — which is cheap stencil reference counting on the WebGL backend and
 * increasingly expensive path clipping on Canvas.
 *
 * The sweep is not decoration: it reads the same angle as the Lighthouse that
 * draws the beam in the world, so the chart always agrees with what is
 * actually happening out there.
 */
export class Minimap extends UIElement {
  /**
   * @param {Object} game - M2D instance
   * @param {Object} options - Chart options
   * @param {number} options.x - Panel centre X, offset from the anchor
   * @param {number} options.y - Panel centre Y, offset from the anchor
   * @param {string} [options.anchor] - Corner the offset is measured from
   * @param {number} options.size - Panel width and height
   * @param {{width: number, height: number}} options.bounds - World bounds to map
   * @param {import('./moteField.js').MoteField} options.field - Field to plot
   * @param {import('./lighthouse.js').Lighthouse} options.lighthouse - Beam source
   * @param {number} options.shoreY - World Y of the water/bank boundary
   */
  constructor(game, { x, y, size, bounds, field, lighthouse, shoreY, anchor }) {
    super(x, y, size, size, { anchor });
    this.game = game;
    this.size = size;
    this.bounds = bounds;
    this.field = field;
    this.lighthouse = lighthouse;
    this.shoreY = shoreY;
    this.visible = true;
    /** Plot at most this many motes; the chart is a readout, not a stress test. */
    this.maxBlips = 200;
  }

  draw() {
    if (!this.visible) return;

    const renderer = this.game.uiRenderer;
    const size = this.size;
    const left = this.x - size / 2;
    const top = this.y - size / 2;
    const scaleX = size / this.bounds.width;
    const scaleY = size / this.bounds.height;

    renderer.drawRect({
      x: left,
      y: top,
      width: size,
      height: size,
      fillStyle: 'rgba(6, 14, 22, 0.86)',
      strokeStyle: 'rgba(120, 200, 255, 0.55)',
      lineWidth: 2,
      cornerRadius: 10
    });

    // Clip 1: the rounded panel. Everything below is confined to it.
    renderer.pushClip({ x: left, y: top, width: size, height: size, cornerRadius: 10 });

    // Water above the shoreline, bank below, matching the world's layout.
    renderer.drawRect({
      x: left,
      y: top,
      width: size,
      height: this.shoreY * scaleY,
      fillStyle: 'rgba(24, 64, 104, 0.55)'
    });

    const step = Math.max(1, Math.ceil(this.field.motes.length / this.maxBlips));
    for (let i = 0; i < this.field.motes.length; i += step) {
      const mote = this.field.motes[i];
      renderer.drawRect({
        x: left + mote.x * scaleX,
        y: top + mote.y * scaleY,
        width: 2,
        height: 2,
        fillStyle: 'rgba(130, 220, 255, 0.7)'
      });
    }

    // Camera viewport outline.
    const camera = this.game.camera;
    renderer.drawRect({
      x: left + (camera.x - camera.width / 2) * scaleX,
      y: top + (camera.y - camera.height / 2) * scaleY,
      width: camera.width * scaleX,
      height: camera.height * scaleY,
      strokeStyle: '#7CFFB2',
      lineWidth: 1.5,
      fill: false
    });

    // Clips 2 and 3: rotate about the lighthouse's position on the chart, then
    // clip a shaft. Same construction as the world beam, same angle.
    const lampX = left + this.lighthouse.x * scaleX;
    const lampY = top + this.lighthouse.lampY * scaleY;
    const reach = this.lighthouse.reach * scaleX;

    renderer.pushTransform({ x: lampX, y: lampY, rotation: this.lighthouse.angle });
    renderer.pushClip({ x: 0, y: -reach * 0.16, width: reach, height: reach * 0.32 });

    renderer.drawArc({
      x: 0,
      y: 0,
      radius: reach,
      fillStyle: {
        type: 'radial',
        x: 0,
        y: 0,
        r0: 0,
        r1: reach,
        stops: [
          { offset: 0, color: 'rgba(255, 243, 180, 0.55)' },
          { offset: 1, color: 'rgba(255, 243, 180, 0)' }
        ]
      }
    });

    renderer.popClip();
    renderer.popTransform();
    renderer.popClip();

    // Lamp marker, outside the panel clip so it stays crisp on the border.
    renderer.drawArc({
      x: lampX,
      y: lampY,
      radius: 3,
      fillStyle: '#FFF59D'
    });

    renderer.drawText({
      text: 'HARBOUR',
      x: left + 8,
      y: top + 6,
      fillStyle: 'rgba(160, 220, 255, 0.8)',
      fontSize: '11px',
      fontFamily: 'monospace',
      textAlign: 'left',
      textBaseline: 'top'
    });
  }
}
