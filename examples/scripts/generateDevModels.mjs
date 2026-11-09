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

const MODELS = {
  'vertexBox.glb': vertexBox
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
