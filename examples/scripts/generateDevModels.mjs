/**
 * Small hand-built glTF models that show off engine features in the
 * yard and the lot's showcase corner:
 * `node scripts/generateDevModels.mjs [--missing]`.
 *
 * Generated, not committed, like the dev textures and the showcase
 * sprites. Each one exists to exercise a reader or renderer path real
 * scans do not: vertex colours and morph targets today, whatever the
 * engine grows next.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';

export const OUT_DIR = resolve(import.meta.dirname, '..', 'src', 'yard', 'models', 'dev');

// The two cubes below are no longer placed in the yard — the spheres
// replaced them — but they are the source of the committed
// test fixtures (packages/engine/test/fixtures/models/VertexBox.glb and
// MorphBox.glb), which want the smallest geometry that exercises the
// path, not the prettiest.

/**
 * A metre cube whose corners carry the colour of their own position —
 * +x red, +y green, +z blue — so every face shades through a gradient
 * no texture or material could fake. 24 vertices, four per face, so the
 * normals stay flat and the colours still interpolate.
 */
function vertexBox(doc) {
  const faces = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }
  ];
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  faces.forEach(({ n, u, v }, f) => {
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 1, 2].map((c) => (n[c] + su * u[c] + sv * v[c]) * 0.5);
      positions.push(...p);
      normals.push(...n);
      colors.push(...p.map((x) => x + 0.5), 1);
    }
    indices.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  const buffer = doc.createBuffer();
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const material = doc.createMaterial('corners').setRoughnessFactor(0.55).setMetallicFactor(0);
  const prim = doc.createPrimitive()
    .setIndices(accessor('SCALAR', new Uint16Array(indices)))
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
    .setAttribute('COLOR_0', accessor('VEC4', new Float32Array(colors)))
    .setMaterial(material);
  const mesh = doc.createMesh('vertexBox').addPrimitive(prim);
  return doc.createNode('vertexBox').setMesh(mesh);
}

/**
 * A half-metre cube that breathes: one morph target inflates every
 * vertex outward along its own position, and a two-second 'pulse' clip
 * drives the weight 0 to 1 and back. The silhouette changing is the
 * point — no rigid transform could do it, so if it moves, morphs work.
 */
function morphBox(doc) {
  const faces = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }
  ];
  const positions = [];
  const normals = [];
  const bulge = [];
  const indices = [];
  faces.forEach(({ n, u, v }, f) => {
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 1, 2].map((c) => (n[c] + su * u[c] + sv * v[c]) * 0.25);
      const length = Math.hypot(...p);
      positions.push(...p);
      normals.push(...n);
      bulge.push(...p.map((x) => (x / length) * 0.2));
    }
    indices.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  const buffer = doc.createBuffer();
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const material = doc.createMaterial('shell')
    .setBaseColorFactor([0.85, 0.45, 0.75, 1]).setRoughnessFactor(0.45).setMetallicFactor(0);
  const target = doc.createPrimitiveTarget('bulge')
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(bulge)));
  const prim = doc.createPrimitive()
    .setIndices(accessor('SCALAR', new Uint16Array(indices)))
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
    .addTarget(target)
    .setMaterial(material);
  const mesh = doc.createMesh('morphBox').addPrimitive(prim).setWeights([0]);
  const node = doc.createNode('morphBox').setMesh(mesh);
  const times = accessor('SCALAR', new Float32Array([0, 1, 2]));
  const weights = accessor('SCALAR', new Float32Array([0, 1, 0]));
  const sampler = doc.createAnimationSampler().setInput(times).setOutput(weights).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath('weights').setSampler(sampler);
  doc.createAnimation('pulse').addSampler(sampler).addChannel(channel);
  return node;
}

/** A UV sphere: positions, outward normals and triangles. */
function sphere(radius, rings = 24, segments = 36) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let g = 0; g <= segments; g++) {
      const theta = (g / segments) * Math.PI * 2;
      const n = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      normals.push(...n);
      positions.push(...n.map((v) => v * radius));
      if (r < rings && g < segments) {
        const a = r * (segments + 1) + g;
        const b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  return { positions, normals, indices };
}

const hue = (h, s, v) => {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
};

/**
 * A colour-wheel sphere: hue runs round the equator, washing to white at
 * the top pole and black at the bottom — the whole HSV cylinder on one
 * surface, every bit of it vertex colour over one flat white material.
 */
function colorSphere(doc) {
  const { positions, normals, indices } = sphere(0.45);
  const colors = [];
  for (let i = 0; i < positions.length; i += 3) {
    const y = normals[i + 1];
    const angle = (Math.atan2(normals[i + 2], normals[i]) / (Math.PI * 2) + 1) % 1;
    const toward = Math.abs(y);
    const c = hue(angle, y > 0 ? 1 - toward : 1, y < 0 ? 1 - toward * 0.9 : 1);
    colors.push(...c, 1);
  }
  const buffer = doc.createBuffer();
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const material = doc.createMaterial('wheel').setRoughnessFactor(0.4).setMetallicFactor(0);
  const prim = doc.createPrimitive()
    .setIndices(accessor('SCALAR', new Uint32Array(indices)))
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
    .setAttribute('COLOR_0', accessor('VEC4', new Float32Array(colors)))
    .setMaterial(material);
  return doc.createNode('colorSphere').setMesh(doc.createMesh('colorSphere').addPrimitive(prim));
}

/**
 * A blob that breathes: a sphere with two morph targets — a vertical
 * stretch that squeezes the waist, and an equator band swell — driven
 * out of phase by a looping 'pulse' clip, so it never holds one shape.
 */
function morphBlob(doc) {
  const { positions, normals, indices } = sphere(0.35);
  const stretch = [];
  const swell = [];
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    stretch.push(-x * 0.3, y * 0.55, -z * 0.3);
    const band = Math.exp(-(y * y) / 0.02);
    swell.push(normals[i] * 0.14 * band, 0, normals[i + 2] * 0.14 * band);
  }
  const buffer = doc.createBuffer();
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const material = doc.createMaterial('blob')
    .setBaseColorFactor([0.78, 0.35, 0.68, 1]).setRoughnessFactor(0.35).setMetallicFactor(0);
  const prim = doc.createPrimitive()
    .setIndices(accessor('SCALAR', new Uint32Array(indices)))
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
    .addTarget(doc.createPrimitiveTarget('stretch').setAttribute('POSITION', accessor('VEC3', new Float32Array(stretch))))
    .addTarget(doc.createPrimitiveTarget('swell').setAttribute('POSITION', accessor('VEC3', new Float32Array(swell))))
    .setMaterial(material);
  const node = doc.createNode('morphBlob').setMesh(doc.createMesh('morphBlob').addPrimitive(prim).setWeights([0, 0]));
  const times = accessor('SCALAR', new Float32Array([0, 0.7, 1.4, 2.1, 2.8]));
  const weights = accessor('SCALAR', new Float32Array([0, 0, 0.9, 0.2, 0.15, 1, 0.7, 0.4, 0, 0]));
  const sampler = doc.createAnimationSampler().setInput(times).setOutput(weights).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath('weights').setSampler(sampler);
  doc.createAnimation('pulse').addSampler(sampler).addChannel(channel);
  return node;
}

const MODELS = {
  'colorSphere.glb': colorSphere,
  'morphBlob.glb': morphBlob
};

export async function generateDevModels({ missingOnly = false } = {}) {
  mkdirSync(OUT_DIR, { recursive: true });
  const io = new NodeIO();
  for (const [name, build] of Object.entries(MODELS)) {
    const to = resolve(OUT_DIR, name);
    if (missingOnly && existsSync(to)) continue;
    const doc = new Document();
    doc.createScene('scene').addChild(build(doc));
    writeFileSync(to, await io.writeBinary(doc));
    console.log(`  ${name}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await generateDevModels({ missingOnly: process.argv.includes('--missing') });
}
