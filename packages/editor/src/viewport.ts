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
 * host (knowledge-base/projects/editor/editor-host.md). **Placeholders** fill only what
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
import { mapPointer, viewToClient, uiToView } from 'm2d-engine/core/viewport.js';
import { ANCHOR_ORIGINS } from 'm2d-engine/core/ui/uiElement.js';
import { isPlainObject, validateScene, rotation, type SceneDocument, type Op, type ValidationIssue, type Quaternion } from 'm2d-editor-core';
import { attachCameraControls, type CameraControls } from './cameraControls.ts';
import { rayShape, isBackdrop3D, bestHit, slopOffsets, type Hit, type Shape } from './picking.ts';

/** A point in client (CSS) pixels. */
export interface Point { x: number; y: number }

/** A projected point: where a world point lands in client pixels, and whether it is behind the eye. */
export interface ClientPoint extends Point { behind: boolean }

/** How far outside the canvas a selection's centre may be before its gizmo hides. */
const OFFSCREEN_MARGIN = 24;

/** How far from the pointer, in client pixels, a near miss still picks. */
const PICK_SLOP = 6;

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
  /** The body's size, in world units: what a scale drag starts from when the document leaves a side out. */
  size: { x: number; y: number; z?: number };
  /** 2D: where the frame is drawn, on the render plane. */
  drawnAt?: Point;
  /**
   * Whether the centre is on the canvas (within a small margin). Off it,
   * the outline may still show what is clipped, but a gizmo would float at
   * the edge over nothing — so it hides.
   */
  onScreen: boolean;
  angle: number;
  /** 3D: the body's orientation. */
  rotation?: Quaternion;
  /** 3D: a ring per world axis, for the rotate gizmo, and whether that axis points at the viewer. */
  rings?: Array<{ axis: 'x' | 'y' | 'z'; normal: V3; points: Point[]; facing: boolean }>;
  /** Which gizmos make sense here; absent means all of them (a UI element neither turns nor, for text, resizes). */
  tools?: { rotate?: boolean; scale?: boolean };
  /** A UI element's nine anchor points on its box, the element's own marked. */
  anchors?: Array<{ name: string; point: Point; active: boolean }>;
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
  /** 3D: the merged mesh block the entity draws with (`m2d.js` sets it). */
  mesh?: { model?: string; scale?: number; offset?: V3; shape?: string; visible?: boolean } | null;
  /** 2D: whether it has a sprite to draw at all. */
  sprite?: unknown;
  visible?: boolean;
  body: {
    setPosition(p: object): void; setAngle?(a: number): void; angle?: number;
    rotation?: { x: number; y: number; z: number; w: number }; setRotation?(q: object): void;
    shape?: string; isSensor?: boolean;
    /** 3D: the size the body was made with; what a shape mesh draws at. */
    sizeVec?: V3;
  };
  /** The constraints attached to the entity, by slot, whoever attached them. */
  constraints?: Map<string, { constructor: { name: string; params?: Record<string, unknown> | null }; [field: string]: unknown }>;
}
/** A layer's prop group as the loaded scene config holds it. */
interface PropGroupLike {
  id?: string;
  prefab?: string;
  width?: number;
  height?: number;
  depth?: number;
  instances?: number[][];
}
interface SceneLike {
  entitiesById: Map<string, EntityLike>;
  /** 3D: the loaded models by key, each with the bounds of its file. */
  models?: Map<string, { bounds?: { min: V3; max: V3 } }>;
  /** 3D: the materials made for `mesh.texture` blocks, by `url|size`. */
  meshMaterials?: Map<string, unknown>;
  /** 2D: the loaded sprite sheets by key. */
  spriteSheets?: Map<string, { defineAnimation?(name: string, frames: unknown[], options?: { fps?: number; loop?: boolean }): void }>;
  /** The loaded document the scene was built from; props, tiles and elements edit in place through it. */
  config?: {
    type?: string;
    layers?: Array<{ props?: PropGroupLike[] }>;
    prefabs?: Record<string, { mesh?: { model?: string; scale?: number; offset?: V3; shape?: string } }>;
    tileLayers?: unknown[];
    paths?: unknown;
    world?: Record<string, unknown>;
    background?: unknown;
    elements?: Array<{ type?: string; id?: string; x?: number; y?: number; anchor?: string }>;
  };
  /** A UI scene's built elements by document id (E9). */
  uiById?: Map<string, UIElementLike>;
  /** The UI tree's root, whose hit test is the input router's own. */
  ui?: { hitTest(x: number, y: number): UIElementLike | null };
  replaceObject(id: string | null, object: object | null, options?: { after?: string | null }): unknown;
  /** Rebuild every prop from the config in place (E7b); see the engine's SceneProps. */
  rebuildProps?(): void;
  /** Rebuild the background and every tile layer from the config in place (E8). */
  rebuildTileLayers?(): void;
  /** Rebuild a UI scene's elements from the config in place (E9). */
  rebuildUIScene?(): void;
  /** Rebuild the named paths from the config. */
  rebuildPaths?(): void;
  /** Rebuild the lighting, post, cycle and particles from the config. */
  rebuildLook?(): void;
  /** Show the cycle at a phase without writing it. */
  previewCycle?(phase: number): void;
}

/** The slice of a built UI element the editor reads and poses. */
interface UIElementLike {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width?: number;
  height?: number;
  frame: { x: number; y: number; width: number; height: number };
  parent?: UIElementLike | null;
}

/**
 * A prop instance, addressed by its place in the document. It has no id
 * of its own, so the editor addresses it as `props:<layer>:<prop>:<index>`
 * — a form no object id can take, since ids cannot hold a colon.
 */
export interface InstanceRef { layer: number; prop: number; index: number }

export function encodeInstance(ref: InstanceRef): string {
  return `props:${ref.layer}:${ref.prop}:${ref.index}`;
}

export function decodeInstance(id: string): InstanceRef | null {
  if (!id.startsWith('props:')) return null;
  const [layer, prop, index] = id.slice(6).split(':').map(Number);
  return Number.isInteger(layer) && Number.isInteger(prop) && Number.isInteger(index) && layer! >= 0 && prop! >= 0 && index! >= 0
    ? { layer: layer!, prop: prop!, index: index! }
    : null;
}

/** What the editor knows about one shown prop instance. */
export interface InstanceInfo {
  ref: InstanceRef;
  /** The document's `[x, y, z, yaw, scale]`. */
  tuple: [number, number, number, number, number];
  position: V3;
  yaw: number;
  scale: number;
  /** The drawn volume's full extents, instance scale included. */
  size: V3;
  /** The volume's centre, offset from the instance origin in its own frame. */
  centre: V3;
  /** The group's id and prefab, for labels. */
  group: string;
  prefab: string;
}

/** The geometry a pick tests for one entity, in the body's frame. */
interface PickVolume {
  shape: Shape;
  /** Full extents. */
  size: V3;
  /** The volume's centre, offset from the body's. */
  centre: V3;
  hidden: boolean;
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
  /**
   * The project's other scenes, each with a fetch of its document: a
   * button or a trigger naming one validates, and a layer that instances
   * one (composition) loads it. Never switched to while editing.
   */
  scenes?: Array<{ name: string; fetch: () => Promise<unknown> }>;
  /** The raw documents of those scenes, by name, as far as they are known: what in-place validation composes from. */
  library?: Record<string, unknown>;
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
  #controls: CameraControls | null = null;
  /** Bumped by every show and close; a show that sees it move was overtaken. */
  #generation = 0;
  /** Whether the shown game is being played rather than edited. */
  #playing = false;
  /** Whether the shown game draws on demand (the default) or every frame. */
  #drawOnDemand = true;
  /** Each placed object's document record as last built, by id; see `apply`. */
  #records = new Map<string, ObjectRecord>();
  /** The project's other scene documents by name, for composing in place; see `ShowOptions.library`. */
  #library: Record<string, unknown> = {};
  /** In-flight gizmo poses for prop instances: the outline moves, the batch waits for the commit. */
  #instancePoses = new Map<string, { position?: V3; yaw?: number }>();
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
    // A UI scene previews at the game's design size, letterboxed in the
    // panel, so what is placed is what the game shows — not the panel's
    // own proportions. A level fills whatever room the panels leave.
    const uiScene = doc.data.type === 'ui';
    const design = {
      width: typeof options.definition?.GAME?.width === 'number' ? options.definition.GAME.width as number : 1280,
      height: typeof options.definition?.GAME?.height === 'number' ? options.definition.GAME.height as number : 720
    };
    const game = new M2D(this.canvas, {
      // The game's own simulation options first; the document and the
      // editor override what they must.
      ...options.definition?.GAME,
      ...options.presentation,
      dimensions,
      editMode: !playing,
      width: uiScene ? design.width : this.canvas.clientWidth || 960,
      height: uiScene ? design.height : this.canvas.clientHeight || 540,
      // Tile layers and bounds size themselves from the world, so the
      // document's say matters here.
      ...(typeof world.width === 'number' && { worldWidth: world.width }),
      ...(typeof world.height === 'number' && { worldHeight: world.height }),
      ...(options.basePath && { basePath: options.basePath }),
      // The panels resize the canvas at will; the view fills whatever room
      // they leave rather than keep the shape it was made with.
      aspectMode: uiScene ? 'letterbox' : 'expand',
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
      // names one validates and a layer that instances one composes; they
      // are never switched to.
      for (const other of options.scenes ?? []) {
        if (other.name !== name) game.sceneManager.addScene(other.name, { fetch: other.fetch });
      }
    }
    this.#library = options.library ?? {};
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
    this.#instancePoses.clear();
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
    // A UI scene ignores the camera: panning it would move nothing.
    if (!uiScene) this.#controls = attachCameraControls(game as never, this.canvas, () => this.#viewChanged());
    this.#records = recordsOf(doc.data);
    this.#viewChanged();
    return true;
  }

  /** Whether the shown game is being played: edits, picks and gizmos wait. */
  get playing(): boolean { return this.#playing; }

  /** Whether the camera is being flown (the right button held): the keys are its, not the editor's. */
  get flying(): boolean { return this.#controls?.flying ?? false; }

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
    if (!scene || !ops.every((op) => objectLevel(op) || propsLevel(op) || tileLevel(op) || animationLevel(op) || elementLevel(op) || pathLevel(op) || lookLevel(op))) return { kind: 'rebuild' };
    const result = validateScene(data, this.#game, { scenes: this.#library });
    if (!result.ok) return { kind: 'invalid', issues: result.issues };

    // Props edit in place as a whole: the loaded groups go into the shown
    // scene's config and the engine rebuilds its batches, bodies and
    // lights from them (SceneProps.rebuild) — never the game around them.
    let propsChanged = 0;
    if (ops.some(propsLevel)) {
      const layers = isPlainObject(result.loaded) && Array.isArray(result.loaded.layers) ? result.loaded.layers : null;
      if (!scene.config?.layers || !scene.rebuildProps || !layers) return { kind: 'rebuild' };
      layers.forEach((layer, i) => {
        const shown = scene.config!.layers![i];
        if (shown && isPlainObject(layer)) shown.props = (layer as { props?: PropGroupLike[] }).props;
      });
      this.#instancePoses.clear();
      scene.rebuildProps();
      propsChanged = ops.filter(propsLevel).length;
    }

    // An edited animation redefines itself on the loaded sheet (E8): the
    // animation editor must not rebuild the game per tweak.
    if (ops.some(animationLevel)) {
      const loadedAssets = isPlainObject(result.loaded) && isPlainObject((result.loaded as { assets?: unknown }).assets)
        ? (result.loaded as { assets: { spritesheets?: Record<string, { animations?: Record<string, { frames: unknown[]; fps?: number; loop?: boolean }> }> } }).assets
        : null;
      for (const key of new Set(ops.filter(animationLevel).map((op) => String(op.path[2])))) {
        const sheet = scene.spriteSheets?.get(key);
        if (!sheet?.defineAnimation) return { kind: 'rebuild' };
        for (const [name, animation] of Object.entries(loadedAssets?.spritesheets?.[key]?.animations ?? {})) {
          sheet.defineAnimation(name, animation.frames, { fps: animation.fps ?? 0, loop: animation.loop ?? true });
        }
      }
      this.#viewChanged();
    }

    // A UI scene's elements rebuild from the config in place (E9).
    if (ops.some(elementLevel)) {
      if (!scene.config || !scene.rebuildUIScene || !isPlainObject(result.loaded)) return { kind: 'rebuild' };
      scene.config.elements = (result.loaded as { elements?: unknown[] }).elements as never;
      scene.rebuildUIScene();
      propsChanged += ops.filter(elementLevel).length;
    }

    // Nothing follows a path in edit mode, so a path edit is the map alone.
    if (ops.some(pathLevel)) {
      if (!scene.config || !scene.rebuildPaths || !isPlainObject(result.loaded)) return { kind: 'rebuild' };
      scene.config.paths = (result.loaded as { paths?: unknown }).paths;
      scene.rebuildPaths();
    }

    if (ops.some(lookLevel)) {
      if (!scene.config || !scene.rebuildLook || !isPlainObject(result.loaded) || !isPlainObject(result.loaded.world)) return { kind: 'rebuild' };
      scene.config.world = result.loaded.world;
      scene.rebuildLook();
      this.#viewChanged();
    }

    // Tile layers and the background rebuild from the config in place the
    // same way (E8): a painted cell must never rebuild the game.
    if (ops.some(tileLevel)) {
      if (!scene.config || !scene.rebuildTileLayers || !isPlainObject(result.loaded)) return { kind: 'rebuild' };
      // A layer naming a sheet the scene has not loaded is a real rebuild.
      const sheets = tileSheets(result.loaded);
      if (![...sheets].every((sheet) => scene.spriteSheets?.has(sheet))) return { kind: 'rebuild' };
      scene.config.tileLayers = (result.loaded as { tileLayers?: unknown[] }).tileLayers as never;
      scene.config.background = (result.loaded as { background?: unknown }).background as never;
      scene.rebuildTileLayers();
      propsChanged += ops.filter(tileLevel).length;
    }

    const next = recordsOf(data);
    const loaded = loadedObjects(result.loaded);
    for (const [id, record] of next) {
      const before = this.#records.get(id);
      // Overrides may name an asset the scene has not loaded (a new texture,
      // a model, a sheet): that is a rebuild. A scale, a recolour or a swap
      // to a loaded asset rebuilds the one object.
      if (before && before.overrides !== record.overrides && !this.#assetsLoaded(scene, loaded.get(id))) return { kind: 'rebuild' };
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
   * The placed object under a client point, by its scene id, or null.
   *
   * 3D casts the camera's ray against each object's *visible* volume — a
   * model's scaled bounds, a shape's real sphere or cylinder, never a
   * trigger box the renderer does not draw at that size — and a ring of
   * rays a few pixels around it, so a near miss on something small still
   * finds it. Hits rank drawn before hidden, direct before near, nearest
   * first, and a backdrop (the floor under the view) last of all. 2D tests
   * the drawn bounds the same way and prefers the smallest object
   * containing the point, so a backdrop the size of the world never wins
   * over what stands on it; see `picking.ts`.
   */
  pick(clientX: number, clientY: number): string | null {
    if (this.#playing) return null;
    const game = this.#game as unknown as { viewport: never; camera: Record<string, never> } | null;
    const scene = this.#scene();
    if (!game || !scene) return null;
    const rect = this.canvas.getBoundingClientRect();

    // A UI scene picks in UI space, through the tree's own hit test — the
    // input router's path — then walks up to the element the document owns.
    if (scene.config?.type === 'ui') {
      const { ui } = mapPointer({ clientX, clientY, rect, viewport: game.viewport }) as unknown as { ui: { x: number; y: number } };
      let hit = scene.ui?.hitTest(ui.x, ui.y) ?? null;
      while (hit) {
        for (const [id, element] of scene.uiById ?? []) {
          if (element === hit) return id;
        }
        hit = hit.parent ?? null;
      }
      return null;
    }

    const viewAt = (x: number, y: number) => mapPointer({ clientX: x, clientY: y, rect, viewport: game.viewport }).view;
    const hits: Hit[] = [];

    if (this.dimensions === 3) {
      const camera = game.camera as unknown as { screenToRay(x: number, y: number): { origin: V3; direction: V3 } };
      const volumes = [...scene.entitiesById].map(([id, entity]) => [id, entity, pickVolume(entity, scene)] as const);
      const instances = this.#pickableInstances(scene);
      for (const { dx, dy, direct } of slopOffsets(PICK_SLOP)) {
        const view = viewAt(clientX + dx, clientY + dy);
        const { origin, direction } = camera.screenToRay(view.x, view.y);
        for (const [id, entity, volume] of volumes) {
          // Into the body's frame, where the volume is axis-aligned, then to the volume's own centre.
          const inverse = rotation.conjugate(quatOf(entity));
          const c = entity.position as V3;
          const o = rotation.rotate(inverse, { x: origin.x - c.x, y: origin.y - c.y, z: origin.z - c.z });
          const local = { x: o.x - volume.centre.x, y: o.y - volume.centre.y, z: o.z - volume.centre.z };
          const t = rayShape(local, rotation.rotate(inverse, direction), volume.shape, volume.size);
          if (t === null) continue;
          hits.push({ id, t, tier: volume.hidden ? 1 : 0, backdrop: isBackdrop3D(volume.size, t), direct });
        }
        // Prop instances, by the same ranking: a yaw-only frame, so the
        // ray turns about the up axis instead of a full quaternion.
        for (const inst of instances) {
          const p = inst.position;
          const o = rotateY({ x: origin.x - p.x, y: origin.y - p.y, z: origin.z - p.z }, -inst.yaw);
          const local = { x: o.x - inst.centre.x, y: o.y - inst.centre.y, z: o.z - inst.centre.z };
          const t = rayShape(local, rotateY(direction, -inst.yaw), inst.shape, inst.size);
          if (t === null) continue;
          hits.push({ id: inst.id, t, tier: inst.hidden ? 1 : 0, backdrop: isBackdrop3D(inst.size, t), direct });
        }
      }
      return bestHit(hits);
    }

    const camera = game.camera as unknown as {
      zoom?: number; screenToWorld(x: number, y: number): Point; getVisibleArea?(): { width: number; height: number };
    };
    const zoom = typeof camera.zoom === 'number' && camera.zoom > 0 ? camera.zoom : 1;
    const slop = PICK_SLOP / zoom;
    const visible = camera.getVisibleArea?.();
    const viewArea = visible ? visible.width * visible.height : Infinity;
    const view = viewAt(clientX, clientY);
    const world = camera.screenToWorld(view.x, view.y);
    for (const [id, entity] of scene.entitiesById) {
      if (entity.visible === false) continue;
      const { x, y } = entity.renderPosition;
      const halfW = entity.size.x / 2;
      const halfH = entity.size.y / 2;
      const dx = Math.abs(world.x - x);
      const dy = Math.abs(world.y - y);
      if (dx > halfW + slop || dy > halfH + slop) continue;
      const area = entity.size.x * entity.size.y;
      hits.push({
        id,
        // Smaller first: the thing on the backdrop, not the backdrop.
        t: area,
        tier: entity.sprite || entity.mesh ? 0 : 1,
        backdrop: area >= viewArea / 4,
        direct: dx <= halfW && dy <= halfH
      });
    }
    return bestHit(hits);
  }

  /** What the editor knows about the prop instance `id` names — its tuple, volume and group — or null. */
  instanceAt(id: string): InstanceInfo | null {
    const ref = decodeInstance(id);
    const scene = this.#scene();
    if (!ref || !scene?.config) return null;
    const group = scene.config.layers?.[ref.layer]?.props?.[ref.prop];
    const tuple = group?.instances?.[ref.index];
    if (!group || !Array.isArray(tuple)) return null;
    const [x = 0, y = 0, z = 0, yaw = 0, scale = 1] = tuple;
    const { size, centre } = instanceVolume(scene, group, scale);
    return {
      ref, tuple: [x, y, z, yaw, scale], position: { x, y, z }, yaw, scale, size, centre,
      group: group.id ?? `props[${ref.prop}]`, prefab: group.prefab ?? ''
    };
  }

  /** Every prop instance of the shown 3D scene, with its pick volume. */
  #pickableInstances(scene: SceneLike): Array<{ id: string; position: V3; yaw: number; shape: Shape; size: V3; centre: V3; hidden: boolean }> {
    const out: Array<{ id: string; position: V3; yaw: number; shape: Shape; size: V3; centre: V3; hidden: boolean }> = [];
    const layers = scene.config?.layers ?? [];
    layers.forEach((layer, l) => {
      (layer.props ?? []).forEach((group, p) => {
        const mesh = group.prefab ? scene.config?.prefabs?.[group.prefab]?.mesh : undefined;
        // A model streamed out or still loading is not on screen: its
        // instances rank behind drawn things, but still answer a click.
        const hidden = !!mesh?.model && !scene.models?.has(mesh.model);
        const { shape } = instanceShape(mesh);
        (group.instances ?? []).forEach((tuple, i) => {
          if (!Array.isArray(tuple)) return;
          const [x = 0, y = 0, z = 0, yaw = 0, scale = 1] = tuple;
          const { size, centre } = instanceVolume(scene, group, scale);
          out.push({ id: encodeInstance({ layer: l, prop: p, index: i }), position: { x, y, z }, yaw, shape, size, centre, hidden });
        });
      });
    });
    return out;
  }

  /** Whether every asset a loaded object's overrides name is in the shown scene already. */
  #assetsLoaded(scene: SceneLike, object: object | undefined): boolean {
    const overrides = isPlainObject(object) && isPlainObject(object.overrides) ? object.overrides : null;
    if (!overrides) return true;
    if (typeof overrides.spritesheet === 'string' && !scene.spriteSheets?.has(overrides.spritesheet)) return false;
    const mesh = isPlainObject(overrides.mesh) ? overrides.mesh : null;
    if (mesh) {
      if (typeof mesh.model === 'string' && !scene.models?.has(mesh.model)) return false;
      const texture = isPlainObject(mesh.texture) ? mesh.texture : null;
      if (texture && typeof texture.url === 'string' && !scene.meshMaterials?.has(`${texture.url}|${(texture.size as number | undefined) ?? 1}`)) return false;
    }
    return true;
  }

  /** What `previewSize` changed on an entity, to put back if the drag is cancelled. */
  #sizePreviews = new Map<string, () => void>();

  /**
   * Show an object at another size while a scale drag is in progress: a
   * shape mesh draws at the body's recorded size, so that is what moves; a
   * model draws at its mesh block's scale and offset, so those scale; a 2D
   * sprite draws at the entity's size. The collider is left alone — the
   * edit on release rebuilds the object for real. `endPreviewSize` puts
   * the entity back when the drag is cancelled.
   */
  previewSize(id: string, size: { x: number; y: number; z?: number }): void {
    const element = this.#scene()?.config?.type === 'ui' ? this.#scene()?.uiById?.get(id) : undefined;
    if (element) {
      if (!this.#sizePreviews.has(id)) {
        const was = { width: element.width, height: element.height };
        this.#sizePreviews.set(id, () => { element.width = was.width; element.height = was.height; });
      }
      element.width = size.x;
      element.height = size.y;
      this.#viewChanged();
      return;
    }
    if (decodeInstance(id)) { this.#viewChanged(); return; }
    const entity = this.#scene()?.entitiesById.get(id);
    if (!entity) return;
    if (!this.#sizePreviews.has(id)) {
      const body = entity.body;
      const was = { sizeVec: body.sizeVec ? { ...body.sizeVec } : null, mesh: entity.mesh, size: { ...entity.size } };
      this.#sizePreviews.set(id, () => {
        if (was.sizeVec) body.sizeVec = was.sizeVec;
        entity.mesh = was.mesh;
        entity.size = was.size;
      });
    }
    if (this.dimensions === 3) {
      const base = this.#sizePreviews.get(id) ? entity : entity;
      const mesh = entity.mesh;
      if (mesh?.model) {
        // Uniform, by the width's ratio to what the preview started from.
        const started = (entity.body.sizeVec ?? entity.size).x || 1;
        const factor = size.x / started;
        const o = mesh.offset ?? { x: 0, y: 0, z: 0 };
        entity.mesh = { ...mesh, scale: (mesh.scale ?? 1) * factor, offset: { x: o.x * factor, y: o.y * factor, z: o.z * factor } };
      }
      if (entity.body.sizeVec) entity.body.sizeVec = { x: size.x, y: size.y, z: size.z ?? size.x };
      void base;
    } else {
      entity.size = { x: size.x, y: size.y };
    }
    this.#viewChanged();
  }

  /** Put back what `previewSize` changed (the drag was cancelled), or forget it (the edit rebuilt the object). */
  endPreviewSize(id: string, restore: boolean): void {
    const undo = this.#sizePreviews.get(id);
    this.#sizePreviews.delete(id);
    if (restore) undo?.();
    this.#viewChanged();
  }

  /**
   * The constraints the shown entity actually carries — the ones its actor
   * attached in its constructor as well as the document's — each with the
   * live value of every param its class declares. What the inspector shows
   * so a scene author sees what the game really runs, not only what the
   * document says.
   */
  liveConstraints(id: string): Array<{ slot: string; type: string; params: Record<string, unknown> }> {
    const entity = this.#scene()?.entitiesById.get(id);
    if (!entity?.constraints) return [];
    const out: Array<{ slot: string; type: string; params: Record<string, unknown> }> = [];
    for (const [slot, constraint] of entity.constraints) {
      const klass = constraint.constructor;
      const params: Record<string, unknown> = {};
      for (const key of Object.keys(klass.params ?? {})) {
        const shown = plainValue(constraint[key]);
        if (shown !== undefined) params[key] = shown;
      }
      out.push({ slot, type: klass.name, params });
    }
    return out;
  }

  /** The ids of the placed objects (or UI elements) whose on-screen centre a test accepts: what a marquee selects. */
  objectsWithin(test: (centre: ClientPoint) => boolean): string[] {
    const scene = this.#scene();
    const toClient = this.#toClient();
    if (this.#playing || !scene || !toClient) return [];
    const ids: string[] = [];
    if (scene.config?.type === 'ui') {
      for (const [id, element] of scene.uiById ?? []) {
        if (test(toClient({ x: element.x, y: element.y }))) ids.push(id);
      }
      return ids;
    }
    for (const [id, entity] of scene.entitiesById) {
      const centre = toClient(this.dimensions === 3 ? entity.position : entity.renderPosition);
      if (!centre.behind && test(centre)) ids.push(id);
    }
    return ids;
  }

  /** Where an object is on screen, for its outline and gizmo; null if it is not shown or is behind the eye. */
  placement(id: string): Placement | null {
    if (this.#playing) return null;
    if (this.#scene()?.config?.type === 'ui') return this.#elementPlacement(id);
    if (decodeInstance(id)) return this.#instancePlacement(id);
    const entity = this.#scene()?.entitiesById.get(id);
    if (!entity) return null;
    const toClient = this.#toClient();
    if (!toClient) return null;
    const angle = entity.body.angle ?? 0;

    if (this.dimensions === 3) {
      const p = entity.position as V3;
      const q = quatOf(entity);
      const size = { x: entity.size.x, y: entity.size.y, z: entity.size.z ?? entity.size.x };
      const center = toClient(p);
      // Behind the eye a point still projects — mirrored, onto nonsense. Nothing to show.
      if (center.behind) return null;
      const edges = this.outline({ position: p, size, rotation: q });
      const axes = (['x', 'y', 'z'] as const).map((axis) => axisOf(axis, center, toClient({ ...p, [axis]: p[axis] + 1 })));
      const rings = this.#rings3D(p, axes, toClient);
      return {
        id, dimensions: 3, center, edges, axes, size, onScreen: this.#onScreen(center),
        position: { x: p.x, y: p.y, z: p.z }, angle, rotation: q, rings
      };
    }

    // 2D: the outline is the drawn frame, turned with the body; the axes
    // are the ground's, through the projection when the game has one.
    const drawn = entity.renderPosition;
    const turn = entity.renderAngle ?? angle;
    const edges = this.outline({ drawnAt: drawn, size: entity.size, angle: turn });
    const ground = entity.position;
    const origin = this.#plane(ground.x, ground.y, toClient);
    const axes = [
      axisOf('x', origin, this.#plane(ground.x + 1, ground.y, toClient)),
      axisOf('y', origin, this.#plane(ground.x, ground.y + 1, toClient))
    ];
    const center = toClient(drawn);
    return {
      id, dimensions: 2, center, edges, axes, size: { x: entity.size.x, y: entity.size.y }, onScreen: this.#onScreen(center),
      drawnAt: { x: drawn.x, y: drawn.y }, position: { x: ground.x, y: ground.y }, angle
    };
  }

  /**
   * Every light the shown scene carries, for the view helpers: an
   * entity's (3D: placed by its offset; 2D: at its body), by its scene id,
   * and a prop's (no id — a prop instance's light is the group's). A
   * spot carries its direction.
   */
  lights(): Array<{ id: string | null; position: { x: number; y: number; z?: number }; spot: boolean; direction?: V3; range?: number }> {
    const scene = this.#scene() as (SceneLike & { propLights?: Array<{ position: V3; type?: string; direction?: V3; range?: number }> }) | null;
    if (!scene || this.#playing) return [];
    const out: Array<{ id: string | null; position: { x: number; y: number; z?: number }; spot: boolean; direction?: V3; range?: number }> = [];
    for (const [id, entity] of scene.entitiesById) {
      const light = (entity as { light?: { type?: string; offset?: { x?: number; y?: number; z?: number }; direction?: V3; range?: number } | null }).light;
      if (!light) continue;
      const o = light.offset ?? {};
      const position = this.dimensions === 3
        ? { x: (entity.position.x) + (o.x ?? 0), y: (entity.position.y) + (o.y ?? 0), z: (entity.position.z ?? 0) + (o.z ?? 0) }
        : { x: entity.renderPosition.x + (o.x ?? 0), y: entity.renderPosition.y + (o.y ?? 0) };
      out.push({ id, position, spot: light.type === 'spot', direction: light.direction, range: light.range });
    }
    for (const light of scene.propLights ?? []) {
      out.push({ id: null, position: light.position, spot: light.type === 'spot', direction: light.direction, range: light.range });
    }
    return out;
  }

  /** The 2D camera's visible rectangle on the render plane, or null. */
  visibleArea(): { left: number; top: number; right: number; bottom: number } | null {
    const camera = (this.#game as unknown as { camera?: { getVisibleArea?(): { left: number; top: number; right: number; bottom: number } } } | null)?.camera;
    return this.dimensions === 2 ? camera?.getVisibleArea?.() ?? null : null;
  }

  /** The 3D camera's look-at point, or the 2D camera's centre. */
  cameraTarget(): V3 | null {
    const camera = (this.#game as unknown as { camera?: { lookAt?: V3; x?: number; y?: number } } | null)?.camera;
    if (!camera) return null;
    if (this.dimensions === 3) return camera.lookAt ? { ...camera.lookAt } : null;
    return { x: camera.x ?? 0, y: camera.y ?? 0, z: 0 };
  }

  /** The world size the shown game was built with. */
  worldSize(): { width: number; height: number } {
    const options = (this.#game as unknown as { options?: { worldWidth?: number; worldHeight?: number } } | null)?.options;
    return { width: options?.worldWidth ?? 960, height: options?.worldHeight ?? 540 };
  }

  /** Whether the game draws through a 2D projection (isometric, belt). */
  get projected(): boolean {
    return !!(this.#game as unknown as { projection?: unknown } | null)?.projection;
  }

  /** What `isolate` hid, to show again. */
  #isolated: Array<() => void> = [];

  /**
   * Isolate: show only the objects named (and nothing of the props), or
   * everything again with null. Visibility only — nothing is rebuilt.
   */
  isolate(ids: string[] | null): void {
    for (const restore of this.#isolated) restore();
    this.#isolated = [];
    const scene = this.#scene() as (SceneLike & { props?: { hidden: boolean } }) | null;
    if (!scene || !ids) { this.#viewChanged(); return; }
    const keep = new Set(ids);
    for (const [id, entity] of scene.entitiesById) {
      if (keep.has(id)) continue;
      const was = entity.visible;
      entity.visible = false;
      this.#isolated.push(() => { entity.visible = was; });
    }
    if (scene.props) {
      const props = scene.props;
      const was = props.hidden;
      props.hidden = true;
      this.#isolated.push(() => { props.hidden = was; });
    }
    this.#viewChanged();
  }

  /** The UI space's size, for anchor math; null off a UI scene. */
  uiBox(): { width: number; height: number } | null {
    if (this.#scene()?.config?.type !== 'ui') return null;
    const ui = (this.#game as unknown as { uiRenderer?: { width: number; height: number } } | null)?.uiRenderer;
    return ui ? { width: ui.width, height: ui.height } : null;
  }

  /** A UI point in client pixels; nothing in UI space is ever behind the eye. */
  #uiToClient(): ((p: Point) => ClientPoint) | null {
    const game = this.#game as unknown as { viewport: never } | null;
    if (!game) return null;
    const rect = this.canvas.getBoundingClientRect();
    return (p) => {
      const view = uiToView({ x: p.x, y: p.y, viewport: game.viewport });
      const client = viewToClient({ x: view.x, y: view.y, rect, viewport: game.viewport });
      return { x: client.x, y: client.y, behind: false };
    };
  }

  /**
   * A UI element's placement (E9): its frame outlined in UI space mapped
   * to the screen, screen-aligned axes, no rotation — an element does not
   * turn — and the nine anchor points of the box it offsets from, the
   * element's own marked. `position` is the document's `x`/`y`: an
   * element's offsets from its anchor, exactly what a move writes back.
   */
  #elementPlacement(id: string): Placement | null {
    const scene = this.#scene();
    const live = scene?.uiById?.get(id);
    const toClient = this.#uiToClient();
    if (!live || !toClient) return null;
    const f = live.frame;
    const corners = [
      { x: f.x, y: f.y }, { x: f.x + f.width, y: f.y },
      { x: f.x + f.width, y: f.y + f.height }, { x: f.x, y: f.y + f.height }
    ].map(toClient);
    const edges = corners.map((point, i): [Point, Point] => [point, corners[(i + 1) % 4]!]);
    const center = toClient({ x: live.x, y: live.y });
    const axes: Placement['axes'] = [
      axisOf('x', center, toClient({ x: live.x + 1, y: live.y })),
      axisOf('y', center, toClient({ x: live.x, y: live.y + 1 }))
    ];
    const element = scene?.config?.elements?.find((each) => each?.id === id);
    const anchor = element?.anchor ?? 'top-left';
    const game = this.#game as unknown as { uiRenderer?: { width: number; height: number } } | null;
    const box = { width: game?.uiRenderer?.width ?? 0, height: game?.uiRenderer?.height ?? 0 };
    const anchors = Object.entries(ANCHOR_POINTS).map(([name, [fx, fy]]) => ({
      name,
      point: toClient({ x: fx * box.width, y: fy * box.height }),
      active: name === anchor
    }));
    return {
      id, dimensions: 2, center, edges, axes,
      size: { x: f.width, y: f.height },
      onScreen: this.#onScreen(center),
      drawnAt: { x: live.x, y: live.y },
      position: { x: live.offsetX, y: live.offsetY },
      angle: 0,
      tools: { rotate: false, scale: element?.type !== 'text' },
      anchors
    };
  }

  /** A prop instance's placement: its volume outlined, yaw the only ring, a uniform scale. */
  #instancePlacement(id: string): Placement | null {
    if (this.dimensions !== 3) return null;
    const info = this.instanceAt(id);
    const toClient = this.#toClient();
    if (!info || !toClient) return null;
    const pose = this.#instancePoses.get(id);
    const p = pose?.position ?? info.position;
    const yaw = pose?.yaw ?? info.yaw;
    const q: Quaternion = rotation.forScene(rotation.fromAxisAngle({ x: 0, y: 1, z: 0 }, yaw));
    const offset = rotateY(info.centre, yaw);
    const drawnAt = { x: p.x + offset.x, y: p.y + offset.y, z: p.z + offset.z };
    const center = toClient(drawnAt);
    if (center.behind) return null;
    const edges = this.outline({ position: drawnAt, size: info.size, rotation: q });
    const axes = (['x', 'y', 'z'] as const).map((axis) => axisOf(axis, center, toClient({ ...drawnAt, [axis]: drawnAt[axis] + 1 })));
    // An instance turns about the up axis alone, so only that ring shows.
    const rings = this.#rings3D(drawnAt, axes, toClient).filter((ring) => ring.axis === 'y');
    return {
      id, dimensions: 3, center, edges, axes, size: { ...info.size }, onScreen: this.#onScreen(center),
      position: { x: p.x, y: p.y, z: p.z }, angle: 0, rotation: q, rings
    };
  }

  /** Whether a client point is on the canvas (within a small margin); off it a gizmo would float over nothing. */
  #onScreen(c: Point): boolean {
    const rect = this.canvas.getBoundingClientRect();
    return c.x >= rect.left - OFFSCREEN_MARGIN && c.x <= rect.right + OFFSCREEN_MARGIN
      && c.y >= rect.top - OFFSCREEN_MARGIN && c.y <= rect.bottom + OFFSCREEN_MARGIN;
  }

  /** The three rotate rings around `p`, sized to read about RING_PX across on screen. */
  #rings3D(
    p: V3, axes: Placement['axes'], toClient: (point: { x: number; y: number; z?: number }) => ClientPoint
  ): NonNullable<Placement['rings']> {
    const pxPerUnit = axes.reduce((sum, a) => sum + a.scale, 0) / 3 || 1;
    const radius = RING_PX / pxPerUnit;
    const eye = (this.#game?.camera as unknown as { position?: V3 } | undefined)?.position ?? p;
    return (['x', 'y', 'z'] as const).map((axis) => {
      const normal = { x: axis === 'x' ? 1 : 0, y: axis === 'y' ? 1 : 0, z: axis === 'z' ? 1 : 0 };
      const [u, v] = axis === 'x' ? ['y', 'z'] as const : axis === 'y' ? ['z', 'x'] as const : ['x', 'y'] as const;
      const points: Point[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const w = { ...p };
        w[u] += Math.cos(a) * radius;
        w[v] += Math.sin(a) * radius;
        const point = toClient(w);
        if (!point.behind) points.push(point);
      }
      const facing = (eye[axis] - p[axis]) > 0;
      return { axis, normal, points, facing };
    });
  }

  /**
   * The outline of a box on screen, as client-space segments: a 3D box at
   * a position with a size and an orientation, or a 2D frame drawn at a
   * render-plane point (or standing at a ground point, through the
   * projection) with a size and a turn. Segments with an end behind the
   * eye are left out. What the selection's outline, a scale drag's preview
   * and a drop's ghost all draw with.
   */
  outline(spec: {
    position?: { x: number; y: number; z?: number }; drawnAt?: Point;
    size: { x: number; y: number; z?: number }; rotation?: Quaternion; angle?: number;
  }): Array<[Point, Point]> {
    const toClient = this.#toClient();
    if (!toClient) return [];
    if (this.dimensions === 3) {
      const p = { x: spec.position?.x ?? 0, y: spec.position?.y ?? 0, z: spec.position?.z ?? 0 };
      const q = spec.rotation ?? rotation.IDENTITY;
      const h = { x: spec.size.x / 2, y: spec.size.y / 2, z: (spec.size.z ?? spec.size.x) / 2 };
      const corner = (sx: number, sy: number, sz: number) => {
        const r = rotation.rotate(q, { x: sx * h.x, y: sy * h.y, z: sz * h.z });
        return toClient({ x: p.x + r.x, y: p.y + r.y, z: p.z + r.z });
      };
      const edges: Array<[Point, Point]> = [];
      for (const [a, b] of BOX_EDGES) {
        const from = corner(...a);
        const to = corner(...b);
        if (!from.behind && !to.behind) edges.push([from, to]);
      }
      return edges;
    }
    const drawn = spec.drawnAt ?? this.#renderPlane(spec.position?.x ?? 0, spec.position?.y ?? 0);
    const turn = spec.angle ?? 0;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const hw = spec.size.x / 2;
    const hh = spec.size.y / 2;
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) =>
      toClient({ x: drawn.x + dx! * cos - dy! * sin, y: drawn.y + dx! * sin + dy! * cos }));
    return corners.map((point, i): [Point, Point] => [point, corners[(i + 1) % 4]!]);
  }

  /** A world point (render-plane point in 2D) on screen, in client pixels, or null with no game. */
  project(p: { x: number; y: number; z?: number }): ClientPoint | null {
    return this.#toClient()?.(p) ?? null;
  }

  /** A 2D ground point on screen, through the game's projection when it has one — the inverse of `worldPoint`. */
  groundToClient(x: number, y: number): ClientPoint | null {
    if (this.dimensions !== 2) return null;
    const toClient = this.#toClient();
    return toClient ? this.#plane(x, y, toClient) : null;
  }

  /** A 2D ground point on the render plane, through the game's projection when it has one. */
  #renderPlane(x: number, y: number): Point {
    const projection = (this.#game as unknown as { projection?: { toScreen(x: number, y: number): Point } }).projection;
    return projection ? projection.toScreen(x, y) : { x, y };
  }

  #plane(x: number, y: number, toClient: (p: { x: number; y: number }) => ClientPoint): ClientPoint {
    return toClient(this.#renderPlane(x, y));
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

  /** Show particle fields that are not yet in the document, while a slider drags; the edit on release replaces them. */
  previewParticles(fields: unknown[]): void {
    const scene = this.#scene();
    if (this.#playing || !scene?.config || !scene.rebuildLook) return;
    scene.config.world = { ...scene.config.world, particles: fields };
    scene.rebuildLook();
    this.#viewChanged();
  }

  /** Show the lighting cycle at `phase`, or back at the document's own with null; nothing is written. */
  previewPhase(phase: number | null): void {
    const scene = this.#scene();
    if (this.#playing || !scene?.previewCycle) return;
    const cycle = scene.config?.world?.cycle as { phase?: number } | undefined;
    scene.previewCycle(phase ?? cycle?.phase ?? 0);
    this.#viewChanged();
  }

  /**
   * Show an object somewhere it is not yet in the document, while a gizmo
   * drags it: the body moves, nothing is rebuilt. The edit on release
   * rebuilds it for real — and an actor that seeds its look from where it
   * stands may then look different there, which is the truth.
   */
  preview(id: string, pose: Pose): void {
    // A UI element poses live: its offsets are exactly the document's x/y.
    const element = this.#scene()?.config?.type === 'ui' ? this.#scene()?.uiById?.get(id) : undefined;
    if (element) {
      if (pose.position) {
        element.offsetX = pose.position.x;
        element.offsetY = pose.position.y;
      }
      this.#viewChanged();
      return;
    }
    if (decodeInstance(id)) {
      // The batch cannot move per frame (every shadow cube would re-render);
      // the pose moves the overlay's outline, and the commit rebuilds once.
      const entry = this.#instancePoses.get(id) ?? {};
      if (pose.position) entry.position = { x: pose.position.x, y: pose.position.y, z: pose.position.z ?? 0 };
      if (pose.rotation) entry.yaw = 2 * Math.atan2(pose.rotation[1], pose.rotation[3]);
      this.#instancePoses.set(id, entry);
      this.#viewChanged();
      return;
    }
    const entity = this.#scene()?.entitiesById.get(id);
    if (!entity) return;
    const { position, angle, rotation: q } = pose;
    if (position) entity.body.setPosition(this.dimensions === 3 ? position : { x: position.x, y: position.y });
    if (angle !== undefined) entity.body.setAngle?.(angle);
    if (q) entity.body.setRotation?.({ x: q[0], y: q[1], z: q[2], w: q[3] });
    this.#viewChanged();
  }

  /** Point the camera at an object or a prop instance, keeping the zoom and the angle. */
  frame(id: string): void {
    const camera = this.#game?.camera as (Record<string, unknown> & { update?(dt: number): void; lookAt?: Record<string, number> }) | undefined;
    const instance = decodeInstance(id) ? this.instanceAt(id) : null;
    if (instance && camera) {
      if (camera.lookAt) Object.assign(camera.lookAt, instance.position);
      camera.update?.(0);
      this.#viewChanged();
      return;
    }
    const entity = this.#scene()?.entitiesById.get(id);
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

  /**
   * World (render-plane in 2D) to client pixels, for the current camera
   * and canvas. In 3D a point behind the eye still projects — the divide
   * flips it onto the screen — so each point says whether it is behind,
   * from its depth in view space, and callers leave those out.
   */
  #toClient(): ((p: { x: number; y: number; z?: number }) => ClientPoint) | null {
    // A UI scene's points are in UI space, not the world's: the camera
    // never moves them, the letterbox does.
    if (this.#scene()?.config?.type === 'ui') return this.#uiToClient();
    const game = this.#game as unknown as {
      viewport: never;
      camera: { worldToScreen(x: number, y: number, z?: number): Point; view?: Float32Array | number[]; near?: number };
    } | null;
    if (!game) return null;
    const rect = this.canvas.getBoundingClientRect();
    const { view: matrix, near = 0.1 } = game.camera;
    const threeD = this.dimensions === 3 && matrix !== undefined;
    return (p) => {
      const view = game.camera.worldToScreen(p.x, p.y, p.z);
      const client = viewToClient({ x: view.x, y: view.y, rect, viewport: game.viewport });
      // View space looks down -z: the depth of the point is minus its view z.
      const depth = threeD ? -(matrix[2]! * p.x + matrix[6]! * p.y + matrix[10]! * (p.z ?? 0) + matrix[14]!) : 1;
      return { x: client.x, y: client.y, behind: depth < near };
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
    this.#instancePoses.clear();
    this.#isolated = [];
    this.#controls?.detach();
    this.#controls = null;
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

/**
 * What a pick tests for a 3D entity: the model's bounds under the mesh
 * block's scale and offset when it draws one, else its shape at the
 * body's size. A trigger box twice the size of the lamp inside it is not
 * what the eye sees, so it is not what a click lands on.
 */
function pickVolume(entity: EntityLike, scene: SceneLike): PickVolume {
  const size = { x: entity.size.x, y: entity.size.y, z: entity.size.z ?? entity.size.x };
  const mesh = entity.mesh;
  const hidden = mesh?.visible === false || entity.visible === false;
  const bounds = mesh?.model ? scene.models?.get(mesh.model)?.bounds : undefined;
  if (bounds) {
    const s = mesh?.scale ?? 1;
    const o = mesh?.offset ?? { x: 0, y: 0, z: 0 };
    return {
      shape: 'box',
      size: { x: (bounds.max.x - bounds.min.x) * s, y: (bounds.max.y - bounds.min.y) * s, z: (bounds.max.z - bounds.min.z) * s },
      centre: { x: (bounds.max.x + bounds.min.x) / 2 * s + o.x, y: (bounds.max.y + bounds.min.y) / 2 * s + o.y, z: (bounds.max.z + bounds.min.z) / 2 * s + o.z },
      hidden
    };
  }
  const shape = (mesh?.shape ?? entity.body.shape ?? 'box') as Shape;
  return { shape: ['sphere', 'cylinder', 'capsule'].includes(shape) ? shape : 'box', size, centre: { x: 0, y: 0, z: 0 }, hidden };
}

/**
 * A live field as plain data for display, or undefined when it is not
 * data: a function, an engine object (a body, a collider set) or anything
 * cyclic. Arrays and plain objects are copied two levels down.
 */
function plainValue(value: unknown, depth = 0): unknown {
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value !== 'object' || depth > 2) return undefined;
  if (Array.isArray(value)) return value.map((each) => plainValue(each, depth + 1) ?? null);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, each] of Object.entries(value as Record<string, unknown>)) {
    const shown = plainValue(each, depth + 1);
    if (shown !== undefined) out[key] = shown;
  }
  return out;
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

/** Whether an op only touches a layer's props: the in-place prop rebuild covers it. */
function propsLevel(op: Op): boolean {
  const [layers, index, props] = op.path;
  return layers === 'layers' && typeof index === 'number' && props === 'props';
}

/** Whether an op only touches the tile layers or the background: the in-place layer rebuild covers it. */
function tileLevel(op: Op): boolean {
  return op.path[0] === 'tileLayers' || op.path[0] === 'background';
}

/** Whether an op only touches a sheet's animations: redefining them on the loaded sheet covers it. */
function animationLevel(op: Op): boolean {
  return op.path[0] === 'assets' && op.path[1] === 'spritesheets' && typeof op.path[2] === 'string' && op.path[3] === 'animations';
}

function lookLevel(op: Op): boolean {
  return op.path[0] === 'world' && ['lighting', 'post', 'cycle', 'particles'].includes(String(op.path[1]));
}

function pathLevel(op: Op): boolean {
  return op.path[0] === 'paths';
}

/** Whether an op only touches a UI scene's elements: the in-place element rebuild covers it. */
function elementLevel(op: Op): boolean {
  return op.path[0] === 'elements';
}

/** The nine anchor origins, the engine's own. */
const ANCHOR_POINTS: Readonly<Record<string, readonly [number, number]>> = ANCHOR_ORIGINS;

/** Every sheet the loaded document's tile layers and background draw from. */
function tileSheets(loaded: Record<string, unknown>): Set<string> {
  const sheets = new Set<string>();
  for (const layer of Array.isArray(loaded.tileLayers) ? loaded.tileLayers : []) {
    if (isPlainObject(layer) && typeof layer.spritesheet === 'string') sheets.add(layer.spritesheet);
  }
  if (isPlainObject(loaded.background) && typeof loaded.background.spritesheet === 'string') sheets.add(loaded.background.spritesheet);
  return sheets;
}

/** A vector turned about the up axis, the way the engine turns a prop by its yaw. */
function rotateY(v: V3, yaw: number): V3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}

/** The pick shape of a prop instance: the prefab's primitive, or a box for a model. */
function instanceShape(mesh?: { model?: string; shape?: string }): { shape: Shape } {
  if (mesh?.model) return { shape: 'box' };
  const shape = mesh?.shape ?? 'box';
  return { shape: (['sphere', 'cylinder', 'capsule'].includes(shape) ? shape : 'box') as Shape };
}

/**
 * The drawn volume of one instance of a prop group, in the instance's own
 * frame (before its yaw): a model's bounds under the mesh block's scale
 * and offset, or the group's size for a primitive — both times the
 * instance's scale. A model not resident falls back to the group's size
 * standing on the instance origin, so it can still be outlined and picked.
 */
function instanceVolume(scene: SceneLike, group: PropGroupLike, scale: number): { size: V3; centre: V3 } {
  const mesh = group.prefab ? scene.config?.prefabs?.[group.prefab]?.mesh : undefined;
  const bounds = mesh?.model ? scene.models?.get(mesh.model)?.bounds : undefined;
  if (bounds && mesh) {
    const s = mesh.scale ?? 1;
    const o = mesh.offset ?? { x: 0, y: 0, z: 0 };
    return {
      size: {
        x: (bounds.max.x - bounds.min.x) * s * scale,
        y: (bounds.max.y - bounds.min.y) * s * scale,
        z: (bounds.max.z - bounds.min.z) * s * scale
      },
      centre: {
        x: (((bounds.max.x + bounds.min.x) / 2) * s + o.x) * scale,
        y: (((bounds.max.y + bounds.min.y) / 2) * s + o.y) * scale,
        z: (((bounds.max.z + bounds.min.z) / 2) * s + o.z) * scale
      }
    };
  }
  const w = (group.width ?? 32) * scale;
  const h = (group.height ?? 32) * scale;
  const d = (group.depth ?? group.width ?? 32) * scale;
  if (mesh?.model) return { size: { x: w, y: h, z: d }, centre: { x: 0, y: h / 2, z: 0 } };
  return { size: { x: w, y: h, z: d }, centre: { x: 0, y: 0, z: 0 } };
}

function axisOf(axis: 'x' | 'y' | 'z', from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = Math.hypot(dx, dy);
  return { axis, dir: scale > 1e-9 ? { x: dx / scale, y: dy / scale } : { x: 0, y: 0 }, scale };
}

/** The twelve edges of a box, as pairs of corner signs. */
const BOX_EDGES: Array<[[number, number, number], [number, number, number]]> = [
  [[-1, -1, -1], [1, -1, -1]], [[1, -1, -1], [1, -1, 1]], [[1, -1, 1], [-1, -1, 1]], [[-1, -1, 1], [-1, -1, -1]],
  [[-1, 1, -1], [1, 1, -1]], [[1, 1, -1], [1, 1, 1]], [[1, 1, 1], [-1, 1, 1]], [[-1, 1, 1], [-1, 1, -1]],
  [[-1, -1, -1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1]], [[1, -1, 1], [1, 1, 1]], [[-1, -1, 1], [-1, 1, 1]]
];
