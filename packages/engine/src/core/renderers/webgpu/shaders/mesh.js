import { CLUSTER_CAPACITY } from './constants.js';
import { BRDF } from './chunks/brdf.js';
import { LIGHTING } from './chunks/lighting.js';
import { COMMON } from './chunks/frame.js';
import { MATERIAL } from './chunks/material.js';
import { MORPH } from './chunks/morph.js';

const meshVertex = (skinned) => /* wgsl */ `
${MORPH}
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) instance: u32,
  // This frame's and last frame's clip positions, unjittered, for velocity.
  @location(4) clipNow: vec4f,
  @location(5) clipPrev: vec4f,
  // World-space tangent, handedness in w.
  @location(6) tangent: vec4f,
  @location(7) vertexColor: vec4f,
  // Where world-planar texturing samples: the world position and normal,
  // or, for a body that moves (material.coat.z), its own frame at its own
  // size, so the texture rides with it.
  @location(8) planarPosition: vec3f,
  @location(9) planarNormal: vec3f,
};

@vertex
fn vs(
  @builtin(instance_index) instanceIndex: u32,
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) tangent: vec4f,
  @location(6) color: vec4f${skinned ? `,
  @location(4) jointIndices: vec4u,
  @location(5) jointWeights: vec4f` : ''}
) -> VertexOut {
  let index = remap[instanceIndex];
  let inst = instances[index];
  ${skinned ? `
  let skin = skinMatrix(inst, jointIndices, jointWeights);
  let local = skin * vec4f(position, 1.0);
  let localNormal = (skin * vec4f(normal, 0.0)).xyz;
  let localTangent = (skin * vec4f(tangent.xyz, 0.0)).xyz;
  let previousLocal = previousSkinMatrix(inst, jointIndices, jointWeights) * vec4f(position, 1.0);` : `
  let now = morphed(position, normal, inst.skin.x, vertexIndex);
  let local = vec4f(now[0], 1.0);
  let localNormal = now[1];
  let localTangent = tangent.xyz;
  let previousLocal = vec4f(morphed(position, normal, inst.skin.z, vertexIndex)[0], 1.0);`}
  let time = frame.post[2].w;
  let unbent = inst.model * local;
  let world = vec4f(unbent.xyz + windOffset(unbent.xyz, inst.model[3].xyz, time), 1.0);
  var out: VertexOut;
  let clip = frame.viewProjection * world;
  out.position = clip;
  out.worldPosition = world.xyz;
  out.normal = inst.normal * localNormal;
  out.tangent = vec4f(inst.normal * localTangent, tangent.w);
  out.uv = uv;
  out.instance = index;
  out.clipNow = vec4f(clip.xy - frame.jitter.xy * clip.w, clip.zw);
  // Last frame's bend too, or the motion vectors would miss the wind and TAA would smear it.
  let previous = inst.previousModel * previousLocal;
  let previousWorld = previous.xyz + windOffset(previous.xyz, inst.previousModel[3].xyz, time - frame.post[5].y);
  out.clipPrev = frame.previousViewProjection * vec4f(previousWorld, 1.0);
  out.vertexColor = color;
  let ownFrame = material.coat.z > 0.5;
  let size = vec3f(length(inst.model[0].xyz), length(inst.model[1].xyz), length(inst.model[2].xyz));
  out.planarPosition = select(world.xyz, local.xyz * size, ownFrame);
  out.planarNormal = select(out.normal, localNormal, ownFrame);
  return out;
}
`;

const meshShader = (skinned) => /* wgsl */ `
${COMMON}
${meshVertex(skinned)}

${LIGHTING}

${MATERIAL}

${BRDF}

struct MeshFragment {
  @location(0) direct: vec4f,
  @location(1) indirect: vec4f,
  @location(2) normalDepth: vec4f,
  @location(3) velocity: vec2f,
};

@fragment
fn fs(in: VertexOut, @builtin(front_facing) frontFacing: bool) -> MeshFragment {
  let inst = instances[in.instance];
  var uv = materialUV(in.uv);
  if (material.specular.y > 0.0) {
    let axis = abs(in.planarNormal);
    let p = in.planarPosition / material.specular.y;
    uv = select(select(p.xy, p.xz, axis.y >= axis.x && axis.y >= axis.z), p.yz, axis.x >= axis.y && axis.x >= axis.z);
  }
  // Material lookups take the frame's mip bias: with TAA jittering the
  // sample positions, half a level sharper restores the detail the
  // temporal filter averages away, as every TAA renderer does.
  let mipBias = frame.post[6].y;
  let baseSample = textureSampleBias(baseColorTexture, materialSampler, uv, mipBias);
  alphaTest(baseSample.a * material.baseColor.a, uv);
  let v = normalize(frame.camera.xyz - in.worldPosition);
  // A double-sided surface faces the viewer from either side.
  var geometricNormal = normalize(in.normal);
  if (material.flags.w > 0.5 && !frontFacing) { geometricNormal = -geometricNormal; }
  var n = geometricNormal;
  if (material.flags.z > 0.5) {
    // Tangent-space normal map, scaled in xy and rebuilt in a tangent frame.
    var t = vec3f(1.0, 0.0, 0.0);
    var b = vec3f(0.0, 0.0, -1.0);
    if (material.specular.y > 0.0) {
      // Mapped planar from the world, the frame is the projection's own:
      // the tangent where u grows, the bitangent where v shrinks (a
      // normal map's +Y is the top of its image), whatever the mesh says.
      let axis = abs(in.planarNormal);
      if (axis.x >= axis.y && axis.x >= axis.z) { t = vec3f(0.0, 1.0, 0.0); b = vec3f(0.0, 0.0, -1.0); }
      else if (axis.z > axis.y) { t = vec3f(1.0, 0.0, 0.0); b = vec3f(0.0, -1.0, 0.0); }
      // In a body's own frame the axes turn with it.
      if (material.coat.z > 0.5) {
        t = normalize((inst.model * vec4f(t, 0.0)).xyz);
        b = normalize((inst.model * vec4f(b, 0.0)).xyz);
      }
    } else {
      // The vertex frame, made orthogonal to the normal. A primitive's
      // tangents are zeros, and normalizing a zero vector is undefined:
      // on real GPUs it is a NaN that blacks the pixel out even where a
      // later branch would have replaced it, so the degenerate case is
      // never computed rather than overwritten.
      let along = in.tangent.xyz - geometricNormal * dot(geometricNormal, in.tangent.xyz);
      if (dot(along, along) > 1e-12) {
        t = normalize(along);
        b = cross(geometricNormal, t) * select(1.0, in.tangent.w, in.tangent.w != 0.0);
      } else {
        let helper = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(geometricNormal.y) > 0.9);
        t = normalize(cross(helper, geometricNormal));
        b = cross(geometricNormal, t);
      }
    }
    var mapped = textureSampleBias(normalTexture, materialSampler, uv, mipBias).xyz * 2.0 - 1.0;
    mapped = vec3f(mapped.xy * material.factors.z, mapped.z);
    n = normalize(t * mapped.x + b * mapped.y + geometricNormal * mapped.z);
  }

  let mrSample = textureSampleBias(metallicRoughnessTexture, materialSampler, uv, mipBias);
  let emissiveSample = textureSampleBias(emissiveTexture, materialSampler, uv, mipBias);
  let occlusion = mix(1.0, textureSampleBias(occlusionTexture, materialSampler, uv, mipBias).r, material.emissive.w);
  var base = inst.color.rgb * material.baseColor.rgb * baseSample.rgb * in.vertexColor.rgb;
  let checker = inst.params.w;
  if (checker > 0.0) {
    let cell = floor(in.worldPosition.xz / checker);
    let odd = (cell.x + cell.y) - 2.0 * floor((cell.x + cell.y) * 0.5);
    base = mix(base, base * 0.72, odd);
  }
  // glTF packs roughness in green and metallic in blue.
  let metallic = clamp(inst.params.x * material.factors.x * mrSample.b, 0.0, 1.0);
  var roughness = clamp(inst.params.y * material.factors.y * mrSample.g, 0.04, 1.0);
  // Specular anti-aliasing (Tokuyoshi and Kaplanyan): where the normal
  // changes quickly across a pixel, a sharp highlight is smaller than the
  // pixel and shimmers as it moves. Widening the lobe by the normal's
  // variation over the pixel steadies it at no visible cost on flat areas.
  let dndx = dpdx(n);
  let dndy = dpdy(n);
  let variance = 0.25 * (dot(dndx, dndx) + dot(dndy, dndy));
  let kernel = min(2.0 * variance, 0.18);
  roughness = sqrt(clamp(roughness * roughness + kernel, 0.0, 1.0));

  let f0 = mix(vec3f(material.specular.x), base, metallic);
  let nDotV = max(dot(n, v), 1e-4);
  // The clearcoat: a second, dielectric specular lobe over the base at
  // its own roughness, which dims what it covers by what it reflects.
  let coat = material.coat.x;
  let coatRoughness = clamp(material.coat.y, 0.04, 1.0);
  let coatFresnel = fresnelSchlick(nDotV, vec3f(0.04)).x * coat;

  // The sun, shadowed.
  let l = -normalize(frame.sunDirection.xyz);
  let sun = frame.sunColor.rgb * frame.sunDirection.w;
  let visibility = sunVisibility(in.worldPosition, n, max(dot(n, l), 0.0));
  // Diffuse and specular kept apart until the end: a blended surface
  // covers what is behind it by its diffuse only.
  let sunParts = shadeParts(n, v, l, sun * visibility, base, f0, metallic, roughness);
  var color = sunParts[0];
  var gloss = sunParts[1];
  var coatColor = vec3f(0.0);
  if (coat > 0.0) { coatColor += shade(geometricNormal, v, l, sun * visibility, vec3f(0.0), vec3f(0.04), 1.0, coatRoughness); }

  // Point and spot lights, from this fragment's cluster rather than the
  // whole frame: a fragment shades with the few lights that reach it.
  let viewDepthHere = -(frame.view * vec4f(in.worldPosition, 1.0)).z;
  let cluster = clusterOf(in.position.xy, viewDepthHere);
  let lightCount = clusterCounts[cluster];
  for (var slot = 0u; slot < lightCount; slot++) {
    let i = clusterIndices[cluster * CLUSTER_CAPACITY + slot];
    let light = lights[i];
    let toLight = light.position.xyz - in.worldPosition;
    let distance = length(toLight);
    if (distance > light.position.w) { continue; }
    let dir = toLight / max(distance, 1e-4);
    var attenuation = falloff(distance, light.position.w);
    if (light.direction.w > 0.5) {
      let cosAngle = dot(-dir, normalize(light.direction.xyz));
      attenuation *= smoothstep(light.cone.y, light.cone.x, cosAngle);
    }
    if (attenuation <= 0.0) { continue; }
    if (light.cone.z > 0.5) {
      attenuation *= spotVisibility(u32(light.cone.z) - 1u, in.worldPosition, n, max(dot(n, dir), 0.0));
      if (attenuation <= 0.0) { continue; }
    } else if (light.cone.w > 0.5) {
      // The integer part names the cube, the fraction its strength: a
      // cube newly handed to this lamp blends its shadow in.
      let strength = fract(light.cone.w) * 2.0;
      let seen = pointVisibility(u32(light.cone.w) - 1u, in.worldPosition, light.position.xyz, light.position.w, n, max(dot(n, dir), 0.0));
      attenuation *= mix(1.0, seen, strength);
      if (attenuation <= 0.0) { continue; }
    }
    let parts = shadeParts(n, v, dir, light.color.rgb * light.color.w * attenuation, base, f0, metallic, roughness);
    color += parts[0];
    gloss += parts[1];
    if (coat > 0.0) { coatColor += shade(geometricNormal, v, dir, light.color.rgb * light.color.w * attenuation, vec3f(0.0), vec3f(0.04), 1.0, coatRoughness); }
  }

  // The environment: diffuse from the irradiance map, specular from the
  // prefiltered map at the roughness's mip, weighted by the split-sum LUT.
  let ambient = frame.sky.w;
  let fr = fresnelRoughness(nDotV, f0, roughness);
  let irradiance = textureSample(irradianceMap, environmentSampler, n).rgb;
  let diffuse = irradiance * base * (1.0 - metallic) * (vec3f(1.0) - fr);
  let r = reflect(-v, n);
  let prefiltered = textureSampleLevel(prefilteredMap, environmentSampler, r, roughness * frame.params2.w).rgb;
  let lut = textureSample(brdfLut, environmentSampler, vec2f(nDotV, roughness)).rg;
  let specular = prefiltered * (fr * lut.x + lut.y);
  // Indirect light goes out on its own so ambient occlusion can scale it
  // and nothing else; fog is applied over both in the resolve pass. The
  // material's own baked occlusion applies here too.
  var indirect = diffuse * ambient * occlusion;
  var indirectGloss = specular * ambient * occlusion;
  if (coat > 0.0) {
    // The lacquer's own reflection of the environment, over a base dimmed
    // by what the coat took; the coat follows the smooth surface, not
    // the normal map, as a varnish lies over the grain.
    let coatR = reflect(-v, geometricNormal);
    let coatPrefiltered = textureSampleLevel(prefilteredMap, environmentSampler, coatR, coatRoughness * frame.params2.w).rgb;
    let coatLut = textureSample(brdfLut, environmentSampler, vec2f(nDotV, coatRoughness)).rg;
    let coatSpecular = coatPrefiltered * (0.04 * coatLut.x + coatLut.y) * coat;
    color = color * (1.0 - coatFresnel);
    gloss = gloss * (1.0 - coatFresnel) + coatColor * coat;
    indirect = indirect * (1.0 - coatFresnel);
    indirectGloss = indirectGloss * (1.0 - coatFresnel) + coatSpecular * ambient * occlusion;
  }

  color += base * inst.params.z + material.emissive.rgb * emissiveSample.rgb;

  var out: MeshFragment;
  // A BLEND material carries its coverage out as alpha; the transparent
  // pipeline blends both light targets by it and writes neither the
  // normal-depth nor the velocity, so the resolve's "direct plus
  // indirect times occlusion" stays exact through the blend: the
  // occlusion is one value at this pixel and multiplies out of both
  // sides. The opaque pipelines do not blend, so alpha is ignored there.
  // Premultiplied: the blend adds what this pixel gives and keeps what is
  // behind it by one minus its coverage. Coverage scales the diffuse and
  // the glow, what a surface's substance gives; its reflection it gives
  // whole, as glass reflects however clear it is. Scaling everything by
  // coverage, as plain alpha blending does, made a clear pane a faint
  // white matte layer whose reflection had all but gone; stacked, those
  // layers added up to milk.
  let coverage = select(1.0, baseSample.a * material.baseColor.a * in.vertexColor.a, material.flags.y > 1.5);
  out.direct = vec4f(clampHDR(color * coverage + gloss), coverage);
  out.indirect = vec4f(clampHDR(indirect * coverage + indirectGloss), coverage);
  let viewDepth = -(frame.view * vec4f(in.worldPosition, 1.0)).z;
  out.normalDepth = vec4f(n, viewDepth);
  let now = in.clipNow.xy / in.clipNow.w;
  let prev = in.clipPrev.xy / in.clipPrev.w;
  out.velocity = (now - prev) * vec2f(0.5, -0.5);
  return out;
}
`;

export const MESH_SHADER = meshShader(false);

export const MESH_SKINNED_SHADER = meshShader(true);
