import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { RecordingRenderer } from 'm2d-engine/test/helpers/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from 'm2d-engine/test/helpers/environment.js';
import { registerKitScenery, stripGeometry } from '../src/scenery.ts';

/** A strip laid along one of the scene's paths, drawn in 2D and built as a mesh in 3D. */

installWindowStub();
stubDocumentListeners();

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

const SCENERY = { bodyType: 'static', isSensor: true, layer: 'none' };

function level({ dimensions = 2, properties = { path: 'edge', width: 10 }, points } = {}) {
  const three = dimensions === 3;
  return {
    version: SCENE_VERSION, type: 'level', name: 'strip',
    world: { dimensions, gravity: three ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0 } },
    paths: { edge: { points: points ?? (three ? [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] : [{ x: 0, y: 50 }, { x: 100, y: 50 }]) } },
    prefabs: { strip: { actor: 'PathStrip', physics: SCENERY, properties, ...(three && { mesh: { color: '#d8d4cc' } }) } },
    layers: [{ name: 'main', objects: [{ id: 'strip-1', prefab: 'strip', x: 3, y: 0, ...(three && { z: 2, depth: 1 }), width: 1, height: 1 }] }]
  };
}

async function make(scene, { editMode = false } = {}) {
  const three = scene.world.dimensions === 3;
  const game = three
    ? new M2D(null, { headless: true, dimensions: 3, editMode })
    : new M2D(displayCanvas(320, 180), { width: 320, height: 180, renderer: new RecordingRenderer(), devConsole: false, performanceStats: false });
  registerKitScenery(game);
  game.sceneManager.addScene(scene.name, { fetch: async () => scene });
  await game.sceneManager.switchTo(scene.name);
  return { game, strip: game.sceneManager.getCurrentScene().entitiesById.get('strip-1') };
}

/** The extent of a geometry's positions, per axis. */
function bounds(geometry) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < geometry.positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], geometry.positions[i]);
    max[i % 3] = Math.max(max[i % 3], geometry.positions[i]);
  }
  return { min, max };
}

/** Every triangle's winding normal agrees with its vertices' normals: front faces face out. */
function facesOut(geometry) {
  const p = geometry.positions, n = geometry.normals, idx = geometry.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const i = idx[t] * 3;
    if (cross[0] * n[i] + cross[1] * n[i + 1] + cross[2] * n[i + 2] <= 0) return false;
  }
  return true;
}

describe('PathStrip in 2D', () => {
  it('draws a band of its colour along the path without a sprite', async () => {
    const { game, strip } = await make(level({ properties: { path: 'edge', width: 10, color: '#123456' } }));
    game.renderer.reset();
    strip.draw(0);
    const [band] = game.renderer.optionsFor('drawPath');
    expect(band).toMatchObject({ strokeStyle: '#123456', lineWidth: 10, closed: false });
    expect(band.points.map(({ x, y }) => [x, y])).toEqual([[0, 50], [100, 50]]);
    game.destroy();
  });

  it('tiles its sprite along each segment, turned to it, `repeat` long and `width` across', async () => {
    const { game, strip } = await make(level({ properties: { path: 'edge', width: 10, repeat: 25 }, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }] }));
    const drawn = [];
    strip.sprite = { width: 32, draw: (anim, x, y, options) => drawn.push({ x, y, ...options }) };
    strip.draw(0);
    expect(drawn).toHaveLength(4 + 2);
    expect(drawn[0]).toMatchObject({ x: 12.5, y: 0, width: 25, height: 10, rotation: 0 });
    expect(drawn[4].rotation).toBeCloseTo(Math.PI / 2);
    expect(drawn[4]).toMatchObject({ x: 100, y: 12.5 });
    game.destroy();
  });

  it('draws along the ground through the level\'s projection', async () => {
    const scene = level({ properties: { path: 'edge', width: 10, color: '#123456' } });
    scene.world.projection = 'isometric';
    const { game, strip } = await make(scene);
    game.renderer.reset();
    strip.draw(0);
    const [band] = game.renderer.optionsFor('drawPath');
    expect(band.points).toEqual([game.projection.toScreen(0, 50), game.projection.toScreen(100, 50)]);
    game.destroy();
  });

  it('is refused without a path, naming the property', async () => {
    const error = await make(level({ properties: { width: 10 } })).then(() => null, (e) => e);
    expect(error?.message).toMatch(/properties\.path.*laid along a path/);
  });
});

describe('PathStrip in 3D', () => {
  it('builds a kerb along its path: width across, height up, in its body\'s frame', async () => {
    const { game, strip } = await make(level({ dimensions: 3, properties: { path: 'edge', width: 0.3, height: 0.1 } }));
    expect(strip.mesh).toMatchObject({ color: expect.any(Array) });
    const geometry = strip.geometry;
    expect(strip.geometry).toBe(geometry);
    // The path runs x 0..10 at z 0; the body stands at (3, 0, 2).
    const { min, max } = bounds(geometry);
    expect(min[0]).toBeCloseTo(-3); expect(max[0]).toBeCloseTo(7);
    expect(min[1]).toBeCloseTo(0); expect(max[1]).toBeCloseTo(0.1);
    expect(min[2]).toBeCloseTo(-2.15); expect(max[2]).toBeCloseTo(-1.85);
    expect(facesOut(geometry)).toBe(true);
    game.destroy();
  });

  it('is built again when its path is edited, and is nothing without one', async () => {
    const { game, strip } = await make(level({ dimensions: 3, properties: { path: 'edge', width: 0.3, height: 0.1 } }), { editMode: true });
    const scene = game.sceneManager.getCurrentScene();
    const before = strip.geometry;
    scene.config.paths.edge = { points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 30 }] };
    scene.rebuildPaths();
    expect(strip.geometry).not.toBe(before);
    expect(bounds(strip.geometry).max[2]).toBeCloseTo(28, 3);
    delete scene.config.paths.edge;
    scene.rebuildPaths();
    expect(strip.geometry).toBeNull();
    // No mesh either, so the frame draws no box of the kerb's material in its place.
    expect(strip.mesh).toBeNull();
    game.destroy();
  });

  it('lays a flat ribbon at height 0, facing up', async () => {
    const { game, strip } = await make(level({ dimensions: 3, properties: { path: 'edge', width: 2 } }));
    const { normals } = strip.geometry;
    for (let i = 0; i < normals.length; i += 3) expect([normals[i], normals[i + 1], normals[i + 2]]).toEqual([0, 1, 0]);
    expect(facesOut(strip.geometry)).toBe(true);
    game.destroy();
  });

  it('keeps its width through a corner, mitred', () => {
    const line = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }];
    const geometry = stripGeometry(line, 2, 0.5, { x: 0, y: 0, z: 0 }, null);
    expect(facesOut(geometry)).toBe(true);
    // The corner's two top vertices are the second pair: a mitre at 45°, sqrt(2) out.
    const p = geometry.positions;
    const corner = [[p[6], p[8]], [p[9], p[11]]];
    for (const [x, z] of corner) expect(Math.hypot(x - 10, z)).toBeCloseTo(Math.SQRT2, 5);
  });
});
