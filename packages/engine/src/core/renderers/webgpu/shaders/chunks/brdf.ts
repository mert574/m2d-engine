/**
 * The physically based shading terms every lit pass shares: the GGX
 * distribution, Smith's geometry term, Schlick's Fresnel (and its
 * roughness-aware form for image-based light), one light's contribution
 * through them, and a light's distance falloff.
 */
export const BRDF = /* wgsl */ `
fn distributionGGX(nDotH: f32, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn geometrySmith(nDotV: f32, nDotL: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  let gv = nDotV / (nDotV * (1.0 - k) + k);
  let gl = nDotL / (nDotL * (1.0 - k) + k);
  return gv * gl;
}

fn fresnelSchlick(cosTheta: f32, f0: vec3f) -> vec3f {
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

fn fresnelRoughness(cosTheta: f32, f0: vec3f, roughness: f32) -> vec3f {
  return f0 + (max(vec3f(1.0 - roughness), f0) - f0) * pow(1.0 - cosTheta, 5.0);
}

// Cook-Torrance for one light arriving along l with the given radiance,
// as its diffuse and its specular parts: a blended surface scales only
// the first by its coverage (see the mesh pass).
fn shadeParts(n: vec3f, v: vec3f, l: vec3f, radiance: vec3f, base: vec3f, f0: vec3f, metallic: f32, roughness: f32) -> array<vec3f, 2> {
  let h = normalize(v + l);
  let nDotL = max(dot(n, l), 0.0);
  let nDotV = max(dot(n, v), 1e-4);
  let nDotH = max(dot(n, h), 0.0);
  let hDotV = max(dot(h, v), 0.0);
  let d = distributionGGX(nDotH, roughness);
  let g = geometrySmith(nDotV, nDotL, roughness);
  let f = fresnelSchlick(hDotV, f0);
  let specular = (d * g * f) / max(4.0 * nDotV * nDotL, 1e-4);
  let kd = (vec3f(1.0) - f) * (1.0 - metallic);
  return array<vec3f, 2>(kd * base / PI * radiance * nDotL, specular * radiance * nDotL);
}

fn shade(n: vec3f, v: vec3f, l: vec3f, radiance: vec3f, base: vec3f, f0: vec3f, metallic: f32, roughness: f32) -> vec3f {
  let parts = shadeParts(n, v, l, radiance, base, f0, metallic, roughness);
  return parts[0] + parts[1];
}

// Inverse-square falloff windowed to the light's range, so a light ends
// smoothly where its range ends instead of being cut off.
fn falloff(distance: f32, range: f32) -> f32 {
  let d2 = max(distance * distance, 1e-4);
  let window = clamp(1.0 - pow(distance / range, 4.0), 0.0, 1.0);
  return (window * window) / d2;
}
`;
