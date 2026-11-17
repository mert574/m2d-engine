/**
 * The engine's own actors and constraints, available to every scene by
 * name without a game registering them.
 *
 * A game's `registerActor` and `registerConstraint` still come first — a
 * game may ship its own `Health`, or put the engine's class under another
 * name — and what a game registers is what `own` lists. The built-ins fill
 * in behind, so a scene author (or the editor) can attach `Hover` to a
 * lamp without first editing the game's code, and the scene loads in the
 * game too. Nothing here is instantiated until a scene names it.
 */

import { Bee } from '../actors/bee.js';
import { Coin } from '../actors/coin.js';
import { Ghost } from '../actors/ghost.js';
import { MovingPlatform } from '../actors/movingPlatform.js';
import { Npc } from '../actors/npc.js';
import { ObliquePlayer } from '../actors/obliquePlayer.js';
import { Platform } from '../actors/platform.js';
import { Player } from '../actors/player.js';
import { Prop } from '../actors/prop.js';
import { Rocket } from '../actors/rocket.js';
import { TopDownPlayer } from '../actors/topDownPlayer.js';
import { Trigger } from '../actors/trigger.js';
import { Turret } from '../actors/turret.js';
import { Abilities } from '../constraints/abilities.js';
import { Attack } from '../constraints/attack.js';
import { CarControl } from '../constraints/carControl.js';
import { Chase } from '../constraints/chase.js';
import { ContactDamage } from '../constraints/contactDamage.js';
import { DamageFlash } from '../constraints/damageFlash.js';
import { Debug } from '../constraints/debug.js';
import { Footsteps } from '../constraints/footsteps.js';
import { GlideControl } from '../constraints/glideControl.js';
import { Grabbable } from '../constraints/grabbable.js';
import { Health } from '../constraints/health.js';
import { Hover } from '../constraints/hover.js';
import { Interactive } from '../constraints/interactive.js';
import { KeyboardControl } from '../constraints/keyboardControl.js';
import { PathFollow } from '../constraints/pathFollow.js';
import { PointerMove } from '../constraints/pointerMove.js';
import { ProximityPrompt } from '../constraints/proximityPrompt.js';
import { ThrustControl } from '../constraints/thrustControl.js';
import { WallSlip } from '../constraints/wallSlip.js';

/** The engine's actors, by the name a scene uses. */
export const BUILTIN_ACTORS = new Map(Object.entries({
  Bee, Coin, Ghost, MovingPlatform, Npc, ObliquePlayer, Platform, Player, Prop, Rocket, TopDownPlayer, Trigger, Turret
}));

/** The engine's constraints, by the name a scene uses. */
export const BUILTIN_CONSTRAINTS = new Map(Object.entries({
  Abilities, Attack, CarControl, Chase, ContactDamage, DamageFlash, Debug, Footsteps, GlideControl, Grabbable, Health,
  Hover, Interactive, KeyboardControl, PathFollow, PointerMove, ProximityPrompt, ThrustControl, WallSlip
}));

/**
 * Where each built-in lives under `m2d-engine/`, for an editor to write a
 * registration import. One entry per built-in; `builtins.test.js` holds the
 * two maps to the same keys and each path to exporting its class.
 */
export const BUILTIN_MODULES = new Map(Object.entries({
  Bee: 'actors/bee.js', Coin: 'actors/coin.js', Ghost: 'actors/ghost.js', MovingPlatform: 'actors/movingPlatform.js',
  Npc: 'actors/npc.js', ObliquePlayer: 'actors/obliquePlayer.js', Platform: 'actors/platform.js', Player: 'actors/player.js',
  Prop: 'actors/prop.js', Rocket: 'actors/rocket.js', TopDownPlayer: 'actors/topDownPlayer.js', Trigger: 'actors/trigger.js',
  Turret: 'actors/turret.js',
  Abilities: 'constraints/abilities.js', Attack: 'constraints/attack.js', CarControl: 'constraints/carControl.js',
  Chase: 'constraints/chase.js', ContactDamage: 'constraints/contactDamage.js', DamageFlash: 'constraints/damageFlash.js',
  Debug: 'constraints/debug.js', Footsteps: 'constraints/footsteps.js', GlideControl: 'constraints/glideControl.js',
  Grabbable: 'constraints/grabbable.js', Health: 'constraints/health.js', Hover: 'constraints/hover.js',
  Interactive: 'constraints/interactive.js', KeyboardControl: 'constraints/keyboardControl.js',
  PathFollow: 'constraints/pathFollow.js', PointerMove: 'constraints/pointerMove.js',
  ProximityPrompt: 'constraints/proximityPrompt.js', ThrustControl: 'constraints/thrustControl.js',
  WallSlip: 'constraints/wallSlip.js'
}));

/**
 * A `Map` of a game's registered classes that falls back to the built-ins:
 * `get`, `has` and iteration see both, the game's entry winning for a
 * name both have; `own` is what the game itself registered.
 */
export class Registry extends Map {
  #builtins;
  /** Who registered each of the game's own entries: 'game' (default) or 'kit'. */
  #origins = new Map();

  /** @param {Map<string, Function>} builtins */
  constructor(builtins = new Map()) {
    super();
    this.#builtins = builtins;
  }

  /**
   * @param {string} name
   * @param {Function} klass
   * @param {'game'|'kit'} [origin] - Who is registering; a game's own code by default.
   */
  set(name, klass, origin = 'game') {
    this.#origins.set(name, origin);
    return super.set(name, klass);
  }

  delete(name) {
    this.#origins.delete(name);
    return super.delete(name);
  }

  /**
   * Where a name comes from: 'game', 'kit' or 'engine' (a built-in the game
   * did not register itself); undefined for a name nothing provides.
   * @param {string} name
   * @returns {'game'|'kit'|'engine'|undefined}
   */
  originOf(name) {
    if (super.has(name)) return this.#origins.get(name) ?? 'game';
    return this.#builtins.has(name) ? 'engine' : undefined;
  }

  /** What the game registered, without the built-ins. */
  get own() {
    return new Map(super.entries());
  }

  /** Whether a name resolves to a built-in the game did not register itself. */
  isBuiltin(name) {
    return !super.has(name) && this.#builtins.has(name);
  }

  get(name) {
    return super.get(name) ?? this.#builtins.get(name);
  }

  has(name) {
    return super.has(name) || this.#builtins.has(name);
  }

  get size() {
    return this.#merged().size;
  }

  keys() { return this.#merged().keys(); }
  values() { return this.#merged().values(); }
  entries() { return this.#merged().entries(); }
  [Symbol.iterator]() { return this.#merged()[Symbol.iterator](); }
  forEach(callback, thisArg) { this.#merged().forEach(callback, thisArg); }

  /** The game's entries first, then the built-ins it did not override. */
  #merged() {
    const merged = new Map(super.entries());
    for (const [name, klass] of this.#builtins) if (!merged.has(name)) merged.set(name, klass);
    return merged;
  }
}
