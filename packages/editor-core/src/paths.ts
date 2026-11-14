/**
 * The document side of paths: a level's named `paths`, and the inline
 * point lists a `PathFollow` carries (`properties.path.points`, a
 * constraint's `params.points`). The editor's path tool edits either
 * through the same ops, and a rename carries every `path` that names one.
 */

import { isPlainObject, valueAt, type PathSegment } from './descriptors.ts';
import type { Op } from './edits.ts';

/** A path's point as the editor positions it; a document's point may carry more (a road's half-width `w`), which the edits below keep. */
export interface PathPoint { x: number; y: number; z?: number }

/** A list of points the editor can draw and drag, and where it lives in the document. */
export interface PointList {
  /** The `points` array's path. */
  points: PathSegment[];
  /** The named path's key, when it is one of `paths`; absent for an inline list. */
  name?: string;
  closed: boolean;
  smooth: boolean;
}

const isPoint = (value: unknown): value is PathPoint =>
  isPlainObject(value) && typeof value.x === 'number' && typeof value.y === 'number';

/** Every string field named `path` under `value`, by document path. */
function pathFields(value: unknown, at: PathSegment[], out: Array<{ at: PathSegment[]; name: string }>): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => pathFields(item, [...at, i], out));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, field] of Object.entries(value)) {
    if (key === 'path' && typeof field === 'string') out.push({ at: [...at, key], name: field });
    else pathFields(field, [...at, key], out);
  }
}

/** Where objects and prefabs name a path: their properties and constraints. */
function references(doc: unknown): Array<{ at: PathSegment[]; name: string }> {
  const data = isPlainObject(doc) ? doc : {};
  const out: Array<{ at: PathSegment[]; name: string }> = [];
  const layers = Array.isArray(data.layers) ? data.layers : [];
  layers.forEach((layer, l) => {
    const objects = isPlainObject(layer) && Array.isArray(layer.objects) ? layer.objects : [];
    objects.forEach((object, o) => {
      if (!isPlainObject(object)) return;
      pathFields(object.properties, ['layers', l, 'objects', o, 'properties'], out);
      pathFields(object.constraints, ['layers', l, 'objects', o, 'constraints'], out);
    });
  });
  const prefabs = isPlainObject(data.prefabs) ? data.prefabs : {};
  for (const [name, prefab] of Object.entries(prefabs)) {
    if (isPlainObject(prefab)) pathFields(prefab.constraints, ['prefabs', name, 'constraints'], out);
  }
  return out;
}

/** The ops that point every reference to path `from` at `to` instead. */
export function renamePathReferences(doc: unknown, from: string, to: string): Op[] {
  return references(doc).filter((ref) => ref.name === from).map((ref) => ({ op: 'set', path: ref.at, value: to }));
}

/** How many places name path `name`; a delete of a used path is worth a warning. */
export function pathUsers(doc: unknown, name: string): number {
  return references(doc).filter((ref) => ref.name === name).length;
}

function namedList(doc: unknown, name: string): PointList | null {
  const path = valueAt(doc, ['paths', name]);
  if (!isPlainObject(path) || !Array.isArray(path.points)) return null;
  return { points: ['paths', name, 'points'], name, closed: path.closed === true, smooth: path.smooth === true };
}

/** Inline `points` lists under `value` that look like a path: two or more points. */
function inlineLists(value: unknown, at: PathSegment[], out: PointList[]): void {
  if (!isPlainObject(value)) return;
  for (const [key, field] of Object.entries(value)) {
    if (key === 'points' && Array.isArray(field) && field.length >= 2 && field.every(isPoint)) {
      out.push({ points: [...at, key], closed: false, smooth: false });
    } else inlineLists(field, [...at, key], out);
  }
}

/**
 * The point lists a selection shows: a named path itself, or for a placed
 * object every path its follower uses — the named ones it or its prefab
 * refers to, and the inline lists it carries.
 */
export function pointListsFor(doc: unknown, selected: PathSegment[]): PointList[] {
  if (selected[0] === 'paths' && typeof selected[1] === 'string') {
    const list = namedList(doc, selected[1]);
    return list ? [list] : [];
  }
  const object = valueAt(doc, selected);
  if (selected[0] !== 'layers' || selected[2] !== 'objects' || !isPlainObject(object)) return [];
  const lists: PointList[] = [];
  inlineLists(object.properties, [...selected, 'properties'], lists);
  inlineLists(object.constraints, [...selected, 'constraints'], lists);
  const names = new Set<string>();
  const found: Array<{ at: PathSegment[]; name: string }> = [];
  pathFields(object.properties, [], found);
  pathFields(object.constraints, [], found);
  const prefab = isPlainObject(doc) && isPlainObject(doc.prefabs) && typeof object.prefab === 'string' ? doc.prefabs[object.prefab] : null;
  if (isPlainObject(prefab)) pathFields(prefab.constraints, [], found);
  for (const { name } of found) names.add(name);
  for (const name of names) {
    const list = namedList(doc, name);
    if (list) lists.unshift(list);
  }
  return lists;
}

/**
 * Move point `index` to `to`, keeping everything else the point carries:
 * a road's half-width `w`, say, which the pointer knows nothing about.
 */
export function movePoint(doc: unknown, points: PathSegment[], index: number, to: PathPoint): Op[] {
  const current = valueAt(doc, [...points, index]);
  return [{ op: 'set', path: [...points, index], value: { ...(isPlainObject(current) ? current : {}), ...to } }];
}

/**
 * Insert `point` after `index` in `list`. The fields its neighbours carry
 * besides the position come with it, numbers blended halfway, so a point
 * added to a road is as wide as the road around it rather than of no width.
 */
export function insertPoint(doc: unknown, list: PointList, index: number, point: PathPoint): Op[] {
  const existing = valueAt(doc, list.points);
  const points = Array.isArray(existing) ? existing : [];
  const before = points[index];
  const after = index + 1 < points.length ? points[index + 1] : list.closed ? points[0] : undefined;
  return [{ op: 'insert', path: list.points, index: index + 1, value: { ...carried(before, after), ...point } }];
}

/** What two neighbouring points share besides their position: numbers averaged, the rest from the first. */
function carried(before: unknown, after: unknown): Record<string, unknown> {
  const a = isPlainObject(before) ? before : {};
  const b = isPlainObject(after) ? after : {};
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === 'x' || key === 'y' || key === 'z') continue;
    out[key] = typeof a[key] === 'number' && typeof b[key] === 'number'
      ? ((a[key] as number) + (b[key] as number)) / 2
      : key in a ? a[key] : b[key];
  }
  return out;
}

/** Remove point `index`, refusing to leave fewer than two: a path of one point is no path. */
export function removePoint(doc: unknown, points: PathSegment[], index: number): Op[] {
  const list = valueAt(doc, points);
  if (!Array.isArray(list) || list.length <= 2) throw new Error('a path keeps at least two points');
  return [{ op: 'remove', path: points, index }];
}
