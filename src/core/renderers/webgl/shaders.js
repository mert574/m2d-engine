/**
 * The renderer's single program. Vertices arrive in pixel space (already
 * transformed on the CPU); the paint mode is a per-batch uniform.
 */

export const ATTRIBUTES = {
  a_position: 0,
  a_uv: 1,
  a_color: 2,
  a_uvBounds: 3
};

/** Floats per vertex: position(2) uv(2) color(4) uvBounds(4). */
export const VERTEX_FLOATS = 12;

export const MODE_SOLID = 0;
export const MODE_TEXTURE = 1;
export const MODE_GRADIENT = 2;
export const MODE_SHADOW = 3;

export const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
layout(location = 3) in vec4 a_uvBounds;

uniform vec2 u_resolution;
uniform float u_flipY;

out vec2 v_uv;
out vec4 v_color;
out vec4 v_uvBounds;

void main() {
  v_uv = a_uv;
  v_color = a_color;
  v_uvBounds = a_uvBounds;
  vec2 clip = a_position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y * u_flipY, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;
in vec4 v_uvBounds;

uniform int u_mode;            // 0 solid, 1 texture, 2 gradient, 3 shadow tint
uniform sampler2D u_texture;
uniform int u_gradientType;    // 0 linear, 1 radial (concentric)
uniform vec4 u_gradient;       // linear: x0 y0 x1 y1   radial: x y r0 r1
uniform vec4 u_shadowColor;    // premultiplied

out vec4 fragColor;

void main() {
  if (u_mode == 0) {
    fragColor = v_color;
  } else if (u_mode == 1) {
    // Clamp into the sub-rectangle (inset half a texel by the CPU) so linear
    // filtering never bleeds neighbouring atlas tiles in.
    vec2 uv = clamp(v_uv, v_uvBounds.xy, v_uvBounds.zw);
    fragColor = texture(u_texture, uv) * v_color;
  } else if (u_mode == 2) {
    float t;
    if (u_gradientType == 0) {
      vec2 d = u_gradient.zw - u_gradient.xy;
      float len2 = dot(d, d);
      t = len2 > 0.0 ? dot(v_uv - u_gradient.xy, d) / len2 : 0.0;
    } else {
      float dist = distance(v_uv, u_gradient.xy);
      float span = u_gradient.w - u_gradient.z;
      t = span > 0.0 ? (dist - u_gradient.z) / span : 1.0;
    }
    fragColor = texture(u_texture, vec2(clamp(t, 0.0, 1.0), 0.5)) * v_color;
  } else {
    fragColor = u_shadowColor * texture(u_texture, v_uv).a * v_color.a;
  }
}
`;

/** Separable Gaussian blur used by the shadow pass. */
export const BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;
in vec4 v_uvBounds;

uniform sampler2D u_texture;
uniform vec2 u_direction;   // (1/w, 0) or (0, 1/h)
uniform float u_sigma;
uniform int u_radius;

out vec4 fragColor;

void main() {
  if (u_radius <= 0) {
    fragColor = texture(u_texture, v_uv);
    return;
  }
  float twoSigma2 = 2.0 * u_sigma * u_sigma;
  vec4 sum = texture(u_texture, v_uv);
  float weightSum = 1.0;
  for (int i = 1; i <= 128; i++) {
    if (i > u_radius) break;
    float w = exp(-float(i * i) / twoSigma2);
    vec2 offset = u_direction * float(i);
    sum += (texture(u_texture, v_uv + offset) + texture(u_texture, v_uv - offset)) * w;
    weightSum += 2.0 * w;
  }
  fragColor = sum / weightSum;
}
`;

/**
 * Light map accumulation. The quad's local uv runs -1..1, so the falloff is
 * just the distance from its centre; `v_color.rgb` is the light's colour
 * times its intensity. Drawn additively over an ambient clear.
 */
export const LIGHT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;

out vec4 fragColor;

void main() {
  float d = length(v_uv);
  float falloff = clamp(1.0 - d, 0.0, 1.0);
  falloff *= falloff;
  fragColor = vec4(v_color.rgb * falloff, 1.0);
}
`;

/** Bright-pass over the lit scene, feeding the bloom blur. */
export const BRIGHT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_scene;
uniform sampler2D u_light;
uniform float u_threshold;

out vec4 fragColor;

void main() {
  vec3 lit = texture(u_scene, v_uv).rgb * texture(u_light, v_uv).rgb;
  float luma = max(max(lit.r, lit.g), lit.b);
  // Keep the colour, scale by how far past the threshold it is, so a bright
  // amber lamp blooms amber rather than white.
  float keep = max(0.0, luma - u_threshold) / max(luma, 0.0001);
  fragColor = vec4(lit * keep, 1.0);
}
`;

/** Final composite: scene x light, plus bloom, then vignette. */
export const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_scene;
uniform sampler2D u_light;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
uniform float u_vignette;
uniform float u_vignetteStart;

out vec4 fragColor;

void main() {
  vec3 color = texture(u_scene, v_uv).rgb * texture(u_light, v_uv).rgb;
  color += texture(u_bloom, v_uv).rgb * u_bloomStrength;

  float r = length(v_uv - 0.5) * 1.41421356;
  color *= 1.0 - u_vignette * smoothstep(u_vignetteStart, 1.0, r);

  fragColor = vec4(color, 1.0);
}
`;
