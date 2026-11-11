import { COMMON } from '../chunks/frame.js';
import { POST_COMMON } from './chunks.js';

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
