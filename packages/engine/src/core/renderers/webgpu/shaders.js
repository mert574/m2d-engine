/**
 * WGSL for the 3D renderer. One program so far: a vertex-coloured mesh under
 * one directional light and an ambient term. It is the smallest shader that
 * can show a surface facing the light as brighter than one facing away,
 * which is what "a lit triangle" means and what R0 has to prove.
 *
 * Grown per phase, not ahead of one: materials, textures and real lighting
 * arrive with the phases that need them (see docs/plans/3d-and-editor.md).
 */

/** Floats per vertex: position xyz, normal xyz, colour rgb. */
export const MESH_VERTEX_FLOATS = 9;

/** The frame uniform block, in the order the WGSL struct declares it. */
export const FRAME_UNIFORM_FLOATS = 16 + 4 + 4 + 4;

export const MESH_SHADER = /* wgsl */ `
struct Frame {
  viewProjection: mat4x4f,
  // xyz: the direction the light travels, world space. w unused.
  lightDirection: vec4f,
  lightColor: vec4f,
  ambient: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec3f,
};

@vertex
fn vs(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f
) -> VertexOut {
  var out: VertexOut;
  out.position = frame.viewProjection * vec4f(position, 1.0);
  out.normal = normal;
  out.color = color;
  return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let n = normalize(in.normal);
  let toLight = normalize(-frame.lightDirection.xyz);
  let diffuse = max(dot(n, toLight), 0.0);
  let lit = in.color * (frame.ambient.rgb + frame.lightColor.rgb * diffuse);
  return vec4f(lit, 1.0);
}
`;
