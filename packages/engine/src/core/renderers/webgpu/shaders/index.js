/**
 * WGSL for the 3D renderer: a sky, a shadow pass, a physically based mesh
 * pass lit by the sun, an image-based environment and point and spot
 * lights, and the environment bakes and post passes that feed it. Grown
 * per phase of docs/plans/3d-and-editor.md.
 *
 * Every pass shares the frame uniform and the instance and light storage
 * arrays in group 0. Layouts here must match `INSTANCE_FLOATS` and
 * `LIGHT_FLOATS` in frame3d.js. Colour is linear and high range all the
 * way to the composite pass, which tonemaps and encodes for the canvas.
 */

export { MAX_CASCADES, MAX_SPOT_SHADOWS, MAX_POINT_SHADOWS, POINT_SHADOW_NEAR, CLUSTER_X, CLUSTER_Y, CLUSTER_Z, CLUSTER_COUNT, CLUSTER_CAPACITY, FRAME_UNIFORM_FLOATS, FRAME_OFFSETS, MATERIAL_UNIFORM_FLOATS, MAX_VIEWS, MAX_CULL_PASSES, MAX_PARTICLE_FIELDS } from './constants.js';
export { SKY_SHADER } from './sky.js';
export { MESH_SHADER, MESH_SKINNED_SHADER } from './mesh.js';
export { SHADOW_SHADER, SHADOW_SKINNED_SHADER } from './shadow.js';
export { LIGHT_CLUSTER_SHADER } from './clusters.js';
export { CULL_SHADER } from './cull.js';
export { SKY_BAKE_SHADER, PREFILTER_SHADER, IRRADIANCE_SHADER, BRDF_LUT_SHADER } from './environment.js';
export { BLOOM_PREFILTER_SHADER, BLOOM_DOWNSAMPLE_SHADER, BLOOM_UPSAMPLE_SHADER } from './post/bloom.js';
export { AO_SHADER, AO_BLUR_SHADER } from './post/ao.js';
export { PARTICLE_SHADER } from './particles.js';
export { RESOLVE_SHADER } from './post/resolve.js';
export { TAA_SHADER } from './post/taa.js';
export { DOF_DOWN_SHADER, DOF_TILE_SHADER, DOF_DILATE_SHADER, DOF_FAR_SHADER, DOF_NEAR_SHADER, DOF_COMBINE_SHADER } from './post/dof.js';
export { MOTION_BLUR_SHADER } from './post/motionBlur.js';
export { LUMINANCE_SHADER, ADAPT_SHADER } from './post/exposure.js';
export { COMPOSITE_SHADER } from './post/composite.js';
