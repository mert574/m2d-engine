/**
 * Resizing a placed object as ops.
 *
 * An object's `width`, `height` and `depth` size its body, and a shape
 * mesh draws at the body's size — so for a block, resizing is three
 * fields. A *model* draws at its own `mesh.scale` whatever the body does,
 * which is why a dropped model that came in small stayed small however
 * the box around it was dragged. Here a resize of a model object is
 * uniform and carries the model with it: the three sizes scale by one
 * factor, and `overrides.mesh.scale` (and the `offset` that seats the
 * model in its box, which is in metres and so scales too) follow.
 */

import { isPlainObject, type Op, type PathSegment } from 'm2d-editor-core';

/** The schema's default size, when an object leaves one out. */
const DEFAULT_OBJECT_SIZE = 32;

export interface Sizes { width?: number; height?: number; depth?: number }

const SIZE_KEYS = ['width', 'height', 'depth'] as const;

/** The data at a document path. */
export function at(doc: unknown, path: PathSegment[]): unknown {
  let value: unknown = doc;
  for (const segment of path) {
    value = isPlainObject(value) || Array.isArray(value) ? (value as Record<string, unknown>)[segment as never] : undefined;
  }
  return value;
}

/** An op that sets `value` at `path`, creating the first missing container on the way. */
export function setDeep(doc: unknown, path: PathSegment[], value: unknown): Op {
  for (let depth = 1; depth < path.length; depth++) {
    if (at(doc, path.slice(0, depth)) === undefined) {
      let nested: unknown = value;
      for (let i = path.length - 1; i >= depth; i--) nested = { [path[i] as string]: nested };
      return { op: 'set', path: path.slice(0, depth), value: nested };
    }
  }
  return { op: 'set', path, value };
}

/** The mesh block a placed object draws with: its prefab's, under its overrides. */
export function effectiveMesh(doc: unknown, path: PathSegment[]): Record<string, unknown> | null {
  const object = at(doc, path);
  if (!isPlainObject(object)) return null;
  const prefabs = isPlainObject(doc) && isPlainObject(doc.prefabs) ? doc.prefabs : {};
  const prefab = typeof object.prefab === 'string' && isPlainObject(prefabs[object.prefab]) ? prefabs[object.prefab] as Record<string, unknown> : {};
  const overrides = isPlainObject(object.overrides) && isPlainObject(object.overrides.mesh) ? object.overrides.mesh : {};
  const base = isPlainObject(prefab.mesh) ? prefab.mesh : {};
  const mesh = { ...base, ...overrides };
  return Object.keys(mesh).length ? mesh : null;
}

/** Whether a placed object in a 3D level draws a model, which only scales uniformly. */
export function scalesUniformly(doc: unknown, path: PathSegment[], dimensions: 2 | 3): boolean {
  if (dimensions !== 3) return false;
  return typeof effectiveMesh(doc, path)?.model === 'string';
}

/** The object's sizes as the loader would take them: the document's, or the default. */
export function currentSizes(doc: unknown, path: PathSegment[], dimensions: 2 | 3): Required<Sizes> {
  const object = at(doc, path);
  const number = (key: string, fallback: number) =>
    (isPlainObject(object) && typeof object[key] === 'number' ? object[key] as number : fallback);
  const width = number('width', DEFAULT_OBJECT_SIZE);
  const height = number('height', DEFAULT_OBJECT_SIZE);
  // Without a depth, a 3D body is as deep as it is wide.
  const depth = number('depth', dimensions === 3 ? width : DEFAULT_OBJECT_SIZE);
  return { width, height, depth };
}

const round = (value: number) => Math.round(value * 1e4) / 1e4;

/**
 * The ops that give the object at `path` the sizes in `next` (any subset).
 * For a model object the change is made uniform from the first axis
 * given, and the mesh's scale and offset scale with it.
 */
export function resizeOps(doc: unknown, path: PathSegment[], next: Sizes, dimensions: 2 | 3): Op[] {
  const current = currentSizes(doc, path, dimensions);
  const ops: Op[] = [];
  const keys = dimensions === 3 ? SIZE_KEYS : (['width', 'height'] as const);

  if (!scalesUniformly(doc, path, dimensions)) {
    for (const key of keys) {
      const value = next[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) ops.push({ op: 'set', path: [...path, key], value: round(value) });
    }
    return ops;
  }

  const lead = keys.find((key) => typeof next[key] === 'number' && Number.isFinite(next[key]) && next[key]! > 0);
  if (!lead) return ops;
  const factor = next[lead]! / current[lead];
  if (!Number.isFinite(factor) || factor <= 0) return ops;
  for (const key of keys) ops.push({ op: 'set', path: [...path, key], value: round(current[key] * factor) });
  if (Math.abs(factor - 1) < 1e-9) return ops;

  const mesh = effectiveMesh(doc, path) ?? {};
  const scale = typeof mesh.scale === 'number' ? mesh.scale : 1;
  const patch: Record<string, unknown> = { scale: round(scale * factor) };
  if (isPlainObject(mesh.offset)) {
    const o = mesh.offset as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === 'number' ? round(v * factor) : 0);
    patch.offset = { x: n(o.x), y: n(o.y), z: n(o.z) };
  }
  // Into the object's own mesh overrides: key by key when the block is
  // there, else the block in one piece (two deep sets on a missing
  // container would each create it, the second undoing the first).
  const object = at(doc, path) as Record<string, unknown>;
  const own = isPlainObject(object.overrides) && isPlainObject(object.overrides.mesh) ? object.overrides.mesh : null;
  if (own) {
    for (const [key, value] of Object.entries(patch)) ops.push({ op: 'set', path: [...path, 'overrides', 'mesh', key], value });
  } else {
    ops.push(setDeep(doc, [...path, 'overrides', 'mesh'], patch));
  }
  return ops;
}
