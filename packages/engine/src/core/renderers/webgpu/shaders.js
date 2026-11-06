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

/** Floats in the frame uniform, in the order `Frame` declares them. */
export const FRAME_UNIFORM_FLOATS = 16 * 3 + 4 * 8;

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
  // rgb sky colour; w ambient intensity.
  sky: vec4f,
  ground: vec4f,
  // rgb fog colour; w density.
  fog: vec4f,
  // x exposure, y shadows on, z shadow texel size, w shadow radius.
  params: vec4f,
  // x light count, y bloom threshold, z bloom intensity, w prefiltered mip count - 1.
  params2: vec4f,
};

struct Instance {
  model: mat4x4f,
  normal: mat3x3f,
  color: vec4f,
  // x metallic, y roughness, z emissive, w checker size.
  params: vec4f,
};

struct Light {
  // xyz position; w range.
  position: vec4f,
  // rgb colour; w intensity.
  color: vec4f,
  // xyz the direction a spot points; w 0 point, 1 spot.
  direction: vec4f,
  // x cos inner cone, y cos outer cone.
  cone: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
@group(0) @binding(2) var<storage, read> lights: array<Light>;

const PI = 3.14159265;

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

@fragment
fn fs(in: SkyOut) -> @location(0) vec4f {
  let far = frame.inverseViewProjection * vec4f(in.ndc, 1.0, 1.0);
  let near = frame.inverseViewProjection * vec4f(in.ndc, 0.0, 1.0);
  let dir = normalize(far.xyz / far.w - near.xyz / near.w);
  return vec4f(skyColor(dir, true), 1.0);
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
@group(1) @binding(2) var irradianceMap: texture_cube<f32>;
@group(1) @binding(3) var prefilteredMap: texture_cube<f32>;
@group(1) @binding(4) var brdfLut: texture_2d<f32>;
@group(1) @binding(5) var environmentSampler: sampler;

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

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let inst = instances[in.instance];
  let n = normalize(in.normal);
  let v = normalize(frame.camera.xyz - in.worldPosition);

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

  let f0 = mix(vec3f(0.04), base, metallic);
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
  color += (diffuse + specular) * ambient;

  color += base * inst.params.z + material.emissive.rgb * emissiveSample.rgb;

  // Distance fog toward the horizon colour.
  let distance = length(frame.camera.xyz - in.worldPosition);
  let fogAmount = 1.0 - exp(-frame.fog.w * distance);
  color = mix(color, frame.fog.rgb, fogAmount);

  return vec4f(color, 1.0);
}
`;

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
 * Bloom's first step: keep what is brighter than the threshold, softly, at
 * half resolution. A smooth knee so a surface just over the threshold does
 * not flicker in and out.
 */
export const BLOOM_PREFILTER_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let color = textureSample(source, sourceSampler, in.uv).rgb * frame.params.x;
  let threshold = frame.params2.y;
  let knee = threshold * 0.5;
  let brightness = max(color.r, max(color.g, color.b));
  var soft = brightness - threshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  let contribution = max(soft, brightness - threshold) / max(brightness, 1e-4);
  return vec4f(color * contribution, 1.0);
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
  let a = textureSample(source, sourceSampler, in.uv + vec2f(-2.0 * x, 2.0 * y)).rgb;
  let b = textureSample(source, sourceSampler, in.uv + vec2f(0.0, 2.0 * y)).rgb;
  let c = textureSample(source, sourceSampler, in.uv + vec2f(2.0 * x, 2.0 * y)).rgb;
  let d = textureSample(source, sourceSampler, in.uv + vec2f(-2.0 * x, 0.0)).rgb;
  let e = textureSample(source, sourceSampler, in.uv).rgb;
  let f = textureSample(source, sourceSampler, in.uv + vec2f(2.0 * x, 0.0)).rgb;
  let g = textureSample(source, sourceSampler, in.uv + vec2f(-2.0 * x, -2.0 * y)).rgb;
  let h = textureSample(source, sourceSampler, in.uv + vec2f(0.0, -2.0 * y)).rgb;
  let i = textureSample(source, sourceSampler, in.uv + vec2f(2.0 * x, -2.0 * y)).rgb;
  let j = textureSample(source, sourceSampler, in.uv + vec2f(-x, y)).rgb;
  let k = textureSample(source, sourceSampler, in.uv + vec2f(x, y)).rgb;
  let l = textureSample(source, sourceSampler, in.uv + vec2f(-x, -y)).rgb;
  let m = textureSample(source, sourceSampler, in.uv + vec2f(x, -y)).rgb;
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
  var sum = textureSample(source, sourceSampler, in.uv).rgb * 4.0;
  sum += textureSample(source, sourceSampler, in.uv + vec2f(-x, 0.0)).rgb * 2.0;
  sum += textureSample(source, sourceSampler, in.uv + vec2f(x, 0.0)).rgb * 2.0;
  sum += textureSample(source, sourceSampler, in.uv + vec2f(0.0, -y)).rgb * 2.0;
  sum += textureSample(source, sourceSampler, in.uv + vec2f(0.0, y)).rgb * 2.0;
  sum += textureSample(source, sourceSampler, in.uv + vec2f(-x, -y)).rgb;
  sum += textureSample(source, sourceSampler, in.uv + vec2f(x, -y)).rgb;
  sum += textureSample(source, sourceSampler, in.uv + vec2f(-x, y)).rgb;
  sum += textureSample(source, sourceSampler, in.uv + vec2f(x, y)).rgb;
  return vec4f(sum / 16.0, 1.0);
}
`;

/**
 * The last pass: the frame plus its bloom, exposed, tonemapped with
 * Narkowicz's fit of the ACES curve, and encoded for the canvas, which is
 * a plain unorm format expecting sRGB values.
 */
export const COMPOSITE_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
@group(1) @binding(2) var bloom: texture_2d<f32>;

fn tonemap(color: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  var color = textureSample(source, sourceSampler, in.uv).rgb * frame.params.x;
  color += textureSample(bloom, sourceSampler, in.uv).rgb * frame.params2.z;
  return vec4f(pow(tonemap(color), vec3f(1.0 / 2.2)), 1.0);
}
`;
