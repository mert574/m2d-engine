import { COMMON } from '../chunks/frame.js';
import { POST_COMMON } from './chunks.js';

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

// The history resampled on a Catmull-Rom spline (the 5-bilinear-tap
// form), not plain bilinear: the history is re-filtered every frame, and
// a bilinear kernel compounds into a visible blur within a few frames
// while Catmull-Rom's negative lobes keep edges where they were. Its
// ringing can undershoot, so the result is floored at zero; the clip box
// below bounds the overshoot.
fn sampleHistoryCatmullRom(uv: vec2f, size: vec2f) -> vec3f {
  let samplePos = uv * size;
  let texPos1 = floor(samplePos - 0.5) + 0.5;
  let f = samplePos - texPos1;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let texel = 1.0 / size;
  let pos0 = (texPos1 - 1.0) * texel;
  let pos3 = (texPos1 + 2.0) * texel;
  let pos12 = (texPos1 + w2 / w12) * texel;
  var sum = textureSampleLevel(history, sourceSampler, vec2f(pos12.x, pos0.y), 0.0).rgb * w12.x * w0.y;
  sum += textureSampleLevel(history, sourceSampler, vec2f(pos0.x, pos12.y), 0.0).rgb * w0.x * w12.y;
  sum += textureSampleLevel(history, sourceSampler, pos12, 0.0).rgb * w12.x * w12.y;
  sum += textureSampleLevel(history, sourceSampler, vec2f(pos3.x, pos12.y), 0.0).rgb * w3.x * w12.y;
  sum += textureSampleLevel(history, sourceSampler, vec2f(pos12.x, pos3.y), 0.0).rgb * w12.x * w3.y;
  let weight = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(sum / weight, vec3f(0.0));
}

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
  var hist = clampHDR(sampleHistoryCatmullRom(prevUV, frame.jitter.zw));
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
