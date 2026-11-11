import { COMMON } from './chunks/frame.js';
import { MATERIAL } from './chunks/material.js';
import { MORPH } from './chunks/morph.js';

const shadowShader = (skinned) => /* wgsl */ `
${COMMON}
${MATERIAL}
${MORPH}

// The light's view-projection for this pass: one cascade or one spot.
@group(1) @binding(0) var<uniform> lightViewProjection: mat4x4f;

struct ShadowOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(
  @builtin(instance_index) instanceIndex: u32,
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f${skinned ? `,
  @location(3) jointIndices: vec4u,
  @location(4) jointWeights: vec4f` : ''}
) -> ShadowOut {
  let inst = instances[remap[instanceIndex]];
  ${skinned
    ? 'let local = skinMatrix(inst, jointIndices, jointWeights) * vec4f(position, 1.0);'
    // Morphed in the shadow too, or the shape would cast its unmorphed self.
    : 'let local = vec4f(morphed(position, normal, inst.skin.x, vertexIndex)[0], 1.0);'}
  var out: ShadowOut;
  // Bent as the mesh pass bends it, so the shadow moves with the tree.
  let unbent = inst.model * local;
  let world = unbent.xyz + windOffset(unbent.xyz, inst.model[3].xyz, frame.post[2].w);
  out.position = lightViewProjection * vec4f(world, 1.0);
  out.uv = uv;
  return out;
}

// Depth only; a leaf's cut-out edge casts a cut-out shadow.
@fragment
fn fs(in: ShadowOut) {
  if (material.flags.y > 0.5) {
    let uv = materialUV(in.uv);
    alphaTest(textureSample(baseColorTexture, materialSampler, uv).a * material.baseColor.a, uv);
  }
}
`;

export const SHADOW_SHADER = shadowShader(false);

export const SHADOW_SKINNED_SHADER = shadowShader(true);
