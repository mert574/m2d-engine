/**
 * Morph targets, group 3: position and normal deltas packed six floats a
 * vertex per target, and how many of each there are. An unskinned,
 * morphed instance stores its weight bases (plus one) in the skin slots
 * the joints would have used; a geometry without targets binds an empty
 * group and a zero target count, so the loop never runs.
 */
export const MORPH = /* wgsl */ `
struct MorphInfo { targets: u32, vertices: u32 };
@group(3) @binding(0) var<storage, read> morphDeltas: array<f32>;
@group(3) @binding(1) var<uniform> morphInfo: MorphInfo;

fn morphed(position: vec3f, normal: vec3f, base: f32, vertex: u32) -> array<vec3f, 2> {
  var out = array<vec3f, 2>(position, normal);
  if (base < 0.5) { return out; }
  let first = u32(base) - 1u;
  for (var t = 0u; t < morphInfo.targets; t++) {
    let w = morphWeights[first + t];
    if (abs(w) < 1e-5) { continue; }
    let o = (t * morphInfo.vertices + vertex) * 6u;
    out[0] += w * vec3f(morphDeltas[o], morphDeltas[o + 1u], morphDeltas[o + 2u]);
    out[1] += w * vec3f(morphDeltas[o + 3u], morphDeltas[o + 4u], morphDeltas[o + 5u]);
  }
  return out;
}
`;
