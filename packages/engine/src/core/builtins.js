/**
 * The engine's own actors and constraints, available to every scene by
 * name without a game registering them: the capabilities, named for what
 * they do. Game pieces — players, platforms, mobs, a turret — are the
 * kit's (`m2d-kit`), registered by the game.
 *
 * A game's `registerActor` and `registerConstraint` still come first — a
 * game may ship its own `Health`, or put the engine's class under another
 * name — and what a game registers is what `own` lists. The built-ins fill
 * in behind, so a scene author (or the editor) can attach `Hover` to a
 * lamp without first editing the game's code, and the scene loads in the
 * game too. Nothing here is instantiated until a scene names it.
 */

import { Prop } from '../actors/prop.ts';
import { Trigger } from '../actors/trigger.ts';
import { SpawnPoint } from '../actors/spawnPoint.ts';
import { NavVolume } from '../actors/navVolume.ts';
import { Abilities } from '../constraints/abilities.ts';
import { Attack } from '../constraints/attack.ts';
import { Chase } from '../constraints/chase.ts';
import { Collectable } from '../constraints/collectable.ts';
import { ContactDamage } from '../constraints/contactDamage.ts';
import { DamageFlash } from '../constraints/damageFlash.ts';
import { Debug } from '../constraints/debug.ts';
import { Footsteps } from '../constraints/footsteps.ts';
import { Grabbable } from '../constraints/grabbable.ts';
import { Health } from '../constraints/health.ts';
import { Hover } from '../constraints/hover.ts';
import { Interactive } from '../constraints/interactive.ts';
import { KeyboardControl } from '../constraints/keyboardControl.ts';
import { NavObstacle } from '../constraints/navObstacle.ts';
import { PathFollow } from '../constraints/pathFollow.ts';
import { PointerMove } from '../constraints/pointerMove.ts';
import { ProximityPrompt } from '../constraints/proximityPrompt.ts';

/** The engine's actors, by the name a scene uses. */
export const BUILTIN_ACTORS = new Map(Object.entries({
  Prop, Trigger, SpawnPoint, NavVolume
}));

/** The engine's constraints, by the name a scene uses. */
export const BUILTIN_CONSTRAINTS = new Map(Object.entries({
  Abilities, Attack, Chase, Collectable, ContactDamage, DamageFlash, Debug, Footsteps, Grabbable, Health,
  Hover, Interactive, KeyboardControl, NavObstacle, PathFollow, PointerMove, ProximityPrompt
}));

/**
 * Where each built-in lives under `m2d-engine/`, for an editor to write a
 * registration import. One entry per built-in; `builtins.test.js` holds the
 * two maps to the same keys and each path to exporting its class.
 */
export const BUILTIN_MODULES = new Map(Object.entries({
  Prop: 'actors/prop.ts', Trigger: 'actors/trigger.ts', SpawnPoint: 'actors/spawnPoint.ts', NavVolume: 'actors/navVolume.ts',
  Abilities: 'constraints/abilities.ts', Attack: 'constraints/attack.ts',
  Chase: 'constraints/chase.ts', Collectable: 'constraints/collectable.ts', ContactDamage: 'constraints/contactDamage.ts', DamageFlash: 'constraints/damageFlash.ts',
  Debug: 'constraints/debug.ts', Footsteps: 'constraints/footsteps.ts',
  Grabbable: 'constraints/grabbable.ts', Health: 'constraints/health.ts', Hover: 'constraints/hover.ts',
  Interactive: 'constraints/interactive.ts', KeyboardControl: 'constraints/keyboardControl.ts', NavObstacle: 'constraints/navObstacle.ts',
  PathFollow: 'constraints/pathFollow.ts', PointerMove: 'constraints/pointerMove.ts',
  ProximityPrompt: 'constraints/proximityPrompt.ts'
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

  /** @param {Map<string, unknown>} builtins */
  constructor(builtins = new Map()) {
    super();
    this.#builtins = builtins;
  }

  /**
   * @param {string} name
   * @param {unknown} klass - A class, or a prefab template's object.
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
