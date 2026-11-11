import { COMMON } from '../chunks/frame.js';
import { POST_COMMON, EXPOSURE } from './chunks.js';

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
  // The glow over the frame, by the scene's intensity. The chain is a
  // weighted mean of its levels, so a glow is the lamp's own light spread
  // by the scatter, not a multiplied copy of it; what the threshold kept
  // out contributes nothing, and the tonemapper holds the rest.
  color += textureSampleLevel(bloom, sourceSampler, in.uv, 0.0).rgb * frame.params2.z;
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
