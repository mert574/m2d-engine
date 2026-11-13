import { InputSchema } from 'm2d-engine/net/input.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';
import { Wall, Torch, Ember, Stair, Creature, Knight, Quartermaster } from './keepActors.js';
import { keepIntents, newPurse } from './keepIntents.js';
import { SatchelBar } from './satchelUI.js';

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

/** Where knights come in: the start room, a little apart from each other. */
const START = { x: 416, y: 2656 };
const SPREAD = [[0, 0], [64, 0], [-64, 0], [0, 64], [64, 64], [-64, 64], [128, 0], [128, 64]];

/** Register the cast and the intents, on a displayed game, a headless one or a client. */
export function registerKeep(game) {
  for (const [name, actor] of Object.entries({
    ObliquePlayer: Knight, Ghost: Creature, Wall, Torch, Coin: Ember, Trigger: Stair, Quartermaster
  })) game.registerActor(name, actor);
  // The shared effects the cast attaches in code, registered so a scene may retune them by slot.
  game.registerConstraint('AttackSwing', AttackSwing);
  game.registerConstraint('HitBurst', HitBurst);
  game.registerIntents(keepIntents);
  // The satchel strip, which the keep's hud places by name. Only ever
  // built where there is a screen to show it on.
  game.registerHudComponent('satchel', (scene, element) => new SatchelBar(scene.game.players.local, element));
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
 * Bring a knight in for a player: at the start, owned by them, with a
 * purse. Online, a fallen knight comes back to the start after three
 * seconds instead of ending the game for everyone.
 */
export function spawnKnight(game, player, index) {
  const [dx, dy] = SPREAD[index % SPREAD.length];
  const knight = game.spawn({
    type: 'ObliquePlayer', x: START.x + dx, y: START.y + dy, width: 28, height: 28,
    sprite: 'knight', animation: 'idle_down',
    options: { spriteSize: 200, spriteOffsetY: -56 },
    physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 },
    playerId: player.id
  });
  player.avatar = knight;
  player.state = newPurse();
  const health = knight.getConstraint('health');
  health.onDeath = () => {
    player.notify('fallen');
    game.time.after(3, () => {
      if (!game.entities.has(knight)) return;
      knight.dead = false;
      health.currentHealth = health.maxHealth;
      knight.body.setPosition({ x: START.x + dx, y: START.y + dy });
      knight.body.setVelocity({ x: 0, y: 0 });
    });
  };
  return knight;
}
