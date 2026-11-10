/**
 * Structural edits, as ops: the changes that add to, rename or rearrange
 * a scene's containers rather than tune a field in one.
 *
 * One place for them, on purpose (docs/plans/editor-e6-e9.md): the GUI
 * and the MCP tools both call these, so neither can do what the other
 * cannot, and a rename that has to carry its references (a prefab's name
 * is written in every object that uses it) is right in both. Each
 * function reads the document and returns the ops to apply; nothing here
 * applies them.
 */

import { isPlainObject, type PathSegment } from './descriptors.ts';
import { uniqueId, type Op } from './edits.ts';

/** A deep copy of plain JSON data; this package's `lib` has no DOM, so no `structuredClone`. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The data at a path. */
export function valueAt(doc: unknown, path: PathSegment[]): unknown {
  let value = doc;
  for (const segment of path) {
    value = isPlainObject(value) || Array.isArray(value) ? (value as Record<string, unknown>)[segment as never] : undefined;
  }
  return value;
}

/** An op that sets `value` at `path`, creating the first missing container on the way. */
export function setDeep(doc: unknown, path: PathSegment[], value: unknown): Op {
  for (let depth = 1; depth < path.length; depth++) {
    if (valueAt(doc, path.slice(0, depth)) === undefined) {
      let nested: unknown = value;
      for (let i = path.length - 1; i >= depth; i--) nested = { [path[i] as string]: nested };
      return { op: 'set', path: path.slice(0, depth), value: nested };
    }
  }
  return { op: 'set', path, value };
}

/** A key not yet in the record at `path`: `base` itself when free, else `stem-2`, `stem-3`… */
export function uniqueKey(doc: unknown, path: PathSegment[], base: string): string {
  const record = valueAt(doc, path);
  const taken = isPlainObject(record) ? record : {};
  if (base && !(base in taken)) return base;
  const stem = base.replace(/-\d+$/, '') || 'entry';
  if (!(stem in taken)) return stem;
  for (let n = 2; ; n++) if (!(`${stem}-${n}` in taken)) return `${stem}-${n}`;
}

// --- Records ---------------------------------------------------------------

/** Add `key` to the record at `path`. Refuses a key already there. */
export function addEntry(doc: unknown, path: PathSegment[], key: string, value: unknown): Op[] {
  if (!key) throw new Error('an entry needs a name');
  const record = valueAt(doc, path);
  if (isPlainObject(record) && key in record) throw new Error(`'${key}' is already in ${path.join('.') || 'the document'}`);
  return [setDeep(doc, [...path, key], value)];
}

/** Remove `key` from the record at `path`. */
export function removeEntry(doc: unknown, path: PathSegment[], key: string): Op[] {
  return [{ op: 'set', path: [...path, key] }];
}

/**
 * Rename a record entry, carrying its references: a prefab's name lives
 * in every object and prop that uses it, a sprite sheet's in the prefabs
 * and tile layers that draw it, a model's and an environment's in the
 * mesh blocks and the world that name them.
 */
export function renameEntry(doc: unknown, path: PathSegment[], from: string, to: string): Op[] {
  if (!to) throw new Error('an entry needs a name');
  if (from === to) return [];
  const record = valueAt(doc, path);
  if (!isPlainObject(record) || !(from in record)) throw new Error(`'${from}' is not in ${path.join('.')}`);
  if (to in record) throw new Error(`'${to}' is already in ${path.join('.')}`);
  const ops: Op[] = [
    { op: 'set', path: [...path, to], value: record[from] },
    { op: 'set', path: [...path, from] }
  ];
  const data = isPlainObject(doc) ? doc : {};
  const key = path.join('.');
  const eachObject = (visit: (object: Record<string, unknown>, at: PathSegment[]) => void) => {
    const layers = Array.isArray(data.layers) ? data.layers : [];
    layers.forEach((layer, l) => {
      if (!isPlainObject(layer)) return;
      for (const list of ['objects', 'props'] as const) {
        const items = Array.isArray(layer[list]) ? layer[list] as unknown[] : [];
        items.forEach((item, i) => { if (isPlainObject(item)) visit(item, ['layers', l, list, i]); });
      }
    });
  };
  const eachPrefab = (visit: (prefab: Record<string, unknown>, at: PathSegment[]) => void) => {
    const prefabs = isPlainObject(data.prefabs) ? data.prefabs : {};
    for (const [name, prefab] of Object.entries(prefabs)) if (isPlainObject(prefab)) visit(prefab, ['prefabs', name]);
  };
  if (key === 'prefabs') {
    eachObject((item, at) => { if (item.prefab === from) ops.push({ op: 'set', path: [...at, 'prefab'], value: to }); });
  } else if (key === 'assets.spritesheets') {
    eachPrefab((prefab, at) => { if (prefab.spritesheet === from) ops.push({ op: 'set', path: [...at, 'spritesheet'], value: to }); });
    eachObject((item, at) => {
      const overrides = isPlainObject(item.overrides) ? item.overrides : null;
      if (overrides?.spritesheet === from) ops.push({ op: 'set', path: [...at, 'overrides', 'spritesheet'], value: to });
    });
    const tiles = Array.isArray(data.tileLayers) ? data.tileLayers : [];
    tiles.forEach((layer, i) => { if (isPlainObject(layer) && layer.spritesheet === from) ops.push({ op: 'set', path: ['tileLayers', i, 'spritesheet'], value: to }); });
    if (isPlainObject(data.background) && data.background.spritesheet === from) ops.push({ op: 'set', path: ['background', 'spritesheet'], value: to });
  } else if (key === 'assets.models') {
    eachPrefab((prefab, at) => { if (isPlainObject(prefab.mesh) && prefab.mesh.model === from) ops.push({ op: 'set', path: [...at, 'mesh', 'model'], value: to }); });
    eachObject((item, at) => {
      const mesh = isPlainObject(item.overrides) && isPlainObject(item.overrides.mesh) ? item.overrides.mesh : null;
      if (mesh?.model === from) ops.push({ op: 'set', path: [...at, 'overrides', 'mesh', 'model'], value: to });
    });
  } else if (key === 'assets.environments') {
    if (isPlainObject(data.world) && data.world.environment === from) ops.push({ op: 'set', path: ['world', 'environment'], value: to });
  }
  return ops;
}

// --- Prefabs -----------------------------------------------------------------

/** A new prefab of `actor`, named like `name`, with a body and a look fitting the level's dimension. */
export function addPrefab(doc: unknown, name: string, actor: string, dimensions: 2 | 3): { ops: Op[]; name: string } {
  const key = uniqueKey(doc, ['prefabs'], name);
  const prefab: Record<string, unknown> = { actor, physics: { bodyType: 'static' } };
  if (dimensions === 3) prefab.mesh = { color: '#9aa4b2', roughness: 0.8 };
  return { ops: addEntry(doc, ['prefabs'], key, prefab), name: key };
}

/** A copy of a prefab under a new name; objects keep pointing at the original. */
export function duplicatePrefab(doc: unknown, name: string): { ops: Op[]; name: string } {
  const prefab = valueAt(doc, ['prefabs', name]);
  if (!isPlainObject(prefab)) throw new Error(`there is no prefab '${name}'`);
  const key = uniqueKey(doc, ['prefabs'], name);
  return { ops: addEntry(doc, ['prefabs'], key, clone(prefab)), name: key };
}

/**
 * Turn a placed object's overrides into a prefab of their own: a new
 * prefab from the object's current prefab under its overrides, the object
 * re-pointed at it and its overrides dropped.
 */
export function objectToPrefab(doc: unknown, objectPath: PathSegment[], name?: string): { ops: Op[]; name: string } {
  const object = valueAt(doc, objectPath);
  if (!isPlainObject(object) || typeof object.prefab !== 'string') throw new Error('not a placed object');
  const base = valueAt(doc, ['prefabs', object.prefab]);
  if (!isPlainObject(base)) throw new Error(`there is no prefab '${object.prefab}'`);
  const overrides = isPlainObject(object.overrides) ? object.overrides : {};
  const merged: Record<string, unknown> = clone({ ...base, ...overrides });
  for (const block of ['physics', 'mesh', 'light'] as const) {
    if (isPlainObject(base[block]) || isPlainObject(overrides[block])) {
      merged[block] = clone({ ...(isPlainObject(base[block]) ? base[block] : {}), ...(isPlainObject(overrides[block]) ? overrides[block] : {}) });
    }
  }
  const key = uniqueKey(doc, ['prefabs'], name ?? (typeof object.id === 'string' ? object.id : object.prefab));
  const ops = addEntry(doc, ['prefabs'], key, merged);
  ops.push({ op: 'set', path: [...objectPath, 'prefab'], value: key });
  if (object.overrides !== undefined) ops.push({ op: 'set', path: [...objectPath, 'overrides'] });
  return { ops, name: key };
}

// --- Constraints -------------------------------------------------------------

/** A slot name for a constraint type: `KeyboardControl` → `keyboardControl`. */
export function slotFor(type: string): string {
  return type ? type.charAt(0).toLowerCase() + type.slice(1) : 'constraint';
}

/**
 * Attach a constraint to a prefab or a placed object: an entry in its
 * `constraints` under a free slot, with the type and any params given.
 */
export function attachConstraint(doc: unknown, ownerPath: PathSegment[], type: string, params: Record<string, unknown> = {}, slot?: string): { ops: Op[]; slot: string } {
  if (!type) throw new Error('a constraint needs a type');
  const key = slot ?? uniqueKey(doc, [...ownerPath, 'constraints'], slotFor(type));
  const entry: Record<string, unknown> = { type };
  if (Object.keys(params).length) entry.params = params;
  return { ops: addEntry(doc, [...ownerPath, 'constraints'], key, entry), slot: key };
}

// --- Layers ------------------------------------------------------------------

/** A new, empty layer after the last (or at `index`). */
export function addLayer(doc: unknown, name: string, index?: number): Op[] {
  const layers = valueAt(doc, ['layers']);
  if (!Array.isArray(layers)) return [{ op: 'set', path: ['layers'], value: [{ name, objects: [] }] }];
  return [{ op: 'insert', path: ['layers'], index: index ?? layers.length, value: { name, objects: [] } }];
}

export function removeLayer(doc: unknown, index: number): Op[] {
  const layers = valueAt(doc, ['layers']);
  if (!Array.isArray(layers) || !layers[index]) throw new Error(`there is no layer ${index}`);
  return [{ op: 'remove', path: ['layers'], index }];
}

/** Move a layer to another position in the draw order. */
export function moveLayer(doc: unknown, from: number, to: number): Op[] {
  const layers = valueAt(doc, ['layers']);
  if (!Array.isArray(layers) || !layers[from]) throw new Error(`there is no layer ${from}`);
  const target = Math.max(0, Math.min(layers.length - 1, to));
  if (target === from) return [];
  return [
    { op: 'remove', path: ['layers'], index: from },
    { op: 'insert', path: ['layers'], index: target, value: layers[from] }
  ];
}

/**
 * Move a placed object to another layer, or to another slot in its own
 * (the draw order among objects of one layer is their order). `index`
 * omitted appends.
 */
export function moveObject(doc: unknown, objectPath: PathSegment[], toLayer: number, index?: number): Op[] {
  const [, fromLayer, , fromIndex] = objectPath as ['layers', number, 'objects', number];
  const object = valueAt(doc, objectPath);
  if (!isPlainObject(object)) throw new Error('not a placed object');
  const layers = valueAt(doc, ['layers']);
  if (!Array.isArray(layers) || !isPlainObject(layers[toLayer])) throw new Error(`there is no layer ${toLayer}`);
  const targetObjects = Array.isArray((layers[toLayer] as Record<string, unknown>).objects) ? (layers[toLayer] as { objects: unknown[] }).objects : [];
  // After the removal, the target list is one shorter when it is the same layer.
  const length = targetObjects.length - (toLayer === fromLayer ? 1 : 0);
  const at = Math.max(0, Math.min(length, index ?? length));
  if (toLayer === fromLayer && at === fromIndex) return [];
  const ops: Op[] = [{ op: 'remove', path: ['layers', fromLayer, 'objects'], index: fromIndex }];
  if (!Array.isArray((layers[toLayer] as Record<string, unknown>).objects)) ops.push({ op: 'set', path: ['layers', toLayer, 'objects'], value: [] });
  ops.push({ op: 'insert', path: ['layers', toLayer, 'objects'], index: at, value: object });
  return ops;
}

// --- Objects, in bulk ---------------------------------------------------------

/** The path of the placed object with this id, if there is one. */
export function objectPathOf(doc: unknown, id: string): PathSegment[] | null {
  const layers = valueAt(doc, ['layers']);
  if (!Array.isArray(layers)) return null;
  for (const [l, layer] of layers.entries()) {
    const objects = isPlainObject(layer) && Array.isArray(layer.objects) ? layer.objects : [];
    const index = objects.findIndex((object) => isPlainObject(object) && object.id === id);
    if (index >= 0) return ['layers', l, 'objects', index];
  }
  return null;
}

/** Remove several placed objects at once: highest index first, so the earlier paths hold. */
export function removeObjects(doc: unknown, ids: string[]): Op[] {
  const paths = ids.map((id) => objectPathOf(doc, id)).filter((path): path is PathSegment[] => !!path);
  paths.sort((a, b) => (b[1] as number) - (a[1] as number) || (b[3] as number) - (a[3] as number));
  return paths.map((path) => ({ op: 'remove', path: path.slice(0, 3), index: path[3] as number }));
}

/**
 * Insert copies of placed objects into a layer, ids made unique, each
 * offset by `offset`. Returns the ops and the new ids, in order.
 */
export function insertObjects(
  doc: unknown, objects: Array<Record<string, unknown>>, layer: number, offset: { x?: number; y?: number; z?: number } = {}
): { ops: Op[]; ids: string[] } {
  const layers = valueAt(doc, ['layers']);
  if (!Array.isArray(layers) || !isPlainObject(layers[layer])) throw new Error(`there is no layer ${layer}`);
  const existing = Array.isArray((layers[layer] as Record<string, unknown>).objects) ? (layers[layer] as { objects: unknown[] }).objects.length : 0;
  // Ids must be unique against the document *and* each other: track them as they are taken.
  const scratch = clone(doc) as Record<string, unknown>;
  const ops: Op[] = [];
  const ids: string[] = [];
  objects.forEach((source, i) => {
    const copy = clone(source);
    const base = typeof copy.id === 'string' ? copy.id : (typeof copy.prefab === 'string' ? copy.prefab : 'object');
    copy.id = uniqueId(scratch, base);
    for (const axis of ['x', 'y', 'z'] as const) {
      if (offset[axis] && typeof copy[axis] === 'number') copy[axis] = (copy[axis] as number) + offset[axis]!;
    }
    ops.push({ op: 'insert', path: ['layers', layer, 'objects'], index: existing + i, value: copy });
    ids.push(copy.id as string);
    ((scratch.layers as unknown[])[layer] as { objects: unknown[] }).objects.push(copy);
  });
  return { ops, ids };
}

/** Every placed object using a prefab, by id. */
export function objectsOfPrefab(doc: unknown, prefab: string): string[] {
  const ids: string[] = [];
  const layers = valueAt(doc, ['layers']);
  for (const layer of Array.isArray(layers) ? layers : []) {
    for (const object of isPlainObject(layer) && Array.isArray(layer.objects) ? layer.objects : []) {
      if (isPlainObject(object) && object.prefab === prefab && typeof object.id === 'string') ids.push(object.id);
    }
  }
  return ids;
}

/**
 * Line several objects up on one axis — to the least, the middle or the
 * greatest of their positions — or spread them evenly between the two
 * outermost. Each object's own position moves; the first and last stay
 * put under `distribute`.
 */
export function arrangeObjects(
  doc: unknown, ids: string[], axis: 'x' | 'y' | 'z', how: 'min' | 'center' | 'max' | 'distribute'
): Op[] {
  const placed = ids.flatMap((id) => {
    const path = objectPathOf(doc, id);
    const object = path ? valueAt(doc, path) : null;
    const value = isPlainObject(object) && typeof object[axis] === 'number' ? object[axis] as number : (axis === 'z' ? 0 : null);
    return path && value !== null ? [{ path, value }] : [];
  });
  if (placed.length < 2) return [];
  const round = (value: number) => Math.round(value * 1e4) / 1e4;
  const values = placed.map((p) => p.value);
  const ops: Op[] = [];
  if (how === 'distribute') {
    const sorted = [...placed].sort((a, b) => a.value - b.value);
    const lo = sorted[0]!.value;
    const hi = sorted[sorted.length - 1]!.value;
    sorted.forEach((p, i) => {
      const target = round(lo + ((hi - lo) * i) / (sorted.length - 1));
      if (target !== p.value) ops.push({ op: 'set', path: [...p.path, axis], value: target });
    });
    return ops;
  }
  const target = round(how === 'min' ? Math.min(...values) : how === 'max' ? Math.max(...values) : (Math.min(...values) + Math.max(...values)) / 2);
  for (const p of placed) if (p.value !== target) ops.push({ op: 'set', path: [...p.path, axis], value: target });
  return ops;
}

// --- Scenes ------------------------------------------------------------------

/** A blank level or UI scene, the smallest the loader accepts, named. */
export function blankScene(name: string, type: 'level' | 'ui', version: number, dimensions: 2 | 3 = 2): Record<string, unknown> {
  if (type === 'ui') return { version, name, type: 'ui', elements: [] };
  return {
    version, name, type: 'level',
    world: dimensions === 3 ? { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } } : { width: 960, height: 540, gravity: { x: 0, y: 900 } },
    prefabs: {},
    layers: [{ name: 'main', objects: [] }]
  };
}
