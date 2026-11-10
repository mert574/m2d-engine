import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { M2D } from '../../src/core/m2d.js';
import { Entity } from '../../src/core/entity.js';
import { initPhysics } from '../../src/core/physics/index.js';
import { WebGPURenderer } from '../../src/core/renderers/index.js';
import { initWebGPU } from '../../src/core/renderers/webgpu/device.js';
import { Camera3D } from '../../src/core/camera3d.js';
import { box, plane } from '../../src/core/renderers/geometry/primitives.js';
import { SCENE_VERSION } from '../../src/core/sceneLoader.js';
import { createCanvasElement, readCanvas2DPixels } from '../helpers/environment.js';

/**
 * Multiple live views of one scene — the editor plan's hard requirement
 * (docs/plans/editor-e0.md, E0.5). One frame, several cameras, several
 * canvases: in 3D the renderer shares the assembly, cull and shadows and
 * runs the camera passes per view; in 2D the world pass is walked once
 * more per view through its own renderer instance. The assertions are
 * about relationships — the views show *different* pictures of the *same*
 * frame — never exact pixels from a software rasterizer.
 */

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

const pixels = (image) => ({
  at(x, y) {
    const i = (y * image.width + x) * 4;
    return [...image.data.slice(i, i + 4)];
  },
  width: image.width,
  height: image.height
});

describe('3D: several views of one frame', () => {
  beforeAll(() => initWebGPU());

  function make(W, H) {
    const canvas = canvasInDocument(W, H);
    const renderer = new WebGPURenderer();
    renderer.effects = { taa: false, ao: false, dof: false, motionBlur: false, autoExposure: false, bloom: false, film: false };
    renderer.init(canvas, { width: W, height: H });
    cleanup.push(() => renderer.destroy());
    return renderer;
  }

  function freeCamera(width, height, position) {
    const camera = new Camera3D(width, height, { mode: 'free', position, lookAt: { x: 0, y: 1, z: 0 } });
    camera.update(0);
    return camera;
  }

  /** A red cube at the origin on a grey floor, sun from above. */
  function frameFor(renderer, camera) {
    const frame = renderer.createFrame();
    frame.setCamera(camera);
    frame.sun = { direction: [-0.4, -1, -0.3], color: [1, 1, 1], intensity: 3 };
    frame.fog.density = 0;
    frame.bloom.intensity = 0;
    frame.shadow.enabled = false;
    frame.add(plane(), { position: { x: 0, y: 0, z: 0 }, scale: { x: 30, y: 1, z: 30 }, color: [0.4, 0.4, 0.4], roughness: 0.9 });
    frame.add(box(), { position: { x: 0, y: 1, z: 0 }, scale: { x: 2, y: 2, z: 2 }, color: [0.9, 0.05, 0.05], roughness: 0.6 });
    return frame;
  }

  it('renders each view from its own camera, sharing the frame', async () => {
    const W = 96, H = 64;
    const renderer = make(W, H);
    // The primary camera looks at the cube; the side view looks away from
    // it, out across the empty floor to the sky.
    const sideCanvas = canvasInDocument(W, H);
    const side = renderer.createView(sideCanvas, freeCamera(W, H, { x: 12, y: 2, z: 0 }));
    side.camera.lookAt = { x: 30, y: 2, z: 0 };
    side.camera.update(0);

    renderer.render(frameFor(renderer, freeCamera(W, H, { x: 0, y: 2, z: 7 })));

    // Both readbacks enqueued in the same task as the render: a canvas
    // texture expires when the task ends and the frame is presented.
    const [mainImage, sideImage] = await Promise.all([renderer.readPixels(), renderer.readPixels(side)]);
    const main = pixels(mainImage);
    const away = pixels(sideImage);
    const centreMain = main.at(W / 2, H / 2);
    const centreSide = away.at(W / 2, H / 2);

    // The primary sees the red cube dead centre…
    expect(centreMain[0]).toBeGreaterThan(centreMain[2] + 30);
    // …the side view, facing away, sees no red there…
    expect(centreSide[0]).toBeLessThan(centreSide[2] + 30);
    // …and both views actually drew something.
    expect(centreMain.some((c) => c > 8)).toBe(true);
    expect(centreSide.some((c) => c > 8)).toBe(true);
    // One frame was assembled for both.
    expect(renderer.stats.instances).toBe(2);
  });

  it('turns a view to face the scene and sees it', async () => {
    const W = 96, H = 64;
    const renderer = make(W, H);
    const sideCanvas = canvasInDocument(W, H);
    const side = renderer.createView(sideCanvas, freeCamera(W, H, { x: 0, y: 2, z: -7 }));

    renderer.render(frameFor(renderer, freeCamera(W, H, { x: 0, y: 2, z: 7 })));
    const seen = pixels(await renderer.readPixels(side)).at(W / 2, H / 2);
    // From the opposite side the cube is still the centre of the picture:
    // the cull kept it for this view's frustum too.
    expect(seen[0]).toBeGreaterThan(seen[2] + 30);
  });

  it('removes a view and keeps rendering', async () => {
    const W = 64, H = 48;
    const renderer = make(W, H);
    const side = renderer.createView(canvasInDocument(W, H), freeCamera(W, H, { x: 0, y: 2, z: -7 }));
    renderer.render(frameFor(renderer, freeCamera(W, H, { x: 0, y: 2, z: 7 })));
    renderer.removeView(side);
    renderer.render(frameFor(renderer, freeCamera(W, H, { x: 0, y: 2, z: 7 })));
    const centre = pixels(await renderer.readPixels()).at(W / 2, H / 2);
    expect(centre[0]).toBeGreaterThan(centre[2] + 30);
    expect(renderer.views.length).toBe(1);
  });
});

describe('2D: several views of one scene', () => {
  class Block extends Entity {
    name = 'Block';

    draw() {
      const { x, y } = this.renderPosition;
      this.game.renderer.drawRect({
        x: x - this.size.x / 2, y: y - this.size.y / 2,
        width: this.size.x, height: this.size.y, fillStyle: '#ff6600'
      });
    }
  }

  const LEVEL = {
    version: SCENE_VERSION, type: 'level', name: 'room',
    world: { gravity: { x: 0, y: 0 } },
    prefabs: { block: { actor: 'Block', physics: { bodyType: 'static' } } },
    layers: [{ name: 'main', objects: [
      { id: 'block-1', prefab: 'block', x: 320, y: 180, width: 100, height: 100 }
    ] }]
  };

  it('draws the same scene through each view camera', async () => {
    await initPhysics();
    const canvas = canvasInDocument(320, 180);
    const game = new M2D(canvas, {
      width: 320, height: 180, renderer: 'canvas', performanceStats: false, editMode: true
    });
    cleanup.push(() => game.destroy());
    game.registerActor('Block', Block);
    game.sceneManager.addScene('room', { fetch: async () => LEVEL });
    await game.sceneManager.switchTo('room');

    const sideCanvas = canvasInDocument(320, 180);
    const view = game.addView(sideCanvas);

    // Main camera on the block; the side camera far away in empty space.
    game.camera.x = 320; game.camera.y = 180;
    view.camera.x = 2000; view.camera.y = 2000;
    const scene = game.sceneManager.getCurrentScene();
    game.renderer.clear('#000');
    game.drawWorld(scene, 0);

    const at = (image, x, y) => pixels(image).at(x, y);
    const mainCentre = at(readCanvas2DPixels(canvas), 160, 90);
    let sideCentre = at(readCanvas2DPixels(sideCanvas), 160, 90);
    expect(mainCentre[0]).toBeGreaterThan(180);           // #ff6600 on the main canvas
    expect(sideCentre[0]).toBeLessThan(40);               // empty space on the side one

    // Swing the side camera onto the block: now both see it.
    view.camera.x = 320; view.camera.y = 180;
    game.drawWorld(scene, 0);
    sideCentre = at(readCanvas2DPixels(sideCanvas), 160, 90);
    expect(sideCentre[0]).toBeGreaterThan(180);

    // The swap restored the game's own renderer and camera.
    expect(game.camera.x).toBe(320);
    expect(game.renderer.canvas).toBe(canvas);

    game.removeView(view);
    expect(game.views.length).toBe(0);
  });
});
