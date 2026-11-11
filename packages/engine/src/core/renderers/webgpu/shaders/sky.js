import { COMMON } from './chunks/frame.js';

export const SKY_SHADER = /* wgsl */ `
${COMMON}

struct SkyOut {
  @builtin(position) position: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> SkyOut {
  var out: SkyOut;
  out.position = vec4f(fullscreenCorner(i), 1.0, 1.0);
  out.ndc = fullscreenCorner(i);
  return out;
}

struct SkyFragment {
  @location(0) direct: vec4f,
  @location(1) indirect: vec4f,
  @location(2) normalDepth: vec4f,
  @location(3) velocity: vec2f,
};

@fragment
fn fs(in: SkyOut) -> SkyFragment {
  let ndc = in.ndc - frame.jitter.xy;
  let far = frame.inverseViewProjection * vec4f(ndc, 1.0, 1.0);
  let near = frame.inverseViewProjection * vec4f(ndc, 0.0, 1.0);
  let dir = normalize(far.xyz / far.w - near.xyz / near.w);
  var out: SkyFragment;
  out.direct = vec4f(clampHDR(skyColor(dir, true)), 1.0);
  out.indirect = vec4f(0.0);
  // No geometry: depth 0 tells the post passes to leave the sky alone.
  out.normalDepth = vec4f(0.0, 1.0, 0.0, 0.0);
  // The sky moves only with the camera: reproject a point far along the ray.
  let world = frame.camera.xyz + dir * 1.0e4;
  let prev = frame.previousViewProjection * vec4f(world, 1.0);
  out.velocity = (ndc - prev.xy / prev.w) * vec2f(0.5, -0.5);
  return out;
}
`;
