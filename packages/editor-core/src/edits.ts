/**
 * Edits as data: the concrete commands.
 *
 * Every change to a document — the inspector writing a field, a gizmo
 * moving an object, an agent's tool call, an undo — is a list of three
 * kinds of op at a path into the document. Plain records, so an edit
 * crosses a socket, an MCP call or a log unchanged, and a replica of the
 * document applies exactly what the host applied.
 *
 * Applying ops returns their **inverse as ops**, not as a closure. That
 * one choice is what lets the host broadcast an undo the same way it
 * broadcasts an edit (a replica never needs a copy of the host's undo
 * stack), and lets a viewport apply an undo in place exactly as it
 * applies the edit it reverses.
 *
 * Paths are index-based (`['layers', 0, 'objects', 3, 'x']`). History is
 * strictly stack-ordered, so an index an earlier op shifted is shifted
 * back before anything older is undone.
 */

import type { Command } from './commands.ts';
import type { SceneDocument } from './document.ts';
import { isPlainObject, type PathSegment } from './descriptors.ts';

/** Set a field or element; with no `value`, delete the field. */
export interface SetOp { op: 'set'; path: PathSegment[]; value?: unknown }
/** Insert into the array at `path`, before `index`. */
export interface InsertOp { op: 'insert'; path: PathSegment[]; index: number; value: unknown }
/** Remove one element from the array at `path`. */
export interface RemoveOp { op: 'remove'; path: PathSegment[]; index: number }
export type Op = SetOp | InsertOp | RemoveOp;

/** One step of history: what the undo list shows, and what it did. */
export interface Edit {
  label: string;
  ops: Op[];
}

/** An op that cannot apply to this document. Nothing of its edit is applied. */
export class EditError extends Error {
  readonly path: PathSegment[];

  constructor(path: PathSegment[], message: string) {
    super(`Edit at ${formatPath(path) || '(document)'}: ${message}`);
    this.name = 'EditError';
    this.path = path;
  }
}

/** `['layers', 0, 'objects', 3]` as the loader writes it: `layers[0].objects[3]`. */
export function formatPath(path: PathSegment[]): string {
  return path.reduce<string>((text, segment) =>
    typeof segment === 'number' ? `${text}[${segment}]` : text ? `${text}.${segment}` : segment, '');
}

/** `layers[0].objects[3].x` back to `['layers', 0, 'objects', 3, 'x']`: the inverse of `formatPath`. */
export function parsePath(text: string): PathSegment[] {
  const path: PathSegment[] = [];
  for (const [, key, index] of text.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    path.push(index !== undefined ? Number(index) : key!);
  }
  return path;
}

/** The container a path names, or an EditError saying why there is none. */
function containerAt(root: unknown, path: PathSegment[]): Record<string, unknown> | unknown[] {
  let value = root;
  path.forEach((segment, depth) => {
    const next = isPlainObject(value) || Array.isArray(value)
      ? (value as Record<string, unknown>)[segment as never]
      : undefined;
    if (!isPlainObject(next) && !Array.isArray(next)) {
      throw new EditError(path.slice(0, depth + 1), 'there is no object or array here');
    }
    value = next;
  });
  if (!isPlainObject(value) && !Array.isArray(value)) throw new EditError(path, 'there is no object or array here');
  return value as Record<string, unknown> | unknown[];
}

/** JSON values only, and never an alias of the caller's object. */
function own(value: unknown, path: PathSegment[]): unknown {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new EditError(path, `${value} is not a JSON value`);
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new EditError(path, `a ${typeof value} is not a JSON value`);
  }
  return typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) as unknown : value;
}

function applyOne(root: Record<string, unknown>, op: Op): Op {
  if (op.op === 'set') {
    if (op.path.length === 0) throw new EditError(op.path, 'the document itself cannot be set');
    const key = op.path[op.path.length - 1]!;
    const parent = containerAt(root, op.path.slice(0, -1));
    const value = own(op.value, op.path);
    if (Array.isArray(parent)) {
      if (typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key >= parent.length) {
        throw new EditError(op.path, `index ${String(key)} is outside the array (length ${parent.length})`);
      }
      if (value === undefined) throw new EditError(op.path, 'an array element cannot be deleted by set; use remove');
      const before = parent[key];
      parent[key] = value;
      return { op: 'set', path: op.path, value: before };
    }
    const field = String(key);
    const had = Object.hasOwn(parent, field);
    const before = parent[field];
    if (value === undefined) delete parent[field];
    else parent[field] = value;
    return had ? { op: 'set', path: op.path, value: before } : { op: 'set', path: op.path };
  }

  const array = containerAt(root, op.path);
  if (!Array.isArray(array)) throw new EditError(op.path, 'insert and remove need an array');
  if (op.op === 'insert') {
    if (!Number.isInteger(op.index) || op.index < 0 || op.index > array.length) {
      throw new EditError(op.path, `cannot insert at ${op.index} (length ${array.length})`);
    }
    array.splice(op.index, 0, own(op.value, op.path));
    return { op: 'remove', path: op.path, index: op.index };
  }
  if (!Number.isInteger(op.index) || op.index < 0 || op.index >= array.length) {
    throw new EditError(op.path, `cannot remove ${op.index} (length ${array.length})`);
  }
  const [removed] = array.splice(op.index, 1);
  return { op: 'insert', path: op.path, index: op.index, value: removed };
}

/**
 * Apply ops in order and return the ops that undo them, in the order to
 * apply them. All or nothing: an op that fails puts back the ones before
 * it and throws.
 */
export function applyOps(root: Record<string, unknown>, ops: readonly Op[]): Op[] {
  const inverse: Op[] = [];
  try {
    for (const op of ops) inverse.unshift(applyOne(root, op));
  } catch (error) {
    for (const op of inverse) applyOne(root, op);
    throw error;
  }
  return inverse;
}

/**
 * An edit as a command on a document's stack. Its undo applies the
 * inverse ops; `lastOps` reports what the most recent apply or undo did,
 * for a caller that forwards changes (the host to its replicas).
 */
export class EditCommand implements Command<SceneDocument> {
  readonly label: string;
  readonly ops: Op[];
  /** The ops the latest apply or undo of this command applied. */
  lastOps: Op[] = [];
  /** Who made it: 'editor', 'agent', ... Shown beside the label. */
  readonly origin: string;

  constructor(edit: Edit, origin = 'editor') {
    this.label = edit.label;
    this.ops = edit.ops;
    this.origin = origin;
  }

  apply(doc: SceneDocument) {
    const inverse = applyOps(doc.data, this.ops);
    this.lastOps = this.ops;
    return () => {
      applyOps(doc.data, inverse);
      this.lastOps = inverse;
    };
  }
}

/**
 * An id not yet taken by any object, prop or element in the document,
 * from `base`: `crate` → `crate-2`, `crate-7` → `crate-8`. The loader
 * never invents one, so anything the editor adds goes through here.
 */
export function uniqueId(doc: unknown, base: string): string {
  const taken = new Set<string>();
  const data = isPlainObject(doc) ? doc : {};
  for (const layer of Array.isArray(data.layers) ? data.layers : []) {
    if (!isPlainObject(layer)) continue;
    for (const list of [layer.objects, layer.props, layer.scenes]) {
      for (const entry of Array.isArray(list) ? list : []) {
        if (isPlainObject(entry) && typeof entry.id === 'string') taken.add(entry.id);
      }
    }
  }
  for (const element of Array.isArray(data.elements) ? data.elements : []) {
    if (isPlainObject(element) && typeof element.id === 'string') taken.add(element.id);
  }
  const match = /^(.*?)-(\d+)$/.exec(base);
  const stem = match ? match[1]! : base;
  let n = match ? Number(match[2]) : 1;
  let id = match ? `${stem}-${n}` : stem;
  while (taken.has(id)) id = `${stem}-${++n}`;
  return id;
}
