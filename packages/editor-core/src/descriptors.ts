/// <reference path="./engine.d.ts" />
/**
 * Walking the engine's schema descriptors alongside a document.
 *
 * The descriptors are data (`core/schema.js`), and three kinds of them
 * defer the shape to the value — `union` by a `match`, `tagged` by a tag
 * field, `dynamic` by a registry lookup. Everything in this package that
 * walks a document with its schema (the writer's key order, the
 * inspector's field rows) needs the same resolution, so it lives here
 * once.
 */

import type { SchemaDescriptor } from 'm2d-engine/core/schema.js';

/** One step into a document: an object key or an array index. */
export type PathSegment = string | number;

/**
 * What a `dynamic` descriptor's `select` may want to see: the containing
 * object, the key the value sits under, and the registries the loader
 * would supply (`prefabs`, `actors`, `constraintTypes`). All optional —
 * a select that cannot answer returns null and the value is treated as
 * free-form, exactly as the loader treats it with no game.
 */
export interface ResolveContext {
  parent?: unknown;
  key?: string;
  context?: {
    prefabs?: Record<string, unknown>;
    actors?: Map<string, unknown> | null;
    constraintTypes?: Map<string, unknown> | null;
    [extra: string]: unknown;
  };
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Follow `union`, `tagged` and `dynamic` to the concrete descriptor for
 * this value, the way the engine's `validate` does, or null when it
 * cannot be known (an unregistered constraint's params) — in which case
 * the value is free-form.
 */
export function resolveDescriptor(
  desc: SchemaDescriptor | null, value: unknown, ctx: ResolveContext = {}
): SchemaDescriptor | null {
  let current = desc;
  for (let hops = 0; current && hops < 32; hops++) {
    if (current.kind === 'union') {
      current = current.branches?.find(branch => !branch.match || branch.match(value)) ?? null;
    } else if (current.kind === 'tagged') {
      const tag = current.tag !== undefined && isPlainObject(value) ? value[current.tag] : undefined;
      current = (typeof tag === 'string' ? current.variants?.[tag] : undefined) ?? null;
    } else if (current.kind === 'dynamic') {
      try {
        current = current.select?.(value, ctx) ?? null;
      } catch {
        current = null;
      }
    } else {
      return current;
    }
  }
  return current;
}

/**
 * The descriptor and value at a path into a document — `['layers', 0,
 * 'objects', 3]` from a scene's root schema gives the placed object's
 * descriptor and the object itself. Each step resolves through whatever
 * the value chose, carrying parent and key so `dynamic` descriptors
 * (constraint params, actor properties) resolve when `registries` can
 * name their classes.
 *
 * Returns a null descriptor past anything the schema does not describe
 * (an `s.any` region, an unknown key); the value is still followed.
 */
export function descriptorAt(
  root: SchemaDescriptor, doc: unknown, path: PathSegment[],
  registries: ResolveContext['context'] = {}
): { desc: SchemaDescriptor | null; value: unknown } {
  const context = {
    prefabs: isPlainObject(doc) && isPlainObject(doc.prefabs) ? doc.prefabs : {},
    ...registries
  };
  let desc: SchemaDescriptor | null = root;
  let value: unknown = doc;
  let parent: unknown;
  let key: string | undefined;

  for (const segment of path) {
    desc = resolveDescriptor(desc, value, { parent, key, context });
    parent = value;
    key = String(segment);
    value = isPlainObject(parent) || Array.isArray(parent)
      ? (parent as Record<string, unknown>)[segment as never]
      : undefined;

    if (!desc) continue;
    if (desc.kind === 'object') desc = desc.fields?.[segment as string] ?? null;
    else if (desc.kind === 'record') desc = desc.value ?? null;
    else if (desc.kind === 'array') desc = desc.item ?? null;
    else if (desc.kind === 'tuple') desc = desc.items?.[segment as number] ?? null;
    else desc = null;
  }
  return { desc: resolveDescriptor(desc, value, { parent, key, context }) ?? desc, value };
}
