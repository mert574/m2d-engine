import { MAX_CULL_PASSES } from './constants.js';
import { COMMON } from './chunks/frame.js';

/**
 * Frustum culling on the GPU, for every pass at once. One invocation per
 * instance: find its group (binary search over the group starts), then
 * for each pass whose six planes it is inside — the camera's for pass 0,
 * a shadow map's after — take a slot from that pass and group's indirect
 * instance count and write the instance's index into the remap list
 * there. The draws read the counts; the vertex shaders read the remap. A
 * non-caster skips the shadow passes.
 */
export const CULL_SHADER = /* wgsl */ `
${COMMON}

struct CullParams {
  // x pass count, y instance count, z group count, w the index of the
  // first shadow pass (every pass before it is a camera view).
  counts: vec4u,
  planes: array<vec4f, ${MAX_CULL_PASSES * 6}>,
};

struct DrawArgs {
  indexCount: u32,
  instanceCount: atomic<u32>,
  firstIndex: u32,
  baseVertex: i32,
  firstInstance: u32,
};

@group(1) @binding(0) var<uniform> cull: CullParams;
@group(1) @binding(1) var<storage, read> groupStarts: array<u32>;
@group(1) @binding(2) var<storage, read_write> args: array<DrawArgs>;
@group(1) @binding(3) var<storage, read_write> remapOut: array<u32>;
// Per group: the screen coverage (fraction of the view's height) an
// instance must be within [x, y) of to be drawn at this level of detail.
@group(1) @binding(4) var<storage, read> groupLod: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let total = cull.counts.y;
  if (i >= total) { return; }
  let inst = instances[i];
  let b = inst.bounds;
  // The group whose range holds i: groupStarts is ascending, with a
  // sentinel equal to total after the last group.
  var lo = 0u;
  var hi = cull.counts.z;
  while (hi - lo > 1u) {
    let mid = (lo + hi) / 2u;
    if (groupStarts[mid] <= i) { lo = mid; } else { hi = mid; }
  }
  let g = lo;
  // Level of detail: how much of the screen's height the sphere covers,
  // from the camera, for every pass alike so a shadow matches its caster.
  let range = groupLod[g];
  let distance = max(length(b.xyz - frame.camera.xyz), 1e-3);
  let coverage = b.w / (distance * frame.lens.y);
  if (coverage < range.x || coverage >= range.y) { return; }
  let passes = cull.counts.x;
  for (var p = 0u; p < passes; p++) {
    // A shadow pass sees only casters; every camera view sees everything.
    if (p >= cull.counts.w && inst.skin.w < 0.5) { continue; }
    var inside = true;
    for (var k = 0u; k < 6u; k++) {
      let plane = cull.planes[p * 6u + k];
      if (dot(plane.xyz, b.xyz) + plane.w < -b.w) { inside = false; break; }
    }
    if (!inside) { continue; }
    let slot = atomicAdd(&args[p * cull.counts.z + g].instanceCount, 1u);
    remapOut[p * total + groupStarts[g] + slot] = i;
  }
}
`;
