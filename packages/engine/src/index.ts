// m2d-engine: the game, its scenes, entities and constraints, and the
// helpers game code reaches for. Every other area has its own entry
// (`m2d-engine/schema`, `/physics`, `/actors`, `/constraints`, `/ui`,
// `/renderers`, `/net`, `/nav`, `/quality`, `/testing`); nothing else
// in the package is public.
export { M2D } from './core/m2d.js';
export { Entity } from './core/entity.js';
export { Constraint, KEY_BINDINGS } from './core/constraint.js';
export { Projectile } from './core/projectile.js';
export { Scene } from './core/scene.js';
export { bootProject, projectOptions, combineSceneHooks } from './core/project.js';
export { BUILTIN_ACTORS, BUILTIN_CONSTRAINTS, Registry } from './core/builtins.js';
export { Vec2, Vec3, Quat, Angle, DIRECTIONS_8 } from './core/math.ts';
export type { Vector2, Vector3, Quaternion, Direction8 } from './core/math.ts';
export { Rng, makeRng } from './core/rng.js';
export { Timer, Time } from './core/time.js';
export { Camera } from './core/camera.js';
export { Camera3D } from './core/camera3d.js';
export { CameraControls, CONTROL_KEYS } from './core/cameraControls.js';
export { InputSnapshot } from './core/input/snapshot.js';
export { keyLabel } from './core/input/actions.js';
export { AssetDatabase, AssetManifestError } from './core/assets.js';
export { blendLook, cycleLook, advanceCycle } from './core/look.js';
export { Quest } from './core/quest.js';
export { Path } from './core/path.js';
export { lineOfSight, canSee } from './core/senses.js';
export { PARTICLE_KINDS, PARTICLE_DEFAULTS } from './core/particles.js';
export { Animator3D } from './core/animator3d.js';
