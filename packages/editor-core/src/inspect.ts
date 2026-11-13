/// <reference path="./engine.d.ts" />
/**
 * The inspector's rows, generated from the schema.
 *
 * This is what phase A1 of the engine plan bought: the format is
 * descriptors, so an inspector does not hard-code a panel per thing — it
 * asks the schema what the fields are. Every declared field appears
 * whether or not the document sets it, with its label, kind, unit and
 * the default or initial it falls back to; keys the schema cannot know
 * (an undeclared actor's bag) appear as what they are. Rendering is the
 * app's job; these rows are the data, so the MCP server can hand an
 * agent exactly what a person sees.
 */

import type { SchemaDescriptor } from 'm2d-engine/core/schema.js';
import { schemaForType } from 'm2d-engine/core/sceneSchema.js';
import {
  descriptorAt, resolveDescriptor, isPlainObject,
  type PathSegment, type ResolveContext
} from './descriptors.ts';

/** Arrays longer than this show a summary instead of every element. */
const ARRAY_LIMIT = 50;

export interface InspectedRow {
  /** The field's key, or an index for an array element. */
  key: string;
  /** What the row says: the descriptor's label, or the key. */
  label: string;
  /** Into the document, from the scene root. */
  path: PathSegment[];
  /** The descriptor's kind, or 'unknown' where the schema has nothing. */
  kind: string;
  /** The document's value, when it sets one. */
  value?: unknown;
  /** Whether the document sets it; a false row shows `fallback` muted. */
  present: boolean;
  /** What absence means: the descriptor's `default` or its `initial`. */
  fallback?: unknown;
  required?: boolean;
  unit?: string;
  description?: string;
  /** The widget hint ('color', 'asset', ...) and the ref scope ('prefab', ...). */
  editor?: string;
  refScope?: string;
  /** For an enum: what it may be. */
  options?: unknown[];
  /** Nested rows, for an object or a short array. */
  children?: InspectedRow[];
  /** For a long array: how many entries the summary stands for. */
  summary?: string;
  /**
   * For a field declared as a union or a tagged union: the shapes it may
   * take, each with a starting value — what a variant picker offers. The
   * row's own `kind` is the shape the document chose.
   */
  alternatives?: Array<{ label: string; value: unknown }>;
  /** For a tuple: each position's descriptor label, for a cell per position. */
  tuple?: Array<{ label?: string; kind: string }>;
  /** For a record: what a new entry starts as (its required fields begun). */
  entryTemplate?: unknown;
  /** For an array: what a new item starts as. */
  itemTemplate?: unknown;
}

export interface InspectOptions {
  /** Registries that let dynamic regions resolve; see `descriptorAt`. */
  registries?: ResolveContext['context'];
  /** How deep nested rows go before a value shows as plain JSON. */
  depth?: number;
}

/**
 * The rows for one node of a scene document — the thing the tree
 * selected, named by its path. The scene's own schema is picked by its
 * `type`; an unknown type still inspects, schema-less.
 */
export function inspectNode(doc: unknown, path: PathSegment[], options: InspectOptions = {}): InspectedRow[] {
  const type = isPlainObject(doc) && typeof doc.type === 'string' ? doc.type : null;
  const schema = type === null ? null : schemaForType(type);
  const registries = {
    prefabs: isPlainObject(doc) && isPlainObject(doc.prefabs) ? doc.prefabs : {},
    ...options.registries
  };
  const depth = options.depth ?? 4;
  if (!schema) return rowsFor(null, pick(doc, path), path, registries, depth, 0);
  const { desc, value } = descriptorAt(schema, doc, path, registries);
  return rowsFor(desc, value, path, registries, depth, 0);
}

/**
 * The rows for one node of any document under any descriptor: what
 * `inspectNode` does for a scene, for a document that is not one (the
 * project file, against `PROJECT_SCHEMA`).
 */
export function inspectWith(schema: SchemaDescriptor, doc: unknown, path: PathSegment[], options: InspectOptions = {}): InspectedRow[] {
  const registries = { prefabs: {}, ...options.registries };
  const { desc, value } = descriptorAt(schema, doc, path, registries);
  return rowsFor(desc, value, path, registries, options.depth ?? 4, 0);
}

function pick(doc: unknown, path: PathSegment[]): unknown {
  let value = doc;
  for (const segment of path) {
    value = isPlainObject(value) || Array.isArray(value)
      ? (value as Record<string, unknown>)[segment as never]
      : undefined;
  }
  return value;
}

type Registries = NonNullable<ResolveContext['context']>;

/** The rows for a value under a (resolved) descriptor. */
function rowsFor(
  desc: SchemaDescriptor | null, value: unknown, path: PathSegment[],
  registries: Registries, maxDepth: number, depth: number
): InspectedRow[] {
  if (desc?.kind === 'object') {
    const fields = desc.fields ?? {};
    const bag = isPlainObject(value) ? value : {};
    const keys = [
      ...Object.keys(fields),
      ...Object.keys(bag).filter((key) => !(key in fields))
    ];
    return keys.map((key) =>
      row(key, fields[key] ?? null, bag[key], key in bag, bag, [...path, key], registries, maxDepth, depth));
  }

  if (desc?.kind === 'record') {
    const bag = isPlainObject(value) ? value : {};
    return Object.keys(bag).map((key) =>
      row(key, desc.value ?? null, bag[key], true, bag, [...path, key], registries, maxDepth, depth));
  }

  if (Array.isArray(value)) {
    if (value.length > ARRAY_LIMIT) return [];
    return value.map((entry, index) => {
      const item = desc?.kind === 'array' ? desc.item ?? null
        : desc?.kind === 'tuple' ? desc.items?.[index] ?? null
          : null;
      return row(String(index), item, entry, true, value, [...path, index], registries, maxDepth, depth);
    });
  }

  if (isPlainObject(value)) {
    // No schema here: the keys are the document's own.
    return Object.keys(value).map((key) =>
      row(key, null, value[key], true, value, [...path, key], registries, maxDepth, depth));
  }

  return [];
}

function row(
  key: string, declared: SchemaDescriptor | null, value: unknown, present: boolean,
  parent: unknown, path: PathSegment[], registries: Registries, maxDepth: number, depth: number
): InspectedRow {
  // Resolved with the containing object as parent, so a dynamic field —
  // an actor's properties, a constraint's params — picks its shape the
  // way the loader would.
  const desc = resolveDescriptor(declared, value, { parent, key, context: registries });
  const out: InspectedRow = {
    key,
    label: (typeof desc?.label === 'string' ? desc.label : undefined) ?? key,
    path,
    kind: desc?.kind ?? 'unknown',
    present,
    required: desc?.required === true || undefined,
    unit: typeof desc?.unit === 'string' ? desc.unit : undefined,
    description: typeof desc?.description === 'string' ? desc.description : undefined,
    editor: typeof desc?.editor === 'string' ? desc.editor : undefined,
    refScope: desc?.kind === 'ref' && typeof desc.scope === 'string' ? desc.scope : undefined,
    options: Array.isArray(desc?.values) ? desc.values : undefined
  };
  if (present) out.value = value;
  const fallback = desc?.default ?? desc?.initial;
  if (fallback !== undefined) out.fallback = fallback;
  const alternatives = alternativesOf(declared);
  if (alternatives.length > 1) out.alternatives = alternatives;
  if (desc?.kind === 'tuple' && desc.items) {
    out.tuple = desc.items.map((item) => ({ label: typeof item.label === 'string' ? item.label : undefined, kind: item.kind }));
  }
  if (desc?.kind === 'record') out.entryTemplate = startingValue(desc.value ?? null) ?? {};
  if (desc?.kind === 'array') out.itemTemplate = startingValue(desc.item ?? null);

  // Only what the document sets expands: an absent object field is one
  // muted row, not a subtree of dashes.
  const nested = present && depth < maxDepth
    && (desc?.kind === 'object' || desc?.kind === 'record' || isPlainObject(value) || Array.isArray(value));
  if (nested) {
    if (Array.isArray(value) && value.length > ARRAY_LIMIT) {
      out.summary = `${value.length} entries`;
    } else {
      const children = rowsFor(desc, value, path, registries, maxDepth, depth + 1);
      if (children.length) out.children = children;
    }
  }
  return out;
}

/**
 * The shapes a union or a tagged union may take, each with a value that
 * satisfies it: an enum branch is one alternative per value, a tagged
 * variant is its tag with the required fields started. Empty for anything
 * that is not a choice of shapes.
 */
function alternativesOf(declared: SchemaDescriptor | null): Array<{ label: string; value: unknown }> {
  if (!declared) return [];
  if (declared.kind === 'union') {
    return (declared.branches ?? []).flatMap((branch) => {
      if (branch.kind === 'enum') return (branch.values ?? []).map((value) => ({ label: String(value), value }));
      return [{ label: shapeLabel(branch), value: startingValue(branch) }];
    });
  }
  if (declared.kind === 'tagged' && declared.tag && declared.variants) {
    return Object.entries(declared.variants).map(([tag, variant]) => ({
      label: tag,
      value: { ...(startingValue(variant) as Record<string, unknown>), [declared.tag!]: tag }
    }));
  }
  return [];
}

function shapeLabel(desc: SchemaDescriptor): string {
  if (typeof desc.label === 'string') return desc.label;
  if (desc.kind === 'object') return `{ ${Object.keys(desc.fields ?? {}).join(', ')} }`;
  return desc.kind;
}

/** A value a descriptor accepts, with its required fields started and its defaults taken. */
export function startingValue(desc: SchemaDescriptor | null): unknown {
  if (!desc) return undefined;
  if (desc.default !== undefined) return desc.default;
  if (desc.initial !== undefined) return desc.initial;
  switch (desc.kind) {
    case 'number': case 'integer': return 0;
    case 'string': case 'ref': return '';
    case 'boolean': return false;
    case 'enum': return desc.values?.[0];
    case 'array': return [];
    case 'record': return {};
    case 'tuple': return (desc.items ?? []).map(startingValue);
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(desc.fields ?? {})) {
        if (field.required === true) out[key] = startingValue(field);
      }
      return out;
    }
    case 'union': return startingValue(desc.branches?.[0] ?? null);
    case 'tagged': {
      const [tag, variant] = Object.entries(desc.variants ?? {})[0] ?? [];
      return tag && variant ? { ...(startingValue(variant) as Record<string, unknown>), [desc.tag!]: tag } : {};
    }
    default: return undefined;
  }
}
