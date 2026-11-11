import { COMMON } from '../chunks/frame.js';
import { POST_COMMON } from './chunks.js';

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
