/**
 * The component catalog: every actor and constraint the editor can offer,
 * with what each declares.
 *
 * Two sources. The **game's registries** — what its definition's
 * `register(game)` put in `game.actors` and `game.constraintTypes` — are
 * what a scene may name today, each with the origin the registry records
 * (the engine's built-ins, a kit's registration, or the game's own code).
 * The **engine's unregistered classes**, read from the engine's own
 * `BUILTIN_*` maps rather than a list kept here, are what a game *could*
 * register; one the game has not is shown with the two lines that would.
 */

import { BUILTIN_ACTORS, BUILTIN_CONSTRAINTS } from 'm2d-engine';

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
  kind: 'actor' | 'constraint' | 'prefab';
  name: string;
  description: string;
  fields: CatalogField[];
  /** Whether a scene may name it: the game registered it, or the engine ships it (`builtin`). */
  registered: boolean;
  /** Where a registered name comes from: the engine's built-ins, a kit, or the game's own code. */
  origin?: 'engine' | 'kit' | 'game';
  /** An engine class the game did not register itself; a scene may still name it. */
  builtin?: boolean;
  /** For an engine class the game does not register: the module to import it from. */
  module?: string;
  /** For an engine class whose name differs from its export. */
  exportName?: string;
  /** A prefab template: `{ description, dimensions, prefab }`, the entry a scene's `prefabs` takes. */
  template?: { description?: string; dimensions?: 2 | 3; prefab: Record<string, unknown> };
  /** The one scene dimension the entry works in, an actor's `static dimensions` or a template's; absent, both. */
  dimensions?: 2 | 3;
}

interface ClassLike {
  description?: unknown;
  dimensions?: unknown;
  properties?: unknown;
  params?: unknown;
}

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

const dimensionOf = (klass: unknown): 2 | 3 | undefined => {
  const dimensions = (klass as ClassLike | null)?.dimensions;
  return dimensions === 2 || dimensions === 3 ? dimensions : undefined;
};

/**
 * The catalog for a game's registries. Entries the game registers come
 * first in each kind, then the engine's unregistered ones, each sorted by
 * name.
 */
export function buildCatalog(registries: { actors?: Map<string, unknown>; constraintTypes?: Map<string, unknown>; prefabTemplates?: Map<string, unknown> }): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const add = (kind: CatalogEntry['kind'], registry: Map<string, unknown> | undefined, engine: Map<string, unknown>, which: 'properties' | 'params') => {
    const seen = new Set<string>();
    // A `Registry` (the engine's) records where each name came from.
    const reg = registry as { own?: Map<string, unknown>; originOf?(name: string): CatalogEntry['origin'] } | undefined;
    for (const [name, klass] of registry ?? []) {
      seen.add(name);
      const origin = reg?.originOf?.(name) ?? (reg?.own ? (reg.own.has(name) ? 'game' : 'engine') : 'game');
      entries.push({ kind, name, description: describe(klass), fields: fieldsOf(klass, which), registered: true, origin, builtin: origin === 'engine', dimensions: dimensionOf(klass) });
    }
    for (const [name, klass] of engine) {
      if (seen.has(name)) continue;
      entries.push({
        kind, name, description: describe(klass), fields: fieldsOf(klass, which), registered: false,
        module: kind === 'actor' ? 'm2d-engine/actors' : 'm2d-engine/constraints', exportName: name
      });
    }
  };
  add('actor', registries.actors, BUILTIN_ACTORS as Map<string, unknown>, 'properties');
  add('constraint', registries.constraintTypes, BUILTIN_CONSTRAINTS as Map<string, unknown>, 'params');
  const templates = registries.prefabTemplates as { originOf?(name: string): CatalogEntry['origin'] } & Map<string, unknown> | undefined;
  for (const [name, given] of templates ?? []) {
    const template = given as NonNullable<CatalogEntry['template']>;
    entries.push({
      kind: 'prefab', name, description: template.description ?? '', fields: [],
      registered: true, origin: templates?.originOf?.(name) ?? 'game', template, dimensions: template.dimensions
    });
  }
  // The game's own first, then a kit's, then the engine's, then anything a scene cannot name yet.
  const rank = (entry: CatalogEntry) => (!entry.registered ? 3 : entry.origin === 'engine' ? 2 : entry.origin === 'kit' ? 1 : 0);
  // Prefab templates first (a whole thing to drop in), then actors, then constraints.
  const kindRank = (entry: CatalogEntry) => (entry.kind === 'prefab' ? 0 : entry.kind === 'actor' ? 1 : 2);
  return entries.sort((a, b) => kindRank(a) - kindRank(b) || rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The lines a definition needs to register an engine class. */
export function registrationSnippet(entry: CatalogEntry): string {
  if (!entry.module) return '';
  const call = entry.kind === 'actor' ? 'registerActor' : 'registerConstraint';
  return `import { ${entry.exportName} } from '${entry.module}';\ngame.${call}('${entry.name}', ${entry.exportName});`;
}
