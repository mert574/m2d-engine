import { Player } from 'm2d-engine/actors/player.js';
import { Prop } from 'm2d-engine/actors/prop.js';

/**
 * The game's definition: the cast, and the options its simulation needs —
 * nothing that shows them. `main.js` boots from it, the editor runs it,
 * and a headless server or test can too. See m2d.project.json.
 */

/** M2D options the simulation depends on. */
export const GAME = { worldWidth: 1600, worldHeight: 900 };

/** The hero: the engine's platformer player, drawn as a friendly block until it has art. */
export class Hero extends Player {
  draw() {
    if (this.sprite?.width) return super.draw();
    const { x, y } = this.renderPosition;
    const { x: w, y: h } = this.size;
    const renderer = this.game.renderer;
    renderer.drawRect({ x: x - w / 2, y: y - h / 2, width: w, height: h, cornerRadius: 7, fillStyle: '#ff7a59' });
    const eye = x + this.facingDirection * w * 0.18;
    renderer.drawRect({ x: eye - 3, y: y - h * 0.22, width: 6, height: 8, cornerRadius: 3, fillStyle: '#2b1a12' });
  }
}

/** Register the cast, on a displayed game, a headless one or the editor's. */
export function register(game) {
  game.registerActor('Player', Hero);
  game.registerActor('Prop', Prop);
}
