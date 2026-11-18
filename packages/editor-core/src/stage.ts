/**
 * Documents and edits for running a scene other than as written: a prefab
 * alone on a stage, a play starting with the player somewhere else, and
 * the resting poses a short run settles dynamic bodies into. The editor's
 * Play and the MCP tools both build from these, so a playtest an agent
 * runs is the one a person would see.
 */

import { isPlainObject, valueAt, type PathSegment } from './descriptors.ts';
import type { Op } from './edits.ts';
import { forScene, type Quaternion } from './rotation.ts';

export interface At { x: number; y: number; z?: number }

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const STAGE_ID = 'stage';
const FLOOR_ID = 'stage-floor';
const FLOOR_PREFAB = 'stage-floor';

function dimensionsOf(data: Record<string, unknown>): 2 | 3 {
  return isPlainObject(data.world) && data.world.dimensions === 3 ? 3 : 2;
}

function objectsOf(data: Record<string, unknown>): Array<{ object: Record<string, unknown>; at: PathSegment[] }> {
  const layers = Array.isArray(data.layers) ? data.layers : [];
  return layers.flatMap((layer, l) => {
    const objects = isPlainObject(layer) && Array.isArray(layer.objects) ? layer.objects : [];
    return objects.flatMap((object, o) => (isPlainObject(object) ? [{ object, at: ['layers', l, 'objects', o] as PathSegment[] }] : []));
  });
}

/** The player's object: `world.player`, or null when the level names none. */
export function playerObjectId(data: Record<string, unknown>): string | null {
  return isPlainObject(data.world) && typeof data.world.player === 'string' ? data.world.player : null;
}

/**
 * A copy of the scene whose player starts at `at`. Its spawn points are
 * left out of the copy: they say where play starts, and here the person
 * playing has said.
 */
export function playFrom(data: Record<string, unknown>, at: At): Record<string, unknown> {
  const id = playerObjectId(data);
  if (!id) throw new Error('this scene has no player to place: set world.player to the id of the player\'s object');
  const copy = clone(data);
  const player = objectsOf(copy).find(({ object }) => object.id === id);
  if (!player) throw new Error(`world.player names '${id}', and no placed object has that id`);
  player.object.x = at.x;
  player.object.y = at.y;
  if (dimensionsOf(copy) === 3) player.object.z = at.z ?? 0;
  const prefabs = isPlainObject(copy.prefabs) ? copy.prefabs : {};
  const spawns = (object: Record<string, unknown>) => {
    const prefab = prefabs[String(object.prefab)];
    return isPlainObject(prefab) && prefab.actor === 'SpawnPoint';
  };
  for (const layer of Array.isArray(copy.layers) ? copy.layers : []) {
    if (isPlainObject(layer) && Array.isArray(layer.objects)) layer.objects = layer.objects.filter((object) => !(isPlainObject(object) && spawns(object)));
  }
  return copy;
}

/**
 * A level holding one instance of `prefab` just above a floor, in the
 * scene's world and look, for watching it with its constraints ticking.
 * The instance is the scene's first placed one of that prefab (its size,
 * properties, constraints and overrides) with its placement reset, so it
 * behaves as it does in the level. The scene's prefabs, assets and paths
 * come along so everything it names resolves; the level's objects, HUD,
 * rules and player do not.
 */
export function prefabStage(data: Record<string, unknown>, prefab: string): Record<string, unknown> {
  const prefabs = isPlainObject(data.prefabs) ? data.prefabs : {};
  if (!isPlainObject(prefabs[prefab])) throw new Error(`there is no prefab '${prefab}'`);
  const three = dimensionsOf(data) === 3;
  const world = isPlainObject(data.world) ? clone(data.world) : {};
  for (const key of ['player', 'rules']) delete world[key];
  const camera = isPlainObject(world.camera) ? world.camera : {};
  delete camera.bounds;
  world.camera = { ...camera, follow: STAGE_ID };
  const floor = three
    ? { actor: 'Platform', physics: { bodyType: 'static' }, mesh: { color: '#3a3f47', roughness: 0.9 } }
    : { actor: 'Platform', physics: { bodyType: 'static' } };
  const like = clone(objectsOf(data).find(({ object }) => object.prefab === prefab)?.object ?? {});
  for (const key of ['id', 'x', 'y', 'z', 'angle', 'rotation']) delete like[key];
  const height = typeof like.height === 'number' ? like.height : three ? 1 : 32;
  const objects = three
    ? [
      { id: FLOOR_ID, prefab: FLOOR_PREFAB, x: 0, y: -0.25, z: 0, width: 20, height: 0.5, depth: 20 },
      { ...like, id: STAGE_ID, prefab, x: 0, y: height / 2 + 0.25, z: 0 }
    ]
    : [
      { id: FLOOR_ID, prefab: FLOOR_PREFAB, x: 0, y: 160, width: 1600, height: 24 },
      { ...like, id: STAGE_ID, prefab, x: 0, y: 148 - height / 2 - 8 }
    ];
  const stage: Record<string, unknown> = {
    version: data.version, type: 'level', name: `${String(data.name ?? 'scene')}:${prefab}`, world,
    prefabs: { ...clone(prefabs), [FLOOR_PREFAB]: floor },
    layers: [{ name: 'stage', objects }]
  };
  for (const key of ['uses', 'assets', 'paths']) if (data[key] !== undefined) stage[key] = clone(data[key]);
  return stage;
}

export interface Variant {
  /** Start the player here instead of where the scene puts it. */
  from?: At;
  /** Run this prefab alone on a stage instead of the scene. */
  prefab?: string;
}

/** The document a variant plays: the scene, the scene with its player moved, or a prefab's stage. */
export function variantOf(data: Record<string, unknown>, variant: Variant): Record<string, unknown> {
  if (variant.prefab && variant.from) throw new Error('a prefab stage has no player to move; give prefab or from, not both');
  if (variant.prefab) return prefabStage(data, variant.prefab);
  if (variant.from) return playFrom(data, variant.from);
  return data;
}

/** Where a short run left one placed object, as the host reports it. */
export interface Rest {
  id: string;
  bodyType: string;
  x: number; y: number; z?: number;
  angle?: number;
  rotation?: Quaternion;
  moved: number;
}

/**
 * The edit that writes resting poses back: every dynamic body that moved,
 * except the player (who would only have fallen to where play starts
 * anyway) and objects composed from another scene (they are that scene's
 * to write). `ids` limits it to some objects.
 */
export function settleOps(data: Record<string, unknown>, rests: readonly Rest[], ids?: readonly string[]): { ops: Op[]; moved: string[] } {
  const three = dimensionsOf(data) === 3;
  const player = playerObjectId(data);
  const paths = new Map(objectsOf(data).map(({ object, at }) => [object.id, at]));
  const round = (value: number) => (three ? Math.round(value * 1000) / 1000 : Math.round(value * 100) / 100);
  const ops: Op[] = [];
  const moved: string[] = [];
  for (const rest of rests) {
    if (rest.bodyType !== 'dynamic' || rest.moved < (three ? 0.001 : 0.5) || rest.id === player) continue;
    if (ids && !ids.includes(rest.id)) continue;
    const at = paths.get(rest.id);
    if (!at) continue;
    const object = valueAt(data, at) as Record<string, unknown>;
    moved.push(rest.id);
    ops.push({ op: 'set', path: [...at, 'x'], value: round(rest.x) }, { op: 'set', path: [...at, 'y'], value: round(rest.y) });
    if (three) {
      ops.push({ op: 'set', path: [...at, 'z'], value: round(rest.z ?? 0) });
      const turned = rest.rotation && 2 * Math.acos(Math.min(1, Math.abs(rest.rotation[3]))) > 1e-3;
      if (rest.rotation && (turned || object.rotation !== undefined)) ops.push({ op: 'set', path: [...at, 'rotation'], value: forScene(rest.rotation) });
    } else if (rest.angle !== undefined && (Math.abs(rest.angle) > 1e-4 || object.angle !== undefined)) {
      ops.push({ op: 'set', path: [...at, 'angle'], value: Math.round(rest.angle * 10000) / 10000 });
    }
  }
  return { ops, moved };
}
