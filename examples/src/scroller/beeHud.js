import { UIElement } from 'm2d-engine/core/ui/uiElement.js';

/**
 * The bee's own readout: hearts, pollen, score and the live combo, and
 * the send-off once the hive is reached.
 *
 * Everything on it is the bee's state rather than the scene's — a sting
 * costs a heart *and* scatters pollen the lane already counted as taken,
 * so a tally of the grains would disagree with what the bee is carrying.
 * One widget, registered with `registerHudComponent`, placed by the lane's
 * `hud`; it reads the player each frame and changes nothing.
 */
export class BeeStatus extends UIElement {
  /**
   * @param {import('m2d-engine/core/scene.js').Scene} scene
   * @param {object} options - The HUD element's placement and properties
   */
  constructor(scene, options = {}) {
    const { properties = {}, ...placement } = options;
    super({ anchor: 'top-left', pivot: 'top-left', x: 0, y: 0, width: 0, height: 0, ...placement });
    this.scene = scene;
    /** How many grains the lane put down: a tally of the pollen prefab. */
    this.totalCounter = properties.totalCounter ?? 'total';
    this.hint = properties.hint ?? '';
  }

  /** The send-off, by how the run went. */
  rank(bee, total) {
    const part = total ? bee.pollen / total : 0;
    if (part >= 0.95 && bee.hearts === 3) return "QUEEN'S OWN — a perfect beeline";
    if (part >= 0.8) return 'HEAD FORAGER';
    if (part >= 0.55) return 'FORAGER';
    return 'WORKER — the lane will still be there tomorrow';
  }

  draw() {
    const bee = this.scene.game.player;
    if (!bee) return;
    const paint = this.paint;
    // The whole view: this widget is the lane's readout, laid out against
    // the screen's corners rather than inside a box of its own.
    const view = this.parentBox;
    const total = this.scene.counters?.get(this.totalCounter) ?? 0;

    const outline = (color, width) => ({ strokeStyle: color, lineWidth: width });

    // Hearts, top left: the one number that must read at a glance.
    paint.drawText({
      x: view.x + 20, y: view.y + 16, text: '♥ '.repeat(Math.max(0, bee.hearts)).trim(),
      fillStyle: '#e8536a', fontSize: 19, letterSpacing: 4, textBaseline: 'top',
      ...outline('rgba(40, 10, 20, 0.5)', 2)
    });

    // The haul, top right.
    paint.drawText({
      x: view.x + view.width - 20, y: view.y + 16, text: `POLLEN ${bee.pollen} / ${total}`,
      fillStyle: '#fff3c8', fontSize: 15, letterSpacing: 2, textAlign: 'right', textBaseline: 'top',
      ...outline('rgba(80, 40, 0, 0.6)', 2)
    });
    paint.drawText({
      x: view.x + view.width - 20, y: view.y + 40,
      text: `SCORE ${bee.score}${bee.combo > 1 ? `   ×${bee.combo}` : ''}`,
      fillStyle: '#ffd98f', fontSize: 15, letterSpacing: 2, textAlign: 'right', textBaseline: 'top',
      ...outline('rgba(80, 40, 0, 0.6)', 2)
    });

    if (this.hint && !bee.arrived) {
      paint.drawText({
        x: view.x + view.width - 20, y: view.y + view.height - 16, text: this.hint,
        fillStyle: 'rgba(255, 240, 220, 0.6)', fontSize: 13, textAlign: 'right', textBaseline: 'bottom'
      });
    }

    if (!bee.arrived) return;
    // Home: the send-off, over the middle of the view.
    paint.drawText({
      x: view.x + view.width / 2, y: view.y + view.height / 2 - 120, text: this.rank(bee, total),
      fillStyle: '#fff3d6', fontSize: 30, fontWeight: '600', letterSpacing: 3,
      textAlign: 'center', textBaseline: 'middle', ...outline('rgba(70, 30, 0, 0.6)', 3)
    });
    paint.drawText({
      x: view.x + view.width / 2, y: view.y + view.height / 2 - 84,
      text: `${bee.pollen} of ${total} pollen · best chain ×${bee.bestCombo} · score ${bee.score}`,
      fillStyle: '#ffe2ae', fontSize: 16, letterSpacing: 2,
      textAlign: 'center', textBaseline: 'middle', ...outline('rgba(70, 30, 0, 0.5)', 2)
    });
  }
}
