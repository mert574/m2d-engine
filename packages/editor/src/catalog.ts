/**
 * The component catalog: every actor and constraint the editor can offer,
 * with what each declares.
 *
 * Two sources. The **game's registries** — what its definition's
 * `register(game)` put in `game.actors` and `game.constraintTypes` — are
 * what a scene may name today. The **engine's own** actors and
 * constraints, imported here, are what a game *could* register; one the
 * game has not is shown with the two lines that would, since a scene that
 * names it would otherwise fail to load. The two are merged by name, the
 * game's class winning (a game may register the engine's class under its
 * own name, or its own class under the engine's).
 */

import { Bee } from 'm2d-engine/actors/bee.js';
import { Coin } from 'm2d-engine/actors/coin.js';
import { Ghost } from 'm2d-engine/actors/ghost.js';
import { MovingPlatform } from 'm2d-engine/actors/movingPlatform.js';
import { Npc } from 'm2d-engine/actors/npc.js';
import { ObliquePlayer } from 'm2d-engine/actors/obliquePlayer.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { Player } from 'm2d-engine/actors/player.js';
import { Prop } from 'm2d-engine/actors/prop.js';
import { Rocket } from 'm2d-engine/actors/rocket.js';
import { TopDownPlayer } from 'm2d-engine/actors/topDownPlayer.js';
import { Trigger } from 'm2d-engine/actors/trigger.js';
import { Turret } from 'm2d-engine/actors/turret.js';
import { Abilities } from 'm2d-engine/constraints/abilities.js';
import { Attack } from 'm2d-engine/constraints/attack.js';
import { CarControl } from 'm2d-engine/constraints/carControl.js';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { ContactDamage } from 'm2d-engine/constraints/contactDamage.js';
import { DamageFlash } from 'm2d-engine/constraints/damageFlash.js';
import { Debug } from 'm2d-engine/constraints/debug.js';
import { Footsteps } from 'm2d-engine/constraints/footsteps.js';
import { GlideControl } from 'm2d-engine/constraints/glideControl.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { Hover } from 'm2d-engine/constraints/hover.js';
import { Interactive } from 'm2d-engine/constraints/interactive.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import { PathFollow } from 'm2d-engine/constraints/pathFollow.js';
import { PointerMove } from 'm2d-engine/constraints/pointerMove.js';
import { ProximityPrompt } from 'm2d-engine/constraints/proximityPrompt.js';
import { ThrustControl } from 'm2d-engine/constraints/thrustControl.js';
import { WallSlip } from 'm2d-engine/constraints/wallSlip.js';

/** A field a class declares, as the catalog lists it. */
export interface CatalogField {
  key: string;
  kind: string;
  label: string;
  unit?: string;
  description?: string;
  initial?: unknown;
  required?: boolean;
}

export interface CatalogEntry {
  kind: 'actor' | 'constraint';
  name: string;
  description: string;
  fields: CatalogField[];
  /** Whether a scene may name it: the game registered it, or the engine ships it (`builtin`). */
  registered: boolean;
  /** An engine class the game did not register itself; a scene may still name it. */
  builtin?: boolean;
  /** For an engine class the game does not register: the module to import it from. */
  module?: string;
  /** For an engine class whose name differs from its export. */
  exportName?: string;
}

interface ClassLike {
  description?: unknown;
  properties?: unknown;
  params?: unknown;
}

const ENGINE_ACTORS: Array<[string, unknown, string]> = [
  ['Bee', Bee, 'bee'], ['Coin', Coin, 'coin'], ['Ghost', Ghost, 'ghost'], ['MovingPlatform', MovingPlatform, 'movingPlatform'],
  ['Npc', Npc, 'npc'], ['ObliquePlayer', ObliquePlayer, 'obliquePlayer'], ['Platform', Platform, 'platform'], ['Player', Player, 'player'],
  ['Prop', Prop, 'prop'], ['Rocket', Rocket, 'rocket'], ['TopDownPlayer', TopDownPlayer, 'topDownPlayer'], ['Trigger', Trigger, 'trigger'],
  ['Turret', Turret, 'turret']
];
const ENGINE_CONSTRAINTS: Array<[string, unknown, string]> = [
  ['Abilities', Abilities, 'abilities'], ['Attack', Attack, 'attack'], ['CarControl', CarControl, 'carControl'], ['Chase', Chase, 'chase'],
  ['ContactDamage', ContactDamage, 'contactDamage'], ['DamageFlash', DamageFlash, 'damageFlash'], ['Debug', Debug, 'debug'],
  ['Footsteps', Footsteps, 'footsteps'], ['GlideControl', GlideControl, 'glideControl'], ['Health', Health, 'health'], ['Hover', Hover, 'hover'],
  ['Interactive', Interactive, 'interactive'], ['KeyboardControl', KeyboardControl, 'keyboardControl'], ['PathFollow', PathFollow, 'pathFollow'],
  ['PointerMove', PointerMove, 'pointerMove'], ['ProximityPrompt', ProximityPrompt, 'proximityPrompt'], ['ThrustControl', ThrustControl, 'thrustControl'],
  ['WallSlip', WallSlip, 'wallSlip']
];

/** `frictionAir` → `Friction air`. */
function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A class's declared fields: `static properties` along the chain for an actor, `static params` for a constraint. */
export function fieldsOf(klass: unknown, which: 'properties' | 'params'): CatalogField[] {
  let declared: Record<string, unknown> | null = null;
  if (which === 'properties') {
    // Along the class chain, base first, as the loader merges them.
    const chain: Array<Record<string, unknown>> = [];
    for (let c = klass as ClassLike | null; c && c !== Function.prototype; c = Object.getPrototypeOf(c) as ClassLike | null) {
      if (Object.prototype.hasOwnProperty.call(c, 'properties') && c.properties && typeof c.properties === 'object') chain.unshift(c.properties as Record<string, unknown>);
    }
    for (const own of chain) declared = { ...(declared ?? {}), ...own };
  } else {
    const params = (klass as ClassLike | null)?.params;
    declared = params && typeof params === 'object' ? params as Record<string, unknown> : null;
  }
  return Object.entries(declared ?? {}).map(([key, desc]) => {
    const d = (desc && typeof desc === 'object' ? desc : {}) as Record<string, unknown>;
    return {
      key,
      kind: typeof d.kind === 'string' ? d.kind : 'unknown',
      label: typeof d.label === 'string' ? d.label : humanize(key),
      unit: typeof d.unit === 'string' ? d.unit : undefined,
      description: typeof d.description === 'string' ? d.description : undefined,
      initial: d.initial ?? d.default,
      required: d.required === true || undefined
    };
  });
}

const describe = (klass: unknown): string => {
  const text = (klass as ClassLike | null)?.description;
  return typeof text === 'string' ? text : '';
};

/**
 * The catalog for a game's registries. Entries the game registers come
 * first in each kind, then the engine's unregistered ones, each sorted by
 * name.
 */
export function buildCatalog(registries: { actors?: Map<string, unknown>; constraintTypes?: Map<string, unknown> }): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const add = (kind: CatalogEntry['kind'], registry: Map<string, unknown> | undefined, engine: Array<[string, unknown, string]>, which: 'properties' | 'params', folder: string) => {
    const seen = new Set<string>();
    // A `Registry` (the engine's) tells its own entries from the built-ins it falls back to.
    const own = (registry as { own?: Map<string, unknown> } | undefined)?.own;
    for (const [name, klass] of registry ?? []) {
      seen.add(name);
      entries.push({ kind, name, description: describe(klass), fields: fieldsOf(klass, which), registered: true, builtin: own ? !own.has(name) : false });
    }
    for (const [name, klass, file] of engine) {
      if (seen.has(name)) continue;
      entries.push({
        kind, name, description: describe(klass), fields: fieldsOf(klass, which), registered: false,
        module: `m2d-engine/${folder}/${file}.js`, exportName: name
      });
    }
  };
  add('actor', registries.actors, ENGINE_ACTORS, 'properties', 'actors');
  add('constraint', registries.constraintTypes, ENGINE_CONSTRAINTS, 'params', 'constraints');
  // The game's own first, then the engine's, then anything a scene cannot name yet.
  const rank = (entry: CatalogEntry) => (!entry.registered ? 2 : entry.builtin ? 1 : 0);
  return entries.sort((a, b) => (a.kind === b.kind ? rank(a) - rank(b) || a.name.localeCompare(b.name) : a.kind === 'actor' ? -1 : 1));
}

/** The lines a definition needs to register an engine class. */
export function registrationSnippet(entry: CatalogEntry): string {
  if (!entry.module) return '';
  const call = entry.kind === 'actor' ? 'registerActor' : 'registerConstraint';
  return `import { ${entry.exportName} } from '${entry.module}';\ngame.${call}('${entry.name}', ${entry.exportName});`;
}
