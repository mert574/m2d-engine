import { COMMON } from '../chunks/frame.js';
import { POST_COMMON, EXPOSURE, BLOOM_KNEE } from './chunks.js';

/**
 * Bloom's first step: keep what is brighter than the threshold, softly, at
 * half resolution. A smooth knee so a surface just over the threshold does
 * not flicker in and out.
 */
export const BLOOM_PREFILTER_SHADER = /* wgsl */ `
${COMMON}
${POST_COMMON}
${EXPOSURE}
${BLOOM_KNEE}

// A 2x2 box of the source, each tap capped. The cap is the firefly
// guard: one glint cannot become a flickering square of bloom. It is a
// cap and not a brightness weight (Karis) because a weight of 1/(1+L)
// cut a lamp's head to a fifth before the chain began — a street lamp
// or a neon tube is a few bright pixels among dark ones, and those are
// the very pixels bloom is for; the temporal filter upstream already
// steadies them.
const BLOOM_CAP = 32.0;
@fragment
fn fs(in: PostOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let e = exposure();
  var sum = vec3f(0.0);
  for (var y = -1; y <= 1; y += 2) {
    for (var x = -1; x <= 1; x += 2) {
      let c = clampHDR(textureSampleLevel(source, sourceSampler, in.uv + vec2f(f32(x), f32(y)) * texel * 0.5, 0.0).rgb) * e;
      sum += min(c, vec3f(BLOOM_CAP));
    }
  }
  // The optional threshold with its soft knee; 0 lets everything scatter
  // a little, which is what a lens does.
  return vec4f(scatterPart(sum * 0.25), 1.0);
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

/**
 * A 9-tap tent upsample, blended over the level above by the scatter
 * constant: out = scatter * tent(lower) + (1 - scatter) * upper. Each
 * level therefore holds a weighted mean, not a sum — the chain stays at
 * the scene's energy whatever its depth, the composite's share stays a
 * share, and the glow falls off geometrically (a tight core with a long
 * soft tail) instead of every radius weighing the same, which read as a
 * flat milky veil.
 */
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
