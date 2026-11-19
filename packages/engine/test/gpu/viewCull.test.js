import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { M2D } from '../../src/core/m2d.js';
import { Entity } from '../../src/core/entity.js';
import { initPhysics } from '../../src/core/physics/index.js';
import { SCENE_VERSION } from '../../src/core/sceneLoader.js';
import { createCanvasElement, readCanvas2DPixels, readWebGLPixels } from '../helpers/environment.js';

/**
 * The view cull is a saving, never a difference: a frame drawn with it on
 * has to be the frame drawn with it off, pixel for pixel, while issuing
 * fewer draws. This is the check the unit tests cannot make — they count
 * calls, and a cull that is a few units too tight still counts right while
 * clipping a sprite at the edge of the screen.
 *
 * Both 2D backends, at a few zooms and a rotation, over a level whose
 * entities run well past the view in every direction.
 */

const W = 320;
const H = 180;
const cleanup = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); });

function canvasInDocument(width, height) {
  const canvas = createCanvasElement(width, height);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  document.body.appendChild(canvas);
  cleanup.push(() => canvas.remove());
  return canvas;
}

/** A sprite-less entity drawing a disc wider than its body, as a glow would. */
class Blob extends Entity {
  name = 'Blob';

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawArc({ x, y, radius: this.size.x * 0.7, fillStyle: '#ff8844' });
    this.game.renderer.drawRect({
      x: x - this.size.x / 2, y: y - this.size.y / 2,
      width: this.size.x, height: this.size.y, fillStyle: '#2255cc'
    });
  }

  /** What it really covers: the disc, not the body. */
  get drawBounds() {
    const { x, y } = this.renderPosition;
    const reach = this.size.x * 0.7;
    return { x: x - reach, y: y - reach, width: reach * 2, height: reach * 2 };
  }
}

/** A grid of blobs over a world far larger than any one view. */
const LEVEL = {
  version: SCENE_VERSION, type: 'level', name: 'field',
  world: { width: 2000, height: 1200, gravity: { x: 0, y: 0 } },
  prefabs: { blob: { actor: 'Blob', physics: { bodyType: 'static', isSensor: true } } },
  layers: [{
    name: 'main',
    objects: Array.from({ length: 160 }, (_, i) => ({
      id: `blob-${i}`, prefab: 'blob',
      x: 40 + (i % 16) * 125, y: 40 + Math.floor(i / 16) * 118,
      width: 36, height: 36
    }))
  }]
};

async function makeGame(backend) {
  const canvas = canvasInDocument(W, H);
  const game = new M2D(canvas, { width: W, height: H, renderer: backend, performanceStats: false, devConsole: false, worldWidth: 2000, worldHeight: 1200 });
  cleanup.push(() => game.destroy());
  game.registerActor('Blob', Blob);
  game.sceneManager.addScene('field', { fetch: async () => LEVEL });
  await game.sceneManager.switchTo('field');
  return { game, canvas };
}

const readPixels = (backend, canvas) => (backend === 'canvas' ? readCanvas2DPixels(canvas) : readWebGLPixels(canvas));

/** Draw one frame and report the pixels and what it cost. */
function frame(game, canvas, backend) {
  game.renderer.resetStats();
  game.renderer.clear('#101014');
  game.drawWorld(game.sceneManager.getCurrentScene(), 0);
  // `primitives` is what the callers asked for; `drawCalls` is what the
  // backend submitted, and a batching one merges a whole level into one.
  return { image: readPixels(backend, canvas), drawn: game.renderer.stats.primitives, culled: game.renderer.stats.culled };
}

/** Share of pixels where two frames disagree beyond a rasterizer's wobble. */
function mismatch(a, b, tolerance = 4) {
  let bad = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > tolerance
      || Math.abs(a.data[i + 1] - b.data[i + 1]) > tolerance
      || Math.abs(a.data[i + 2] - b.data[i + 2]) > tolerance) bad++;
  }
  return bad / (a.data.length / 4);
}

const VIEWS = [
  ['centred', { x: 1000, y: 600, zoom: 1, rotation: 0 }],
  ['at a corner of the world', { x: 60, y: 60, zoom: 1, rotation: 0 }],
  ['zoomed in', { x: 700, y: 400, zoom: 3, rotation: 0 }],
  ['zoomed out', { x: 1000, y: 600, zoom: 0.5, rotation: 0 }],
  ['turned', { x: 1000, y: 600, zoom: 1.4, rotation: 0.7 }]
];

for (const backend of ['canvas', 'webgl']) {
  describe(`the view cull on the ${backend} backend`, () => {
    beforeAll(() => initPhysics());

    for (const [name, view] of VIEWS) {
      it(`draws the same frame ${name}, with fewer draws`, async () => {
        const { game, canvas } = await makeGame(backend);
        Object.assign(game.camera, view);
        // No padding: the bounds themselves decide, so a cull that is a
        // little too tight clips a sprite at the edge instead of being
        // covered by the camera's 100-unit margin.
        game.camera.padding = { x: 0, y: 0 };

        game.cvars.set('r_cull', false);
        const whole = frame(game, canvas, backend);
        game.cvars.set('r_cull', true);
        const culled = frame(game, canvas, backend);

        expect(mismatch(whole.image, culled.image)).toBeLessThan(0.0005);
        expect(culled.culled).toBeGreaterThan(0);
        expect(whole.culled).toBe(0);
        expect(culled.drawn).toBeLessThan(whole.drawn);
      });
    }
  });
}
