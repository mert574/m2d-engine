import { COMMON } from '../chunks/frame.js';
import { POST_COMMON } from './chunks.js';

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
