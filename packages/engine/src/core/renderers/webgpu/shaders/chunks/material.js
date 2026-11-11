// A glTF metallic-roughness material: factors multiplied into the
// instance's, and textures that are 1x1 white (or flat blue for the
// normal map) where the material has none. Group 2 of the mesh and
// shadow pipelines.
export const MATERIAL = /* wgsl */ `
struct Material {
  baseColor: vec4f,
  // x metallic, y roughness, z normal scale, w alpha cutoff.
  factors: vec4f,
  // rgb emissive, w occlusion strength.
  emissive: vec4f,
  // Texture coordinate transform: xy scale, zw offset.
  uvScaleOffset: vec4f,
  // x rotation (radians), y alpha mode (0 opaque, 1 mask, 2 blend), z 1 when the material has a normal map, w 1 when double sided.
  flags: vec4f,
  // x dielectric reflectance at normal incidence (0.04 for glTF's default ior 1.5, times KHR_materials_specular's factor).
  // y world metres per texture tile: when set, the textures are mapped
  // planar from the world position along the dominant normal axis — the
  // dev-grid look, the same density on a floor and a wall whatever the
  // mesh's own coordinates say.
  // z 1 for foliage, whose cut-out keeps its coverage down the mip chain (see alphaTest).
  // w how the wind moves it: 0 not at all, 1 it sways (a tree's wood), 2 it sways and flutters (its leaves).
  specular: vec4f,
  // x clearcoat strength, y its roughness: a thin glossy lacquer over the
  // base (car paint, varnish, a wet surface). z, w unused.
  coat: vec4f,
};
@group(2) @binding(0) var<uniform> material: Material;
@group(2) @binding(1) var materialSampler: sampler;
@group(2) @binding(2) var baseColorTexture: texture_2d<f32>;
@group(2) @binding(3) var metallicRoughnessTexture: texture_2d<f32>;
@group(2) @binding(4) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(5) var normalTexture: texture_2d<f32>;
@group(2) @binding(6) var occlusionTexture: texture_2d<f32>;

// KHR_texture_transform: scale, then rotate, then offset.
fn materialUV(uv: vec2f) -> vec2f {
  let r = material.flags.x;
  let c = cos(r);
  let s = sin(r);
  let scaled = uv * material.uvScaleOffset.xy;
  return vec2f(c * scaled.x + s * scaled.y, -s * scaled.x + c * scaled.y) + material.uvScaleOffset.zw;
}

// The wind. A swaying model bends with height above its instance's base,
// so a trunk's foot stays put and a crown moves most; the sway rolls
// across the ground downwind as a gust, phased by where the instance
// stands so a wood does not move in step. Leaves and blades also
// flutter, small and fast, each by its own position. Wood and leaves of
// one model bend alike, so a leaf never leaves its branch.
fn windOffset(world: vec3f, base: vec3f, time: f32) -> vec3f {
  let wind = frame.post[7];
  let mode = material.specular.w;
  let strength = length(wind.xy);
  if (mode < 0.5 || strength < 1e-4) { return vec3f(0.0); }
  let h = max(world.y - base.y, 0.0);
  let along = dot(base.xz, wind.xy / strength);
  let gust = sin(time * 0.7 - along * 0.06);
  let sway = 0.6 + 0.4 * sin(time * 1.4 + dot(base.xz, vec2f(0.37, 0.53))) + wind.z * gust;
  var offset = vec3f(wind.x, 0.0, wind.y) * sway * (0.012 * h + 0.003 * h * h);
  if (mode > 1.5) {
    let f = sin(time * 7.3 + dot(world, vec3f(2.1, 1.7, 2.9)));
    offset += vec3f(f, f * 0.4, -f) * 0.06 * strength * min(h, 1.0);
  }
  return offset;
}

// Alpha-tested materials drop the fragment below the cutoff. A blended
// material is treated as a mask at its cutoff for now: foliage reads
// right, glass does not, and proper transparency is its own phase.
// Only a MASK material (flags.y 1) cuts at its cutoff. A BLEND one
// (flags.y 2) is drawn in the transparent pass and keeps its soft edge,
// so testing it here would throw away the very pixels it is for.
//
// A cut-out's mip chain averages its alpha, so a leaf card thins with
// every level until, far enough away, the tree is bare branches. For
// foliage the alpha is scaled up by the level being read (the mip-scale
// fix every foliage renderer applies), which keeps a card's coverage
// close to constant with distance; at level 0 nothing changes. Only for
// foliage: a chain-link fence's wire should thin into the distance, and
// boosted it reads as a solid board.
fn alphaMip(uv: vec2f) -> f32 {
  let texel = uv * vec2f(textureDimensions(baseColorTexture, 0));
  let dx = dpdx(texel);
  let dy = dpdy(texel);
  return max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
}

fn alphaTest(alpha: f32, uv: vec2f) {
  let covered = alpha * (1.0 + alphaMip(uv) * 0.25 * material.specular.z);
  if (material.flags.y > 0.5 && material.flags.y < 1.5 && covered < material.factors.w) { discard; }
}
`;
