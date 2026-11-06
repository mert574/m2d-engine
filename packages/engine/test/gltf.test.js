import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from '../src/core/physics/index.js';
import { parseGLB, DEFAULT_MATERIAL } from '../src/core/gltf.js';
import { Frame3D } from '../src/core/renderers/frame3d.js';
import { Camera3D } from '../src/core/camera3d.js';
import { box, boundingSphere } from '../src/core/renderers/geometry/primitives.js';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { SceneLoader, SCENE_VERSION } from '../src/core/sceneLoader.js';
import { MANIFEST_VERSION } from '../src/core/assetSchema.js';

/**
 * Models on the CPU side: reading a .glb, the asset and scene plumbing that
 * names one, and the frame's culling. What the GPU makes of it is the
 * browser suite's business.
 */

const fixture = (name) => {
  const buf = readFileSync(new URL(`./fixtures/models/${name}.glb`, import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

/** Stands in for createImageBitmap: remembers what it was asked to decode. */
const fakeDecode = async (bytes, mimeType) => ({ width: 0, height: 0, bytes: bytes.length, mimeType });

describe('reading a .glb', () => {
  it('reads the textured box: one part, its geometry, its material and its image', async () => {
    const model = await parseGLB(fixture('BoxTextured'), { decodeImage: fakeDecode });
    expect(model.parts).toHaveLength(1);
    const { geometry, material, matrix } = model.parts[0];
    expect(geometry.positions.length / 3).toBe(24);
    expect(geometry.normals.length).toBe(geometry.positions.length);
    expect(geometry.uvs.length / 2).toBe(24);
    expect(geometry.indices.length).toBe(36);
    expect(material.baseColor).toEqual([1, 1, 1, 1]);
    expect(material.metallic).toBe(0);
    expect(material.baseColorTexture.mimeType).toBe('image/png');
    expect(material.baseColorTexture.bytes).toBeGreaterThan(100);
    expect(material.metallicRoughnessTexture).toBeNull();
    expect(matrix).toHaveLength(16);
    // Khronos's box is a unit cube at the origin.
    expect(model.bounds.min).toEqual({ x: -0.5, y: -0.5, z: -0.5 });
    expect(model.bounds.max).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it('refuses what is not a glb, and says so', async () => {
    await expect(parseGLB(new ArrayBuffer(8), { name: 'x' })).rejects.toThrow(/x is not a .glb/);
    const bad = new Uint8Array(fixture('BoxTextured'));
    bad[4] = 1;
    await expect(parseGLB(bad.buffer, { name: 'old' })).rejects.toThrow(/glTF 1; only glTF 2.0/);
  });

  it('gives a primitive without a material glTF\'s default', () => {
    expect(DEFAULT_MATERIAL.baseColor).toEqual([1, 1, 1, 1]);
    expect(DEFAULT_MATERIAL.metallic).toBe(1);
  });
});

describe('a model as an asset', () => {
  beforeAll(() => initPhysics({ dimensions: 3 }));
  class Truck extends Entity { name = 'Truck'; }
  const game = () => {
    const g = new M2D(null, { headless: true, dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 1 });
    g.registerActor('Truck', Truck);
    return g;
  };
  const level = (fields) => ({
    version: SCENE_VERSION, type: 'level', name: 'yard', world: { dimensions: 3 }, ...fields
  });

  it('declares a model inline and names it from a prefab\'s mesh', () => {
    const loaded = new SceneLoader(game()).load(level({
      assets: { models: { truck: { url: 'models/truck.glb' } } },
      prefabs: { truck: { actor: 'Truck', mesh: { model: 'truck', scale: 0.5, offset: { x: 0, y: -0.4, z: 0 } } } },
      layers: [{ name: 'main', objects: [{ id: 't', prefab: 'truck', x: 0, y: 0, z: 0, width: 1, height: 1 }] }]
    }));
    expect(loaded.prefabs.truck.mesh.model).toBe('truck');
  });

  it('rejects a mesh naming a model the scene did not declare', () => {
    expect(() => new SceneLoader(game()).load(level({
      prefabs: { truck: { actor: 'Truck', mesh: { model: 'nope' } } },
      layers: [{ name: 'main', objects: [] }]
    }))).toThrow(/prefabs.truck.mesh.model: no model named 'nope'/);
  });

  it('binds a model asset from the database under a local name', () => {
    const g = game();
    g.loadAssets({
      version: MANIFEST_VERSION, basePath: 'assets/',
      assets: { 'model-truck': { type: 'model', name: 'truck', source: 'models/truck.glb' } }
    });
    const loaded = new SceneLoader(g).load(level({
      uses: { lorry: 'model-truck' },
      prefabs: { truck: { actor: 'Truck', mesh: { model: 'lorry' } } },
      layers: [{ name: 'main', objects: [] }]
    }));
    expect(loaded.assets.models.lorry.url).toBe('assets/models/truck.glb');
  });

  it('rejects a mesh block in a 2D level', () => {
    const g = new M2D(null, { headless: true, worldWidth: 20, worldHeight: 20, seed: 1 });
    g.registerActor('Truck', Truck);
    expect(() => new SceneLoader(g).load({
      version: SCENE_VERSION, type: 'level', name: 'flat',
      prefabs: { truck: { actor: 'Truck', mesh: { color: '#f00' } } },
      layers: [{ name: 'main', objects: [] }]
    })).toThrow(/prefabs.truck.mesh: a mesh is drawn by the 3D renderer, and this level is 2D/);
  });
});

describe('the frame culls', () => {
  const camera = () => {
    const c = new Camera3D(16, 9, { mode: 'free', position: { x: 0, y: 2, z: 10 }, lookAt: { x: 0, y: 0, z: 0 } });
    c.update(0);
    return c;
  };

  it('keeps what the camera sees and drops what it does not', () => {
    const frame = new Frame3D();
    frame.setCamera(camera());
    frame.shadow.radius = 5;
    frame.add(box(), { position: { x: 0, y: 0, z: 0 } });
    frame.add(box(), { position: { x: 0, y: 0, z: 30 } });   // behind the camera
    frame.add(box(), { position: { x: 200, y: 0, z: 0 } });  // far to the side
    expect(frame.added).toBe(3);
    expect(frame.drawn).toBe(1);
    // In view and inside the shadow sphere casts; the far ones cast nothing.
    expect(frame.casting).toBe(1);
  });

  it('keeps an unseen caster near the camera target for the shadow pass alone', () => {
    const frame = new Frame3D();
    frame.setCamera(camera());
    frame.shadow.radius = 10;
    // Behind the camera but within the shadow map's reach.
    frame.add(box(), { position: { x: 0, y: 0, z: 14 } });
    expect(frame.drawn).toBe(0);
    expect(frame.casting).toBe(1);
    const [entry] = frame.entries();
    expect(entry.main).toHaveLength(0);
    expect(entry.shadow).toHaveLength(1);
  });

  it('groups by geometry and then material', () => {
    const frame = new Frame3D();
    const g = box();
    const red = { name: 'red' };
    frame.add(g, { position: { x: 0, y: 0, z: 0 } });
    frame.add(g, { position: { x: 1, y: 0, z: 0 } });
    frame.add(g, { position: { x: 2, y: 0, z: 0 }, material: red });
    const entries = [...frame.entries()];
    expect(entries).toHaveLength(2);
    expect(entries[0].material).toBeNull();
    expect(entries[0].main).toHaveLength(2);
    expect(entries[1].material).toBe(red);
  });

  it('scales the bounding sphere by the largest axis of the model matrix', () => {
    const frame = new Frame3D();
    frame.setCamera(camera());
    // A box stretched to 100 m along x, centred far to the side, still reaches the view.
    frame.add(box(), { position: { x: 60, y: 0, z: 0 }, scale: { x: 100, y: 1, z: 1 } });
    expect(frame.drawn).toBe(1);
    expect(boundingSphere(box()).radius).toBeCloseTo(Math.sqrt(0.75), 6);
  });
});
