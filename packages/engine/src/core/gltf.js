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
 *     lods: [{ parts, coverage }], nodes, skins, animations, skinned,
 *     bounds: { min, max } }
 *
 * One part per mesh primitive per node that uses it, with the node's
 * bind-pose world matrix baked in; `geometry` is the `primitives.js` shape
 * with `uvs` and `tangents` added, and `joints` and `weights` when the
 * mesh is skinned; `material` is a metallic-roughness material with its
 * textures as decoded images. The renderer uploads geometry and images
 * once each, by identity.
 *
 * **Levels of detail.** A root node named `LOD0`, `LOD1`, ... (or ending
 * `_LOD<n>`) holds one level; `lods[n].parts` are that level's parts and
 * `parts` is the finest level's. Each level's `coverage` is the fraction
 * of the screen's height the model must cover to be drawn at it: level
 * n is drawn while coverage is at least `lods[n].coverage` and below
 * `lods[n - 1].coverage`. The thresholds come from
 * `asset.extras.m2d.lods[n].coverage`, which the asset compiler writes,
 * or default to a geometric series. A model without LOD roots has one
 * level, covering everything.
 *
 * `nodes` is the node tree as plain data (parent index and local TRS),
 * `skins` the joint lists with inverse bind matrices, and `animations`
 * the clips as sampled channels, for `Animator3D` to play. A model with
 * no skin or clip is drawn from `parts` alone.
 *
 * Read so far: positions, normals (flat ones made when absent), tangents
 * (made from the texture coordinates when absent), one set of texture
 * coordinates, joints and weights, indices, node transforms, skins,
 * animations (linear and step; cubic splines keep their key values and
 * interpolate linearly), and the metallic-roughness material with base
 * colour, metallic-roughness, normal, occlusion and emissive textures,
 * `alphaMode` with its cutoff, `doubleSided`, `KHR_texture_transform` on
 * the base colour (applied to every texture of the material),
 * `KHR_materials_ior` and `KHR_materials_specular` (as one reflectance at
 * normal incidence), `EXT_texture_webp` and `KHR_texture_basisu` (KTX2
 * textures, decoded through `setKTX2Decoder`). Morph targets morph position and
 * normal, driven by weights channels, on unskinned meshes. Not yet: morphs on a skinned mesh, the other
 * material extensions, `.gltf` with external files.
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

/**
 * The KTX2 decoder, set by the renderer that knows the GPU's compressed
 * formats (`webgpuRenderer` registers one over `webgpu/basis.js`). It
 * takes a file's bytes and resolves to the record `TextureCache3D.get`
 * uploads. Without one — headless, or a renderer that cannot use the
 * result — KTX2 images are skipped the way images are skipped without
 * `createImageBitmap`.
 * @type {((bytes: Uint8Array) => Promise<object|null>)|null}
 */
let ktx2Decoder = null;

/** @param {((bytes: Uint8Array) => Promise<object|null>)|null} decoder */
export function setKTX2Decoder(decoder) {
  ktx2Decoder = decoder;
}

async function defaultDecodeImage(bytes, mimeType) {
  if (mimeType === 'image/ktx2') return ktx2Decoder ? ktx2Decoder(bytes) : null;
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
    if (!texture) return null;
    // A KTX2 or WebP source stands in for the fallback.
    const source = texture.extensions?.KHR_texture_basisu?.source
      ?? texture.extensions?.EXT_texture_webp?.source
      ?? texture.source;
    return source === undefined ? null : images[source];
  };

  const materials = (json.materials ?? []).map((m) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    const transform = pbr.baseColorTexture?.extensions?.KHR_texture_transform;
    // Dielectric reflectance from the index of refraction, scaled by the
    // specular factor; photoscanned foliage ships at 0.6 of glTF's 0.04.
    const ior = m.extensions?.KHR_materials_ior?.ior ?? 1.5;
    const specularFactor = m.extensions?.KHR_materials_specular?.specularFactor ?? 1;
    return {
      specularF0: Math.pow((ior - 1) / (ior + 1), 2) * specularFactor,
      name: m.name,
      baseColor: pbr.baseColorFactor ?? [1, 1, 1, 1],
      metallic: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor ?? 1,
      emissive: m.emissiveFactor ?? [0, 0, 0],
      baseColorTexture: textureImage(pbr.baseColorTexture),
      metallicRoughnessTexture: textureImage(pbr.metallicRoughnessTexture),
      emissiveTexture: textureImage(m.emissiveTexture),
      normalTexture: textureImage(m.normalTexture),
      normalScale: m.normalTexture?.scale ?? 1,
      occlusionTexture: textureImage(m.occlusionTexture),
      occlusionStrength: m.occlusionTexture?.strength ?? 1,
      /** `opaque`, `mask` (cut at `alphaCutoff`) or `blend`. */
      alphaMode: (m.alphaMode ?? 'OPAQUE').toLowerCase(),
      alphaCutoff: m.alphaCutoff ?? 0.5,
      doubleSided: m.doubleSided ?? false,
      /** Texture coordinates go through scale, rotation and offset, in that order. */
      uvTransform: transform
        ? { offset: transform.offset ?? [0, 0], scale: transform.scale ?? [1, 1], rotation: transform.rotation ?? 0 }
        : null
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
    // Tangents for normal mapping: the file's, or made from the texture
    // coordinates; a primitive with no coordinates has nothing to map.
    const tangents = prim.attributes.TANGENT !== undefined
      ? read(prim.attributes.TANGENT, { asFloat: true })
      : (prim.attributes.TEXCOORD_0 !== undefined ? makeTangents(positions, normals, uvs, indices) : null);
    const geometry = { positions, normals, uvs, indices, tangents };
    // Vertex colours multiply the base colour, as the spec says. Stored
    // as bytes: the renderer binds them as a unorm8x4 attribute, a
    // quarter the memory of floats on a mesh big enough to care.
    if (prim.attributes.COLOR_0 !== undefined) {
      const values = read(prim.attributes.COLOR_0, { asFloat: true });
      const parts = COMPONENTS[accessors[prim.attributes.COLOR_0].type];
      const colors = new Uint8Array(vertexCount * 4).fill(255);
      for (let v = 0; v < vertexCount; v++) {
        for (let c = 0; c < parts; c++) {
          colors[v * 4 + c] = Math.round(Math.min(Math.max(values[v * parts + c], 0), 1) * 255);
        }
      }
      geometry.colors = colors;
    }
    if (prim.attributes.JOINTS_0 !== undefined && prim.attributes.WEIGHTS_0 !== undefined) {
      const joints = read(prim.attributes.JOINTS_0);
      geometry.joints = joints instanceof Uint16Array ? joints : Uint16Array.from(joints);
      geometry.weights = read(prim.attributes.WEIGHTS_0, { asFloat: true });
      geometry.skinned = true;
    }
    // Morph targets: position and normal deltas per target, packed as six
    // floats a vertex for the vertex shader to walk. The instance record
    // spends the skin slots on the weight bases, so a mesh cannot be
    // skinned and morphed at once; a face on a rigged character is real
    // content, but none the engine ships, so it waits for its consumer.
    if (prim.targets?.length) {
      if (geometry.skinned) {
        console.warn(`M2D: ${name}: a skinned mesh with morph targets; the morphs are ignored`);
      } else {
        const count = prim.targets.length;
        const deltas = new Float32Array(count * vertexCount * 6);
        prim.targets.forEach((target, t) => {
          const dp = target.POSITION !== undefined ? read(target.POSITION, { asFloat: true }) : null;
          const dn = target.NORMAL !== undefined ? read(target.NORMAL, { asFloat: true }) : null;
          for (let v = 0; v < vertexCount; v++) {
            const o = (t * vertexCount + v) * 6;
            if (dp) { deltas[o] = dp[v * 3]; deltas[o + 1] = dp[v * 3 + 1]; deltas[o + 2] = dp[v * 3 + 2]; }
            if (dn) { deltas[o + 3] = dn[v * 3]; deltas[o + 4] = dn[v * 3 + 1]; deltas[o + 5] = dn[v * 3 + 2]; }
          }
        });
        geometry.morphs = { count, vertices: vertexCount, deltas };
      }
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
    }).filter((c) => c.node !== undefined);
    return { index, name: animation.name ?? `clip ${index}`, duration, channels };
  });

  const parts = [];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const visit = (nodeIndex, parent, into = parts) => {
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
        const weights = geometry.morphs
          ? Float32Array.from(node.weights ?? json.meshes[node.mesh].weights ?? new Array(geometry.morphs.count).fill(0))
          : null;
        into.push({ geometry, material, matrix: world, node: nodeIndex, skin, weights });
        // A skinned mesh is placed by its joints, not its node; its bind
        // pose is still the right thing to measure. Only the finest level
        // measures: the others are the same shape, coarser.
        if (into === parts) growBounds(bounds, geometry.positions, skin === null ? world : mat4.create());
      });
    }
    for (const child of node.children ?? []) visit(child, world, into);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes ?? (json.nodes ?? []).map((_, i) => i);
  // Root nodes named for a level of detail hold that level; anything else
  // at the root belongs to level 0.
  const levelParts = [];
  for (const root of roots) {
    const level = lodIndex(json.nodes[root].name);
    if (level === null || level === 0) {
      visit(root, mat4.create(), parts);
    } else {
      visit(root, mat4.create(), levelParts[level] ??= []);
    }
  }
  if (!parts.length) throw new Error(`M2D: ${name} has no triangle meshes`);
  const declared = json.asset?.extras?.m2d?.lods;
  const lods = [{ parts, coverage: 0 }];
  for (let level = 1; level < levelParts.length; level++) {
    if (!levelParts[level]) throw new Error(`M2D: ${name} has LOD${levelParts.length - 1} but no LOD${level}`);
    lods.push({ parts: levelParts[level], coverage: 0 });
  }
  // Level n is drawn while the model covers at least this much of the
  // screen's height; level 0 always covers the top. Declared by the
  // compiler, or each level at a third of the one before, from a quarter.
  for (let level = 1; level < lods.length; level++) {
    lods[level - 1].coverage = declared?.[level]?.coverage ?? 0.25 / Math.pow(3, level - 1);
  }
  return {
    name: json.asset?.extras?.title ?? name,
    parts,
    lods,
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
  baseColorTexture: null, metallicRoughnessTexture: null, emissiveTexture: null,
  normalTexture: null, normalScale: 1, occlusionTexture: null, occlusionStrength: 1,
  alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, uvTransform: null, specularF0: 0.04
});

/**
 * The level of detail to draw a model at, from how much of the screen's
 * height it covers: `radius / (distance * tan(fov / 2))` is the sphere's
 * diameter as a fraction of the view's height at that distance.
 * @param {Model} model
 * @param {number} coverage
 * @returns {number} The level's index into `model.lods`
 */
export function lodFor(model, coverage) {
  const lods = model.lods;
  let level = 0;
  while (level < lods.length - 1 && coverage < lods[level].coverage) level++;
  return level;
}

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

/** The level a root node's name declares (`LOD2`, `tree_LOD2`), or null. */
function lodIndex(nodeName) {
  const match = /(?:^|_)LOD(\d+)$/i.exec(nodeName ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * Per-vertex tangents from the texture coordinates (Lengyel), with the
 * handedness in w, for a mesh whose normal map needs a frame to live in.
 * Mirrored islands come out right-handed or left as the coordinates say.
 */
function makeTangents(positions, normals, uvs, indices) {
  const count = positions.length / 3;
  const tan = new Float32Array(count * 3);
  const bitan = new Float32Array(count * 3);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const e1x = positions[b * 3] - ax, e1y = positions[b * 3 + 1] - ay, e1z = positions[b * 3 + 2] - az;
    const e2x = positions[c * 3] - ax, e2y = positions[c * 3 + 1] - ay, e2z = positions[c * 3 + 2] - az;
    const du1 = uvs[b * 2] - uvs[a * 2], dv1 = uvs[b * 2 + 1] - uvs[a * 2 + 1];
    const du2 = uvs[c * 2] - uvs[a * 2], dv2 = uvs[c * 2 + 1] - uvs[a * 2 + 1];
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const r = 1 / det;
    const tx = (e1x * dv2 - e2x * dv1) * r, ty = (e1y * dv2 - e2y * dv1) * r, tz = (e1z * dv2 - e2z * dv1) * r;
    const bx = (e2x * du1 - e1x * du2) * r, by = (e2y * du1 - e1y * du2) * r, bz = (e2z * du1 - e1z * du2) * r;
    for (const v of [a, b, c]) {
      tan[v * 3] += tx; tan[v * 3 + 1] += ty; tan[v * 3 + 2] += tz;
      bitan[v * 3] += bx; bitan[v * 3 + 1] += by; bitan[v * 3 + 2] += bz;
    }
  }
  const out = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    let tx = tan[v * 3], ty = tan[v * 3 + 1], tz = tan[v * 3 + 2];
    // Gram-Schmidt against the normal.
    const d = nx * tx + ny * ty + nz * tz;
    tx -= nx * d; ty -= ny * d; tz -= nz * d;
    let len = Math.hypot(tx, ty, tz);
    if (len < 1e-8) {
      // No usable coordinates: any perpendicular will do.
      if (Math.abs(nx) < 0.9) { tx = 0; ty = -nz; tz = ny; } else { tx = nz; ty = 0; tz = -nx; }
      len = Math.hypot(tx, ty, tz) || 1;
    }
    out[v * 4] = tx / len; out[v * 4 + 1] = ty / len; out[v * 4 + 2] = tz / len;
    // Handedness. glTF's v runs down the image, so the accumulated dP/dv
    // points the opposite way from the map's +Y; the frame is right-handed
    // (w = 1) when n x t points against it, which is what an exporter's
    // TANGENT says for an ordinary upright quad.
    const cx = ny * tz - nz * ty, cy = nz * tx - nx * tz, cz = nx * ty - ny * tx;
    out[v * 4 + 3] = (cx * bitan[v * 3] + cy * bitan[v * 3 + 1] + cz * bitan[v * 3 + 2]) > 0 ? -1 : 1;
  }
  return out;
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
