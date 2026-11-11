/**
 * Thumbnails for the Assets tab, rendered **in the editor's own tab** (the
 * carried follow-up; the host has no GPU, this page does): a model turned
 * three-quarters under the default sky, an HDR panorama as the sky it
 * lights. Each is one frame of a small edit-mode game on a canvas kept
 * off screen, read back as PNG and handed to the host, which keeps it by
 * the file's key (path, size, mtime) under `library/thumbs/` so it is
 * drawn once per file state and shared by every tab. One at a time: a
 * WebGPU device per thumbnail, made and destroyed in turn.
 */

import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { initWebGPU, webgpuSupported } from 'm2d-engine/core/renderers/index.js';
import { Prop } from 'm2d-engine/actors/prop.js';
import { SCENE_VERSION } from 'm2d-editor-core';
import { get, post } from './host.ts';
import type { AssetFileEntry } from './assetsPanel.ts';

const SIZE = 160;

let canvas: HTMLCanvasElement | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** The off-screen canvas the thumbnails draw on, made once. */
function stage(): HTMLCanvasElement {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.cssText = `position:fixed;left:-${SIZE * 4}px;top:0;width:${SIZE}px;height:${SIZE}px;pointer-events:none`;
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  return canvas;
}

/**
 * Render a thumbnail for a model or an environment and store it with the
 * host; resolves to the thumbnail's project path, or null when this file
 * has no picture to make (an image shows itself) or the page cannot.
 */
export function renderThumbnail(file: AssetFileEntry, basePath: string): Promise<string | null> {
  if ((file.kind !== 'model' && file.kind !== 'environment') || !webgpuSupported()) return Promise.resolve(null);
  const run = queue.then(() => draw(file, basePath)).catch((error: unknown) => {
    console.warn(`thumbnail for ${file.path} failed: ${String((error as Error).message ?? error)}`);
    return null;
  });
  queue = run;
  return run;
}

async function draw(file: AssetFileEntry, basePath: string): Promise<string | null> {
  await Promise.all([initWebGPU(), initPhysics({ dimensions: 3 })]);
  // A fresh canvas each time: a destroyed game's context cannot be reused.
  const old = canvas;
  canvas = null;
  const target = stage();
  old?.remove();

  const scene = await sceneFor(file);
  const game = new M2D(target, {
    dimensions: 3, editMode: true, width: SIZE, height: SIZE, worldWidth: 40, worldHeight: 40,
    basePath, aspectMode: 'letterbox', performanceStats: false, devConsole: false
  });
  try {
    game.registerActor('Prop', Prop as never);
    game.sceneManager.addScene('thumb', { fetch: async () => scene.data });
    await game.start();
    await game.sceneManager.switchTo('thumb');
    const camera = game.camera as unknown as { lookAt?: { x: number; y: number; z: number }; yaw?: number; pitch?: number; distance?: number; update?(dt: number): void };
    if (camera.lookAt) Object.assign(camera.lookAt, scene.lookAt);
    camera.yaw = scene.yaw;
    camera.pitch = scene.pitch;
    camera.distance = scene.distance;
    camera.update?.(0);
    game.drawOnDemand = false;
    // Two frames: the first uploads, the second draws what it uploaded.
    for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
    const png = target.toDataURL('image/png').split(',')[1];
    if (!png) return null;
    const { thumb } = await post<{ thumb: string }>('/__thumb', { key: file.thumbKey, png });
    return thumb;
  } finally {
    game.destroy();
  }
}

/** The scene one thumbnail draws, and where its camera stands. */
async function sceneFor(file: AssetFileEntry): Promise<{
  data: Record<string, unknown>; lookAt: { x: number; y: number; z: number }; yaw: number; pitch: number; distance: number;
}> {
  if (file.kind === 'environment') {
    return {
      data: {
        version: SCENE_VERSION, type: 'level', name: 'thumb',
        world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 }, environment: 'sky' },
        assets: { environments: { sky: { url: file.url } } },
        prefabs: {}, layers: [{ name: 'main', objects: [] }]
      },
      lookAt: { x: 0, y: 1, z: 0 }, yaw: 0.6, pitch: 0.1, distance: 0.5
    };
  }
  const info = await get<{ bounds?: { min: number[]; max: number[] } }>(`/__asset-info?path=${encodeURIComponent(file.path)}`);
  const min = info.bounds?.min ?? [-0.5, 0, -0.5];
  const max = info.bounds?.max ?? [0.5, 1, 0.5];
  const size = [0, 1, 2].map((i) => Math.max(0.01, max[i]! - min[i]!));
  const centre = [0, 1, 2].map((i) => (max[i]! + min[i]!) / 2);
  const radius = Math.hypot(size[0]!, size[1]!, size[2]!) / 2;
  return {
    data: {
      version: SCENE_VERSION, type: 'level', name: 'thumb',
      // Clear air and a strong sun: a small picture has no room for haze.
      world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 }, lighting: { sun: { direction: { x: -0.4, y: -1, z: -0.6 }, intensity: 2.6 }, fog: { density: 0 }, exposure: 1.15 } },
      assets: { models: { thing: { url: file.url } } },
      prefabs: {
        thing: { actor: 'Prop', physics: { bodyType: 'static' }, mesh: { model: 'thing', offset: { x: -centre[0]!, y: -centre[1]!, z: -centre[2]! } } },
        ground: { actor: 'Prop', physics: { bodyType: 'static' }, mesh: { color: '#7d8590', roughness: 0.95 } }
      },
      layers: [{
        name: 'main',
        objects: [
          { id: 'thing', prefab: 'thing', x: 0, y: size[1]! / 2, z: 0, width: size[0], height: size[1], depth: size[2] },
          { id: 'ground', prefab: 'ground', x: 0, y: -0.05, z: 0, width: radius * 6, height: 0.1, depth: radius * 6 }
        ]
      }]
    },
    lookAt: { x: 0, y: size[1]! / 2, z: 0 }, yaw: 0.75, pitch: 0.38, distance: radius * 1.75
  };
}
