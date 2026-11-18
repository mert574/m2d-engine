import { InputSchema } from 'm2d-engine/net/input.js';
import { registerEffects } from 'm2d-kit/effects';
import { Wall, Torch, Ember, Stair, Creature, Knight, Quartermaster } from './keepActors.js';
import { keepIntents, newPurse } from './keepIntents.js';
import { SatchelBar } from './satchelUI.js';
import { VaultPlan } from './menuBackdrop.js';

/**
 * Cinder Keep's simulation: the actors, the intents and the keep's rules,
 * and nothing that shows them. The browser imports this from main.js; the
 * match server imports it from keepMatch.js. Everything here, and
 * everything it imports, runs in plain Node.
 *
 * The rules tell players what happened through `player.notify`, which
 * reaches the right screen alone and online alike:
 *
 * | Event | When |
 * | --- | --- |
 * | `stair-open` | The last ember was gathered (everyone hears it) |
 * | `stair-sealed` | A knight reached the stair before that |
 * | `descended` | A knight took the open stair |
 * | `fallen` | A knight's health ran out (online, where they come back) |
 */

export const WORLD = { width: 64 * 64, height: 48 * 64 };

/** What a client's held input may be: the keys the knight reads, and a pointer on the keep's floor. */
export const KEEP_INPUT = new InputSchema({
  keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyX', 'Digit1', 'Digit2', 'Digit3'],
  pointer: { bounds: { left: 0, top: 0, right: WORLD.width, bottom: WORLD.height }, buttons: 1 }
});

/** M2D options the keep's simulation depends on. */
export const KEEP_GAME = { worldWidth: WORLD.width, worldHeight: WORLD.height };

/** The uniform names the editor's project file points at; see m2d.project.json. */
export const GAME = KEEP_GAME;
export { registerKeep as register };


/** Register the cast and the intents, on a displayed game, a headless one or a client. */
export function registerKeep(game) {
  game.registerBackdropLayer('vaultPlan', () => new VaultPlan());
  for (const [name, actor] of Object.entries({
    ObliquePlayer: Knight, Ghost: Creature, Wall, Torch, Coin: Ember, Stair, Quartermaster
  })) game.registerActor(name, actor);
  // The shared effects the cast attaches in code, registered so a scene may retune them by slot.
  registerEffects(game);
  game.registerIntents(keepIntents);
  // The satchel strip, which the keep's hud places by name. Only ever
  // built where there is a screen to show it on.
  game.registerUIComponent('satchel', (scene, element) => new SatchelBar(scene.game.players.local, element));
}

/** Everyone who should hear about the keep's progress. */
function everyone(game) {
  return game.players.all;
}

/**
 * The keep's simulation hooks, which the page (through `bootProject`),
 * the editor's play and the match server all run: the purse, the embers
 * that open the stair, the stair that tells a knight what it found.
 * Presentation is the hooks module's.
 *
 * @param {import('m2d-engine/core/m2d.js').M2D} game
 */
export function sceneHooks(game) {
  return { keep: {
    onEnter() {
      const entities = [...game.entities];
      const stair = entities.find((e) => e instanceof Stair);

      // Alone, the player at the keyboard is the scene's knight.
      const local = game.players.local;
      local.state = newPurse();
      local.avatar = game.player;

      for (const ember of entities.filter((e) => e instanceof Ember)) {
        ember.onTaken = () => {
          if ([...game.entities].some((e) => e instanceof Ember) || !stair?.sealed) return;
          stair.sealed = false;
          for (const player of everyone(game)) player.notify('stair-open');
        };
      }
      if (stair) {
        stair.onEnter = (knight) => {
          const player = knight.player ?? game.players.local;
          player.notify(stair.sealed ? 'stair-sealed' : 'descended');
        };
      }
    }
  } };
}

/**
 * A player's knight, once the server has made it from the scene's own
 * at a free spawn point: a purse for them, and a knight that falls comes
 * back at a free spawn point three seconds later instead of ending the
 * game for everyone.
 */
export function readyKnight(game, player) {
  const knight = player.avatar;
  player.state = newPurse();
  const health = knight.getConstraint('health');
  health.onDeath = () => {
    player.notify('fallen');
    game.time.after(3, () => {
      if (!game.entities.has(knight)) return;
      const point = game.sceneManager.getCurrentScene()?.freeSpawnPoint();
      knight.dead = false;
      health.currentHealth = health.maxHealth;
      if (point) knight.body.setPosition({ ...point.body.position });
      knight.body.setVelocity({ x: 0, y: 0 });
    });
  };
  return knight;
}
