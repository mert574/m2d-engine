// === Post ===

export const POST_COMMON = /* wgsl */ `
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
 * Exposure this frame: the scene's, or the auto-exposure adaptation when
 * that is on, in which case the scene steers with the key instead.
 */
export const EXPOSURE = /* wgsl */ `
@group(1) @binding(2) var exposureTexture: texture_2d<f32>;
fn exposure() -> f32 {
  if (frame.post[3].x > 0.5) {
    return textureLoad(exposureTexture, vec2u(0u, 0u), 0).r;
  }
  return frame.params.x;
}
`;

/**
 * The share of a colour that scatters into bloom: all of it, or with a
 * threshold only what is brighter, rolled on over a soft knee so a
 * surface just at the line does not flicker in and out.
 */
export const BLOOM_KNEE = /* wgsl */ `
fn scatterPart(color: vec3f) -> vec3f {
  let threshold = frame.params2.y;
  if (threshold <= 0.0) { return color; }
  let knee = threshold * 0.5;
  let brightness = max(color.r, max(color.g, color.b));
  var soft = brightness - threshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  return color * max(soft, brightness - threshold) / max(brightness, 1e-4);
}
`;
