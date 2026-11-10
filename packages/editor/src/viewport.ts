/**
 * The viewport: an engine instance in edit mode, drawing a document.
 *
 * Edit mode (E0.6) is what makes this possible — the scene materializes
 * from its document with no lifecycle hook run, no tick, no input into
 * the simulation and no game transition, so what is on screen is the
 * document and nothing else. Play-in-editor (E4) is the same document
 * through a fresh game *without* the flag.
 *
 * A project's actor and constraint classes are code the editor cannot
 * load yet (a project manifest for them is E5 territory), so the ones a
 * document names get **placeholders**: an empty actor still draws its
 * prefab's sprite or mesh — the data half of its look — and a
 * placeholder constraint (`static params = null`) accepts whatever the
 * scene tuned on the real one. What hand-written `draw()` code adds on
 * top is the half an editor cannot reach, and the viewport is honest
 * about that rather than guessing.
 */

import { M2D } from 'm2d-engine/core/m2d.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { Constraint } from 'm2d-engine/core/constraint.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { initWebGPU, webgpuSupported } from 'm2d-engine/core/renderers/index.js';
import { isPlainObject, type SceneDocument } from 'm2d-editor-core';
import { attachCameraControls } from './cameraControls.ts';

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
  /** Real classes to register ahead of the placeholders, by name. */
  actors?: Record<string, unknown>;
  /** Other scene names the document may refer to (buttons, triggers). */
  sceneNames?: string[];
  /**
   * What the engine materializes, when it differs from the document —
   * a copy whose asset URLs were made reachable (see assetUrls.ts).
   */
  data?: Record<string, unknown>;
  /** Called at close, after the game is gone: blob URLs go back here. */
  cleanup?: () => void;
}

export class Viewport {
  readonly canvas: HTMLCanvasElement;
  #game: InstanceType<typeof M2D> | null = null;
  #detach: (() => void) | null = null;
  #cleanup: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** The dimension a document asks for; the game is built to match. */
  static dimensionsOf(doc: SceneDocument): number {
    const world = (doc.data as { world?: { dimensions?: unknown } }).world;
    return world?.dimensions === 3 ? 3 : 2;
  }

  /**
   * Show a document. Tears down whatever was there first: a game owns a
   * physics world and a GPU device's worth of resources, and nothing of
   * it may survive `destroy()`.
   */
  async show(doc: SceneDocument, options: ShowOptions = {}): Promise<void> {
    this.close();
    const dimensions = Viewport.dimensionsOf(doc);
    if (dimensions === 3) {
      if (!webgpuSupported()) throw new Error('This scene is 3D, which needs WebGPU: Chrome or Edge with a GPU.');
      await initWebGPU();
    }
    await initPhysics(dimensions === 3 ? { dimensions: 3 } : undefined);

    const world = isPlainObject(doc.data.world) ? doc.data.world : {};
    const game = new M2D(this.canvas, {
      dimensions,
      editMode: true,
      width: this.canvas.clientWidth || 960,
      height: this.canvas.clientHeight || 540,
      // Tile layers and bounds size themselves from the world, so the
      // document's say matters here.
      worldWidth: typeof world.width === 'number' ? world.width : undefined,
      worldHeight: typeof world.height === 'number' ? world.height : undefined,
      // The editor's own chrome is DOM; the engine draws the world only.
      performanceStats: false,
      devConsole: false
    });
    for (const [name, Class] of Object.entries(options.actors ?? {})) {
      game.registerActor(name, Class as never);
    }
    const named = namedClasses(doc.data);
    for (const name of named.actors) {
      if (!(options.actors && name in options.actors)) game.registerActor(name, placeholderActor() as never);
    }
    for (const type of named.constraints) {
      game.registerConstraint(type, placeholderConstraint() as never);
    }

    const data = options.data ?? doc.data;
    const name = doc.name ?? 'scene';
    game.sceneManager.addScene(name, { fetch: async () => data });
    // The rest of the project's scenes, so a button or a trigger that
    // names one validates; they are never switched to.
    for (const other of options.sceneNames ?? []) {
      if (other !== name) game.sceneManager.addScene(other, { fetch: async () => ({}) });
    }
    this.#game = game;
    await game.start();
    await game.sceneManager.switchTo(name);
    // Start looking at the middle of the world rather than its origin;
    // the camera is the editor's from here (drag to move, scroll to zoom).
    if (dimensions === 2) {
      const camera = game.camera as { x: number; y: number };
      camera.x = (typeof world.width === 'number' ? world.width : game.options.width as number) / 2;
      camera.y = (typeof world.height === 'number' ? world.height : game.options.height as number) / 2;
    }
    this.#detach = attachCameraControls(game as never);
    this.#cleanup = options.cleanup ?? null;
  }

  /** Nothing of a game may outlive this; see the engine's teardown rule. */
  close(): void {
    this.#detach?.();
    this.#detach = null;
    this.#game?.destroy();
    this.#game = null;
    this.#cleanup?.();
    this.#cleanup = null;
  }

  get game(): InstanceType<typeof M2D> | null {
    return this.#game;
  }
}
