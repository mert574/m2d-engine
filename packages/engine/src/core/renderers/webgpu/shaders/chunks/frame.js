import { CLUSTER_X, CLUSTER_Y, CLUSTER_Z, CLUSTER_CAPACITY } from '../constants.js';

export const COMMON = /* wgsl */ `
struct Frame {
  viewProjection: mat4x4f,
  view: mat4x4f,
  inverseViewProjection: mat4x4f,
  // The sun's view-projection per cascade, and each shadowed spot's.
  cascades: array<mat4x4f, 4>,
  spotShadows: array<mat4x4f, 4>,
  // xyz eye position.
  camera: vec4f,
  // xyz the direction the light travels; w intensity.
  sunDirection: vec4f,
  sunColor: vec4f,
  // rgb sky colour; w ambient intensity.
  sky: vec4f,
  ground: vec4f,
  // rgb fog colour; w density.
  fog: vec4f,
  // x exposure, y an HDR environment is bound, z its intensity, w unused.
  params: vec4f,
  // x light count, y bloom threshold, z bloom intensity, w prefiltered mip count - 1.
  params2: vec4f,
  // View-space distance where each cascade ends.
  cascadeSplits: vec4f,
  // x cascade count, y sun shadow texel (1/size), z spot shadow texel, w normal offset in texels.
  shadowParams: vec4f,
  // Half-extent of each cascade's orthographic box, in metres.
  cascadeRadii: vec4f,
  // x bias in metres, y the cascades' reach back toward the sun in
  // metres, z the point-cube depth bias, scaled by the renderer to the
  // cube's texel size so the quality setting carries it, w one texel of
  // a cube face (1/size).
  shadowBias: vec4f,
  // Post-process settings; see Frame3D.post and the pass that reads each.
  // post[0]: x taa blend, y ao radius (m), z ao intensity, w ao on.
  // post[1]: x dof focus distance (m), y focal length (mm), z dof max blur (px), w dof on.
  // post[2]: x motion blur strength, y vignette, z grain, w time (s).
  // post[3]: x auto exposure on, y key, z min exposure, w max exposure.
  // post[4]: x saturation, y contrast, z temperature, w lut on.
  // post[5]: x adaptation speed, y frame delta (s), z taa on, w motion blur on.
  // post[6]: x dof f-stop, y texture mip bias (negative while TAA jitters).
  // post[7]: xy the wind along x and z (direction times strength), z gustiness, w unused.
  post: array<vec4f, 8>,
  // x tan(fov/2) * aspect, y tan(fov/2), z near, w far.
  lens: vec4f,
  // xy the sub-pixel jitter in NDC this frame, zw the world surface size in pixels.
  jitter: vec4f,
  // Last frame's unjittered view-projection, for motion vectors.
  previousViewProjection: mat4x4f,
};

// A point's position in view space, from its screen uv and linear depth.
fn viewPosition(uv: vec2f, depth: f32) -> vec3f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return vec3f(ndc.x * frame.lens.x * depth, ndc.y * frame.lens.y * depth, -depth);
}

fn luminance(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

struct Instance {
  model: mat4x4f,
  normal: mat3x3f,
  color: vec4f,
  // x metallic, y roughness, z emissive, w checker size.
  params: vec4f,
  // Last frame's model matrix, for motion vectors.
  previousModel: mat4x4f,
  // x first joint matrix in the joints array, y 1 when skinned, w 1 when it casts a shadow.
  skin: vec4f,
  // World bounding sphere: xyz centre, w radius. The cull pass tests it.
  bounds: vec4f,
};

struct Light {
  // xyz position; w range.
  position: vec4f,
  // rgb colour; w intensity.
  color: vec4f,
  // xyz the direction a spot points; w 0 point, 1 spot.
  direction: vec4f,
  // x cos inner cone, y cos outer cone, z spot shadow layer + 1 (0:
  // none), w point shadow cube + 1 (0: none) with the shadow's strength
  // packed in the fraction (fract * 2), so a cube handed from one lamp
  // to another fades in instead of popping.
  cone: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
@group(0) @binding(2) var<storage, read> lights: array<Light>;
@group(0) @binding(3) var<storage, read> joints: array<mat4x4f>;
// The cull pass's output: for each pass and group, the indices of the
// instances that survived, in the slots the indirect draw walks.
@group(0) @binding(4) var<storage, read> remap: array<u32>;
// The light cluster pass's output: how many lights reach each cluster,
// and their indices, ${CLUSTER_CAPACITY} slots per cluster.
@group(0) @binding(5) var<storage, read> clusterCounts: array<u32>;
@group(0) @binding(6) var<storage, read> clusterIndices: array<u32>;
// An HDR environment panorama, equirectangular, when the scene loads
// one; a 1x1 black stands in otherwise and frame.params.y says which.
@group(0) @binding(7) var environmentMap: texture_2d<f32>;
@group(0) @binding(8) var environmentMapSampler: sampler;
// Every morphed instance's target weights this frame, then last frame's;
// the instance record carries the bases plus one in its skin slots.
@group(0) @binding(9) var<storage, read> morphWeights: array<f32>;

const CLUSTER_X = ${CLUSTER_X}u;
const CLUSTER_Y = ${CLUSTER_Y}u;
const CLUSTER_Z = ${CLUSTER_Z}u;
const CLUSTER_CAPACITY = ${CLUSTER_CAPACITY}u;

/**
 * The cluster a fragment belongs to: its tile across the screen, and the
 * depth slice its view depth falls in. The slices are spaced
 * exponentially, so the near ones — where a cluster covers little world
 * and lights overlap most — are thin.
 */
fn clusterOf(fragCoord: vec2f, viewDepth: f32) -> u32 {
  let surface = max(frame.jitter.zw, vec2f(1.0));
  let tx = min(u32(max(fragCoord.x, 0.0) / surface.x * f32(CLUSTER_X)), CLUSTER_X - 1u);
  let ty = min(u32(max(fragCoord.y, 0.0) / surface.y * f32(CLUSTER_Y)), CLUSTER_Y - 1u);
  let near = max(frame.lens.z, 1e-4);
  let far = max(frame.lens.w, near * 1.001);
  let slice = log(max(viewDepth, near) / near) / log(far / near) * f32(CLUSTER_Z);
  let tz = min(u32(max(slice, 0.0)), CLUSTER_Z - 1u);
  return (tz * CLUSTER_Y + ty) * CLUSTER_X + tx;
}

// The blend of the four joint matrices a skinned vertex follows.
fn skinMatrix(inst: Instance, j: vec4u, w: vec4f) -> mat4x4f {
  let base = u32(inst.skin.x);
  return joints[base + j.x] * w.x + joints[base + j.y] * w.y + joints[base + j.z] * w.z + joints[base + j.w] * w.w;
}

// The same from last frame's pose, which sits beside this one in the
// buffer. A limb's own motion lives in the difference between the two.
fn previousSkinMatrix(inst: Instance, j: vec4u, w: vec4f) -> mat4x4f {
  let base = u32(inst.skin.z);
  return joints[base + j.x] * w.x + joints[base + j.y] * w.y + joints[base + j.z] * w.z + joints[base + j.w] * w.w;
}

const PI = 3.14159265;

// The brightest value a pass may write. The targets are 16-bit float, whose
// ceiling is 65504; a mirror's sun glint or a grazing GGX lobe can pass
// it, and once a texel holds an infinity every pass that averages it
// (the multisample resolve, the TAA neighbourhood, bloom's weighted mean)
// turns it into NaN and spreads it. Well under the ceiling, so a sum of a
// few clamped texels is still finite, and far above anything exposure
// can show.
const HDR_MAX = 16384.0;
fn clampHDR(c: vec3f) -> vec3f {
  return clamp(c, vec3f(0.0), vec3f(HDR_MAX));
}

// The built-in sky in a direction, in linear light: horizon in the fog
// colour, zenith in the sky colour, haze darkening below the horizon,
// and the sun's halo. The disc itself is drawn only on screen
// (withSun), since the environment handles the sun's specular
// analytically and a disc in the prefiltered cube would be a firefly.
//
// Declared before its callers: WGSL wants a function defined above the
// code that calls it, and Tint's leniency about that is not portable.
fn proceduralSky(dir: vec3f, withSun: bool) -> vec3f {
  let up = clamp(dir.y, -1.0, 1.0);
  let zenith = frame.sky.rgb * 1.6;
  let horizon = frame.fog.rgb;
  var color = mix(horizon, zenith, pow(max(up, 0.0), 0.5));
  color = mix(color, horizon * 0.45, smoothstep(0.0, -0.25, up));
  let toSun = -normalize(frame.sunDirection.xyz);
  let cosAngle = dot(dir, toSun);
  let halo = pow(max(cosAngle, 0.0), 24.0) * 0.25;
  var sun = halo;
  if (withSun) {
    sun += smoothstep(0.9993, 0.9998, cosAngle) * 2.0;
  }
  color += frame.sunColor.rgb * frame.sunDirection.w * sun * step(0.0, up + 0.02);
  return color;
}

/**
 * The sky in a direction. With an HDR environment loaded the panorama
 * is the sky - it already holds its own sun, horizon and clouds, so
 * none of the procedural terms apply - and lod picks how blurred a
 * version to read, which is how the cube bake avoids aliasing its
 * smaller mips. Without one, the analytic gradient above.
 */
fn skyColorLod(dir: vec3f, withSun: bool, lod: f32) -> vec3f {
  if (frame.params.y > 0.5) {
    // Equirectangular: longitude around y, latitude down from the
    // zenith, so v 0 is the top row of the file. The longitude is
    // three.js's and Blender's — the panorama's centre faces +x — so an
    // HDRI's sun lands where its author put it rather than a quarter
    // turn away.
    let uv = vec2f(atan2(dir.z, dir.x) / 6.2831853 + 0.5, acos(clamp(dir.y, -1.0, 1.0)) / 3.14159265);
    return clampHDR(textureSampleLevel(environmentMap, environmentMapSampler, uv, lod).rgb * frame.params.z);
  }
  return proceduralSky(dir, withSun);
}

fn skyColor(dir: vec3f, withSun: bool) -> vec3f {
  return skyColorLod(dir, withSun, 0.0);
}

// One triangle covering clip space.
fn fullscreenCorner(i: u32) -> vec2f {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return corners[i];
}
`;
