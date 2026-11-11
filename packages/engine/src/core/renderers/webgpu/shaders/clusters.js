import { CLUSTER_X, CLUSTER_Y, CLUSTER_Z, CLUSTER_CAPACITY } from './constants.js';
import { COMMON } from './chunks/frame.js';

/**
 * Light clustering. One invocation per cluster: build the cluster's
 * view-space bounding box, then keep every light whose sphere reaches
 * it. The fragment shader reads the list back through `clusterOf`.
 *
 * The grid is rebuilt every frame rather than cached against the
 * projection, because it costs one dispatch over 3,456 invocations and
 * caching it would mean tracking every change to the lens, the surface
 * size and the light set.
 */
export const LIGHT_CLUSTER_SHADER = /* wgsl */ `
${COMMON}

@group(1) @binding(0) var<storage, read_write> countsOut: array<u32>;
@group(1) @binding(1) var<storage, read_write> indicesOut: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let cluster = id.x;
  if (cluster >= CLUSTER_X * CLUSTER_Y * CLUSTER_Z) { return; }
  let tx = cluster % CLUSTER_X;
  let ty = (cluster / CLUSTER_X) % CLUSTER_Y;
  let tz = cluster / (CLUSTER_X * CLUSTER_Y);

  // The slice's depth range, exponential between the near and far planes.
  let near = max(frame.lens.z, 1e-4);
  let far = max(frame.lens.w, near * 1.001);
  let ratio = far / near;
  let zNear = near * pow(ratio, f32(tz) / f32(CLUSTER_Z));
  let zFar = near * pow(ratio, f32(tz + 1u) / f32(CLUSTER_Z));

  // The tile's edges in NDC. Rows run down the screen, to match the
  // fragment's framebuffer coordinates in clusterOf.
  let xLo = f32(tx) / f32(CLUSTER_X) * 2.0 - 1.0;
  let xHi = f32(tx + 1u) / f32(CLUSTER_X) * 2.0 - 1.0;
  let yHi = 1.0 - f32(ty) / f32(CLUSTER_Y) * 2.0;
  let yLo = 1.0 - f32(ty + 1u) / f32(CLUSTER_Y) * 2.0;

  // View space: x = ndc.x * lens.x * depth, as viewPosition builds it.
  // The box spans both depths, since the tile widens with distance.
  let xs = vec4f(xLo * frame.lens.x * zNear, xLo * frame.lens.x * zFar, xHi * frame.lens.x * zNear, xHi * frame.lens.x * zFar);
  let ys = vec4f(yLo * frame.lens.y * zNear, yLo * frame.lens.y * zFar, yHi * frame.lens.y * zNear, yHi * frame.lens.y * zFar);
  let lo = vec3f(min(min(xs.x, xs.y), min(xs.z, xs.w)), min(min(ys.x, ys.y), min(ys.z, ys.w)), zNear);
  let hi = vec3f(max(max(xs.x, xs.y), max(xs.z, xs.w)), max(max(ys.x, ys.y), max(ys.z, ys.w)), zFar);

  let count = u32(frame.params2.x);
  var kept = 0u;
  for (var i = 0u; i < count; i++) {
    if (kept >= CLUSTER_CAPACITY) { break; }
    let light = lights[i];
    let view = frame.view * vec4f(light.position.xyz, 1.0);
    // Depth positive along the view direction, as the box is built.
    let centre = vec3f(view.x, view.y, -view.z);
    let delta = centre - clamp(centre, lo, hi);
    let range = light.position.w;
    if (dot(delta, delta) > range * range) { continue; }
    indicesOut[cluster * CLUSTER_CAPACITY + kept] = i;
    kept += 1u;
  }
  countsOut[cluster] = kept;
}
`;
