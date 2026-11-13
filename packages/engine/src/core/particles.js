/**
 * What a `world.particles` field is when it leaves a key out, per kind:
 * the scene's conversion for the renderer and the editor's particle panel
 * both read these, so what the panel shows is what draws. The 3D kinds
 * are in metres, the 2D ones (fireflies, leaves, rain, sparks) in pixels;
 * see sceneBackdrop.js for how those draw.
 */
export const PARTICLE_DEFAULTS = Object.freeze({
  motes: Object.freeze({ count: 400, extent: { x: 16, y: 5, z: 16 }, radius: 0.03, color: '#ffffff', opacity: 0.6, emissive: 0, speed: 0.3, follow: true }),
  smoke: Object.freeze({ count: 120, extent: { x: 0.6, y: 4, z: 0.6 }, radius: 0.5, color: '#ffffff', opacity: 0.3, emissive: 0, speed: 0.6, follow: true }),
  fireflies: Object.freeze({ count: 40, extent: { x: 400, y: 300 }, radius: 2.2, color: '#ffe48a', opacity: 0.9, emissive: 0.8, speed: 4, follow: true, front: false, seed: 1 }),
  leaves: Object.freeze({ count: 30, extent: { x: 400, y: 300 }, radius: 6, color: '#d9883a', opacity: 0.85, emissive: 0, speed: 40, follow: true, front: true, seed: 1 }),
  rain: Object.freeze({ count: 160, extent: { x: 400, y: 300 }, radius: 2, color: '#b8c8e0', opacity: 0.45, emissive: 0, speed: 700, follow: true, front: true, seed: 1 }),
  sparks: Object.freeze({ count: 50, extent: { x: 400, y: 300 }, radius: 2, color: '#ffb35a', opacity: 0.9, emissive: 0.6, speed: 60, follow: true, front: true, seed: 1 })
});

/** A field with every key filled in from its kind's defaults. */
export function withParticleDefaults(field) {
  return { ...PARTICLE_DEFAULTS[field.kind], at: { x: 0, y: 0, z: 0 }, ...field };
}
