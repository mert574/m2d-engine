/**
 * Levels of detail for foliage: leaf, needle and blade cards.
 *
 * The simplifier cannot make these. A scan's leaf is its own island of
 * some twenty triangles, ten centimetres across; at the error a distant
 * level allows, a whole leaf is below the threshold and collapses, so the
 * levels keep their triangle counts and lose their leaves. Foliage levels
 * are made from whole cards instead:
 *
 *   - **Quads.** A card far enough away that its curvature is a pixel or
 *     two becomes one quad: two triangles carrying the same alpha-cut
 *     texture, so the leaf's outline is the texture's, as it always was.
 *     The quad is the least-squares affine map from the card's texture
 *     coordinates to its positions, evaluated at the corners of its
 *     texture rectangle, so it lies where the leaf lay. A card that is not
 *     flat enough for one (its fit is off by more than an eighth of its
 *     size) keeps its triangles, and so does one whose rectangle is mostly
 *     other cards' texels: a quad over a pine twig that spans a third of
 *     its atlas drew every twig packed beside it, as a dark paddle.
 *   - **Thinning.** Further off, a share of the cards is kept (by a stable
 *     hash, so a rebuild thins the same ones) and each survivor grows about
 *     its centre to stand in for the ones around it.
 */

import sharp from 'sharp';

/**
 * The share of a quad's texture that may be other cards' opaque texels.
 * Neighbouring leaves inside a leaf's rectangle read as more leaf, and a
 * crowded atlas has a tenth or so of them; a pine's twig spans a third of
 * its atlas, and its rectangle is four fifths other twigs.
 */
const QUAD_FOREIGN = 0.5;

/** Samples a side across a card's texture rectangle, for that test. */
const ALPHA_SAMPLES = 8;

/** Decoded cut-outs, by the image they came from: every level of a model asks again. */
const alphas = new WeakMap();

/**
 * A cut-out material's alpha, decoded once: what a quad over a card's
 * texture rectangle would show. Null when there is nothing to read, or
 * when a texture transform moves the texture off the coordinates a card
 * carries.
 * @param {import('@gltf-transform/core').Material|null} material
 * @returns {Promise<{width: number, height: number, data: Uint8Array, cutoff: number}|null>}
 */
export async function alphaOf(material) {
  const image = material?.getBaseColorTexture()?.getImage();
  if (!image || material.getBaseColorTextureInfo()?.getExtension('KHR_texture_transform')) return null;
  if (!alphas.has(image)) {
    const { data, info } = await sharp(image).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
    alphas.set(image, { width: info.width, height: info.height, data });
  }
  return { ...alphas.get(image), cutoff: material.getAlphaCutoff() * 255 };
}

const inTriangle = (u, v, ax, ay, bx, by, cx, cy) => {
  const d1 = (u - bx) * (ay - by) - (ax - bx) * (v - by);
  const d2 = (u - cx) * (by - cy) - (bx - cx) * (v - cy);
  const d3 = (u - ax) * (cy - ay) - (cx - ax) * (v - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

/** Whether a quad over a card's texture rectangle would show only the card itself. */
function showsOnlyItself(card, index, uv, alpha) {
  if (!alpha) return true;
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const t of card) {
    for (let k = 0; k < 3; k++) {
      const i = index[t + k];
      u0 = Math.min(u0, uv[i * 2]); v0 = Math.min(v0, uv[i * 2 + 1]);
      u1 = Math.max(u1, uv[i * 2]); v1 = Math.max(v1, uv[i * 2 + 1]);
    }
  }
  let foreign = 0;
  for (let a = 0; a < ALPHA_SAMPLES; a++) {
    for (let b = 0; b < ALPHA_SAMPLES; b++) {
      const u = u0 + (u1 - u0) * (a + 0.5) / ALPHA_SAMPLES, v = v0 + (v1 - v0) * (b + 0.5) / ALPHA_SAMPLES;
      const x = Math.floor((((u % 1) + 1) % 1) * alpha.width), y = Math.floor((((v % 1) + 1) % 1) * alpha.height);
      if (alpha.data[y * alpha.width + x] < alpha.cutoff) continue;
      const own = card.some((t) => {
        const [i, j, k] = [index[t], index[t + 1], index[t + 2]];
        return inTriangle(u, v, uv[i * 2], uv[i * 2 + 1], uv[j * 2], uv[j * 2 + 1], uv[k * 2], uv[k * 2 + 1]);
      });
      if (!own) foreign++;
    }
  }
  return foreign <= QUAD_FOREIGN * ALPHA_SAMPLES * ALPHA_SAMPLES;
}

/** A stable fraction in 0..1 for a card's ordinal, so a rebuild thins the same cards. */
const cardHash = (i) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** The worst a quad may fit its card, as a share of the card's size. */
const QUAD_FIT = 0.12;

/**
 * The cards of a primitive: connected components over its welded
 * vertices, each a list of triangle starts, in the order first met.
 * @returns {number[][]}
 */
export function cardsOf(prim) {
  const index = prim.getIndices().getArray();
  const count = prim.getAttribute('POSITION').getCount();
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < index.length; t += 3) {
    const a = find(index[t]);
    parent[find(index[t + 1])] = a;
    parent[find(index[t + 2])] = a;
  }
  const byRoot = new Map();
  for (let t = 0; t < index.length; t += 3) {
    const root = find(index[t]);
    let card = byRoot.get(root);
    if (!card) byRoot.set(root, card = []);
    card.push(t);
  }
  return [...byRoot.values()];
}

/** Solve a 3x3 system `m x = b` (row-major), or null when it is singular. */
function solve3(m, b) {
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  if (Math.abs(det) < 1e-18) return null;
  const inv = [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]
  ];
  return [0, 1, 2].map((r) => (inv[r * 3] * b[0] + inv[r * 3 + 1] * b[1] + inv[r * 3 + 2] * b[2]) / det);
}

/**
 * The quad that stands for one card, or null when it cannot: four corners
 * (position, uv) and a normal.
 */
function fitQuad(vertices, p, n, uv) {
  // Normal equations for position = a + u * du + v * dv, one axis at a time.
  let s1 = 0, su = 0, sv = 0, suu = 0, suv = 0, svv = 0;
  const sp = [0, 0, 0], sup = [0, 0, 0], svp = [0, 0, 0];
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const normal = [0, 0, 0];
  for (const i of vertices) {
    const u = uv[i * 2], v = uv[i * 2 + 1];
    s1++; su += u; sv += v; suu += u * u; suv += u * v; svv += v * v;
    u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v);
    for (let k = 0; k < 3; k++) {
      const x = p[i * 3 + k];
      sp[k] += x; sup[k] += u * x; svp[k] += v * x;
      lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x);
      normal[k] += n ? n[i * 3 + k] : 0;
    }
  }
  if (u1 - u0 < 1e-6 || v1 - v0 < 1e-6) return null;
  const m = [s1, su, sv, su, suu, suv, sv, suv, svv];
  const axes = [0, 1, 2].map((k) => solve3(m, [sp[k], sup[k], svp[k]]));
  if (axes.some((a) => !a)) return null;
  const at = (u, v) => axes.map(([a, bu, bv]) => a + bu * u + bv * v);
  // How far the card strays from its plane, against how big it is.
  const size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  let error = 0;
  for (const i of vertices) {
    const q = at(uv[i * 2], uv[i * 2 + 1]);
    error += (q[0] - p[i * 3]) ** 2 + (q[1] - p[i * 3 + 1]) ** 2 + (q[2] - p[i * 3 + 2]) ** 2;
  }
  if (Math.sqrt(error / vertices.length) > QUAD_FIT * size) return null;
  const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => ({ position: at(u, v), uv: [u, v] }));
  // The leaf's own shading normal: the mean of its vertex normals. Scanned
  // foliage ships normals smoothed over the canopy, so leaves shade softly;
  // the quad's flat face normal instead turns each leaf to a random angle,
  // and a canopy of those catches the sky in its highlights and goes white.
  // The face normal is the fallback when the vertex normals cancel out.
  let shading = normal;
  if (Math.hypot(...shading) < 1e-6) {
    const du = axes.map((a) => a[1]), dv = axes.map((a) => a[2]);
    shading = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
  }
  const length = Math.hypot(...shading) || 1;
  return { corners, normal: shading.map((x) => x / length) };
}

/** The quad a card becomes, or null: too few triangles to gain, not flat enough, or showing other cards. */
function quadFor(card, vertices, index, p, n, uv, alpha) {
  // A card already two triangles or fewer gains nothing as a quad.
  if (card.length <= 2) return null;
  const quad = fitQuad(vertices, p, n, uv);
  return quad && showsOnlyItself(card, index, uv, alpha) ? quad : null;
}

/**
 * What a primitive's cards would cost kept whole, in triangles: two for a
 * card that becomes a quad, its own count for one that stays triangles.
 * The share to keep for a budget is the budget over this.
 * @param {import('@gltf-transform/core').Primitive} prim
 * @param {{quads?: boolean, alpha?: object|null}} [options]
 */
export function cardCosts(prim, { quads = false, alpha = null } = {}) {
  const index = prim.getIndices().getArray();
  const p = prim.getAttribute('POSITION').getArray();
  const n = prim.getAttribute('NORMAL')?.getArray() ?? null;
  const uvAttr = prim.getAttribute('TEXCOORD_0');
  const canQuad = quads && uvAttr && n && !uvAttr.getNormalized();
  const uv = uvAttr?.getArray() ?? null;
  let total = 0;
  for (const card of cardsOf(prim)) {
    const vertices = canQuad ? [...new Set(card.flatMap((t) => [index[t], index[t + 1], index[t + 2]]))] : null;
    total += canQuad && quadFor(card, vertices, index, p, n, uv, alpha) ? 2 : card.length;
  }
  return total;
}

/**
 * One foliage level of `prim`, in place: keep `keep` of its cards (all at
 * 1), grow each survivor by `grow` about its centre, and with `quads`
 * turn those that fit into quads. The quads go into a new primitive on
 * the same mesh, which is returned; the cards that stay triangles remain
 * on `prim`, for the caller to simplify as level 0 is.
 * @param {import('@gltf-transform/core').Document} doc
 * @param {import('@gltf-transform/core').Mesh} mesh
 * @param {import('@gltf-transform/core').Primitive} prim
 * @param {{keep?: number, grow?: number, quads?: boolean, alpha?: {width: number, height: number, data: Uint8Array, cutoff: number}|null}} [options] - `alpha` is the cut-out (see `alphaOf`): a quad that would show mostly other cards stays triangles
 * @returns {import('@gltf-transform/core').Primitive|null} The quads' primitive, or null when there is none
 */
export function foliageLevel(doc, mesh, prim, { keep = 1, grow = 1, quads = false, alpha = null } = {}) {
  const indices = prim.getIndices();
  const position = prim.getAttribute('POSITION');
  const normalAttr = prim.getAttribute('NORMAL');
  const uvAttr = prim.getAttribute('TEXCOORD_0');
  // A quad is fitted from position and uv; any other attribute (a vertex
  // colour, a second uv set) it carries as the card's average.
  const extras = prim.listSemantics().filter((s) => s !== 'POSITION' && s !== 'NORMAL' && s !== 'TEXCOORD_0').map((semantic) => {
    const accessor = prim.getAttribute(semantic);
    return { semantic, accessor, size: accessor.getElementSize(), values: [], element: [] };
  });
  const canQuad = quads && uvAttr && normalAttr && !uvAttr.getNormalized();
  const index = indices.getArray();
  const p = position.getArray().slice();
  const n = normalAttr?.getArray() ?? null;
  const uv = uvAttr?.getArray() ?? null;
  const cards = cardsOf(prim);
  const stay = [];
  const quadPositions = [], quadNormals = [], quadUVs = [], quadIndices = [];
  const moved = new Uint8Array(position.getCount());
  cards.forEach((card, ordinal) => {
    if (keep < 1 && cardHash(ordinal) >= keep) return;
    const vertices = [...new Set(card.flatMap((t) => [index[t], index[t + 1], index[t + 2]]))];
    const quad = canQuad ? quadFor(card, vertices, index, p, n, uv, alpha) : null;
    if (quad) {
      const centre = [0, 1, 2].map((k) => quad.corners.reduce((sum, c) => sum + c.position[k], 0) / 4);
      const base = quadPositions.length / 3;
      for (const corner of quad.corners) {
        quadPositions.push(...corner.position.map((x, k) => centre[k] + (x - centre[k]) * grow));
        quadNormals.push(...quad.normal);
        quadUVs.push(...corner.uv);
      }
      // Wound to agree with the normal: a two-sided leaf's renderer takes the
      // winding to tell its front from its back and turns the normal for a
      // back face, so a quad wound against its normal shades with a normal
      // facing away, its Fresnel goes to one, and it mirrors the sky white.
      const [a, b, , d] = quad.corners.map((corner) => corner.position);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const agrees = face[0] * quad.normal[0] + face[1] * quad.normal[1] + face[2] * quad.normal[2] >= 0;
      if (agrees) quadIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else quadIndices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      for (const extra of extras) {
        const mean = new Array(extra.size).fill(0);
        for (const i of vertices) {
          extra.accessor.getElement(i, extra.element);
          for (let k = 0; k < extra.size; k++) mean[k] += extra.element[k] / vertices.length;
        }
        for (let corner = 0; corner < 4; corner++) extra.values.push(mean);
      }
      return;
    }
    // Kept as triangles, grown about its centre.
    if (grow !== 1) {
      const centre = [0, 1, 2].map((k) => vertices.reduce((sum, i) => sum + p[i * 3 + k], 0) / vertices.length);
      for (const i of vertices) {
        if (moved[i]) continue;
        moved[i] = 1;
        for (let k = 0; k < 3; k++) p[i * 3 + k] = centre[k] + (p[i * 3 + k] - centre[k]) * grow;
      }
    }
    for (const t of card) stay.push(index[t], index[t + 1], index[t + 2]);
  });
  // Fresh accessors: the clone's may be shared with another primitive.
  prim.setAttribute('POSITION', position.clone().setArray(p));
  prim.setIndices(indices.clone().setArray(new index.constructor(stay)));
  if (!quadIndices.length) return null;
  const buffer = position.getBuffer();
  const accessor = (array, type) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const out = doc.createPrimitive()
    .setMaterial(prim.getMaterial())
    .setAttribute('POSITION', accessor(new Float32Array(quadPositions), 'VEC3'))
    .setAttribute('NORMAL', accessor(new Float32Array(quadNormals), 'VEC3'))
    .setAttribute('TEXCOORD_0', accessor(new Float32Array(quadUVs), 'VEC2'))
    .setIndices(accessor(quadPositions.length / 3 > 65535 ? new Uint32Array(quadIndices) : new Uint16Array(quadIndices), 'SCALAR'));
  for (const extra of extras) {
    // The source's own type and normalization, element by element.
    const out_ = extra.accessor.clone().setArray(new (extra.accessor.getArray().constructor)(extra.values.length * extra.size));
    extra.values.forEach((value, i) => out_.setElement(i, value));
    out.setAttribute(extra.semantic, out_);
  }
  mesh.addPrimitive(out);
  return out;
}
