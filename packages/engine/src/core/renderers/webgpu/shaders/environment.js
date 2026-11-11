import { COMMON } from './chunks/frame.js';

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
  // params.w is the cube mip being drawn. A procedural sky is analytic
  // and every mip is exact at any size, but a panorama has detail to
  // lose: reading it at a matching level of its own mip chain is what
  // keeps the small mips from aliasing into sparkle.
  return vec4f(skyColorLod(faceDirection(u32(bake.params.x), in.ndc), false, bake.params.w), 1.0);
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
