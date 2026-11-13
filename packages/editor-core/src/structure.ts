/**
 * Structural edits, as ops: the changes that add to, rename or rearrange
 * a scene's containers rather than tune a field in one.
 *
 * One place for them, on purpose (knowledge-base/projects/editor/editor-e6-e9.md): the GUI
 * and the MCP tools both call these, so neither can do what the other
 * cannot, and a rename that has to carry its references (a prefab's name
 * is written in every object that uses it) is right in both. Each
 * function reads the document and returns the ops to apply; nothing here
 * applies them.
 */

import { isPlainObject, valueAt, type PathSegment } from './descriptors.ts';
import { renamePathReferences, type PathPoint } from './paths.ts';
import { uniqueId, type Op } from './edits.ts';
import { fromAxisAngle, forScene, toEuler, type Quaternion } from './rotation.ts';

/** A deep copy of plain JSON data; this package's `lib` has no DOM, so no `structuredClone`. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export { valueAt };

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
 * mesh blocks and the world that name them, a path's in every `path`
 * field of the objects and prefabs that follow it.
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
  } else if (key === 'paths') {
    ops.push(...renamePathReferences(doc, from, to));
  }
  return ops;
}

// --- Paths -------------------------------------------------------------------

/** A new named path from `start` to a point `span` world units along x. */
export function addPath(doc: unknown, base: string, start: PathPoint, span: number): { ops: Op[]; name: string } {
  const name = uniqueKey(doc, ['paths'], base);
  return { ops: addEntry(doc, ['paths'], name, { points: [start, { ...start, x: start.x + span }] }), name };
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

// --- Scene instances (composition) ----------------------------------------------

/**
 * Place another level scene whole into a layer (composition): an instance
 * entry under a unique id, at a position. The scene must be one the game
 * registers; the loader expands it when the level loads.
 */
export function addSceneInstance(
  doc: unknown, layer: number, scene: string, position: { x: number; y: number; z?: number }
): { ops: Op[]; id: string } {
  if (!scene) throw new Error('an instance needs a scene');
  const layers = valueAt(doc, ['layers']);
  if (!Array.isArray(layers) || !isPlainObject(layers[layer])) throw new Error(`there is no layer ${layer}`);
  const id = uniqueId(doc, scene);
  const entry: Record<string, unknown> = { id, scene, x: position.x, y: position.y };
  if (position.z !== undefined) entry.z = position.z;
  const existing = (layers[layer] as Record<string, unknown>).scenes;
  const ops: Op[] = Array.isArray(existing)
    ? [{ op: 'insert', path: ['layers', layer, 'scenes'], index: existing.length, value: entry }]
    : [{ op: 'set', path: ['layers', layer, 'scenes'], value: [entry] }];
  return { ops, id };
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

// --- Props (E7b) ---------------------------------------------------------------

/** A prop instance as the scene holds it: `[x, y, z, yaw, scale]`. */
export type PropInstance = [number, number, number, number, number];

/** What a prop's `width`/`height` mean when absent (the schema's default). */
const PROP_DEFAULT_SIZE = 32;

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/** The up axis, for a yaw as a scene quaternion. */
const UP = { x: 0, y: 1, z: 0 };

/** The prop group at `['layers', l, 'props', p]`, checked. */
function propGroup(doc: unknown, propPath: PathSegment[]): Record<string, unknown> & { instances: unknown[] } {
  const group = valueAt(doc, propPath);
  if (!isPlainObject(group) || !Array.isArray(group.instances)) throw new Error('not a prop group');
  return group as Record<string, unknown> & { instances: unknown[] };
}

/**
 * Plant instances into a prop group — a scatter stroke, as one op: the
 * group's `instances` with the new tuples appended. One set, one step of
 * undo per stroke.
 */
export function scatterProps(doc: unknown, propPath: PathSegment[], points: PropInstance[]): Op[] {
  const group = propGroup(doc, propPath);
  if (!points.length) return [];
  const planted = points.map((tuple) => tuple.map(round4));
  return [{ op: 'set', path: [...propPath, 'instances'], value: [...group.instances, ...planted] }];
}

/** Erase instances from a prop group by index, as one op. */
export function erasePropInstances(doc: unknown, propPath: PathSegment[], indices: number[]): Op[] {
  const group = propGroup(doc, propPath);
  const gone = new Set(indices);
  if (!gone.size) return [];
  const kept = group.instances.filter((_, i) => !gone.has(i));
  if (kept.length === group.instances.length) return [];
  return [{ op: 'set', path: [...propPath, 'instances'], value: kept }];
}

/**
 * Turn one prop instance into a placed object: the group's prefab at the
 * instance's position, its yaw as a rotation, the group's size times the
 * instance's scale, and — when the prefab draws a model — the scale
 * carried onto `overrides.mesh.scale` so the model draws exactly where
 * and how big it did. The instance leaves the group.
 */
export function promotePropInstance(doc: unknown, instancePath: PathSegment[], name?: string): { ops: Op[]; id: string } {
  const propPath = instancePath.slice(0, 4);
  const at = instancePath[instancePath.length - 1];
  if (typeof at !== 'number' || instancePath[instancePath.length - 2] !== 'instances') throw new Error('not a prop instance');
  const group = propGroup(doc, propPath);
  const tuple = group.instances[at];
  if (!Array.isArray(tuple)) throw new Error('not a prop instance');
  const [x = 0, y = 0, z = 0, yaw = 0, scale = 1] = tuple as number[];
  const prefabName = typeof group.prefab === 'string' ? group.prefab : '';
  if (!prefabName) throw new Error('the prop group names no prefab');
  const prefab = valueAt(doc, ['prefabs', prefabName]);
  const id = uniqueId(doc, name ?? prefabName);
  const size = (key: 'width' | 'height' | 'depth') => {
    const own = typeof group[key] === 'number' ? group[key] as number : key === 'depth' ? (typeof group.width === 'number' ? group.width as number : PROP_DEFAULT_SIZE) : PROP_DEFAULT_SIZE;
    return round4(own * scale);
  };
  const object: Record<string, unknown> = {
    id, prefab: prefabName,
    x: round4(x), y: round4(y), z: round4(z),
    width: size('width'), height: size('height'), depth: size('depth')
  };
  if (yaw) object.rotation = forScene(fromAxisAngle(UP, yaw));
  const mesh = isPlainObject(prefab) && isPlainObject(prefab.mesh) ? prefab.mesh : null;
  if (mesh?.model && scale !== 1) {
    const offset = isPlainObject(mesh.offset) ? mesh.offset as { x?: number; y?: number; z?: number } : null;
    object.overrides = {
      mesh: {
        scale: round4(((typeof mesh.scale === 'number' ? mesh.scale : 1)) * scale),
        ...(offset && { offset: { x: round4((offset.x ?? 0) * scale), y: round4((offset.y ?? 0) * scale), z: round4((offset.z ?? 0) * scale) } })
      }
    };
  }
  const layer = propPath[1] as number;
  const objects = valueAt(doc, ['layers', layer, 'objects']);
  const ops: Op[] = [
    { op: 'remove', path: [...propPath, 'instances'], index: at },
    { op: 'insert', path: ['layers', layer, 'objects'], index: Array.isArray(objects) ? objects.length : 0, value: object }
  ];
  return { ops, id };
}

/**
 * Turn a placed object back into a prop instance: into a group of its
 * prefab in its layer whose size matches (uniformly scaled, so the drawn
 * thing does not change), or a new group at the object's size. Refused
 * when the object carries overrides (an instance cannot hold them) or a
 * rotation that is not a pure turn about the up axis.
 */
export function demoteObjectToProp(doc: unknown, objectPath: PathSegment[]): { ops: Op[]; group: string } {
  const object = valueAt(doc, objectPath);
  if (!isPlainObject(object) || typeof object.prefab !== 'string') throw new Error('not a placed object');
  if (object.overrides !== undefined) throw new Error(`'${String(object.id)}' carries overrides, which an instance cannot hold`);
  if (object.constraints !== undefined || object.properties !== undefined) {
    throw new Error(`'${String(object.id)}' carries constraints or properties, which an instance cannot hold`);
  }
  let yaw = 0;
  if (Array.isArray(object.rotation)) {
    const q = object.rotation as Quaternion;
    const { pitch, roll, yaw: turn } = toEuler(q);
    if (Math.abs(pitch) > 1e-4 || Math.abs(roll) > 1e-4) {
      throw new Error(`'${String(object.id)}' is tilted; an instance only turns about the up axis`);
    }
    yaw = turn;
  }
  const layer = objectPath[1] as number;
  const layerValue = valueAt(doc, ['layers', layer]);
  const props = isPlainObject(layerValue) && Array.isArray(layerValue.props) ? layerValue.props : [];
  const sizes = ['width', 'height', 'depth'].map((key) => (typeof object[key] === 'number' ? object[key] as number : PROP_DEFAULT_SIZE));
  // A group whose size is the object's under one uniform factor; exact size first.
  let found: { index: number; scale: number } | null = null;
  props.forEach((group, index) => {
    if (!isPlainObject(group) || group.prefab !== object.prefab) return;
    const own = [
      typeof group.width === 'number' ? group.width : PROP_DEFAULT_SIZE,
      typeof group.height === 'number' ? group.height : PROP_DEFAULT_SIZE,
      typeof group.depth === 'number' ? group.depth : (typeof group.width === 'number' ? group.width : PROP_DEFAULT_SIZE)
    ];
    const factor = sizes[0]! / own[0]!;
    if (factor <= 0) return;
    const uniform = own.every((side, i) => Math.abs(side * factor - sizes[i]!) < 1e-3);
    if (!uniform) return;
    if (!found || (factor === 1 && found.scale !== 1)) found = { index, scale: round4(factor) };
  });
  const tuple = (scale: number): PropInstance => [
    round4(typeof object.x === 'number' ? object.x : 0),
    round4(typeof object.y === 'number' ? object.y : 0),
    round4(typeof object.z === 'number' ? object.z : 0),
    round4(yaw), scale
  ];
  const ops: Op[] = [];
  let groupId: string;
  if (found) {
    const { index, scale } = found as { index: number; scale: number };
    const group = props[index] as { id?: unknown; instances?: unknown[] };
    groupId = typeof group.id === 'string' ? group.id : `props[${index}]`;
    ops.push({ op: 'insert', path: ['layers', layer, 'props', index, 'instances'], index: Array.isArray(group.instances) ? group.instances.length : 0, value: tuple(scale) });
  } else {
    groupId = uniqueId(doc, `props-${object.prefab}`);
    const group: Record<string, unknown> = {
      id: groupId, prefab: object.prefab,
      width: sizes[0], height: sizes[1], depth: sizes[2],
      collider: 'bounds',
      instances: [tuple(1)]
    };
    if (isPlainObject(layerValue) && Array.isArray(layerValue.props)) ops.push({ op: 'insert', path: ['layers', layer, 'props'], index: props.length, value: group });
    else ops.push({ op: 'set', path: ['layers', layer, 'props'], value: [group] });
  }
  ops.push({ op: 'remove', path: objectPath.slice(0, 3), index: objectPath[3] as number });
  return { ops, group: groupId };
}

// --- UI elements (E9) ------------------------------------------------------

/** What each element kind starts as: a valid value the loader accepts whole. */
export const ELEMENT_KINDS = ['button', 'menuItem', 'text', 'image', 'rect', 'backdrop'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/**
 * Add a UI element of `kind` to the scene's `elements`, valid from birth:
 * a unique id, a position, a centre anchor, and for a button one thing to
 * do — `onClick` to `scene` when the project has a level to go to, else a
 * named `action` for the game's `onAction` hook. An image needs a sprite;
 * `sprite` names one (the caller usually passes the first sheet).
 */
export function addElement(
  doc: unknown, kind: ElementKind, options: { scene?: string; sprite?: string } = {}
): { ops: Op[]; id: string; index: number } {
  const id = uniqueId(doc, kind);
  const element: Record<string, unknown> = kind === 'backdrop' ? { type: kind, id } : { type: kind, id, x: 0, y: 0, anchor: 'center' };
  if (kind === 'button' || kind === 'menuItem') {
    const label = kind === 'button' ? 'Button' : 'Menu item';
    element.properties = options.scene ? { text: label, onClick: options.scene } : { text: label, action: 'start' };
  } else if (kind === 'backdrop') {
    element.properties = { from: '#101820', to: '#2a3550', angle: 110, motes: 40, vignette: 0.5 };
  } else if (kind === 'text') {
    element.properties = { text: 'Text' };
  } else if (kind === 'image') {
    if (!options.sprite) throw new Error('an image element needs a sprite sheet; add one to assets.spritesheets first');
    element.sprite = options.sprite;
  } else {
    element.width = 200;
    element.height = 100;
    element.color = '$color.border';
  }
  const elements = valueAt(doc, ['elements']);
  // A backdrop is the whole screen behind everything: it goes first.
  if (kind === 'backdrop' && Array.isArray(elements)) {
    return { ops: [{ op: 'insert', path: ['elements'], index: 0, value: element }], id, index: 0 };
  }
  if (Array.isArray(elements)) {
    return { ops: [{ op: 'insert', path: ['elements'], index: elements.length, value: element }], id, index: elements.length };
  }
  return { ops: [{ op: 'set', path: ['elements'], value: [element] }], id, index: 0 };
}

/**
 * Change an element's kind, keeping what every kind shares — id, position,
 * anchor — instead of wiping them the way a raw variant swap would.
 */
export function changeElementType(doc: unknown, elementPath: PathSegment[], kind: ElementKind, options: { scene?: string; sprite?: string } = {}): Op[] {
  const element = valueAt(doc, elementPath);
  if (!isPlainObject(element)) throw new Error('not a UI element');
  const { ops } = addElement({ elements: [] }, kind, options);
  const fresh = (ops[0] as { value: unknown }).value;
  const starting = (Array.isArray(fresh) ? fresh[0] : fresh) as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  // A backdrop has no position: it is the whole screen.
  const shared = kind === 'backdrop' ? (['id'] as const) : (['id', 'x', 'y', 'anchor'] as const);
  for (const key of shared) {
    if (element[key] !== undefined) kept[key] = element[key];
  }
  return [{ op: 'set', path: elementPath, value: { ...starting, ...kept, type: kind } }];
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
