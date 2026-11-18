/**
 * The 3D particle fields the renderer draws, and what an `entity.particles`
 * record is when it leaves a key out. An entity declares one field as it
 * declares a light; `Scene.frame3D` collects them into the frame. Sizes
 * are metres. (A 2D field is plain draw calls, the kit's business.)
 */
export const PARTICLE_KINDS = Object.freeze(['motes', 'smoke']);

export const PARTICLE_DEFAULTS = Object.freeze({
  motes: Object.freeze({ count: 400, extent: { x: 16, y: 5, z: 16 }, radius: 0.03, color: '#ffffff', opacity: 0.6, emissive: 0, speed: 0.3, follow: true }),
  smoke: Object.freeze({ count: 120, extent: { x: 0.6, y: 4, z: 0.6 }, radius: 0.5, color: '#ffffff', opacity: 0.3, emissive: 0, speed: 0.6, follow: true })
});

/** A field with every key filled in from its kind's defaults. */
export function withParticleDefaults(field) {
  return { ...PARTICLE_DEFAULTS[field.kind], at: { x: 0, y: 0, z: 0 }, ...field };
}
