/**
 * WGSL for the 3D renderer: a sky, a shadow pass, a physically based mesh
 * pass lit by the sun, an image-based environment and point and spot
 * lights, and the environment bakes and post passes that feed it. Grown
 * per phase of docs/plans/3d-and-editor.md.
 *
 * Every pass shares the frame uniform and the instance and light storage
 * arrays in group 0. Layouts here must match `INSTANCE_FLOATS` and
 * `LIGHT_FLOATS` in frame3d.js. Colour is linear and high range all the
 * way to the composite pass, which tonemaps and encodes for the canvas.
 */

/** Sun shadow cascades the frame uniform has room for. */
export const MAX_CASCADES = 4;

/** Spot lights that may cast a shadow map at once. */
export const MAX_SPOT_SHADOWS = 4;

/** Floats in the frame uniform, in the order `Frame` declares them. */
export const FRAME_UNIFORM_FLOATS = 16 * 3 + 16 * MAX_CASCADES + 16 * MAX_SPOT_SHADOWS + 4 * 12 + 4 * 8 + 4 * 2 + 16;

/** Float offsets into the frame uniform of the post-process blocks; see `Frame`. */
export const FRAME_OFFSETS = Object.freeze({
  post: 224, lens: 256, jitter: 260, previousViewProjection: 264
});

/** Floats in a material's uniform, in the order `Material` declares them. */
export const MATERIAL_UNIFORM_FLOATS = 4 * 6;

const COMMON = /* wgsl */ `
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
  // x exposure, y unused, z unused, w unused.
  params: vec4f,
  // x light count, y bloom threshold, z bloom intensity, w prefiltered mip count - 1.
  params2: vec4f,
  // View-space distance where each cascade ends.
  cascadeSplits: vec4f,
  // x cascade count, y sun shadow texel (1/size), z spot shadow texel, w normal offset in texels.
  shadowParams: vec4f,
  // Half-extent of each cascade's orthographic box, in metres.
  cascadeRadii: vec4f,
  // x bias in metres, y the cascades' reach back toward the sun in metres.
  shadowBias: vec4f,
  // Post-process settings; see Frame3D.post and the pass that reads each.
  // post[0]: x taa blend, y ao radius (m), z ao intensity, w ao on.
  // post[1]: x dof focus distance (m), y focal length (mm), z dof max blur (px), w dof on.
  // post[2]: x motion blur strength, y vignette, z grain, w time (s).
  // post[3]: x auto exposure on, y key, z min exposure, w max exposure.
  // post[4]: x saturation, y contrast, z temperature, w lut on.
  // post[5]: x adaptation speed, y frame delta (s), z taa on, w motion blur on.
  // post[6]: x dof f-stop. post[7]: unused.
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
  // x cos inner cone, y cos outer cone, z shadow layer + 1 (0: none).
  cone: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
@group(0) @binding(2) var<storage, read> lights: array<Light>;
@group(0) @binding(3) var<storage, read> joints: array<mat4x4f>;
// The cull pass's output: for each pass and group, the indices of the
// instances that survived, in the slots the indirect draw walks.
@group(0) @binding(4) var<storage, read> remap: array<u32>;

// The blend of the four joint matrices a skinned vertex follows.
fn skinMatrix(inst: Instance, j: vec4u, w: vec4f) -> mat4x4f {
  let base = u32(inst.skin.x);
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

// The sky in a direction, in linear light: horizon in the fog colour,
// zenith in the sky colour, haze darkening below the horizon, and the
// sun's halo. The disc itself is drawn only on screen (withSun), since
// the environment handles the sun's specular analytically and a disc in
// the prefiltered cube would be a firefly.
fn skyColor(dir: vec3f, withSun: bool) -> vec3f {
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

// One triangle covering clip space.
fn fullscreenCorner(i: u32) -> vec2f {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return corners[i];
}
`;

export const SKY_SHADER = /* wgsl */ `
${COMMON}

struct SkyOut {
  @builtin(position) position: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> SkyOut {
  var out: SkyOut;
  out.position = vec4f(fullscreenCorner(i), 1.0, 1.0);
  out.ndc = fullscreenCorner(i);
  return out;
}

struct SkyFragment {
  @location(0) direct: vec4f,
  @location(1) indirect: vec4f,
  @location(2) normalDepth: vec4f,
  @location(3) velocity: vec2f,
};

@fragment
fn fs(in: SkyOut) -> SkyFragment {
  let ndc = in.ndc - frame.jitter.xy;
  let far = frame.inverseViewProjection * vec4f(ndc, 1.0, 1.0);
  let near = frame.inverseViewProjection * vec4f(ndc, 0.0, 1.0);
  let dir = normalize(far.xyz / far.w - near.xyz / near.w);
  var out: SkyFragment;
  out.direct = vec4f(clampHDR(skyColor(dir, true)), 1.0);
  out.indirect = vec4f(0.0);
  // No geometry: depth 0 tells the post passes to leave the sky alone.
  out.normalDepth = vec4f(0.0, 1.0, 0.0, 0.0);
  // The sky moves only with the camera: reproject a point far along the ray.
  let world = frame.camera.xyz + dir * 1.0e4;
  let prev = frame.previousViewProjection * vec4f(world, 1.0);
  out.velocity = (ndc - prev.xy / prev.w) * vec2f(0.5, -0.5);
  return out;
}
`;

// A glTF metallic-roughness material: factors multiplied into the
// instance's, and textures that are 1x1 white (or flat blue for the
// normal map) where the material has none. Group 2 of the mesh and
// shadow pipelines.
const MATERIAL = /* wgsl */ `
struct Material {
  baseColor: vec4f,
  // x metallic, y roughness, z normal scale, w alpha cutoff.
  factors: vec4f,
  // rgb emissive, w occlusion strength.
  emissive: vec4f,
  // Texture coordinate transform: xy scale, zw offset.
  uvScaleOffset: vec4f,
  // x rotation (radians), y alpha mode (0 opaque, 1 mask, 2 blend), z 1 when the material has a normal map, w 1 when double sided.
  flags: vec4f,
  // x dielectric reflectance at normal incidence (0.04 for glTF's default ior 1.5, times KHR_materials_specular's factor).
  specular: vec4f,
};
@group(2) @binding(0) var<uniform> material: Material;
@group(2) @binding(1) var materialSampler: sampler;
@group(2) @binding(2) var baseColorTexture: texture_2d<f32>;
@group(2) @binding(3) var metallicRoughnessTexture: texture_2d<f32>;
@group(2) @binding(4) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(5) var normalTexture: texture_2d<f32>;
@group(2) @binding(6) var occlusionTexture: texture_2d<f32>;

// KHR_texture_transform: scale, then rotate, then offset.
fn materialUV(uv: vec2f) -> vec2f {
  let r = material.flags.x;
  let c = cos(r);
  let s = sin(r);
  let scaled = uv * material.uvScaleOffset.xy;
  return vec2f(c * scaled.x + s * scaled.y, -s * scaled.x + c * scaled.y) + material.uvScaleOffset.zw;
}

// Alpha-tested materials drop the fragment below the cutoff. A blended
// material is treated as a mask at its cutoff for now: foliage reads
// right, glass does not, and proper transparency is its own phase.
fn alphaTest(alpha: f32) {
  if (material.flags.y > 0.5 && alpha < material.factors.w) { discard; }
}
`;

const meshVertex = (skinned) => /* wgsl */ `
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) instance: u32,
  // This frame's and last frame's clip positions, unjittered, for velocity.
  @location(4) clipNow: vec4f,
  @location(5) clipPrev: vec4f,
  // World-space tangent, handedness in w.
  @location(6) tangent: vec4f,
};

@vertex
fn vs(
  @builtin(instance_index) instanceIndex: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) tangent: vec4f${skinned ? `,
  @location(4) jointIndices: vec4u,
  @location(5) jointWeights: vec4f` : ''}
) -> VertexOut {
  let index = remap[instanceIndex];
  let inst = instances[index];
  ${skinned ? `
  let skin = skinMatrix(inst, jointIndices, jointWeights);
  let local = skin * vec4f(position, 1.0);
  let localNormal = (skin * vec4f(normal, 0.0)).xyz;
  let localTangent = (skin * vec4f(tangent.xyz, 0.0)).xyz;` : `
  let local = vec4f(position, 1.0);
  let localNormal = normal;
  let localTangent = tangent.xyz;`}
  let world = inst.model * local;
  var out: VertexOut;
  let clip = frame.viewProjection * world;
  out.position = clip;
  out.worldPosition = world.xyz;
  out.normal = inst.normal * localNormal;
  out.tangent = vec4f(inst.normal * localTangent, tangent.w);
  out.uv = uv;
  out.instance = index;
  out.clipNow = vec4f(clip.xy - frame.jitter.xy * clip.w, clip.zw);
  out.clipPrev = frame.previousViewProjection * inst.previousModel * local;
  return out;
}
`;

const shadowShader = (skinned) => /* wgsl */ `
${COMMON}
${MATERIAL}

// The light's view-projection for this pass: one cascade or one spot.
@group(1) @binding(0) var<uniform> lightViewProjection: mat4x4f;

struct ShadowOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(
  @builtin(instance_index) instanceIndex: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f${skinned ? `,
  @location(3) jointIndices: vec4u,
  @location(4) jointWeights: vec4f` : ''}
) -> ShadowOut {
  let inst = instances[remap[instanceIndex]];
  ${skinned ? 'let local = skinMatrix(inst, jointIndices, jointWeights) * vec4f(position, 1.0);' : 'let local = vec4f(position, 1.0);'}
  var out: ShadowOut;
  out.position = lightViewProjection * inst.model * local;
  out.uv = uv;
  return out;
}

// Depth only; a leaf's cut-out edge casts a cut-out shadow.
@fragment
fn fs(in: ShadowOut) {
  if (material.flags.y > 0.5) {
    alphaTest(textureSample(baseColorTexture, materialSampler, materialUV(in.uv)).a * material.baseColor.a);
  }
}
`;

export const SHADOW_SHADER = shadowShader(false);
export const SHADOW_SKINNED_SHADER = shadowShader(true);

/** Passes the cull shader can test at once: the camera and every shadow map. */
export const MAX_CULL_PASSES = 1 + MAX_CASCADES + MAX_SPOT_SHADOWS;

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
  // x pass count, y instance count, z group count.
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
    if (p > 0u && inst.skin.w < 0.5) { continue; }
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

const meshShader = (skinned) => /* wgsl */ `
${COMMON}
${meshVertex(skinned)}

@group(1) @binding(0) var sunShadowMaps: texture_depth_2d_array;
@group(1) @binding(1) var shadowSampler: sampler_comparison;
@group(1) @binding(2) var irradianceMap: texture_cube<f32>;
@group(1) @binding(3) var prefilteredMap: texture_cube<f32>;
@group(1) @binding(4) var brdfLut: texture_2d<f32>;
@group(1) @binding(5) var environmentSampler: sampler;
@group(1) @binding(6) var spotShadowMaps: texture_depth_2d_array;

${MATERIAL}

fn distributionGGX(nDotH: f32, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn geometrySmith(nDotV: f32, nDotL: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  let gv = nDotV / (nDotV * (1.0 - k) + k);
  let gl = nDotL / (nDotL * (1.0 - k) + k);
  return gv * gl;
}

fn fresnelSchlick(cosTheta: f32, f0: vec3f) -> vec3f {
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

fn fresnelRoughness(cosTheta: f32, f0: vec3f, roughness: f32) -> vec3f {
  return f0 + (max(vec3f(1.0 - roughness), f0) - f0) * pow(1.0 - cosTheta, 5.0);
}

// A 3x3 percentage-closer lookup in one layer of a shadow array, so edges
// are soft rather than stair-stepped. Outside the map everything is lit.
fn shadowLookup(maps: texture_depth_2d_array, layer: u32, lightSpace: vec4f, texel: f32, depthBias: f32) -> f32 {
  let proj = lightSpace.xyz / lightSpace.w;
  let uv = vec2f(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || proj.z > 1.0 || proj.z < 0.0) { return 1.0; }
  let depth = proj.z - depthBias;
  var lit = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      lit += textureSampleCompareLevel(maps, shadowSampler, uv + vec2f(f32(x), f32(y)) * texel, layer, depth);
    }
  }
  return lit / 9.0;
}

// How much sun reaches a point: 0 in shadow, 1 lit. The cascade is chosen
// by view-space distance; the lookup is offset along the normal by a few
// of that cascade's texels so a lit surface does not shadow itself.
fn sunVisibility(worldPosition: vec3f, normal: vec3f, nDotL: f32) -> f32 {
  let count = u32(frame.shadowParams.x);
  if (count == 0u) { return 1.0; }
  let viewDepth = -(frame.view * vec4f(worldPosition, 1.0)).z;
  var splits = frame.cascadeSplits;
  var radii = frame.cascadeRadii;
  var cascade = count;
  for (var i = 0u; i < count; i++) {
    if (viewDepth <= splits[i]) { cascade = i; break; }
  }
  if (cascade >= count) { return 1.0; }
  let radius = radii[cascade];
  let texelWorld = radius * 2.0 * frame.shadowParams.y;
  let offset = normal * texelWorld * frame.shadowParams.w * (1.0 + 2.0 * (1.0 - nDotL));
  let lightSpace = frame.cascades[cascade] * vec4f(worldPosition + offset, 1.0);
  // The orthographic depth range is the reach back plus two radii; the
  // bias is metres over that.
  let range = max(radius * 2.0, frame.shadowBias.y) + radius * 2.0;
  let depthBias = frame.shadowBias.x * (1.0 + 2.0 * (1.0 - nDotL)) / range;
  return shadowLookup(sunShadowMaps, cascade, lightSpace, frame.shadowParams.y, depthBias);
}

// How much of a shadowed spot reaches a point, through its perspective map.
fn spotVisibility(layer: u32, worldPosition: vec3f, normal: vec3f, nDotL: f32) -> f32 {
  let offset = normal * frame.shadowBias.x * (1.0 + 2.0 * (1.0 - nDotL));
  let lightSpace = frame.spotShadows[layer] * vec4f(worldPosition + offset, 1.0);
  // Perspective depth is non-linear; the slope-scaled bias of the shadow
  // pipeline carries most of the work, this is a hair on top.
  return shadowLookup(spotShadowMaps, layer, lightSpace, frame.shadowParams.z, 0.0005);
}

// Cook-Torrance for one light arriving along l with the given radiance.
fn shade(n: vec3f, v: vec3f, l: vec3f, radiance: vec3f, base: vec3f, f0: vec3f, metallic: f32, roughness: f32) -> vec3f {
  let h = normalize(v + l);
  let nDotL = max(dot(n, l), 0.0);
  let nDotV = max(dot(n, v), 1e-4);
  let nDotH = max(dot(n, h), 0.0);
  let hDotV = max(dot(h, v), 0.0);
  let d = distributionGGX(nDotH, roughness);
  let g = geometrySmith(nDotV, nDotL, roughness);
  let f = fresnelSchlick(hDotV, f0);
  let specular = (d * g * f) / max(4.0 * nDotV * nDotL, 1e-4);
  let kd = (vec3f(1.0) - f) * (1.0 - metallic);
  return (kd * base / PI + specular) * radiance * nDotL;
}

// Inverse-square falloff windowed to the light's range, so a light ends
// smoothly where its range ends instead of being cut off.
fn falloff(distance: f32, range: f32) -> f32 {
  let d2 = max(distance * distance, 1e-4);
  let window = clamp(1.0 - pow(distance / range, 4.0), 0.0, 1.0);
  return (window * window) / d2;
}

struct MeshFragment {
  @location(0) direct: vec4f,
  @location(1) indirect: vec4f,
  @location(2) normalDepth: vec4f,
  @location(3) velocity: vec2f,
};

@fragment
fn fs(in: VertexOut, @builtin(front_facing) frontFacing: bool) -> MeshFragment {
  let inst = instances[in.instance];
  let uv = materialUV(in.uv);
  let baseSample = textureSample(baseColorTexture, materialSampler, uv);
  alphaTest(baseSample.a * material.baseColor.a);
  let v = normalize(frame.camera.xyz - in.worldPosition);
  // A double-sided surface faces the viewer from either side.
  var geometricNormal = normalize(in.normal);
  if (material.flags.w > 0.5 && !frontFacing) { geometricNormal = -geometricNormal; }
  var n = geometricNormal;
  if (material.flags.z > 0.5) {
    // Tangent-space normal map, scaled in xy and rebuilt in the vertex frame.
    let t = normalize(in.tangent.xyz - geometricNormal * dot(geometricNormal, in.tangent.xyz));
    let b = cross(geometricNormal, t) * in.tangent.w;
    var mapped = textureSample(normalTexture, materialSampler, uv).xyz * 2.0 - 1.0;
    mapped = vec3f(mapped.xy * material.factors.z, mapped.z);
    n = normalize(t * mapped.x + b * mapped.y + geometricNormal * mapped.z);
  }

  let mrSample = textureSample(metallicRoughnessTexture, materialSampler, uv);
  let emissiveSample = textureSample(emissiveTexture, materialSampler, uv);
  let occlusion = mix(1.0, textureSample(occlusionTexture, materialSampler, uv).r, material.emissive.w);
  var base = inst.color.rgb * material.baseColor.rgb * baseSample.rgb;
  let checker = inst.params.w;
  if (checker > 0.0) {
    let cell = floor(in.worldPosition.xz / checker);
    let odd = (cell.x + cell.y) - 2.0 * floor((cell.x + cell.y) * 0.5);
    base = mix(base, base * 0.72, odd);
  }
  // glTF packs roughness in green and metallic in blue.
  let metallic = clamp(inst.params.x * material.factors.x * mrSample.b, 0.0, 1.0);
  var roughness = clamp(inst.params.y * material.factors.y * mrSample.g, 0.04, 1.0);
  // Specular anti-aliasing (Tokuyoshi and Kaplanyan): where the normal
  // changes quickly across a pixel, a sharp highlight is smaller than the
  // pixel and shimmers as it moves. Widening the lobe by the normal's
  // variation over the pixel steadies it at no visible cost on flat areas.
  let dndx = dpdx(n);
  let dndy = dpdy(n);
  let variance = 0.25 * (dot(dndx, dndx) + dot(dndy, dndy));
  let kernel = min(2.0 * variance, 0.18);
  roughness = sqrt(clamp(roughness * roughness + kernel, 0.0, 1.0));

  let f0 = mix(vec3f(material.specular.x), base, metallic);
  let nDotV = max(dot(n, v), 1e-4);

  // The sun, shadowed.
  let l = -normalize(frame.sunDirection.xyz);
  let sun = frame.sunColor.rgb * frame.sunDirection.w;
  let visibility = sunVisibility(in.worldPosition, n, max(dot(n, l), 0.0));
  var color = shade(n, v, l, sun * visibility, base, f0, metallic, roughness);

  // Point and spot lights.
  let lightCount = u32(frame.params2.x);
  for (var i = 0u; i < lightCount; i++) {
    let light = lights[i];
    let toLight = light.position.xyz - in.worldPosition;
    let distance = length(toLight);
    if (distance > light.position.w) { continue; }
    let dir = toLight / max(distance, 1e-4);
    var attenuation = falloff(distance, light.position.w);
    if (light.direction.w > 0.5) {
      let cosAngle = dot(-dir, normalize(light.direction.xyz));
      attenuation *= smoothstep(light.cone.y, light.cone.x, cosAngle);
    }
    if (attenuation <= 0.0) { continue; }
    if (light.cone.z > 0.5) {
      attenuation *= spotVisibility(u32(light.cone.z) - 1u, in.worldPosition, n, max(dot(n, dir), 0.0));
      if (attenuation <= 0.0) { continue; }
    }
    color += shade(n, v, dir, light.color.rgb * light.color.w * attenuation, base, f0, metallic, roughness);
  }

  // The environment: diffuse from the irradiance map, specular from the
  // prefiltered map at the roughness's mip, weighted by the split-sum LUT.
  let ambient = frame.sky.w;
  let fr = fresnelRoughness(nDotV, f0, roughness);
  let irradiance = textureSample(irradianceMap, environmentSampler, n).rgb;
  let diffuse = irradiance * base * (1.0 - metallic) * (vec3f(1.0) - fr);
  let r = reflect(-v, n);
  let prefiltered = textureSampleLevel(prefilteredMap, environmentSampler, r, roughness * frame.params2.w).rgb;
  let lut = textureSample(brdfLut, environmentSampler, vec2f(nDotV, roughness)).rg;
  let specular = prefiltered * (fr * lut.x + lut.y);
  // Indirect light goes out on its own so ambient occlusion can scale it
  // and nothing else; fog is applied over both in the resolve pass. The
  // material's own baked occlusion applies here too.
  let indirect = (diffuse + specular) * ambient * occlusion;

  color += base * inst.params.z + material.emissive.rgb * emissiveSample.rgb;

  var out: MeshFragment;
  out.direct = vec4f(clampHDR(color), 1.0);
  out.indirect = vec4f(clampHDR(indirect), 1.0);
  let viewDepth = -(frame.view * vec4f(in.worldPosition, 1.0)).z;
  out.normalDepth = vec4f(n, viewDepth);
  let now = in.clipNow.xy / in.clipNow.w;
  let prev = in.clipPrev.xy / in.clipPrev.w;
  out.velocity = (now - prev) * vec2f(0.5, -0.5);
  return out;
}
`;

export const MESH_SHADER = meshShader(false);
export const MESH_SKINNED_SHADER = meshShader(true);

// === Environment bakes ===

const CUBE_FACE = /* wgsl */ `
struct Bake {
  // x face index, y roughness, z sample count, w source mip.
  params: vec4f,
};
@group(1) @binding(0) var<uniform> bake: Bake;
@group(1) @binding(1) var source: texture_cube<f32>;
@group(1) @binding(2) var sourceSampler: sampler;

struct FaceOut {
  @builtin(position) position: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> FaceOut {
  var out: FaceOut;
  out.position = vec4f(fullscreenCorner(i), 0.0, 1.0);
  out.ndc = fullscreenCorner(i);
  return out;
}

// The world direction through a texel of cube face \`face\`, in WebGPU's
// face order (+x, -x, +y, -y, +z, -z) and orientation.
fn faceDirection(face: u32, ndc: vec2f) -> vec3f {
  let u = ndc.x;
  let v = -ndc.y;
  switch face {
    case 0u: { return normalize(vec3f(1.0, v, -u)); }
    case 1u: { return normalize(vec3f(-1.0, v, u)); }
    case 2u: { return normalize(vec3f(u, 1.0, -v)); }
    case 3u: { return normalize(vec3f(u, -1.0, v)); }
    case 4u: { return normalize(vec3f(u, v, 1.0)); }
    default: { return normalize(vec3f(-u, v, -1.0)); }
  }
}

fn radicalInverse(bits0: u32) -> f32 {
  var bits = bits0;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(i: u32, count: u32) -> vec2f {
  return vec2f(f32(i) / f32(count), radicalInverse(i));
}

fn tangentFrame(n: vec3f) -> mat3x3f {
  var up = vec3f(0.0, 0.0, 1.0);
  if (abs(n.z) > 0.999) { up = vec3f(1.0, 0.0, 0.0); }
  let t = normalize(cross(up, n));
  let b = cross(n, t);
  return mat3x3f(t, b, n);
}
`;

/** Paints the sky into one cube face. */
export const SKY_BAKE_SHADER = /* wgsl */ `
${COMMON}
${CUBE_FACE}

@fragment
fn fs(in: FaceOut) -> @location(0) vec4f {
  return vec4f(skyColor(faceDirection(u32(bake.params.x), in.ndc), false), 1.0);
}
`;

/**
 * GGX-prefilters the source cube for one roughness into one face:
 * Karis's split-sum convolution, sampling a blurrier source mip for the
 * wider lobes to keep noise down.
 */
export const PREFILTER_SHADER = /* wgsl */ `
${COMMON}
${CUBE_FACE}

@fragment
fn fs(in: FaceOut) -> @location(0) vec4f {
  let n = faceDirection(u32(bake.params.x), in.ndc);
  let roughness = bake.params.y;
  let count = u32(bake.params.z);
  if (roughness < 0.01) {
    return vec4f(textureSampleLevel(source, sourceSampler, n, 0.0).rgb, 1.0);
  }
  let frameTBN = tangentFrame(n);
  let a = roughness * roughness;
  var sum = vec3f(0.0);
  var weight = 0.0;
  for (var i = 0u; i < count; i++) {
    let xi = hammersley(i, count);
    let phi = 2.0 * PI * xi.x;
    let cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
    let h = frameTBN * vec3f(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
    let l = normalize(2.0 * dot(n, h) * h - n);
    let nDotL = dot(n, l);
    if (nDotL > 0.0) {
      sum += textureSampleLevel(source, sourceSampler, l, bake.params.w).rgb * nDotL;
      weight += nDotL;
    }
  }
  return vec4f(sum / max(weight, 1e-4), 1.0);
}
`;

/** Cosine-convolves the source cube into one irradiance face. */
export const IRRADIANCE_SHADER = /* wgsl */ `
${COMMON}
${CUBE_FACE}

@fragment
fn fs(in: FaceOut) -> @location(0) vec4f {
  let n = faceDirection(u32(bake.params.x), in.ndc);
  let count = u32(bake.params.z);
  let frameTBN = tangentFrame(n);
  var sum = vec3f(0.0);
  for (var i = 0u; i < count; i++) {
    let xi = hammersley(i, count);
    let phi = 2.0 * PI * xi.x;
    let cosTheta = sqrt(1.0 - xi.y);
    let sinTheta = sqrt(xi.y);
    let l = frameTBN * vec3f(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
    sum += textureSampleLevel(source, sourceSampler, l, bake.params.w).rgb;
  }
  // Cosine-weighted samples: the estimator of the irradiance integral is
  // the plain mean (the PDF's cos/pi cancels the integrand's), times pi for
  // the Lambert BRDF's 1/pi to meet in the shader.
  return vec4f(sum / f32(count), 1.0);
}
`;

/** The split-sum BRDF lookup: scale and bias on F0 by (n.v, roughness). */
export const BRDF_LUT_SHADER = /* wgsl */ `
${COMMON}
${CUBE_FACE}

fn geometrySmithIBL(nDotV: f32, nDotL: f32, roughness: f32) -> f32 {
  let k = (roughness * roughness) / 2.0;
  let gv = nDotV / (nDotV * (1.0 - k) + k);
  let gl = nDotL / (nDotL * (1.0 - k) + k);
  return gv * gl;
}

@fragment
fn fs(in: FaceOut) -> @location(0) vec4f {
  let nDotV = max(in.ndc.x * 0.5 + 0.5, 1e-3);
  let roughness = max(0.5 - in.ndc.y * 0.5, 0.02);
  let v = vec3f(sqrt(1.0 - nDotV * nDotV), 0.0, nDotV);
  let n = vec3f(0.0, 0.0, 1.0);
  let count = u32(bake.params.z);
  let a = roughness * roughness;
  var scale = 0.0;
  var bias = 0.0;
  for (var i = 0u; i < count; i++) {
    let xi = hammersley(i, count);
    let phi = 2.0 * PI * xi.x;
    let cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
    let h = vec3f(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
    let l = normalize(2.0 * dot(v, h) * h - v);
    let nDotL = max(l.z, 0.0);
    let nDotH = max(h.z, 0.0);
    let vDotH = max(dot(v, h), 0.0);
    if (nDotL > 0.0) {
      let g = geometrySmithIBL(nDotV, nDotL, roughness);
      let gVis = (g * vDotH) / max(nDotH * nDotV, 1e-4);
      let fc = pow(1.0 - vDotH, 5.0);
      scale += (1.0 - fc) * gVis;
      bias += fc * gVis;
    }
  }
  return vec4f(scale / f32(count), bias / f32(count), 0.0, 1.0);
}
`;

// === Post ===

const POST_COMMON = /* wgsl */ `
struct PostOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> PostOut {
  var out: PostOut;
  let c = fullscreenCorner(i);
  out.position = vec4f(c, 0.0, 1.0);
  out.uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
  return out;
}

@group(1) @binding(0) var source: texture_2d<f32>;
@group(1) @binding(1) var sourceSampler: sampler;
`;

/**
 * Exposure this frame: the scene's, or the auto-exposure adaptation when
 * that is on, in which case the scene steers with the key instead.
 */
const EXPOSURE = /* wgsl */ `
@group(1) @binding(2) var exposureTexture: texture_2d<f32>;
fn exposure() -> f32 {
  if (frame.post[3].x > 0.5) {
    return textureLoad(exposureTexture, vec2u(0u, 0u), 0).r;
  }
  return frame.params.x;
}
`;

/**
 * Bloom's first step: keep what is brighter than the threshold, softly, at
 * half resolution. A smooth knee so a surface just over the threshold does
 * not flicker in and out.
 */
export const BLOOM_PREFILTER_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
${EXPOSURE}

// A 2x2 box of the source, each tap weighted down by its brightness
// (Karis) so one hot pixel cannot become a flickering square of bloom.
@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let e = exposure();
  var sum = vec3f(0.0);
  var weight = 0.0;
  for (var y = -1; y <= 1; y += 2) {
    for (var x = -1; x <= 1; x += 2) {
      let c = clampHDR(textureSampleLevel(source, sourceSampler, in.uv + vec2f(f32(x), f32(y)) * texel * 0.5, 0.0).rgb) * e;
      let w = 1.0 / (1.0 + luminance(c));
      sum += c * w;
      weight += w;
    }
  }
  var color = sum / weight;
  // An optional threshold with a soft knee; 0 lets everything scatter a
  // little, which is what a lens does.
  let threshold = frame.params2.y;
  if (threshold > 0.0) {
    let knee = threshold * 0.5;
    let brightness = max(color.r, max(color.g, color.b));
    var soft = brightness - threshold + knee;
    soft = clamp(soft, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    color *= max(soft, brightness - threshold) / max(brightness, 1e-4);
  }
  return vec4f(color, 1.0);
}
`;

/**
 * Ambient occlusion from the depth and normal buffer, at half resolution:
 * a normal-oriented hemisphere of samples in view space, each counted as
 * occluding when the surface at its screen position is in front of it,
 * with a range check so distant geometry does not darken a silhouette.
 */
export const AO_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}

const SAMPLES = 12u;

// A fixed hemisphere kernel, weighted toward the centre.
fn kernel(i: u32) -> vec3f {
  var k = array<vec3f, 12>(
    vec3f(0.04, 0.06, 0.08), vec3f(-0.12, 0.05, 0.10), vec3f(0.10, -0.14, 0.12),
    vec3f(-0.18, -0.10, 0.20), vec3f(0.25, 0.12, 0.16), vec3f(-0.08, 0.30, 0.22),
    vec3f(0.32, -0.26, 0.30), vec3f(-0.38, 0.14, 0.36), vec3f(0.20, 0.42, 0.40),
    vec3f(-0.30, -0.44, 0.48), vec3f(0.54, 0.20, 0.52), vec3f(-0.22, 0.58, 0.60));
  return k[i];
}

fn hash(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let nd = textureSampleLevel(source, sourceSampler, in.uv, 0.0);
  let depth = nd.w;
  if (depth <= 0.0) { return vec4f(1.0); }
  let p = viewPosition(in.uv, depth);
  let n = normalize((frame.view * vec4f(nd.xyz, 0.0)).xyz);
  let radius = frame.post[0].y;
  // A random rotation about the normal per pixel; the blur evens it out.
  let angle = hash(floor(in.position.xy)) * 6.2831853;
  var tangent = normalize(cross(n, vec3f(0.0, 0.0, 1.0) + vec3f(1e-3, 0.0, 0.0)));
  let c = cos(angle);
  let s2 = sin(angle);
  let bitangent = cross(n, tangent);
  let t = tangent * c + bitangent * s2;
  let b = cross(n, t);
  var occlusion = 0.0;
  for (var i = 0u; i < SAMPLES; i++) {
    let k = kernel(i);
    let samplePos = p + (t * k.x + b * k.y + n * k.z) * radius;
    // Project back to the screen.
    let sampleDepth = -samplePos.z;
    let ndc = vec2f(samplePos.x / (frame.lens.x * sampleDepth), samplePos.y / (frame.lens.y * sampleDepth));
    let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { continue; }
    let sceneDepth = textureSampleLevel(source, sourceSampler, uv, 0.0).w;
    if (sceneDepth <= 0.0) { continue; }
    let rangeCheck = smoothstep(0.0, 1.0, radius / max(abs(depth - sceneDepth), 1e-4));
    if (sceneDepth < sampleDepth - 0.02) { occlusion += rangeCheck; }
  }
  let ao = 1.0 - (occlusion / f32(SAMPLES)) * frame.post[0].z;
  return vec4f(clamp(ao, 0.0, 1.0));
}
`;

/** A 4x4 box blur of the occlusion that stays within the surface, by depth. */
export const AO_BLUR_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
@group(1) @binding(2) var normalDepth: texture_2d<f32>;

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let depth = textureSampleLevel(normalDepth, sourceSampler, in.uv, 0.0).w;
  if (depth <= 0.0) { return vec4f(1.0); }
  var sum = 0.0;
  var weight = 0.0;
  for (var y = -2; y < 2; y++) {
    for (var x = -2; x < 2; x++) {
      let uv = in.uv + (vec2f(f32(x), f32(y)) + 0.5) * texel;
      let d = textureSampleLevel(normalDepth, sourceSampler, uv, 0.0).w;
      let w = select(0.0, 1.0, abs(d - depth) < depth * 0.1);
      sum += textureSampleLevel(source, sourceSampler, uv, 0.0).r * w;
      weight += w;
    }
  }
  return vec4f(select(1.0, sum / weight, weight > 0.0));
}
`;

/** Direct plus occluded indirect light, then fog by depth: the lit frame. */
export const RESOLVE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
@group(1) @binding(2) var indirect: texture_2d<f32>;
@group(1) @binding(3) var ao: texture_2d<f32>;
@group(1) @binding(4) var normalDepth: texture_2d<f32>;

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let direct = textureSampleLevel(source, sourceSampler, in.uv, 0.0).rgb;
  let ambient = textureSampleLevel(indirect, sourceSampler, in.uv, 0.0).rgb;
  var occlusion = 1.0;
  if (frame.post[0].w > 0.5) { occlusion = textureSampleLevel(ao, sourceSampler, in.uv, 0.0).r; }
  var color = direct + ambient * occlusion;
  let depth = textureSampleLevel(normalDepth, sourceSampler, in.uv, 0.0).w;
  if (depth > 0.0) {
    let distance = length(viewPosition(in.uv, depth));
    let fogAmount = 1.0 - exp(-frame.fog.w * distance);
    color = mix(color, frame.fog.rgb, fogAmount);
  }
  return vec4f(color, 1.0);
}
`;

/**
 * Temporal anti-aliasing. The main pass is jittered by a sub-pixel offset
 * each frame; this blends the new frame with the history reprojected
 * through the velocity buffer, after clamping the history to the new
 * frame's 3x3 colour range so a moving object leaves no ghost.
 */
export const TAA_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
@group(1) @binding(2) var history: texture_2d<f32>;
@group(1) @binding(3) var velocity: texture_2d<f32>;

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let texel = 1.0 / frame.jitter.zw;
  let current = clampHDR(textureSampleLevel(source, sourceSampler, in.uv, 0.0).rgb);
  let v = textureSampleLevel(velocity, sourceSampler, in.uv, 0.0).xy;
  let prevUV = in.uv - v;
  if (frame.post[0].x >= 1.0 || any(prevUV < vec2f(0.0)) || any(prevUV > vec2f(1.0))) {
    return vec4f(current, 1.0);
  }
  var mean = vec3f(0.0);
  var sq = vec3f(0.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let c = clampHDR(textureSampleLevel(source, sourceSampler, in.uv + vec2f(f32(x), f32(y)) * texel, 0.0).rgb);
      mean += c;
      sq += c * c;
    }
  }
  mean /= 9.0;
  let sigma = sqrt(max(sq / 9.0 - mean * mean, vec3f(0.0)));
  let lo = mean - sigma * 1.25;
  let hi = mean + sigma * 1.25;
  // Clamped as well: a history texel that is not finite would otherwise
  // survive the clip below (every comparison with it is false) and leak
  // into its neighbours each frame.
  var hist = clampHDR(textureSampleLevel(history, sourceSampler, prevUV, 0.0).rgb);
  // Clip the history toward the current mean, keeping it inside the box.
  let centre = (lo + hi) * 0.5;
  let extent = (hi - lo) * 0.5 + 1e-4;
  let offset = hist - centre;
  let unit = abs(offset / extent);
  let maxUnit = max(unit.x, max(unit.y, unit.z));
  if (maxUnit > 1.0) { hist = centre + offset / maxUnit; }
  // Faster convergence where the image moves, so edges do not smear.
  let speed = length(v * frame.jitter.zw);
  let alpha = clamp(frame.post[0].x + speed * 0.02, frame.post[0].x, 0.5);
  return vec4f(mix(hist, current, alpha), 1.0);
}
`;

const DOF_COC = /* wgsl */ `
// The circle of confusion of a point at depth, in pixels, from a thin
// lens: the aperture A = f / N, in sensor millimetres, scaled to the
// screen by the sensor's 24 mm height. Negative in front of the focus.
fn circleOfConfusion(depth: f32) -> f32 {
  if (depth <= 0.0) { return frame.post[1].z; }
  let focus = frame.post[1].x;
  let f = frame.post[1].y * 0.001;
  let aperture = f / frame.post[6].x;
  let mm = aperture * f * (depth - focus) / (depth * max(focus - f, 1e-3)) * 1000.0;
  let px = mm * (frame.jitter.w / 24.0);
  return clamp(px, -frame.post[1].z, frame.post[1].z);
}
`;

/**
 * Depth of field, first step: the frame at half resolution with each
 * pixel's signed circle of confusion in alpha. The circle of the four
 * full-resolution pixels is the nearest one, so a thin in-focus edge is
 * not smeared by its blurred surroundings. The colour is a brightness-
 * weighted mean (Karis), as bloom's is: a single sun glint averaged
 * plainly would be gathered by the sparse spiral below as a ring of dots
 * around it, visible wherever the surroundings are dark.
 */
export const DOF_DOWN_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
${DOF_COC}
@group(1) @binding(2) var normalDepth: texture_2d<f32>;

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let texel = 1.0 / frame.jitter.zw;
  var color = vec3f(0.0);
  var weight = 0.0;
  var coc = 1e9;
  for (var y = -1; y <= 1; y += 2) {
    for (var x = -1; x <= 1; x += 2) {
      let uv = in.uv + vec2f(f32(x), f32(y)) * texel * 0.5;
      let sample = clampHDR(textureSampleLevel(source, sourceSampler, uv, 0.0).rgb);
      let w = 1.0 / (1.0 + luminance(sample));
      color += sample * w;
      weight += w;
      let c = circleOfConfusion(textureSampleLevel(normalDepth, sourceSampler, uv, 0.0).w);
      if (abs(c) < abs(coc)) { coc = c; }
    }
  }
  return vec4f(color / weight, coc);
}
`;

const DOF_GATHER = /* wgsl */ `
// Forty-eight taps on three concentric rings (8, 16 and 24), so a point
// light out of focus becomes a clean disc, as it does through a lens, and
// not the grain a scattered spiral leaves. Offsets in half-resolution
// pixels; the inner ring sits at a third of the radius.
const TAPS = 48u;
fn tap(i: u32, radius: f32) -> vec2f {
  var ring = 3.0;
  var index = f32(i) - 24.0;
  var count = 24.0;
  if (i < 8u) { ring = 1.0; index = f32(i); count = 8.0; }
  else if (i < 24u) { ring = 2.0; index = f32(i) - 8.0; count = 16.0; }
  // Each ring turned by a different fraction so the taps do not line up.
  let angle = (index + ring * 0.37) / count * 2.0 * PI;
  return vec2f(cos(angle), sin(angle)) * (radius * ring / 3.0);
}

// How much a tap's colour counts, beyond its geometric reach: bright taps
// count for less, so a tap that lands on a highlight does not come back
// as a dot where the surroundings are dark.
fn tapWeight(c: vec3f) -> f32 {
  return 1.0 / (1.0 + luminance(c) * 0.25);
}
`;

/**
 * The widest circles in each 8x8 tile of the half-resolution frame: far in
 * red, near in green, in half-resolution pixels. The near gather reads
 * them so it only spreads where something in front of the focus can
 * reach, and stays out of a sharp pixel entirely otherwise.
 */
export const DOF_TILE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let size = textureDimensions(source);
  let origin = vec2u(in.position.xy) * 8u;
  var far = 0.0;
  var near = 0.0;
  for (var y = 0u; y < 8u; y++) {
    for (var x = 0u; x < 8u; x++) {
      let p = min(origin + vec2u(x, y), size - vec2u(1u));
      let coc = textureLoad(source, p, 0).a * 0.5;
      far = max(far, coc);
      near = max(near, -coc);
    }
  }
  return vec4f(far, near, 0.0, 1.0);
}
`;

/** Each tile takes the widest circle of its neighbours too, so a blur reaches across a tile edge. */
export const DOF_DILATE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(source));
  let centre = vec2i(in.position.xy);
  var widest = vec2f(0.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let p = clamp(centre + vec2i(x, y), vec2i(0), size - vec2i(1));
      widest = max(widest, textureLoad(source, p, 0).rg);
    }
  }
  return vec4f(widest, 0.0, 1.0);
}
`;

/**
 * The far field: taps behind the focus gather onto a pixel when their own
 * circle reaches it, but never with a circle wider than the pixel's own,
 * so a blurred background does not bleed over a sharp edge in front of it.
 * A pixel whose own circle is under a full-resolution pixel is left
 * alone, in alpha 0, and the combine keeps the sharp frame there.
 */
export const DOF_FAR_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
${DOF_GATHER}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let centre = textureSampleLevel(source, sourceSampler, in.uv, 0.0);
  let own = max(centre.a, 0.0) * 0.5;
  if (own < 0.5) { return vec4f(centre.rgb, 0.0); }
  let centreWeight = tapWeight(centre.rgb);
  var sum = centre.rgb * centreWeight;
  var weight = centreWeight;
  for (var i = 0u; i < TAPS; i++) {
    let offset = tap(i, own);
    let dist = length(offset);
    let s = textureSampleLevel(source, sourceSampler, in.uv + offset * texel, 0.0);
    let reach = min(max(s.a, 0.0) * 0.5, own);
    let w = clamp(reach - dist + 1.0, 0.0, 1.0) * tapWeight(s.rgb);
    sum += s.rgb * w;
    weight += w;
  }
  return vec4f(sum / weight, 1.0);
}
`;

/**
 * The near field: taps in front of the focus spread over whatever is
 * behind them, including a sharp subject, which is how a foreground blur
 * looks through a real lens. The gather radius is the widest near circle
 * in the pixel's dilated tile, so a tile with nothing near in it costs
 * one texture read and changes nothing. Alpha is the share of the disc
 * whose taps reach the pixel: 1 inside a near object, falling across its
 * blurred edge, 0 where nothing near can reach.
 */
export const DOF_NEAR_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
${DOF_GATHER}
@group(1) @binding(2) var tiles: texture_2d<f32>;

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let radius = textureSampleLevel(tiles, sourceSampler, in.uv, 0.0).g;
  if (radius < 0.5) { return vec4f(0.0); }
  let texel = 1.0 / vec2f(textureDimensions(source));
  var sum = vec3f(0.0);
  var weight = 0.0;
  var coverage = 0.0;
  for (var i = 0u; i < TAPS; i++) {
    let offset = tap(i, radius);
    let dist = length(offset);
    let s = textureSampleLevel(source, sourceSampler, in.uv + offset * texel, 0.0);
    let near = max(-s.a, 0.0) * 0.5;
    // A tap reaches this pixel when its own circle is at least a full
    // pixel wide and spans the distance; anything less is in focus.
    let cover = clamp(near - dist + 0.5, 0.0, 1.0) * step(0.5, near);
    let w = cover * tapWeight(s.rgb);
    sum += s.rgb * w;
    weight += w;
    coverage += cover;
  }
  if (weight <= 0.0) { return vec4f(0.0); }
  return vec4f(sum / weight, clamp(coverage / f32(TAPS), 0.0, 1.0));
}
`;

/**
 * The frame in focus, the far field behind it and the near field over it.
 * In-focus pixels are the sharp frame, untouched: the far field enters
 * only past a full pixel of circle, fully by three, and the near field
 * only where its coverage says something in front reaches.
 */
export const DOF_COMBINE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
${DOF_COC}
@group(1) @binding(2) var normalDepth: texture_2d<f32>;
@group(1) @binding(3) var farField: texture_2d<f32>;
@group(1) @binding(4) var nearField: texture_2d<f32>;

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let sharp = textureSampleLevel(source, sourceSampler, in.uv, 0.0).rgb;
  let coc = circleOfConfusion(textureSampleLevel(normalDepth, sourceSampler, in.uv, 0.0).w);
  let far = textureSampleLevel(farField, sourceSampler, in.uv, 0.0);
  let near = textureSampleLevel(nearField, sourceSampler, in.uv, 0.0);
  let farAmount = smoothstep(1.0, 3.0, max(coc, 0.0)) * far.a;
  var color = mix(sharp, far.rgb, farAmount);
  color = mix(color, near.rgb, near.a);
  return vec4f(color, 1.0);
}
`;

/** Per-object motion blur: taps along the pixel's velocity, clamped to a sane length. */
export const MOTION_BLUR_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
@group(1) @binding(2) var velocity: texture_2d<f32>;

const TAPS = 8u;

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  var v = textureSampleLevel(velocity, sourceSampler, in.uv, 0.0).xy * frame.post[2].x;
  let px = v * frame.jitter.zw;
  let len = length(px);
  let maxLen = 24.0;
  if (len > maxLen) { v *= maxLen / len; }
  if (len < 0.5) { return textureSampleLevel(source, sourceSampler, in.uv, 0.0); }
  var sum = vec3f(0.0);
  for (var i = 0u; i < TAPS; i++) {
    let t = (f32(i) + 0.5) / f32(TAPS) - 0.5;
    sum += textureSampleLevel(source, sourceSampler, in.uv + v * t, 0.0).rgb;
  }
  return vec4f(sum / f32(TAPS), 1.0);
}
`;

/** The frame's average log luminance, as one texel, from a coarse grid of taps. */
export const LUMINANCE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  var sum = 0.0;
  for (var y = 0u; y < 24u; y++) {
    for (var x = 0u; x < 24u; x++) {
      let uv = (vec2f(f32(x), f32(y)) + 0.5) / 24.0;
      sum += log(max(luminance(clampHDR(textureSampleLevel(source, sourceSampler, uv, 0.0).rgb)), 1e-4));
    }
  }
  return vec4f(exp(sum / 576.0), 0.0, 0.0, 1.0);
}
`;

/** Auto-exposure adaptation: ease the exposure toward the one that puts the average at the key. */
export const ADAPT_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
@group(1) @binding(2) var previous: texture_2d<f32>;

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let average = textureLoad(source, vec2u(0u, 0u), 0).r;
  let wanted = clamp(frame.post[3].y / max(average, 1e-4), frame.post[3].z, frame.post[3].w);
  let prev = textureLoad(previous, vec2u(0u, 0u), 0).r;
  let k = 1.0 - exp(-frame.post[5].y * frame.post[5].x);
  var e = prev + (wanted - prev) * k;
  if (prev <= 0.0) { e = wanted; }
  return vec4f(e, 0.0, 0.0, 1.0);
}
`;

/**
 * The last pass: the frame plus its bloom, exposed, tonemapped with
 * Narkowicz's fit of the ACES curve, graded, vignetted, grained and encoded
 * for the canvas, which is a plain unorm format expecting sRGB values.
 */
export const COMPOSITE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
${EXPOSURE}
@group(1) @binding(3) var bloom: texture_2d<f32>;
@group(1) @binding(4) var lut: texture_2d<f32>;

fn tonemap(color: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
}

// A 16x16x16 LUT laid out as a 256x16 strip: blue picks the tile.
fn applyLut(c: vec3f) -> vec3f {
  let tile = c.b * 15.0;
  let t0 = floor(tile);
  let t1 = min(t0 + 1.0, 15.0);
  let u = (c.r * 15.0 + 0.5) / 256.0;
  let v = (c.g * 15.0 + 0.5) / 16.0;
  let a = textureSampleLevel(lut, sourceSampler, vec2f(u + t0 / 16.0, v), 0.0).rgb;
  let b = textureSampleLevel(lut, sourceSampler, vec2f(u + t1 / 16.0, v), 0.0).rgb;
  return mix(a, b, tile - t0);
}

fn hash(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let e = exposure();
  var color = textureSampleLevel(source, sourceSampler, in.uv, 0.0).rgb * e;
  // Bloom replaces a share of the light rather than adding to it, so a
  // bright frame does not get brighter still; the chain is normalised, so
  // the share is the intensity.
  color = mix(color, textureSampleLevel(bloom, sourceSampler, in.uv, 0.0).rgb, frame.params2.z);
  // Temperature before tonemapping: warm pushes red up and blue down.
  let temperature = frame.post[4].z;
  color *= vec3f(1.0 + temperature * 0.2, 1.0, 1.0 - temperature * 0.2);
  color = tonemap(color);
  // Contrast about middle grey and saturation, in display range.
  color = (color - 0.5) * frame.post[4].y + 0.5;
  let grey = luminance(color);
  color = mix(vec3f(grey), color, frame.post[4].x);
  color = clamp(color, vec3f(0.0), vec3f(1.0));
  if (frame.post[4].w > 0.5) { color = applyLut(color); }
  // Vignette: a soft darkening toward the corners.
  let d = (in.uv - 0.5) * vec2f(1.0, frame.jitter.w / frame.jitter.z);
  color *= 1.0 - frame.post[2].y * smoothstep(0.3, 0.9, length(d) * 1.4);
  // Film grain, changing every frame.
  let grain = hash(in.position.xy + fract(frame.post[2].w * 61.0) * 1000.0) - 0.5;
  color += grain * frame.post[2].z;
  return vec4f(pow(clamp(color, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
}
`;
/** A 13-tap downsample (Jimenez), the step between bloom levels. */
export const BLOOM_DOWNSAMPLE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let x = texel.x;
  let y = texel.y;
  let a = textureSampleLevel(source, sourceSampler, in.uv + vec2f(-2.0 * x, 2.0 * y), 0.0).rgb;
  let b = textureSampleLevel(source, sourceSampler, in.uv + vec2f(0.0, 2.0 * y), 0.0).rgb;
  let c = textureSampleLevel(source, sourceSampler, in.uv + vec2f(2.0 * x, 2.0 * y), 0.0).rgb;
  let d = textureSampleLevel(source, sourceSampler, in.uv + vec2f(-2.0 * x, 0.0), 0.0).rgb;
  let e = textureSampleLevel(source, sourceSampler, in.uv, 0.0).rgb;
  let f = textureSampleLevel(source, sourceSampler, in.uv + vec2f(2.0 * x, 0.0), 0.0).rgb;
  let g = textureSampleLevel(source, sourceSampler, in.uv + vec2f(-2.0 * x, -2.0 * y), 0.0).rgb;
  let h = textureSampleLevel(source, sourceSampler, in.uv + vec2f(0.0, -2.0 * y), 0.0).rgb;
  let i = textureSampleLevel(source, sourceSampler, in.uv + vec2f(2.0 * x, -2.0 * y), 0.0).rgb;
  let j = textureSampleLevel(source, sourceSampler, in.uv + vec2f(-x, y), 0.0).rgb;
  let k = textureSampleLevel(source, sourceSampler, in.uv + vec2f(x, y), 0.0).rgb;
  let l = textureSampleLevel(source, sourceSampler, in.uv + vec2f(-x, -y), 0.0).rgb;
  let m = textureSampleLevel(source, sourceSampler, in.uv + vec2f(x, -y), 0.0).rgb;
  var sum = e * 0.125;
  sum += (a + c + g + i) * 0.03125;
  sum += (b + d + f + h) * 0.0625;
  sum += (j + k + l + m) * 0.125;
  return vec4f(sum, 1.0);
}
`;

/** A 9-tap tent upsample, added onto the level above with additive blending. */
export const BLOOM_UPSAMPLE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let x = texel.x;
  let y = texel.y;
  var sum = textureSampleLevel(source, sourceSampler, in.uv, 0.0).rgb * 4.0;
  sum += textureSampleLevel(source, sourceSampler, in.uv + vec2f(-x, 0.0), 0.0).rgb * 2.0;
  sum += textureSampleLevel(source, sourceSampler, in.uv + vec2f(x, 0.0), 0.0).rgb * 2.0;
  sum += textureSampleLevel(source, sourceSampler, in.uv + vec2f(0.0, -y), 0.0).rgb * 2.0;
  sum += textureSampleLevel(source, sourceSampler, in.uv + vec2f(0.0, y), 0.0).rgb * 2.0;
  sum += textureSampleLevel(source, sourceSampler, in.uv + vec2f(-x, -y), 0.0).rgb;
  sum += textureSampleLevel(source, sourceSampler, in.uv + vec2f(x, -y), 0.0).rgb;
  sum += textureSampleLevel(source, sourceSampler, in.uv + vec2f(-x, y), 0.0).rgb;
  sum += textureSampleLevel(source, sourceSampler, in.uv + vec2f(x, y), 0.0).rgb;
  return vec4f(sum / 16.0, 1.0);
}
`;
