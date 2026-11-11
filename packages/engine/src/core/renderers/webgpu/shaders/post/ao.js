import { COMMON } from '../chunks/frame.js';
import { POST_COMMON } from './chunks.js';

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
