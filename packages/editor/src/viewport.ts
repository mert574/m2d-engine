/**
 * The viewport: an engine instance in edit mode, drawing a document.
 *
 * Edit mode (E0.6) is what makes this possible — the scene materializes
 * from its document with no lifecycle hook run, no tick, no input into
 * the simulation and no game transition, so what is on screen is the
 * document and nothing else. Play-in-editor (E4) is the same document
 * through a fresh game *without* the flag.
 *
 * The game's real classes come from its definition module, served by the
 * host (docs/plans/editor-host.md). **Placeholders** fill only what
 * registration left unnamed — a scene no declared game owns, a class a
 * definition forgot: an empty actor still draws its prefab's sprite or
 * mesh, or its body as an outline, and a placeholder constraint
 * (`static params = null`) accepts whatever the scene tuned.
 *
 * A show can be overtaken — a second scene clicked, a reload arriving —
 * while it is still loading. The game it was building is then destroyed
 * by the show itself once its load settles, never underneath a
 * `switchTo` in flight: tearing a physics world down mid-load is a WASM
 * panic, not an error.
 */

import { M2D } from 'm2d-engine/core/m2d.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { Constraint } from 'm2d-engine/core/constraint.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { initWebGPU, webgpuSupported } from 'm2d-engine/core/renderers/index.js';
import { mapPointer, viewToClient } from 'm2d-engine/core/viewport.js';
import { isPlainObject, validateScene, rotation, type SceneDocument, type Op, type ValidationIssue, type Quaternion } from 'm2d-editor-core';
import { attachCameraControls } from './cameraControls.ts';

/** A point in client (CSS) pixels. */
export interface Point { x: number; y: number }

/**
 * Where a placed object is on screen, for the overlay: its outline as
 * client-space segments, its centre, and per axis how a pointer moving
 * across the screen maps to the object's own coordinates.
 */
export interface Placement {
  id: string;
  dimensions: 2 | 3;
  center: Point;
  edges: Array<[Point, Point]>;
  /** Per document axis: the screen direction it runs in and client px per world unit. */
  axes: Array<{ axis: 'x' | 'y' | 'z'; dir: Point; scale: number }>;
  /** The object's document position (ground position in a projected 2D game). */
  position: { x: number; y: number; z?: number };
  angle: number;
  /** 3D: the body's orientation. */
  rotation?: Quaternion;
  /** 3D: a ring per world axis, for the rotate gizmo, and whether that axis points at the viewer. */
  rings?: Array<{ axis: 'x' | 'y' | 'z'; normal: V3; points: Point[]; facing: boolean }>;
}

/** A gizmo's in-flight pose for an object. */
export interface Pose {
  position?: { x: number; y: number; z?: number };
  angle?: number;
  rotation?: Quaternion;
}

/** What applying a change to the view did. */
export type Applied =
  | { kind: 'in-place'; objects: number }
  | { kind: 'rebuild' }
  | { kind: 'invalid'; issues: ValidationIssue[] };

/** Minimal view of an entity, for the editor's geometry. */
interface EntityLike {
  sceneId?: string;
  position: { x: number; y: number; z?: number };
  renderPosition: { x: number; y: number };
  renderAngle?: number;
  size: { x: number; y: number; z?: number };
  body: {
    setPosition(p: object): void; setAngle?(a: number): void; angle?: number;
    rotation?: { x: number; y: number; z: number; w: number }; setRotation?(q: object): void;
  };
}
interface SceneLike {
  entitiesById: Map<string, EntityLike>;
  replaceObject(id: string | null, object: object | null, options?: { after?: string | null }): unknown;
}

/**
 * A nothing-actor: body, sprite or mesh from the prefab, no behaviour.
 * An actor whose look is hand-drawn code the editor cannot load would be
 * invisible, which makes a scene unplaceable — so with no sprite to show,
 * the placeholder draws its body as a translucent outline instead. In 3D
 * the prefab's mesh block already carries the look and this never draws.
 */
function placeholderActor(): unknown {
  return class Placeholder extends Entity {
    declare sprite: unknown;
    declare size: { x: number; y: number };
    declare renderPosition: { x: number; y: number };
    declare game: { renderer: { drawRect(options: Record<string, unknown>): void } };

    draw(deltaTime: number): void {
      if (this.sprite) {
        (Entity.prototype as unknown as { draw(dt: number): void }).draw.call(this, deltaTime);
        return;
      }
      const { x, y } = this.renderPosition;
      this.game.renderer.drawRect({
        x: x - this.size.x / 2, y: y - this.size.y / 2,
        width: this.size.x, height: this.size.y,
        fillStyle: 'rgba(120, 160, 255, 0.18)',
        strokeStyle: 'rgba(160, 195, 255, 0.85)'
      });
    }
  };
}

/** A nothing-constraint that accepts any params; see sceneSchema's rule. */
function placeholderConstraint(): unknown {
  return class Placeholder extends Constraint {
    static override params = null;
  };
}

/** Every actor name and constraint type a document's prefabs/objects use. */
export function namedClasses(doc: Record<string, unknown>): { actors: Set<string>; constraints: Set<string> } {
  const actors = new Set<string>();
  const constraints = new Set<string>();
  const takeConstraints = (block: unknown): void => {
    if (!isPlainObject(block)) return;
    for (const entry of Object.values(block)) {
      if (isPlainObject(entry) && typeof entry.type === 'string') constraints.add(entry.type);
    }
  };
  if (isPlainObject(doc.prefabs)) {
    for (const prefab of Object.values(doc.prefabs)) {
      if (!isPlainObject(prefab)) continue;
      if (typeof prefab.actor === 'string') actors.add(prefab.actor);
      takeConstraints(prefab.constraints);
    }
  }
  const layers = Array.isArray(doc.layers) ? doc.layers : [];
  for (const layer of layers) {
    if (!isPlainObject(layer)) continue;
    for (const object of Array.isArray(layer.objects) ? layer.objects : []) {
      if (isPlainObject(object)) takeConstraints(object.constraints);
    }
  }
  return { actors, constraints };
}

export interface ShowOptions {
  /**
   * The game's definition from the project: `register(game)` installs its
   * real actor and constraint classes, `GAME` carries the M2D options its
   * simulation depends on. Placeholders cover only what registration did
   * not — a class that failed to load, a scene from a game the project
   * does not declare.
   */
  definition?: { register?: (game: unknown) => void; GAME?: Record<string, unknown> } | null;
  /** The engine's basePath: where the scene's asset URLs resolve. */
  basePath?: string;
  /** M2D options for the game's look, from its hooks module (`OPTIONS`). */
  presentation?: Record<string, unknown>;
  /** Other scene names the document may refer to (buttons, triggers). */
  sceneNames?: string[];
  /**
   * Play rather than edit: a game without `editMode`, so the simulation
   * runs, hooks fire and input reaches it. `hooks` builds each scene's
   * presentation hooks for the game (the project's hooks module);
   * `scenes` are the project's other scenes, loadable for real, so a
   * door into the next level opens.
   */
  play?: {
    hooks?: (game: unknown) => Record<string, Record<string, unknown>>;
    scenes?: Array<{ name: string; fetch: () => Promise<unknown> }>;
    /**
     * The game asked for a scene the editor does not have — a main menu
     * its page builds in code. The switch is not made; the editor decides
     * what to do (stop playing, say why).
     */
    leave?: (scene: string) => void;
  };
}

export class Viewport {
  /**
   * The canvas the current game draws on. Each show gets a fresh one:
   * a canvas hands every `getContext` caller the same context, and a
   * destroyed game gives its WebGL context back with `loseContext()` —
   * so a second game on the same element inherits a lost context and
   * draws nothing. The element is swapped in place, keeping its id.
   */
  canvas: HTMLCanvasElement;
  #game: InstanceType<typeof M2D> | null = null;
  #detach: (() => void) | null = null;
  /** Bumped by every show and close; a show that sees it move was overtaken. */
  #generation = 0;
  /** Whether the shown game is being played rather than edited. */
  #playing = false;
  /** Whether the shown game draws on demand (the default) or every frame. */
  #drawOnDemand = true;
  /** Each placed object's document record as last built, by id; see `apply`. */
  #records = new Map<string, ObjectRecord>();
  #viewListeners = new Set<() => void>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** The dimension a document asks for — or, when it is silent, its game's. */
  static dimensionsOf(doc: SceneDocument, definition?: ShowOptions['definition']): number {
    const world = (doc.data as { world?: { dimensions?: unknown } }).world;
    if (world?.dimensions === 3) return 3;
    if (world?.dimensions === 2) return 2;
    return definition?.GAME?.dimensions === 3 ? 3 : 2;
  }

  /**
   * Show a document. Tears down whatever was there first: a game owns a
   * physics world and a GPU device's worth of resources, and nothing of
   * it may survive `destroy()`. Resolves false when a later show or a
   * close overtook this one, which then leaves nothing behind.
   */
  async show(doc: SceneDocument, options: ShowOptions = {}): Promise<boolean> {
    this.close();
    const generation = this.#generation;
    const dimensions = Viewport.dimensionsOf(doc, options.definition);
    if (dimensions === 3) {
      if (!webgpuSupported()) throw new Error('This scene is 3D, which needs WebGPU: Chrome or Edge with a GPU.');
      await initWebGPU();
    }
    await initPhysics(dimensions === 3 ? { dimensions: 3 } : undefined);
    if (generation !== this.#generation) return false;

    const canvas = document.createElement('canvas');
    canvas.id = this.canvas.id;
    canvas.className = this.canvas.className;
    this.canvas.replaceWith(canvas);
    this.canvas = canvas;

    const world = isPlainObject(doc.data.world) ? doc.data.world : {};
    const playing = !!options.play;
    const game = new M2D(this.canvas, {
      // The game's own simulation options first; the document and the
      // editor override what they must.
      ...options.definition?.GAME,
      ...options.presentation,
      dimensions,
      editMode: !playing,
      width: this.canvas.clientWidth || 960,
      height: this.canvas.clientHeight || 540,
      // Tile layers and bounds size themselves from the world, so the
      // document's say matters here.
      ...(typeof world.width === 'number' && { worldWidth: world.width }),
      ...(typeof world.height === 'number' && { worldHeight: world.height }),
      ...(options.basePath && { basePath: options.basePath }),
      // The panels resize the canvas at will; the view fills whatever room
      // they leave rather than keep the shape it was made with.
      aspectMode: 'expand',
      // The editor's own chrome is DOM; the engine draws the world only.
      performanceStats: false,
      devConsole: false
    });
    // The project's real classes — the game as it actually looks and is
    // tuned. Placeholders only fill what registration left unnamed.
    options.definition?.register?.(game);
    const named = namedClasses(doc.data);
    for (const name of named.actors) {
      if (!game.actors.has(name)) game.registerActor(name, placeholderActor() as never);
    }
    for (const type of named.constraints) {
      if (!game.constraintTypes.has(type)) game.registerConstraint(type, placeholderConstraint() as never);
    }

    // Played, a copy: the simulation moves what it plays, and the document
    // must come back from a play exactly as it went in.
    const data = playing ? JSON.parse(JSON.stringify(doc.data)) as Record<string, unknown> : doc.data;
    const name = doc.name ?? 'scene';
    const hooks = (playing && options.play?.hooks?.(game)) || {};
    game.sceneManager.addScene(name, { fetch: async () => data, ...hooks[name] });
    if (playing) {
      const known = new Set([name]);
      for (const other of options.play?.scenes ?? []) {
        if (other.name === name) continue;
        game.sceneManager.addScene(other.name, { fetch: other.fetch, ...hooks[other.name] });
        known.add(other.name);
      }
      const manager = game.sceneManager as unknown as { switchTo(scene: string, ...rest: unknown[]): Promise<unknown> };
      const switchTo = manager.switchTo.bind(manager);
      manager.switchTo = (scene, ...rest) => {
        if (known.has(scene)) return switchTo(scene, ...rest);
        queueMicrotask(() => options.play?.leave?.(scene));
        return Promise.resolve(null);
      };
    } else {
      // The rest of the project's scenes, so a button or a trigger that
      // names one validates; they are never switched to.
      for (const other of options.sceneNames ?? []) {
        if (other !== name) game.sceneManager.addScene(other, { fetch: async () => ({}) });
      }
    }
    // The game is not the viewport's until its scene is in: a close in the
    // meantime must not destroy it mid-load, so this show disposes of it
    // itself when it settles, whichever way it settles.
    try {
      await game.start();
      await game.sceneManager.switchTo(name);
    } catch (error) {
      game.destroy();
      if (generation !== this.#generation) return false;
      throw error;
    }
    if (generation !== this.#generation) {
      game.destroy();
      return false;
    }
    this.#game = game;
    this.#playing = playing;
    if (playing) {
      // The game's own camera, its own input: the editor steps aside.
      this.canvas.focus();
      this.#records.clear();
      this.#viewChanged();
      return true;
    }
    game.drawOnDemand = this.#drawOnDemand;
    // Start looking at the middle of the world rather than its origin;
    // the camera is the editor's from here (drag to move, scroll to zoom).
    if (dimensions === 2) {
      const camera = game.camera as { x: number; y: number };
      camera.x = (typeof world.width === 'number' ? world.width : game.options.width as number) / 2;
      camera.y = (typeof world.height === 'number' ? world.height : game.options.height as number) / 2;
    }
    this.#detach = attachCameraControls(game as never, () => this.#viewChanged());
    this.#records = recordsOf(doc.data);
    this.#viewChanged();
    return true;
  }

  /** Whether the shown game is being played: edits, picks and gizmos wait. */
  get playing(): boolean { return this.#playing; }

  /** The power-saving switch: draw on demand, or every frame like play. */
  get drawOnDemand(): boolean { return this.#drawOnDemand; }
  set drawOnDemand(on: boolean) {
    this.#drawOnDemand = on;
    if (this.#game) this.#game.drawOnDemand = on;
  }

  /** Hear the view move or change — the overlay redraws on it. */
  onViewChange(listener: () => void): () => void {
    this.#viewListeners.add(listener);
    return () => { this.#viewListeners.delete(listener); };
  }

  #viewChanged(): void {
    this.#game?.invalidate();
    for (const listener of this.#viewListeners) listener();
  }

  /**
   * Apply a change to the shown game with the least work that is true.
   * A change confined to a layer's placed objects rebuilds just the
   * objects whose document record changed — each in its draw slot, from
   * the document as the loader normalizes it, so what shows is exactly
   * what a load would build. Anything else (prefabs, the world, props,
   * tiles, an object's `overrides`) is a full rebuild, which the caller
   * does. A document the loader rejects is reported and left undrawn:
   * the view keeps the last good picture.
   */
  apply(ops: readonly Op[], data: Record<string, unknown>): Applied {
    if (this.#playing) return { kind: 'rebuild' };
    const scene = this.#scene();
    if (!scene || !ops.every(objectLevel)) return { kind: 'rebuild' };
    const result = validateScene(data, this.#game);
    if (!result.ok) return { kind: 'invalid', issues: result.issues };

    const next = recordsOf(data);
    const loaded = loadedObjects(result.loaded);
    for (const [id, record] of next) {
      const before = this.#records.get(id);
      if (before && before.overrides !== record.overrides) return { kind: 'rebuild' };
    }
    let changed = 0;
    for (const id of this.#records.keys()) {
      if (!next.has(id)) { scene.replaceObject(id, null); changed++; }
    }
    for (const [id, record] of next) {
      const before = this.#records.get(id);
      if (before?.json === record.json) continue;
      const object = loaded.get(id);
      if (!object) return { kind: 'rebuild' };
      scene.replaceObject(before ? id : null, object, { after: record.after });
      changed++;
    }
    this.#records = next;
    this.#viewChanged();
    return { kind: 'in-place', objects: changed };
  }

  /**
   * The placed object under a client point, by its scene id, or null. 2D
   * tests the drawn bounds and prefers the smallest object containing the
   * point, so a backdrop the size of the world never wins over what stands
   * on it; 3D casts the camera's ray against each object's box and takes
   * the nearest hit.
   */
  pick(clientX: number, clientY: number): string | null {
    if (this.#playing) return null;
    const game = this.#game as unknown as { viewport: never; camera: Record<string, never> } | null;
    const scene = this.#scene();
    if (!game || !scene) return null;
    const { view } = mapPointer({ clientX, clientY, rect: this.canvas.getBoundingClientRect(), viewport: game.viewport });
    let best: string | null = null;
    let bestScore = Infinity;
    if (this.dimensions === 3) {
      const camera = game.camera as unknown as { screenToRay(x: number, y: number): { origin: V3; direction: V3 } };
      const { origin, direction } = camera.screenToRay(view.x, view.y);
      for (const [id, entity] of scene.entitiesById) {
        // Into the box's own frame, where it is axis-aligned at the origin.
        const inverse = rotation.conjugate(quatOf(entity));
        const c = entity.position as V3;
        const local = rotation.rotate(inverse, { x: origin.x - c.x, y: origin.y - c.y, z: origin.z - c.z });
        const t = rayBox(local, rotation.rotate(inverse, direction), { x: 0, y: 0, z: 0 }, entity.size as V3);
        if (t !== null && t < bestScore) { bestScore = t; best = id; }
      }
      return best;
    }
    const camera = game.camera as unknown as { screenToWorld(x: number, y: number): Point };
    const world = camera.screenToWorld(view.x, view.y);
    for (const [id, entity] of scene.entitiesById) {
      const { x, y } = entity.renderPosition;
      const halfW = entity.size.x / 2;
      const halfH = entity.size.y / 2;
      if (Math.abs(world.x - x) > halfW || Math.abs(world.y - y) > halfH) continue;
      const area = entity.size.x * entity.size.y;
      if (area < bestScore) { bestScore = area; best = id; }
    }
    return best;
  }

  /** Where an object is on screen, for its outline and gizmo; null if it is not shown. */
  placement(id: string): Placement | null {
    if (this.#playing) return null;
    const entity = this.#scene()?.entitiesById.get(id);
    if (!entity) return null;
    const toClient = this.#toClient();
    if (!toClient) return null;
    const angle = entity.body.angle ?? 0;

    if (this.dimensions === 3) {
      const p = entity.position as V3;
      const q = quatOf(entity);
      const h = { x: entity.size.x / 2, y: entity.size.y / 2, z: (entity.size.z ?? 0) / 2 };
      const corner = (sx: number, sy: number, sz: number) => {
        const r = rotation.rotate(q, { x: sx * h.x, y: sy * h.y, z: sz * h.z });
        return toClient({ x: p.x + r.x, y: p.y + r.y, z: p.z + r.z });
      };
      const edges: Array<[Point, Point]> = [];
      for (const [a, b] of BOX_EDGES) edges.push([corner(...a), corner(...b)]);
      const center = toClient(p);
      const axes = (['x', 'y', 'z'] as const).map((axis) => axisOf(axis, center, toClient({ ...p, [axis]: p[axis] + 1 })));
      // Rings sized to read about RING_PX across on screen, whatever the distance.
      const pxPerUnit = axes.reduce((sum, a) => sum + a.scale, 0) / 3 || 1;
      const radius = RING_PX / pxPerUnit;
      const eye = (this.#game?.camera as unknown as { position?: V3 } | undefined)?.position ?? p;
      const rings = (['x', 'y', 'z'] as const).map((axis) => {
        const normal = { x: axis === 'x' ? 1 : 0, y: axis === 'y' ? 1 : 0, z: axis === 'z' ? 1 : 0 };
        const [u, v] = axis === 'x' ? ['y', 'z'] as const : axis === 'y' ? ['z', 'x'] as const : ['x', 'y'] as const;
        const points: Point[] = [];
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          const w = { ...p };
          w[u] += Math.cos(a) * radius;
          w[v] += Math.sin(a) * radius;
          points.push(toClient(w));
        }
        const facing = (eye[axis] - p[axis]) > 0;
        return { axis, normal, points, facing };
      });
      return { id, dimensions: 3, center, edges, axes, position: { x: p.x, y: p.y, z: p.z }, angle, rotation: q, rings };
    }

    // 2D: the outline is the drawn frame, turned with the body; the axes
    // are the ground's, through the projection when the game has one.
    const projection = (this.#game as unknown as { projection?: { toScreen(x: number, y: number): Point } }).projection;
    const plane = (x: number, y: number) => toClient(projection ? projection.toScreen(x, y) : { x, y });
    const drawn = entity.renderPosition;
    const turn = entity.renderAngle ?? angle;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const hw = entity.size.x / 2;
    const hh = entity.size.y / 2;
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) =>
      toClient({ x: drawn.x + dx! * cos - dy! * sin, y: drawn.y + dx! * sin + dy! * cos }));
    const edges = corners.map((point, i): [Point, Point] => [point, corners[(i + 1) % 4]!]);
    const ground = entity.position;
    const origin = plane(ground.x, ground.y);
    const axes = [axisOf('x', origin, plane(ground.x + 1, ground.y)), axisOf('y', origin, plane(ground.x, ground.y + 1))];
    return { id, dimensions: 2, center: toClient(drawn), edges, axes, position: { x: ground.x, y: ground.y }, angle };
  }

  /**
   * Where a client point is in a 2D world: the ground position, through
   * the game's projection when it has one — where a dropped thing stands.
   */
  worldPoint(clientX: number, clientY: number): Point | null {
    const game = this.#game as unknown as {
      viewport: never; camera: { screenToWorld(x: number, y: number): Point };
      projection?: { toWorld(x: number, y: number): Point };
    } | null;
    if (!game || this.dimensions !== 2) return null;
    const { view } = mapPointer({ clientX, clientY, rect: this.canvas.getBoundingClientRect(), viewport: game.viewport });
    const plane = game.camera.screenToWorld(view.x, view.y);
    return game.projection ? game.projection.toWorld(plane.x, plane.y) : plane;
  }

  /**
   * Where a client point lands on the horizontal plane at height `y` — a
   * 3D free move drags along the ground under the object.
   */
  groundPoint(clientX: number, clientY: number, y: number): V3 | null {
    const game = this.#game as unknown as { viewport: never; camera: { screenToWorld(x: number, y: number, ground: number): V3 } } | null;
    if (!game || this.dimensions !== 3) return null;
    const { view } = mapPointer({ clientX, clientY, rect: this.canvas.getBoundingClientRect(), viewport: game.viewport });
    return game.camera.screenToWorld(view.x, view.y, y);
  }

  /**
   * Show an object somewhere it is not yet in the document, while a gizmo
   * drags it: the body moves, nothing is rebuilt. The edit on release
   * rebuilds it for real — and an actor that seeds its look from where it
   * stands may then look different there, which is the truth.
   */
  preview(id: string, pose: Pose): void {
    const entity = this.#scene()?.entitiesById.get(id);
    if (!entity) return;
    const { position, angle, rotation: q } = pose;
    if (position) entity.body.setPosition(this.dimensions === 3 ? position : { x: position.x, y: position.y });
    if (angle !== undefined) entity.body.setAngle?.(angle);
    if (q) entity.body.setRotation?.({ x: q[0], y: q[1], z: q[2], w: q[3] });
    this.#viewChanged();
  }

  /** Point the camera at an object, keeping the zoom and the angle. */
  frame(id: string): void {
    const entity = this.#scene()?.entitiesById.get(id);
    const camera = this.#game?.camera as (Record<string, unknown> & { update?(dt: number): void; lookAt?: Record<string, number> }) | undefined;
    if (!entity || !camera) return;
    if (this.dimensions === 3) {
      const p = entity.position as V3;
      if (camera.lookAt) Object.assign(camera.lookAt, { x: p.x, y: p.y, z: p.z });
      camera.update?.(0);
    } else {
      camera.x = entity.renderPosition.x;
      camera.y = entity.renderPosition.y;
    }
    this.#viewChanged();
  }

  get dimensions(): 2 | 3 {
    return (this.#game as unknown as { renderer?: { dimensions: number } } | null)?.renderer?.dimensions === 3 ? 3 : 2;
  }

  #scene(): SceneLike | null {
    return (this.#game?.sceneManager.getCurrentScene() as unknown as SceneLike | undefined) ?? null;
  }

  /** World (render-plane in 2D) to client pixels, for the current camera and canvas. */
  #toClient(): ((p: { x: number; y: number; z?: number }) => Point) | null {
    const game = this.#game as unknown as { viewport: never; camera: { worldToScreen(x: number, y: number, z?: number): Point } } | null;
    if (!game) return null;
    const rect = this.canvas.getBoundingClientRect();
    return (p) => {
      const view = game.camera.worldToScreen(p.x, p.y, p.z);
      return viewToClient({ x: view.x, y: view.y, rect, viewport: game.viewport });
    };
  }

  /**
   * The registries the shown game resolves names against — its real
   * actor and constraint classes — so the inspector can resolve declared
   * `properties` and `params` the way the loader did. Empty before a game
   * is up, which leaves those regions free-form.
   */
  get registries(): { actors?: Map<string, unknown>; constraintTypes?: Map<string, unknown> } {
    const game = this.#game as unknown as { actors?: Map<string, unknown>; constraintTypes?: Map<string, unknown> } | null;
    return game ? { actors: game.actors, constraintTypes: game.constraintTypes } : {};
  }

  /** Nothing of a game may outlive this; see the engine's teardown rule. */
  close(): void {
    this.#generation++;
    this.#playing = false;
    this.#records.clear();
    this.#detach?.();
    this.#detach = null;
    this.#game?.destroy();
    this.#game = null;
  }

  /**
   * The camera as plain state and back, so a hot reload — a new game, the
   * new code, the same document — does not move your eye.
   */
  captureCamera(): Record<string, unknown> | null {
    const camera = this.#game?.camera as Record<string, unknown> | undefined;
    if (!camera) return null;
    const keys = ['x', 'y', 'zoom', 'yaw', 'pitch', 'distance', 'mode'];
    const state: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof camera[key] === 'number' || typeof camera[key] === 'string') state[key] = camera[key];
    }
    const lookAt = camera.lookAt;
    if (isPlainObject(lookAt)) state.lookAt = { ...lookAt };
    return state;
  }

  restoreCamera(state: Record<string, unknown> | null): void {
    const camera = this.#game?.camera as (Record<string, unknown> & { update?: (dt: number) => void }) | undefined;
    if (!camera || !state) return;
    for (const [key, value] of Object.entries(state)) {
      if (key === 'lookAt' && isPlainObject(camera.lookAt) && isPlainObject(value)) Object.assign(camera.lookAt, value);
      else camera[key] = value;
    }
    camera.update?.(0);
  }

  get game(): InstanceType<typeof M2D> | null {
    return this.#game;
  }
}

type V3 = { x: number; y: number; z: number };

/** How wide a 3D rotate ring reads on screen, in CSS pixels. */
const RING_PX = 80;

/** An entity's 3D orientation in the scene's tuple form. */
function quatOf(entity: EntityLike): Quaternion {
  const r = entity.body.rotation;
  return r ? [r.x, r.y, r.z, r.w] : [0, 0, 0, 1];
}

/** A placed object's record, as the in-place diff compares it. */
interface ObjectRecord {
  json: string;
  /** Its `overrides`, apart: a change there can need assets not loaded, so it rebuilds. */
  overrides: string;
  /** The id of the object before it in the document, for where a new one goes. */
  after: string | null;
}

/** Every placed object's record in document order, by id. */
function recordsOf(data: Record<string, unknown>): Map<string, ObjectRecord> {
  const records = new Map<string, ObjectRecord>();
  let after: string | null = null;
  for (const layer of Array.isArray(data.layers) ? data.layers : []) {
    if (!isPlainObject(layer)) continue;
    for (const object of Array.isArray(layer.objects) ? layer.objects : []) {
      if (!isPlainObject(object) || typeof object.id !== 'string') continue;
      records.set(object.id, { json: JSON.stringify(object), overrides: JSON.stringify(object.overrides ?? null), after });
      after = object.id;
    }
  }
  return records;
}

/** The loaded document's objects, by id: what `materializeObject` takes. */
function loadedObjects(loaded: Record<string, unknown> | null): Map<string, object> {
  const objects = new Map<string, object>();
  const layers = loaded && Array.isArray(loaded.layers) ? loaded.layers : [];
  for (const layer of layers) {
    for (const object of isPlainObject(layer) && Array.isArray(layer.objects) ? layer.objects : []) {
      if (isPlainObject(object) && typeof object.id === 'string') objects.set(object.id, object);
    }
  }
  return objects;
}

/** Whether an op only touches a layer's placed objects. */
function objectLevel(op: Op): boolean {
  const [layers, index, objects] = op.path;
  return layers === 'layers' && typeof index === 'number' && objects === 'objects'
    && (op.path.length > 3 || op.op !== 'set' || op.value !== undefined);
}

function axisOf(axis: 'x' | 'y' | 'z', from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = Math.hypot(dx, dy);
  return { axis, dir: scale > 1e-9 ? { x: dx / scale, y: dy / scale } : { x: 0, y: 0 }, scale };
}

/** Distance along a ray to a box centred on `center`, or null for a miss. */
function rayBox(origin: V3, direction: V3, center: V3, size: { x: number; y: number; z?: number }): number | null {
  let near = -Infinity;
  let far = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    const half = (axis === 'z' ? size.z ?? 0 : size[axis]) / 2;
    const lo = center[axis] - half;
    const hi = center[axis] + half;
    const d = direction[axis];
    if (Math.abs(d) < 1e-12) {
      if (origin[axis] < lo || origin[axis] > hi) return null;
      continue;
    }
    let t1 = (lo - origin[axis]) / d;
    let t2 = (hi - origin[axis]) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) return null;
  }
  // The camera inside a box (the ground under a low eye) is not a pick of it.
  return near >= 0 ? near : null;
}

/** The twelve edges of a box, as pairs of corner signs. */
const BOX_EDGES: Array<[[number, number, number], [number, number, number]]> = [
  [[-1, -1, -1], [1, -1, -1]], [[1, -1, -1], [1, -1, 1]], [[1, -1, 1], [-1, -1, 1]], [[-1, -1, 1], [-1, -1, -1]],
  [[-1, 1, -1], [1, 1, -1]], [[1, 1, -1], [1, 1, 1]], [[1, 1, 1], [-1, 1, 1]], [[-1, 1, 1], [-1, 1, -1]],
  [[-1, -1, -1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1]], [[1, -1, 1], [1, 1, 1]], [[-1, -1, 1], [-1, 1, 1]]
];
