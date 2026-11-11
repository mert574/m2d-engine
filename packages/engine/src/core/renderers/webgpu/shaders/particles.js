import { MAX_PARTICLE_FIELDS } from './constants.js';
import { COMMON } from './chunks/frame.js';

/**
 * Particle fields: dust and pollen in the air, smoke from a chimney.
 *
 * No particle has state. Each one's position is a function of its index
 * and the time, so a field costs a uniform and a draw: nothing is
 * simulated on the CPU or stored on the GPU, and a field looks the same
 * every time it is shown. Motes are scattered through a box that a field
 * may centre on the camera, carried by the wind with a wander of their
 * own and wrapped at the box's faces (faded there, so nothing pops);
 * smoke rises from a point through a column, widening and fading over a
 * lifetime that loops. Each draws as a soft camera-facing disc in the
 * transparent pass: its light into the direct target, its coverage over
 * the indirect one, so the ambient light behind it is covered too.
 */
export const PARTICLE_SHADER = /* wgsl */ `
${COMMON}

struct Field {
  // xyz the box's centre (a smoke field's source), w the kind: 0 motes, 1 smoke.
  center: vec4f,
  // xyz the box's half extent (smoke: the column's spread and half its height), w the count.
  extent: vec4f,
  // rgb linear colour, w opacity.
  color: vec4f,
  // x radius (m), y speed (m/s; motes: how far they wander), z emissive, w the field's first particle.
  motion: vec4f,
};
struct Fields { count: vec4u, fields: array<Field, ${MAX_PARTICLE_FIELDS}> };
@group(1) @binding(0) var<uniform> particles: Fields;

struct ParticleOut {
  @builtin(position) position: vec4f,
  @location(0) corner: vec2f,
  @location(1) color: vec4f,
};

fn particleRandom(i: u32, k: u32) -> f32 {
  var h = i * 747796405u + k * 2891336453u + 1u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return f32(h) / 4294967295.0;
}

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> ParticleOut {
  var which = 0u;
  for (var k = 0u; k < particles.count.x; k++) {
    let f = particles.fields[k];
    if (f32(i) >= f.motion.w && f32(i) < f.motion.w + f.extent.w) { which = k; }
  }
  let field = particles.fields[which];
  let local = i - u32(field.motion.w);
  let time = frame.post[2].w;
  let wind = vec3f(frame.post[7].x, 0.0, frame.post[7].y);
  let r = vec4f(particleRandom(local, 1u), particleRandom(local, 2u), particleRandom(local, 3u), particleRandom(local, 4u));
  let e = max(field.extent.xyz, vec3f(0.01));
  var position: vec3f;
  var size = field.motion.x;
  var alpha = field.color.a;
  if (field.center.w < 0.5) {
    // Motes: where it started, plus the wind's carry and its own wander,
    // wrapped into the box around the field's centre.
    let wander = vec3f(sin(time * 0.37 + r.w * 40.0), 0.5 * sin(time * 0.23 + r.x * 30.0), cos(time * 0.31 + r.y * 50.0)) * field.motion.y;
    let carried = (r.xyz * 2.0 - 1.0) * e + wind * 0.8 * time + vec3f(0.0, (r.w - 0.5) * 0.15 * time, 0.0) + wander;
    var rel = carried - field.center.xyz;
    rel = rel - 2.0 * e * floor((rel + e) / (2.0 * e));
    position = field.center.xyz + rel;
    let edge = max(max(abs(rel.x) / e.x, abs(rel.y) / e.y), abs(rel.z) / e.z);
    alpha *= 1.0 - smoothstep(0.75, 1.0, edge);
  } else {
    // Smoke: a puff's life from the source to the column's top, looped,
    // each puff at its own point in it; it widens, grows and fades.
    let life = 2.0 * e.y / max(field.motion.y, 0.01);
    let phase = fract(time / life + r.x);
    let spread = vec3f((r.y - 0.5) * e.x, 0.0, (r.z - 0.5) * e.z) * (0.3 + phase);
    position = field.center.xyz + spread + vec3f(0.0, phase * 2.0 * e.y, 0.0) + wind * phase * life * 0.5;
    size *= 0.5 + 1.5 * phase;
    alpha *= sin(phase * PI);
  }
  // Camera-facing: the view's right and up in the world.
  let right = vec3f(frame.view[0][0], frame.view[1][0], frame.view[2][0]);
  let up = vec3f(frame.view[0][1], frame.view[1][1], frame.view[2][1]);
  let corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[v];
  let world = position + (right * c.x + up * c.y) * size;
  // Nothing in the camera's face: a mote at the lens would be a blot.
  alpha *= smoothstep(1.5, 4.0, distance(world, frame.camera.xyz));
  // Lit by the sky and a little of the sun (a mote catches it from any
  // side), plus its own glow.
  let light = frame.sky.rgb * frame.sky.w + frame.sunColor.rgb * frame.sunDirection.w * 0.3;
  var out: ParticleOut;
  out.position = frame.viewProjection * vec4f(world, 1.0);
  out.corner = c;
  out.color = vec4f(field.color.rgb * (light + vec3f(field.motion.z)), alpha);
  return out;
}

struct ParticleFragment {
  @location(0) direct: vec4f,
  @location(1) indirect: vec4f,
  @location(2) normalDepth: vec4f,
  @location(3) velocity: vec2f,
};

@fragment
fn fs(in: ParticleOut) -> ParticleFragment {
  let a = in.color.a * (1.0 - smoothstep(0.3, 1.0, length(in.corner)));
  if (a < 0.002) { discard; }
  var out: ParticleFragment;
  // Premultiplied, as the transparent targets blend.
  out.direct = vec4f(in.color.rgb * a, a);
  out.indirect = vec4f(0.0, 0.0, 0.0, a);
  return out;
}
`;
