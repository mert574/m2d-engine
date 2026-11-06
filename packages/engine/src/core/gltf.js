import * as mat4 from './renderers/geometry/mat4.js';

/**
 * A glTF 2.0 reader, for `.glb` files, into what the 3D renderer draws.
 *
 * glTF is the format every modelling tool exports and every engine
 * imports, in metres with y up — the conventions the 3D world already
 * has, so nothing here converts an axis or a unit. The result is a
 * `Model`:
 *
 *   { parts: [{ geometry, material, matrix, node, skin }],
 *     nodes, skins, animations, skinned, bounds: { min, max } }
 *
 * One part per mesh primitive per node that uses it, with the node's
 * bind-pose world matrix baked in; `geometry` is the `primitives.js` shape
 * with `uvs` added, and `joints` and `weights` when the mesh is skinned;
 * `material` is a metallic-roughness material with its textures as decoded
 * images. The renderer uploads geometry and images once each, by identity.
 *
 * `nodes` is the node tree as plain data (parent index and local TRS),
 * `skins` the joint lists with inverse bind matrices, and `animations`
 * the clips as sampled channels, for `Animator3D` to play. A model with
 * no skin or clip is drawn from `parts` alone.
 *
 * Read so far: positions, normals (flat ones made when absent), one set
 * of texture coordinates, joints and weights, indices, node transforms,
 * skins, animations (linear and step; cubic splines keep their key values
 * and interpolate linearly), and the core metallic-roughness material
 * with base colour, metallic-roughness and emissive textures. Not yet:
 * vertex colours, normal and occlusion maps, morph targets, material
 * extensions, `.gltf` with external files.
 */

const MAGIC = 0x46546C67;
const JSON_CHUNK = 0x4E4F534A;
const BIN_CHUNK = 0x004E4942;

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array
};
const NORMALIZE = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

/**
 * Parse a `.glb` from its bytes.
 * @param {ArrayBuffer} buffer
 * @param {object} [options]
 * @param {(bytes: Uint8Array, mimeType: string) => Promise<any>} [options.decodeImage]
 *   Turns an embedded image's bytes into something the renderer can upload;
 *   `createImageBitmap` where there is a browser. Images are skipped without it.
 * @param {string} [options.name] - For error messages
 * @returns {Promise<Model>}
 */
export async function parseGLB(buffer, { decodeImage = defaultDecodeImage, name = 'model' } = {}) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || view.getUint32(0, true) !== MAGIC) {
    throw new Error(`M2D: ${name} is not a .glb file (bad magic)`);
  }
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`M2D: ${name} is glTF ${version}; only glTF 2.0 is read`);

  let json = null;
  let bin = null;
  let offset = 12;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = new Uint8Array(buffer, offset + 8, length);
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === BIN_CHUNK) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error(`M2D: ${name} has no JSON chunk`);
  return buildModel(json, bin, { decodeImage, name });
}

/** Fetch and parse a `.glb` by URL. */
export async function loadGLB(url, options = {}) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`M2D: could not fetch model ${url} (${response.status})`);
  return parseGLB(await response.arrayBuffer(), { name: url, ...options });
}

async function defaultDecodeImage(bytes, mimeType) {
  if (typeof createImageBitmap !== 'function') return null;
  // The renderer handles colour space and alpha itself: base colour goes
  // into an sRGB texture, the rest stay linear, and nothing is premultiplied.
  return createImageBitmap(new Blob([bytes], { type: mimeType }), {
    colorSpaceConversion: 'none', premultiplyAlpha: 'none'
  });
}

async function buildModel(json, bin, { decodeImage, name }) {
  const bufferViews = json.bufferViews ?? [];
  const accessors = json.accessors ?? [];

  const bytesOf = (viewIndex) => {
    const bv = bufferViews[viewIndex];
    if (bv.buffer !== 0 || !bin) throw new Error(`M2D: ${name} references an external buffer; only self-contained .glb is read`);
    return { bytes: bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength), stride: bv.byteStride };
  };

  /** An accessor as a tightly packed typed array (floats where normalized). */
  const read = (index, { asFloat = false } = {}) => {
    const acc = accessors[index];
    const Type = ARRAYS[acc.componentType];
    const size = COMPONENTS[acc.type];
    const count = acc.count;
    if (acc.bufferView === undefined) return new (asFloat ? Float32Array : Type)(count * size);
    const { bytes, stride } = bytesOf(acc.bufferView);
    const start = bytes.byteOffset + (acc.byteOffset ?? 0);
    const elementBytes = Type.BYTES_PER_ELEMENT * size;
    let out;
    if (!stride || stride === elementBytes) {
      // Typed arrays need alignment; copy when the buffer view is not aligned.
      out = start % Type.BYTES_PER_ELEMENT === 0
        ? new Type(bytes.buffer, start, count * size).slice()
        : new Type(new Uint8Array(bytes.buffer, start, count * elementBytes).slice().buffer);
    } else {
      out = new Type(count * size);
      const dv = new DataView(bytes.buffer);
      const getter = DataView.prototype[`get${Type.name.replace('Array', '')}`];
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < size; c++) {
          out[i * size + c] = getter.call(dv, start + i * stride + c * Type.BYTES_PER_ELEMENT, true);
        }
      }
    }
    if (asFloat && !(out instanceof Float32Array)) {
      const scale = acc.normalized ? NORMALIZE[acc.componentType] : 1;
      const floats = new Float32Array(out.length);
      for (let i = 0; i < out.length; i++) floats[i] = out[i] / scale;
      return floats;
    }
    return out;
  };

  // Images, decoded once each; materials refer to them by index.
  const images = await Promise.all((json.images ?? []).map(async (image) => {
    if (image.bufferView === undefined) {
      console.warn(`M2D: ${name}: image '${image.name ?? image.uri}' is external and was skipped`);
      return null;
    }
    const { bytes } = bytesOf(image.bufferView);
    return decodeImage(bytes, image.mimeType);
  }));
  const textureImage = (ref) => {
    if (!ref) return null;
    const texture = json.textures?.[ref.index];
    return texture?.source === undefined ? null : images[texture.source];
  };

  const materials = (json.materials ?? []).map((m) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    return {
      name: m.name,
      baseColor: pbr.baseColorFactor ?? [1, 1, 1, 1],
      metallic: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor ?? 1,
      emissive: m.emissiveFactor ?? [0, 0, 0],
      baseColorTexture: textureImage(pbr.baseColorTexture),
      metallicRoughnessTexture: textureImage(pbr.metallicRoughnessTexture),
      emissiveTexture: textureImage(m.emissiveTexture),
      doubleSided: m.doubleSided ?? false
    };
  });

  // Geometry per primitive, built once however many nodes instance the mesh.
  const geometryCache = new Map();
  const geometryFor = (meshIndex, primIndex) => {
    const key = `${meshIndex}:${primIndex}`;
    if (geometryCache.has(key)) return geometryCache.get(key);
    const prim = json.meshes[meshIndex].primitives[primIndex];
    if (prim.mode !== undefined && prim.mode !== 4) {
      console.warn(`M2D: ${name}: primitive mode ${prim.mode} is not triangles and was skipped`);
      geometryCache.set(key, null);
      return null;
    }
    const positions = read(prim.attributes.POSITION, { asFloat: true });
    const vertexCount = positions.length / 3;
    let indices = prim.indices !== undefined ? read(prim.indices) : sequence(vertexCount);
    if (indices instanceof Uint8Array) indices = Uint16Array.from(indices);
    const normals = prim.attributes.NORMAL !== undefined
      ? read(prim.attributes.NORMAL, { asFloat: true })
      : flatNormals(positions, indices);
    const uvs = prim.attributes.TEXCOORD_0 !== undefined
      ? read(prim.attributes.TEXCOORD_0, { asFloat: true })
      : new Float32Array(vertexCount * 2);
    const geometry = { positions, normals, uvs, indices };
    if (prim.attributes.JOINTS_0 !== undefined && prim.attributes.WEIGHTS_0 !== undefined) {
      const joints = read(prim.attributes.JOINTS_0);
      geometry.joints = joints instanceof Uint16Array ? joints : Uint16Array.from(joints);
      geometry.weights = read(prim.attributes.WEIGHTS_0, { asFloat: true });
      geometry.skinned = true;
    }
    geometryCache.set(key, geometry);
    return geometry;
  };

  // The node tree as data, for the animator: parent, local TRS (or a
  // fixed matrix, which no channel can drive), and children.
  const nodes = (json.nodes ?? []).map((node, index) => ({
    index,
    name: node.name ?? `node ${index}`,
    parent: -1,
    children: node.children ?? [],
    translation: node.translation ? [...node.translation] : [0, 0, 0],
    rotation: node.rotation ? [...node.rotation] : [0, 0, 0, 1],
    scale: node.scale ? [...node.scale] : [1, 1, 1],
    matrix: node.matrix ? new Float32Array(node.matrix) : null
  }));
  for (const node of nodes) for (const child of node.children) nodes[child].parent = node.index;

  const skins = (json.skins ?? []).map((skin, index) => ({
    index,
    name: skin.name,
    joints: [...skin.joints],
    inverseBind: skin.inverseBindMatrices !== undefined
      ? read(skin.inverseBindMatrices, { asFloat: true })
      : identityMatrices(skin.joints.length)
  }));

  const animations = (json.animations ?? []).map((animation, index) => {
    let duration = 0;
    const channels = animation.channels.map((channel) => {
      const sampler = animation.samplers[channel.sampler];
      const times = read(sampler.input, { asFloat: true });
      let values = read(sampler.output, { asFloat: true });
      const interpolation = sampler.interpolation ?? 'LINEAR';
      const path = channel.target.path;
      const stride = path === 'rotation' ? 4 : path === 'weights' ? values.length / times.length : 3;
      if (interpolation === 'CUBICSPLINE') {
        // In-tangent, value, out-tangent per key: keep the values.
        const keys = new Float32Array(times.length * stride);
        for (let k = 0; k < times.length; k++) {
          for (let c = 0; c < stride; c++) keys[k * stride + c] = values[(k * 3 + 1) * stride + c];
        }
        values = keys;
      }
      duration = Math.max(duration, times[times.length - 1] ?? 0);
      return { node: channel.target.node, path, times, values, stride, step: interpolation === 'STEP' };
    }).filter((c) => c.node !== undefined && c.path !== 'weights');
    return { index, name: animation.name ?? `clip ${index}`, duration, channels };
  });

  const parts = [];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const local = node.matrix
      ? new Float32Array(node.matrix)
      : mat4.fromTRS(
        vec(node.translation, [0, 0, 0]), quat(node.rotation), vec(node.scale, [1, 1, 1]));
    const world = mat4.multiply(parent, local);
    if (node.mesh !== undefined) {
      json.meshes[node.mesh].primitives.forEach((prim, primIndex) => {
        const geometry = geometryFor(node.mesh, primIndex);
        if (!geometry) return;
        const material = prim.material !== undefined ? materials[prim.material] : DEFAULT_MATERIAL;
        const skin = node.skin !== undefined && geometry.skinned ? node.skin : null;
        parts.push({ geometry, material, matrix: world, node: nodeIndex, skin });
        // A skinned mesh is placed by its joints, not its node; its bind
        // pose is still the right thing to measure.
        growBounds(bounds, geometry.positions, skin === null ? world : mat4.create());
      });
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes ?? (json.nodes ?? []).map((_, i) => i);
  for (const root of roots) visit(root, mat4.create());

  if (!parts.length) throw new Error(`M2D: ${name} has no triangle meshes`);
  return {
    name: json.asset?.extras?.title ?? name,
    parts,
    nodes,
    roots,
    skins,
    animations,
    skinned: skins.length > 0 && parts.some((part) => part.skin !== null),
    bounds: { min: { x: bounds.min[0], y: bounds.min[1], z: bounds.min[2] }, max: { x: bounds.max[0], y: bounds.max[1], z: bounds.max[2] } }
  };
}

function identityMatrices(count) {
  const out = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) { out[i * 16] = out[i * 16 + 5] = out[i * 16 + 10] = out[i * 16 + 15] = 1; }
  return out;
}

/** The material a primitive without one gets: glTF's defaults, which are white, fully metallic, rough. */
export const DEFAULT_MATERIAL = Object.freeze({
  name: 'default', baseColor: [1, 1, 1, 1], metallic: 1, roughness: 1, emissive: [0, 0, 0],
  baseColorTexture: null, metallicRoughnessTexture: null, emissiveTexture: null, doubleSided: false
});

const vec = (v, fallback) => (v ? { x: v[0], y: v[1], z: v[2] } : { x: fallback[0], y: fallback[1], z: fallback[2] });
const quat = (q) => (q ? { x: q[0], y: q[1], z: q[2], w: q[3] } : { x: 0, y: 0, z: 0, w: 1 });

function sequence(count) {
  const out = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  for (let i = 0; i < count; i++) out[i] = i;
  return out;
}

/** Per-vertex normals from face normals, for a mesh that shipped without any. */
function flatNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { normals[v] += nx; normals[v + 1] += ny; normals[v + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
  }
  return normals;
}

function growBounds(bounds, positions, matrix) {
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < positions.length; i += 3) {
    mat4.transformPoint(matrix, { x: positions[i], y: positions[i + 1], z: positions[i + 2] }, p);
    bounds.min[0] = Math.min(bounds.min[0], p.x); bounds.max[0] = Math.max(bounds.max[0], p.x);
    bounds.min[1] = Math.min(bounds.min[1], p.y); bounds.max[1] = Math.max(bounds.max[1], p.y);
    bounds.min[2] = Math.min(bounds.min[2], p.z); bounds.max[2] = Math.max(bounds.max[2], p.z);
  }
}
