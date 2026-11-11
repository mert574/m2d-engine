import { POINT_SHADOW_NEAR } from '../constants.js';

/**
 * Group 1 of the mesh pipelines (the shadow maps, the environment and
 * their samplers) and how much of each light reaches a point: the sun
 * through its cascades, a spot through its map, a point through its cube.
 */
export const LIGHTING = /* wgsl */ `
@group(1) @binding(0) var sunShadowMaps: texture_depth_2d_array;
@group(1) @binding(1) var shadowSampler: sampler_comparison;
@group(1) @binding(2) var irradianceMap: texture_cube<f32>;
@group(1) @binding(3) var prefilteredMap: texture_cube<f32>;
@group(1) @binding(4) var brdfLut: texture_2d<f32>;
@group(1) @binding(5) var environmentSampler: sampler;
@group(1) @binding(6) var spotShadowMaps: texture_depth_2d_array;
@group(1) @binding(7) var pointShadowMaps: texture_depth_cube_array;

const POINT_SHADOW_NEAR = ${POINT_SHADOW_NEAR};

// A 3x3 percentage-closer lookup in one layer of a shadow array, so edges
// are soft rather than stair-stepped. Outside the map everything is lit.
// Percentage-closer filtering over a disc of radius texels: sixteen
// taps on a golden-angle spiral, each a bilinear compare (the sampler
// filters linearly), so the edge is smooth at any radius up to a few
// texels. A radius under one texel takes the 3x3 of old.
fn shadowLookup(maps: texture_depth_2d_array, layer: u32, lightSpace: vec4f, texel: f32, depthBias: f32, radius: f32) -> f32 {
  let proj = lightSpace.xyz / lightSpace.w;
  let uv = vec2f(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || proj.z > 1.0 || proj.z < 0.0) { return 1.0; }
  let depth = proj.z - depthBias;
  var lit = 0.0;
  if (radius <= 1.0) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        lit += textureSampleCompareLevel(maps, shadowSampler, uv + vec2f(f32(x), f32(y)) * texel, layer, depth);
      }
    }
    return lit / 9.0;
  }
  for (var k = 0u; k < 16u; k++) {
    let r = sqrt((f32(k) + 0.5) / 16.0) * radius;
    let a = f32(k) * 2.39996323;
    lit += textureSampleCompareLevel(maps, shadowSampler, uv + vec2f(cos(a), sin(a)) * r * texel, layer, depth);
  }
  return lit / 16.0;
}

// The sun's penumbra, in metres: one width in every cascade, so a shadow
// is as soft at thirty metres as at three. It was a fixed 3x3 of texels,
// whose size doubles from one cascade to the next, so the softness jumped
// at every split — four steps within thirty metres of the camera.
const SUN_PENUMBRA = 0.06;
// The share of each cascade, at its far end, blended into the next, so a
// split is a gradient rather than a line; the last cascade fades to lit.
const CASCADE_BLEND = 0.15;

fn cascadeVisibility(cascade: u32, worldPosition: vec3f, normal: vec3f, nDotL: f32) -> f32 {
  var radii = frame.cascadeRadii;
  let radius = radii[cascade];
  let texelWorld = radius * 2.0 * frame.shadowParams.y;
  let offset = normal * texelWorld * frame.shadowParams.w * (1.0 + 2.0 * (1.0 - nDotL));
  let lightSpace = frame.cascades[cascade] * vec4f(worldPosition + offset, 1.0);
  // The orthographic depth range is the reach back plus two radii; the
  // bias is metres over that. A wider filter reaches further across a
  // sloped receiver, so the bias grows with the slope times the penumbra.
  let range = max(radius * 2.0, frame.shadowBias.y) + radius * 2.0;
  let filterRadius = max(SUN_PENUMBRA, texelWorld);
  let slope = min(sqrt(max(1.0 - nDotL * nDotL, 0.0)) / max(nDotL, 0.05), 3.0);
  let depthBias = (frame.shadowBias.x * (1.0 + 2.0 * (1.0 - nDotL)) + filterRadius * slope * 0.5) / range;
  return shadowLookup(sunShadowMaps, cascade, lightSpace, frame.shadowParams.y, depthBias, filterRadius / texelWorld);
}

// How much sun reaches a point: 0 in shadow, 1 lit. The cascade is chosen
// by view-space distance, and across the far end of each the next one is
// blended in.
fn sunVisibility(worldPosition: vec3f, normal: vec3f, nDotL: f32) -> f32 {
  let count = u32(frame.shadowParams.x);
  if (count == 0u) { return 1.0; }
  let viewDepth = -(frame.view * vec4f(worldPosition, 1.0)).z;
  var splits = frame.cascadeSplits;
  var cascade = count;
  for (var i = 0u; i < count; i++) {
    if (viewDepth <= splits[i]) { cascade = i; break; }
  }
  if (cascade >= count) { return 1.0; }
  let start = select(0.0, splits[max(cascade, 1u) - 1u], cascade > 0u);
  let end = splits[cascade];
  let band = (end - start) * CASCADE_BLEND;
  let t = smoothstep(end - band, end, viewDepth);
  let here = cascadeVisibility(cascade, worldPosition, normal, nDotL);
  if (t <= 0.0) { return here; }
  let next = select(1.0, cascadeVisibility(min(cascade + 1u, count - 1u), worldPosition, normal, nDotL), cascade + 1u < count);
  return mix(here, next, t);
}

// How much of a shadowed spot reaches a point, through its perspective map.
fn spotVisibility(layer: u32, worldPosition: vec3f, normal: vec3f, nDotL: f32) -> f32 {
  let offset = normal * frame.shadowBias.x * (1.0 + 2.0 * (1.0 - nDotL));
  let lightSpace = frame.spotShadows[layer] * vec4f(worldPosition + offset, 1.0);
  // Perspective depth is non-linear; the slope-scaled bias of the shadow
  // pipeline carries most of the work, this is a hair on top.
  return shadowLookup(spotShadowMaps, layer, lightSpace, frame.shadowParams.z, 0.0005, 1.0);
}

/**
 * How much of a shadowed point light reaches a place, through its cube.
 *
 * A cube needs no matrix here. Every face was drawn with the same 90
 * degree frustum, so the depth stored for a point is a function of its
 * distance along whichever axis dominates the direction to it, and
 * that function inverts: rebuild the depth the face would have written
 * and compare. Six matrices in the frame uniform, and the face
 * selection to go with them, are what this avoids.
 */
fn pointVisibility(cube: u32, worldPosition: vec3f, lightPosition: vec3f, range: f32, normal: vec3f, nDotL: f32) -> f32 {
  // Push off the surface along its normal first, as the other two do:
  // a grazing surface self-shadows into acne otherwise.
  let offset = normal * frame.shadowBias.x * (1.0 + 2.0 * (1.0 - nDotL));
  let toFragment = worldPosition + offset - lightPosition;
  // The face that saw this direction looked down its dominant axis, so
  // that component is the view depth the projection was given.
  let axis = max(abs(toFragment.x), max(abs(toFragment.y), abs(toFragment.z)));
  if (axis <= POINT_SHADOW_NEAR) { return 1.0; }
  // The perspective divide of mat4.perspective(90, 1, near, range),
  // which is zero-to-one and right-handed: far * (d - near) / (d * (far - near)).
  let near = POINT_SHADOW_NEAR;
  let depth = range * (axis - near) / (axis * (range - near));
  let bias = frame.shadowBias.z * (1.0 + 2.0 * (1.0 - nDotL));
  // The same 3x3 percentage-closer filter the flat maps get, in the
  // plane perpendicular to the lookup direction: one face texel at this
  // distance is axis * 2 / size across (the face spans two units of
  // tangent per unit of depth). Without it a cube's edge is one hard
  // bilinear step, which at these face sizes reads as broken.
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(toFragment.y) > abs(toFragment.x) && abs(toFragment.y) > abs(toFragment.z)) { up = vec3f(1.0, 0.0, 0.0); }
  let t = normalize(cross(up, toFragment));
  let b = normalize(cross(toFragment, t));
  let spread = axis * 2.0 * frame.shadowBias.w;
  var lit = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let dir = toFragment + (t * f32(x) + b * f32(y)) * spread;
      lit += textureSampleCompareLevel(pointShadowMaps, shadowSampler, dir, cube, depth - bias);
    }
  }
  return lit / 9.0;
}
`;
