import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from '../src/core/physics/index.js';
import { parseGLB, setKTX2Decoder, DEFAULT_MATERIAL, lodFor } from '../src/core/gltf.js';
import { Frame3D, StaticBatch, INSTANCE_FLOATS } from '../src/core/renderers/frame3d.js';
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

  it('routes a KTX2 image (KHR_texture_basisu) through the registered decoder', async () => {
    setKTX2Decoder(async (bytes) => ({ compressed: true, bytes: bytes.length }));
    try {
      const model = await parseGLB(fixture('BoxTexturedKtx2'));
      const texture = model.parts[0].material.baseColorTexture;
      expect(texture.compressed).toBe(true);
      expect(texture.bytes).toBeGreaterThan(100);
    } finally {
      setKTX2Decoder(null);
    }
  });

  it('skips KTX2 images when no decoder is registered, as headless must', async () => {
    const model = await parseGLB(fixture('BoxTexturedKtx2'));
    expect(model.parts[0].material.baseColorTexture).toBeNull();
  });

  it('gives a primitive without a material glTF\'s default', () => {
    expect(DEFAULT_MATERIAL.baseColor).toEqual([1, 1, 1, 1]);
    expect(DEFAULT_MATERIAL.metallic).toBe(1);
  });
});

/**
 * A .glb built in the test from a JSON document and one binary chunk, so
 * a feature can be exercised without a fixture file for it.
 */
function makeGLB(json, bin) {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const pad = (n) => (4 - (n % 4)) % 4;
  const jsonLength = text.length + pad(text.length);
  const binLength = bin.byteLength + pad(bin.byteLength);
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, 0x46546C67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4E4F534A, true);
  bytes.set(text, 20); bytes.fill(0x20, 20 + text.length, 20 + jsonLength);
  const binStart = 20 + jsonLength;
  view.setUint32(binStart, binLength, true); view.setUint32(binStart + 4, 0x004E4942, true);
  bytes.set(new Uint8Array(bin), binStart + 8);
  return buffer;
}

/** A unit quad in the xy plane facing +z, with texture coordinates: positions, normals, uvs, indices. */
function quadBin() {
  const positions = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const bin = new Uint8Array(48 + 48 + 32 + 12 + 4);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(normals.buffer), 48);
  bin.set(new Uint8Array(uvs.buffer), 96);
  bin.set(new Uint8Array(indices.buffer), 128);
  const bufferViews = [
    { buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 48 },
    { buffer: 0, byteOffset: 96, byteLength: 32 }, { buffer: 0, byteOffset: 128, byteLength: 12 }
  ];
  const accessors = [
    { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
    { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
    { bufferView: 3, componentType: 5123, count: 6, type: 'SCALAR' }
  ];
  return { bin: bin.buffer, bufferViews, accessors, buffers: [{ byteLength: bin.byteLength }] };
}

describe('materials and levels of detail', () => {
  const quad = quadBin();
  const primitive = { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 };
  const png = { bufferView: 0, mimeType: 'image/png' };

  it('reads normal, occlusion, alpha, double-sided, the texture transform and a WebP source', async () => {
    const model = await parseGLB(makeGLB({
      asset: { version: '2.0' },
      ...quad,
      images: [png, { bufferView: 1, mimeType: 'image/webp' }],
      textures: [{ source: 0 }, { extensions: { EXT_texture_webp: { source: 1 } } }],
      materials: [{
        name: 'leaf',
        pbrMetallicRoughness: {
          baseColorTexture: { index: 1, extensions: { KHR_texture_transform: { scale: [2, 2], offset: [0.1, 0.2], rotation: 0.5 } } },
          metallicFactor: 0
        },
        normalTexture: { index: 0, scale: 0.8 },
        occlusionTexture: { index: 0, strength: 0.6 },
        alphaMode: 'MASK', alphaCutoff: 0.4, doubleSided: true
      }],
      meshes: [{ primitives: [primitive] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }]
    }, quad.bin), { decodeImage: fakeDecode });
    const m = model.parts[0].material;
    expect(m.normalTexture.mimeType).toBe('image/png');
    expect(m.normalScale).toBe(0.8);
    expect(m.occlusionStrength).toBe(0.6);
    expect(m.baseColorTexture.mimeType).toBe('image/webp');
    expect(m.alphaMode).toBe('mask');
    expect(m.alphaCutoff).toBe(0.4);
    expect(m.doubleSided).toBe(true);
    expect(m.uvTransform).toEqual({ scale: [2, 2], offset: [0.1, 0.2], rotation: 0.5 });
    expect(DEFAULT_MATERIAL.alphaMode).toBe('opaque');
  });

  it('makes tangents from the texture coordinates when the file has none', async () => {
    const model = await parseGLB(makeGLB({
      asset: { version: '2.0' }, ...quad,
      materials: [{}], meshes: [{ primitives: [primitive] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }]
    }, quad.bin));
    const t = model.parts[0].geometry.tangents;
    expect(t).toHaveLength(16);
    // u runs along +x, v runs down -y (glTF's v points down the image), so
    // the tangent is +x and the frame is right-handed.
    for (let v = 0; v < 4; v++) {
      expect(t[v * 4]).toBeCloseTo(1, 5);
      expect(t[v * 4 + 1]).toBeCloseTo(0, 5);
      expect(t[v * 4 + 2]).toBeCloseTo(0, 5);
      expect(t[v * 4 + 3]).toBe(1);
    }
  });

  it('collects LOD roots into levels with the compiler\'s coverage thresholds, and picks by coverage', async () => {
    const model = await parseGLB(makeGLB({
      asset: { version: '2.0', extras: { m2d: { lods: [{ coverage: 0 }, { coverage: 0.3 }, { coverage: 0.1 }] } } },
      ...quad,
      materials: [{}],
      meshes: [{ primitives: [primitive] }, { primitives: [primitive] }, { primitives: [primitive] }],
      nodes: [
        { name: 'LOD0', children: [3] }, { name: 'tree_LOD1', children: [4] }, { name: 'LOD2', children: [5] },
        { mesh: 0 }, { mesh: 1, translation: [0, 0, 5] }, { mesh: 2 }
      ],
      scenes: [{ nodes: [0, 1, 2] }]
    }, quad.bin));
    expect(model.lods).toHaveLength(3);
    expect(model.parts).toBe(model.lods[0].parts);
    expect(model.lods.map((l) => l.coverage)).toEqual([0.3, 0.1, 0]);
    expect(model.lods[1].parts[0].matrix[14]).toBe(5);
    // Level 0 alone sets the bounds: the translated level 1 copy does not widen them.
    expect(model.bounds.max.z).toBe(0);
    expect(lodFor(model, 1)).toBe(0);
    expect(lodFor(model, 0.2)).toBe(1);
    expect(lodFor(model, 0.05)).toBe(2);
    expect(lodFor(model, 0)).toBe(2);
  });

  it('defaults the thresholds to a geometric series and refuses a gap in the chain', async () => {
    const two = await parseGLB(makeGLB({
      asset: { version: '2.0' }, ...quad, materials: [{}],
      meshes: [{ primitives: [primitive] }],
      nodes: [{ name: 'LOD0', children: [2] }, { name: 'LOD1', children: [3] }, { mesh: 0 }, { mesh: 0 }],
      scenes: [{ nodes: [0, 1] }]
    }, quad.bin));
    expect(two.lods.map((l) => l.coverage)).toEqual([0.25, 0]);
    await expect(parseGLB(makeGLB({
      asset: { version: '2.0' }, ...quad, materials: [{}],
      meshes: [{ primitives: [primitive] }],
      nodes: [{ name: 'LOD0', children: [2] }, { name: 'LOD2', children: [3] }, { mesh: 0 }, { mesh: 0 }],
      scenes: [{ nodes: [0, 1] }]
    }, quad.bin), { name: 'gappy' })).rejects.toThrow(/gappy has LOD2 but no LOD1/);
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

describe('a rigged model', () => {
  it('reads the skin, the joints and weights, the node tree and the clip', async () => {
    const model = await parseGLB(fixture('RiggedSimple'), { decodeImage: fakeDecode });
    expect(model.skinned).toBe(true);
    expect(model.skins).toHaveLength(1);
    expect(model.skins[0].joints).toHaveLength(2);
    expect(model.skins[0].inverseBind).toHaveLength(32);
    const [part] = model.parts;
    expect(part.skin).toBe(0);
    expect(part.geometry.skinned).toBe(true);
    expect(part.geometry.joints.length / 4).toBe(part.geometry.positions.length / 3);
    expect(part.geometry.weights.length / 4).toBe(part.geometry.positions.length / 3);
    expect(model.nodes).toHaveLength(5);
    expect(model.nodes.filter((n) => n.parent < 0).length).toBeGreaterThan(0);
    expect(model.animations).toHaveLength(1);
    expect(model.animations[0].duration).toBeCloseTo(2.08, 1);
    expect(model.animations[0].channels.map((c) => c.path).sort()).toEqual(['rotation', 'scale', 'translation']);
  });

  it('the animator poses the joints and moves them as a clip plays', async () => {
    const { Animator3D } = await import('../src/core/animator3d.js');
    const model = await parseGLB(fixture('RiggedSimple'), { decodeImage: fakeDecode });
    const animator = new Animator3D(model);
    const rest = Float32Array.from(animator.jointMatrices(0));
    // At rest a joint matrix is world * inverse bind: near identity for the root.
    expect(rest[0]).toBeCloseTo(1, 3);
    expect(animator.clipNames).toEqual(['clip 0']);
    expect(animator.play('clip 0', { fade: 0 })).toBe(true);
    expect(animator.play('nope')).toBe(false);
    animator.update(0.5);
    const moved = animator.jointMatrices(0);
    let difference = 0;
    for (let i = 0; i < rest.length; i++) difference = Math.max(difference, Math.abs(rest[i] - moved[i]));
    expect(difference).toBeGreaterThan(0.05);
    // Looping wraps time back into the clip.
    animator.update(10);
    expect(animator.layers[0].time).toBeLessThan(model.animations[0].duration);
  });

  it('crossfades: the old clip fades out as the new one fades in, then is dropped', async () => {
    const { Animator3D } = await import('../src/core/animator3d.js');
    const model = await parseGLB(fixture('RiggedSimple'), { decodeImage: fakeDecode });
    const animator = new Animator3D(model);
    animator.play('clip 0', { fade: 0 });
    animator.update(0.1);
    animator.play('clip 0', { fade: 0.5, restart: true });
    expect(animator.layers).toHaveLength(2);
    animator.update(0.25);
    expect(animator.layers[0].weight).toBeCloseTo(0.5, 2);
    expect(animator.layers[1].weight).toBeCloseTo(0.5, 2);
    animator.update(0.3);
    expect(animator.layers).toHaveLength(1);
    expect(animator.layers[0].weight).toBe(1);
    expect(animator.current).toBe('clip 0');
  });

  it('a skinned instance carries its joints into the frame', async () => {
    const model = await parseGLB(fixture('RiggedSimple'), { decodeImage: fakeDecode });
    const { INSTANCE_FLOATS } = await import('../src/core/renderers/frame3d.js');
    const frame = new Frame3D();
    const joints = new Float32Array(32);
    const [part] = model.parts;
    frame.add(part.geometry, { skin: joints });
    frame.add(part.geometry, { skin: joints });
    // Each skinned instance files two poses, this frame's and last
    // frame's, so a limb's own motion reaches the velocity buffer.
    expect(frame.jointCount).toBe(8);
    expect(frame.skins).toHaveLength(4);
    const [entry] = frame.entries();
    expect(entry.instances[0][52]).toBe(0);
    expect(entry.instances[0][54]).toBe(2);
    expect(entry.instances[1][52]).toBe(4);
    expect(entry.instances[1][54]).toBe(6);
    expect(entry.instances[1][53]).toBe(1);
  });

  it('stands the current pose in for the previous one when none is given', async () => {
    const model = await parseGLB(fixture('RiggedSimple'), { decodeImage: fakeDecode });
    const frame = new Frame3D();
    const joints = new Float32Array(32).fill(1);
    const previous = new Float32Array(32).fill(2);
    const [part] = model.parts;
    frame.add(part.geometry, { skin: joints });
    frame.add(part.geometry, { skin: joints, previousSkin: previous });
    // Without a previous pose the current one is both, so nothing moves.
    expect(frame.skins[0]).toBe(joints);
    expect(frame.skins[1]).toBe(joints);
    // With one, the second slot is last frame's.
    expect(frame.skins[2]).toBe(joints);
    expect(frame.skins[3]).toBe(previous);
  });

  it('keeps last frame\'s pose on the animator, and starts with it equal to the first', async () => {
    const { Animator3D } = await import('../src/core/animator3d.js');
    const model = await parseGLB(fixture('RiggedSimple'), { decodeImage: fakeDecode });
    const animator = new Animator3D(model);
    animator.play('clip 0', { fade: 0 });
    animator.update(0);
    // The pose a snap lands on is its own previous: it was never on
    // screen to move from, so the opening frame reports no velocity
    // rather than smearing the model in from the bind pose.
    expect(Array.from(animator.previousJointMatrices(0))).toEqual(Array.from(animator.jointMatrices(0)));
    const first = Float32Array.from(animator.jointMatrices(0));
    animator.update(0.5);
    // After a step, the previous is the pose before it, not the new one.
    expect(Array.from(animator.previousJointMatrices(0))).toEqual(Array.from(first));
    expect(Array.from(animator.jointMatrices(0))).not.toEqual(Array.from(first));
  });
});

describe('props', () => {
  beforeAll(() => initPhysics({ dimensions: 3 }));
  class Ground extends Entity { name = 'Ground'; }
  const level = (fields) => ({
    version: SCENE_VERSION, type: 'level', name: 'lot', world: { dimensions: 3 }, ...fields
  });
  const loader = () => {
    const g = new M2D(null, { headless: true, dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 1 });
    g.registerActor('Ground', Ground);
    return new SceneLoader(g);
  };

  it('validates: a prefab with a mesh, unique ids, 3D only', () => {
    const ok = loader().load(level({
      prefabs: { tree: { actor: 'Ground', mesh: { color: '#3f6b2f', shape: 'sphere' } } },
      layers: [{ name: 'main', objects: [], props: [{ id: 'trees', prefab: 'tree', width: 3, height: 3, instances: [[1, 2, 3, 0, 1], [4, 2, 6, 1.5, 1.3]] }] }]
    }));
    expect(ok.layers[0].props[0].instances).toHaveLength(2);
    expect(ok.layers[0].props[0].castShadow).toBe(true);

    expect(() => loader().load(level({
      prefabs: { tree: { actor: 'Ground' } },
      layers: [{ name: 'main', objects: [], props: [{ id: 'trees', prefab: 'tree', instances: [[0, 0, 0, 0, 1]] }] }]
    }))).toThrow(/props\[0\].prefab: prefab 'tree' has no mesh/);

    expect(() => loader().load(level({
      prefabs: { tree: { actor: 'Ground', mesh: {} } },
      layers: [{ name: 'main', objects: [], props: [{ id: 'trees', prefab: 'tree', instances: [[0, 0, 0, 0]] }] }]
    }))).toThrow(/instances\[0\].*\[x, y, z, yaw, scale\]/);

    expect(() => loader().load(level({
      prefabs: { tree: { actor: 'Ground', mesh: {} } },
      layers: [{ name: 'main', objects: [{ id: 'trees', prefab: 'tree', x: 0, y: 0 }], props: [{ id: 'trees', prefab: 'tree', instances: [] }] }]
    }))).toThrow(/duplicate id 'trees'/);

    expect(() => loader().load({
      version: SCENE_VERSION, type: 'level', name: 'flat',
      prefabs: { tree: { actor: 'Ground' } },
      layers: [{ name: 'main', objects: [], props: [] }]
    })).toThrow(/layers\[0\].props: props are drawn by the 3D renderer, and this level is 2D/);
  });

  it('stands static bodies for props that ask, and none for grass', async () => {
    const game = new M2D(null, { headless: true, dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 1 });
    game.registerActor('Ground', Ground);
    const config = new SceneLoader(game).load(level({
      prefabs: {
        tree: { actor: 'Ground', mesh: { color: '#3f6b2f', shape: 'sphere' } },
        grass: { actor: 'Ground', mesh: { color: '#3f6b2f' } },
        crate: { actor: 'Ground', mesh: { color: '#b86a2a' } }
      },
      layers: [{
        name: 'main', objects: [],
        props: [
          { id: 'trees', prefab: 'tree', width: 4, height: 4, collider: { shape: 'cylinder', width: 0.6, height: 3 }, instances: [[5, 0, 5, 0, 1], [-5, 0, 5, 0, 2]] },
          { id: 'grass', prefab: 'grass', collider: 'none', instances: [[0, 0, 0, 0, 1]] },
          { id: 'crates', prefab: 'crate', width: 1, height: 1, depth: 1, collider: 'bounds', instances: [[0, 0.5, -3, Math.PI / 2, 1]] }
        ]
      }]
    }));
    const { Scene } = await import('../src/core/scene.js');
    const scene = new Scene(game, config);
    scene.setupProps();
    expect(scene.propBodies).toHaveLength(3);
    // The tree's trunk stands on its origin: a cylinder whose centre is half its height up, scaled with the instance.
    const [trunk, bigTrunk, crate] = scene.propBodies;
    expect(trunk.position).toEqual({ x: 5, y: 1.5, z: 5 });
    expect(bigTrunk.position.y).toBeCloseTo(3, 6);
    expect(crate.position).toEqual({ x: 0, y: 0.5, z: -3 });
    expect(crate.bodyType).toBe('static');
    // Headless: colliders but nothing to draw.
    expect(scene.batches).toHaveLength(0);
    // The collider is checked: a shape without a size is refused.
    expect(() => new SceneLoader(game).load(level({
      prefabs: { tree: { actor: 'Ground', mesh: {} } },
      layers: [{ name: 'main', objects: [], props: [{ id: 'trees', prefab: 'tree', collider: { shape: 'cylinder' }, instances: [] }] }]
    }))).toThrow(/collider/);
  });

  it('builds one resident batch per geometry and material, shapes and model parts alike', async () => {
    const truck = await parseGLB(fixture('BoxTextured'), { decodeImage: fakeDecode });
    const config = loader().load(level({
      assets: { models: { truck: { url: 'models/truck.glb' } } },
      prefabs: {
        tree: { actor: 'Ground', mesh: { color: '#3f6b2f', shape: 'sphere' } },
        crate: { actor: 'Ground', mesh: { color: '#b86a2a' } },
        truck: { actor: 'Ground', mesh: { model: 'truck', scale: 2, offset: { x: 0, y: -1, z: 0 } } }
      },
      layers: [{
        name: 'main', objects: [],
        props: [
          { id: 'trees', prefab: 'tree', width: 3, height: 3, instances: [[1, 2, 3, 0, 1], [4, 2, 6, 1.5, 1.3]] },
          { id: 'more-trees', prefab: 'tree', width: 3, height: 3, instances: [[9, 2, 3, 0, 0.5]] },
          { id: 'crates', prefab: 'crate', width: 1, height: 1, depth: 1, castShadow: false, instances: [[0, 0.5, 0, 0.3, 1]] },
          { id: 'trucks', prefab: 'truck', instances: [[10, 1, 10, Math.PI / 2, 1]] }
        ]
      }]
    }));
    // A displayed game's scene, with the model already loaded.
    const { Scene } = await import('../src/core/scene.js');
    const scene = new Scene({ headless: false, physics: { dimensions: 3 } }, config);
    scene.models.set('truck', truck);
    scene.setupProps();
    // Spheres (both tree props), boxes, and the truck's one textured part.
    expect(scene.batches).toHaveLength(3);
    const spheres = scene.batches.find((b) => b.material === null && b.count === 3);
    expect(spheres).toBeTruthy();
    // The second tree: at (4, 2, 6), 3 m wide times 1.3, so a sphere of radius 1.95 around it.
    const second = spheres.records.subarray(INSTANCE_FLOATS, 2 * INSTANCE_FLOATS);
    expect([second[56], second[57], second[58]]).toEqual([4, 2, 6]);
    expect(second[59]).toBeCloseTo(1.95, 5);
    // The crate's colour went to linear light, and it casts no shadow.
    const crates = scene.batches.find((b) => b.material === null && b.count === 1);
    expect(crates.records[28]).toBeCloseTo(0.479, 2);
    expect(crates.records[55]).toBe(0);
    // The truck's part carries the file's material and the mesh block's scale and offset.
    const trucks = scene.batches.find((b) => b.material !== null);
    expect(trucks.material).toBe(truck.parts[0].material);
    expect(trucks.count).toBe(1);
    // y: the instance's 1 plus the offset's -1; the offset is in the body's
    // frame, before the model's scale, as an entity's model is placed.
    expect(trucks.records[13]).toBeCloseTo(0, 5);
    expect(trucks.records[0]).toBeCloseTo(0, 5);   // turned a quarter: x axis maps to z
    expect(trucks.records[2]).toBeCloseTo(-2, 5);  // at scale 2
  });
});

describe('lights', () => {
  it('packs point and spot lights for the GPU, up to the limit', async () => {
    const { LIGHT_FLOATS, MAX_LIGHTS } = await import('../src/core/renderers/frame3d.js');
    const frame = new Frame3D();
    frame.addLight({ position: { x: 1, y: 2, z: 3 }, color: [1, 0.5, 0.25], intensity: 7, range: 9 });
    frame.addLight({ type: 'spot', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: -2, z: 0 }, innerCone: 0.2, outerCone: 0.4 });
    expect(frame.lights).toHaveLength(2);
    const [point, spot] = frame.lights;
    expect(point).toHaveLength(LIGHT_FLOATS);
    expect([...point.slice(0, 8)]).toEqual([1, 2, 3, 9, 1, 0.5, 0.25, 7]);
    expect(point[11]).toBe(0);
    expect([...spot.slice(8, 12)]).toEqual([0, -1, 0, 1]);
    expect(spot[12]).toBeCloseTo(Math.cos(0.2), 6);
    expect(spot[13]).toBeCloseTo(Math.cos(0.4), 6);
    for (let i = 0; i < MAX_LIGHTS + 5; i++) frame.addLight({ position: { x: i, y: 0, z: 0 } });
    expect(frame.lights).toHaveLength(MAX_LIGHTS);
  });

  it('a prefab\'s light block reaches the entity in linear light and follows its body into the frame', async () => {
    await initPhysics({ dimensions: 3 });
    class Lamp extends Entity { name = 'Lamp'; }
    const game = new M2D(null, { headless: true, dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 1 });
    game.registerActor('Lamp', Lamp);
    game.sceneManager.addScene('yard', { fetch: async () => ({
      version: SCENE_VERSION, type: 'level', name: 'yard', world: { dimensions: 3 },
      prefabs: { lamp: { actor: 'Lamp', physics: { bodyType: 'static' }, light: { color: '#ff8000', intensity: 12, range: 8, offset: { x: 0, y: 0.5, z: 0 } } } },
      layers: [{ name: 'main', objects: [{ id: 'l', prefab: 'lamp', x: 2, y: 3, z: 4, width: 0.5, height: 0.5 }] }]
    }) });
    await game.sceneManager.switchTo('yard');
    const lamp = game.sceneManager.getCurrentScene().entitiesById.get('l');
    expect(lamp.light.color[0]).toBeCloseTo(1, 3);
    expect(lamp.light.color[1]).toBeCloseTo(0.2158, 3);
    expect(lamp.light.color[2]).toBe(0);
    expect(lamp.light.intensity).toBe(12);
    game.destroy();
  });

  it('rejects a light block in a 2D level', () => {
    const game = new M2D(null, { headless: true, worldWidth: 20, worldHeight: 20, seed: 1 });
    game.registerActor('Lamp', class extends Entity { name = 'Lamp'; });
    expect(() => new SceneLoader(game).load({
      version: SCENE_VERSION, type: 'level', name: 'flat',
      prefabs: { lamp: { actor: 'Lamp', light: { intensity: 1 } } },
      layers: [{ name: 'main', objects: [] }]
    })).toThrow(/prefabs.lamp.light: a light belongs to the 3D renderer, and this level is 2D/);
  });
});

describe('the frame records what the GPU cull needs', () => {
  const camera = () => {
    const c = new Camera3D(16, 9, { mode: 'free', position: { x: 0, y: 2, z: 10 }, lookAt: { x: 0, y: 0, z: 0 } });
    c.update(0);
    return c;
  };

  it('keeps every instance, with its world bounding sphere in the record', () => {
    const frame = new Frame3D();
    frame.setCamera(camera());
    const g = box();
    frame.add(g, { position: { x: 0, y: 0, z: 0 } });
    frame.add(g, { position: { x: 0, y: 0, z: 30 } });   // behind the camera: culled on the GPU, not here
    frame.add(g, { position: { x: 200, y: 0, z: 0 } });
    expect(frame.added).toBe(3);
    const [entry] = frame.entries();
    expect(entry.instances).toHaveLength(3);
    const far = entry.instances[2];
    expect([far[56], far[57], far[58]]).toEqual([200, 0, 0]);
    expect(far[59]).toBeCloseTo(Math.sqrt(0.75), 6);
    // Every instance casts unless told not to.
    expect(far[55]).toBe(1);
  });

  it('marks an instance that casts no shadow, so the cull skips it for the shadow passes', () => {
    const frame = new Frame3D();
    frame.add(box(), { position: { x: 0, y: 0, z: 0 }, castShadow: false });
    const [entry] = frame.entries();
    expect(entry.instances[0][55]).toBe(0);
  });

  it('carries a static batch by reference and counts its instances', () => {
    const frame = new Frame3D();
    const g = box();
    const batch = new StaticBatch(g);
    batch.push({ position: { x: 1, y: 0, z: 0 } });
    batch.push({ position: { x: 2, y: 0, z: 0 }, scale: 3 });
    expect(batch.count).toBe(2);
    expect(batch.records).toHaveLength(2 * INSTANCE_FLOATS);
    // The second record's sphere: centred at its position, scaled by 3.
    expect(batch.records[INSTANCE_FLOATS + 56]).toBe(2);
    expect(batch.records[INSTANCE_FLOATS + 59]).toBeCloseTo(3 * Math.sqrt(0.75), 6);
    frame.addBatch(batch);
    frame.add(g, { position: { x: 0, y: 0, z: 0 } });
    expect(frame.added).toBe(3);
    const [entry] = frame.entries();
    expect(entry.batches).toEqual([batch]);
    expect(entry.instances).toHaveLength(1);
  });

  it('grows a static batch past its first capacity', () => {
    const batch = new StaticBatch(box(), null, 2);
    for (let i = 0; i < 5; i++) batch.push({ position: { x: i, y: 0, z: 0 } });
    expect(batch.count).toBe(5);
    expect(batch.records[4 * INSTANCE_FLOATS + 56]).toBe(4);
    expect(batch.version).toBe(5);
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
    expect(entries[0].instances).toHaveLength(2);
    expect(entries[1].material).toBe(red);
  });

  it('scales the bounding sphere by the largest axis of the model matrix', () => {
    const frame = new Frame3D();
    frame.add(box(), { position: { x: 60, y: 0, z: 0 }, scale: { x: 100, y: 1, z: 1 } });
    const [entry] = frame.entries();
    expect(entry.instances[0][59]).toBeCloseTo(100 * Math.sqrt(0.75), 4);
    expect(boundingSphere(box()).radius).toBeCloseTo(Math.sqrt(0.75), 6);
  });
});
