/**
 * Small hand-built glTF models the yard displays engine features with:
 * `node scripts/generateDevModels.mjs [--missing]`.
 *
 * Generated, not committed, like the dev textures and the showcase
 * sprites. Each one exists to exercise a reader or renderer path real
 * scans do not: vertex colours today, whatever needs a witness next.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';

export const OUT_DIR = resolve(import.meta.dirname, '..', 'src', 'yard', 'models', 'dev');

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

const MODELS = {
  'vertexBox.glb': vertexBox,
  'morphBox.glb': morphBox
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
