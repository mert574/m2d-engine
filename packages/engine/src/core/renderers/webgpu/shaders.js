/**
 * WGSL for the 3D renderer: a sky, a shadow pass and a physically based
 * mesh pass. Grown per phase of docs/plans/3d-and-editor.md; this is the
 * first shaded picture, not the final renderer.
 *
 * The frame uniform is one struct shared by every pass. The instance
 * buffer is a storage array indexed by `instance_index`; its layout is
 * `INSTANCE_FLOATS` in frame3d.js and must match `Instance` below.
 */

/** Floats in the frame uniform, in the order `Frame` declares them. */
export const FRAME_UNIFORM_FLOATS = 16 * 3 + 4 * 7;

/** Floats in a material's uniform, in the order `Material` declares them. */
export const MATERIAL_UNIFORM_FLOATS = 4 * 3;

const COMMON = /* wgsl */ `
struct Frame {
  viewProjection: mat4x4f,
  lightViewProjection: mat4x4f,
  inverseViewProjection: mat4x4f,
  // xyz eye position.
  camera: vec4f,
  // xyz the direction the light travels; w intensity.
  sunDirection: vec4f,
  sunColor: vec4f,
  // rgb sky ambient; w ambient intensity.
  sky: vec4f,
  ground: vec4f,
  // rgb fog colour; w density.
  fog: vec4f,
  // x exposure, y shadows on, z shadow texel size, w shadow radius.
  params: vec4f,
};

struct Instance {
  model: mat4x4f,
  normal: mat3x3f,
  color: vec4f,
  // x metallic, y roughness, z emissive, w checker size.
  params: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;

// Narkowicz's fit of the ACES filmic curve, then the sRGB transfer, since
// the canvas is a plain unorm format and expects encoded values.
fn tonemap(color: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  let mapped = clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
  return pow(mapped, vec3f(1.0 / 2.2));
}
`;

export const SKY_SHADER = /* wgsl */ `
${COMMON}

struct SkyOut {
  @builtin(position) position: vec4f,
  @location(0) ndc: vec2f,
};

// One triangle covering clip space; the fragment finds its view ray.
@vertex
fn vs(@builtin(vertex_index) i: u32) -> SkyOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: SkyOut;
  out.position = vec4f(corners[i], 1.0, 1.0);
  out.ndc = corners[i];
  return out;
}

@fragment
fn fs(in: SkyOut) -> @location(0) vec4f {
  let far = frame.inverseViewProjection * vec4f(in.ndc, 1.0, 1.0);
  let near = frame.inverseViewProjection * vec4f(in.ndc, 0.0, 1.0);
  let dir = normalize(far.xyz / far.w - near.xyz / near.w);
  let up = clamp(dir.y, -1.0, 1.0);
  // Horizon in the fog colour, zenith in the sky colour, ground a dim earth.
  let zenith = frame.sky.rgb * 1.6;
  let horizon = frame.fog.rgb;
  var color = mix(horizon, zenith, pow(max(up, 0.0), 0.5));
  // Below the horizon the fog darkens rather than turning to earth, so a
  // level's edge meets haze and not a brown band.
  color = mix(color, horizon * 0.45, smoothstep(0.0, -0.25, up));
  // The sun: a bright disc with a soft halo, scattered toward the horizon.
  let toSun = -normalize(frame.sunDirection.xyz);
  let cosAngle = dot(dir, toSun);
  let disc = smoothstep(0.9993, 0.9998, cosAngle);
  let halo = pow(max(cosAngle, 0.0), 24.0) * 0.25;
  color += frame.sunColor.rgb * frame.sunDirection.w * (disc * 2.0 + halo) * step(0.0, up + 0.02);
  return vec4f(tonemap(color * frame.params.x), 1.0);
}
`;

const MESH_VERTEX = /* wgsl */ `
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) instance: u32,
};

@vertex
fn vs(
  @builtin(instance_index) instanceIndex: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f
) -> VertexOut {
  let inst = instances[instanceIndex];
  let world = inst.model * vec4f(position, 1.0);
  var out: VertexOut;
  out.position = frame.viewProjection * world;
  out.worldPosition = world.xyz;
  out.normal = inst.normal * normal;
  out.uv = uv;
  out.instance = instanceIndex;
  return out;
}
`;

export const SHADOW_SHADER = /* wgsl */ `
${COMMON}

@vertex
fn vs(
  @builtin(instance_index) instanceIndex: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f
) -> @builtin(position) vec4f {
  let world = instances[instanceIndex].model * vec4f(position, 1.0);
  return frame.lightViewProjection * world;
}
`;

export const MESH_SHADER = /* wgsl */ `
${COMMON}
${MESH_VERTEX}

@group(1) @binding(0) var shadowMap: texture_depth_2d;
@group(1) @binding(1) var shadowSampler: sampler_comparison;

// A glTF metallic-roughness material: factors multiplied into the
// instance's, and textures that are 1x1 white where the material has none.
struct Material {
  baseColor: vec4f,
  // x metallic, y roughness, z unused, w unused.
  factors: vec4f,
  emissive: vec4f,
};
@group(2) @binding(0) var<uniform> material: Material;
@group(2) @binding(1) var materialSampler: sampler;
@group(2) @binding(2) var baseColorTexture: texture_2d<f32>;
@group(2) @binding(3) var metallicRoughnessTexture: texture_2d<f32>;
@group(2) @binding(4) var emissiveTexture: texture_2d<f32>;

const PI = 3.14159265;

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

// How much sun reaches a point: 0 in shadow, 1 lit, filtered over a 3x3
// tap so edges are soft rather than stair-stepped. The lookup is offset
// along the normal by a texel so a lit surface does not shadow itself.
fn sunVisibility(worldPosition: vec3f, normal: vec3f, nDotL: f32) -> f32 {
  if (frame.params.y < 0.5) { return 1.0; }
  let texelWorld = frame.params.w * 2.0 * frame.params.z;
  let offset = normal * texelWorld * (1.5 + 2.0 * (1.0 - nDotL));
  let lightSpace = frame.lightViewProjection * vec4f(worldPosition + offset, 1.0);
  let proj = lightSpace.xyz / lightSpace.w;
  let uv = vec2f(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || proj.z > 1.0) { return 1.0; }
  let bias = 0.0008 + 0.002 * (1.0 - nDotL);
  let depth = proj.z - bias;
  var lit = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      lit += textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2f(f32(x), f32(y)) * frame.params.z, depth);
    }
  }
  return lit / 9.0;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let inst = instances[in.instance];
  let n = normalize(in.normal);
  let v = normalize(frame.camera.xyz - in.worldPosition);
  let l = -normalize(frame.sunDirection.xyz);
  let h = normalize(v + l);

  let baseSample = textureSample(baseColorTexture, materialSampler, in.uv);
  let mrSample = textureSample(metallicRoughnessTexture, materialSampler, in.uv);
  let emissiveSample = textureSample(emissiveTexture, materialSampler, in.uv);
  var base = inst.color.rgb * material.baseColor.rgb * baseSample.rgb;
  let checker = inst.params.w;
  if (checker > 0.0) {
    let cell = floor(in.worldPosition.xz / checker);
    let odd = (cell.x + cell.y) - 2.0 * floor((cell.x + cell.y) * 0.5);
    base = mix(base, base * 0.72, odd);
  }
  // glTF packs roughness in green and metallic in blue.
  let metallic = clamp(inst.params.x * material.factors.x * mrSample.b, 0.0, 1.0);
  let roughness = clamp(inst.params.y * material.factors.y * mrSample.g, 0.04, 1.0);

  let nDotL = max(dot(n, l), 0.0);
  let nDotV = max(dot(n, v), 1e-4);
  let nDotH = max(dot(n, h), 0.0);
  let hDotV = max(dot(h, v), 0.0);

  let f0 = mix(vec3f(0.04), base, metallic);
  let diffuseColor = base * (1.0 - metallic);

  // Cook-Torrance for the sun.
  let d = distributionGGX(nDotH, roughness);
  let g = geometrySmith(nDotV, nDotL, roughness);
  let f = fresnelSchlick(hDotV, f0);
  let specular = (d * g * f) / max(4.0 * nDotV * nDotL, 1e-4);
  let kd = (vec3f(1.0) - f) * (1.0 - metallic);
  let sun = frame.sunColor.rgb * frame.sunDirection.w;
  let visibility = sunVisibility(in.worldPosition, n, nDotL);
  var color = (kd * base / PI + specular) * sun * nDotL * visibility;

  // Hemisphere ambient: sky from above, ground bounce from below, with a
  // roughness-aware Fresnel term standing in for an environment map.
  let hemi = mix(frame.ground.rgb, frame.sky.rgb, n.y * 0.5 + 0.5) * frame.sky.w;
  let fr = fresnelRoughness(nDotV, f0, roughness);
  color += hemi * diffuseColor * (vec3f(1.0) - fr);
  color += hemi * fr * (1.0 - roughness * 0.7);

  color += base * inst.params.z + material.emissive.rgb * emissiveSample.rgb;

  // Distance fog toward the horizon colour.
  let distance = length(frame.camera.xyz - in.worldPosition);
  let fogAmount = 1.0 - exp(-frame.fog.w * distance);
  color = mix(color, frame.fog.rgb, fogAmount);

  return vec4f(tonemap(color * frame.params.x), 1.0);
}
`;
