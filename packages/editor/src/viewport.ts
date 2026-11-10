/**
 * The viewport: an engine instance in edit mode, drawing a document.
 *
 * Edit mode (E0.6) is what makes this possible — the scene materializes
 * from its document with no lifecycle hook run, no tick, no input into
 * the simulation and no game transition, so what is on screen is the
 * document and nothing else. Play-in-editor (E4) is the same document
 * through a fresh game *without* the flag.
 *
 * The engine draws; it does not decide. Selection, gizmos and
 * render-mode toggles are E2, and the extra cameras an editor wants are
 * `game.addView` (E0.5), which this will grow into when the layout does.
 */

import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { initWebGPU, webgpuSupported } from 'm2d-engine/core/renderers/index.js';
import type { SceneDocument } from 'm2d-editor-core';

export class Viewport {
  readonly canvas: HTMLCanvasElement;
  #game: InstanceType<typeof M2D> | null = null;

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
  async show(doc: SceneDocument, actors: Record<string, unknown> = {}): Promise<void> {
    this.close();
    const dimensions = Viewport.dimensionsOf(doc);
    if (dimensions === 3) {
      if (!webgpuSupported()) throw new Error('This scene is 3D, which needs WebGPU: Chrome or Edge with a GPU.');
      await initWebGPU();
    }
    await initPhysics(dimensions === 3 ? { dimensions: 3 } : undefined);

    const game = new M2D(this.canvas, {
      dimensions,
      editMode: true,
      width: this.canvas.clientWidth || 960,
      height: this.canvas.clientHeight || 540,
      // The editor's own chrome is DOM; the engine draws the world only.
      performanceStats: false,
      devConsole: false
    });
    // An actor a scene names must be registered before it loads. The
    // project's own actors are code the editor cannot know; until a
    // project can declare them (E5), a caller passes what it has and an
    // unknown actor is a validation error the inspector will show.
    for (const [name, Class] of Object.entries(actors)) {
      game.registerActor(name, Class as never);
    }

    const name = doc.name ?? 'scene';
    game.sceneManager.addScene(name, { fetch: async () => doc.data });
    this.#game = game;
    await game.start();
    await game.sceneManager.switchTo(name);
  }

  /** Nothing of a game may outlive this; see the engine's teardown rule. */
  close(): void {
    this.#game?.destroy();
    this.#game = null;
  }

  get game(): InstanceType<typeof M2D> | null {
    return this.#game;
  }
}
