/** Sun shadow cascades the frame uniform has room for. */
export const MAX_CASCADES = 4;

/** Spot lights that may cast a shadow map at once. */
export const MAX_SPOT_SHADOWS = 4;

/**
 * Point lights that may cast a shadow cube at once. Each costs six
 * passes — one per face — so this stays small and the quality setting
 * decides how many of them a frame actually draws.
 */
export const MAX_POINT_SHADOWS = 6;

/**
 * The near plane every shadow cube face is drawn with. Both halves of
 * the comparison have to agree on it: the renderer builds the face
 * projections with this, and the shader rebuilds the stored depth from
 * a distance with it.
 */
export const POINT_SHADOW_NEAR = 0.05;

/**
 * The light cluster grid: tiles across the screen and slices into depth.
 * A fragment shades with the lights of its own cluster instead of every
 * light in the frame, which is what lets a level carry hundreds.
 * 16x9x24 is 3,456 clusters, and the slices are spaced exponentially so
 * the near ones are thin.
 */
export const CLUSTER_X = 16;

export const CLUSTER_Y = 9;

export const CLUSTER_Z = 24;

/** Clusters in the grid. */
export const CLUSTER_COUNT = CLUSTER_X * CLUSTER_Y * CLUSTER_Z;

/**
 * Lights one cluster may hold; past it the cluster keeps the first it
 * found and drops the rest. The far depth slices are large — at 100 m a
 * cluster's box, inflated by every light's range, can stand over dozens
 * of the lot's lamps — so this is sized for them, and `Frame3D`'s light
 * distance fade is what keeps the count under it.
 */
export const CLUSTER_CAPACITY = 64;

/** Floats in the frame uniform, in the order `Frame` declares them. */
export const FRAME_UNIFORM_FLOATS = 16 * 3 + 16 * MAX_CASCADES + 16 * MAX_SPOT_SHADOWS + 4 * 12 + 4 * 8 + 4 * 2 + 16;

/** Float offsets into the frame uniform of the post-process blocks; see `Frame`. */
export const FRAME_OFFSETS = Object.freeze({
  post: 224, lens: 256, jitter: 260, previousViewProjection: 264
});

/** Floats in a material's uniform, in the order `Material` declares them. */
export const MATERIAL_UNIFORM_FLOATS = 4 * 7;

/**
 * Passes the cull shader can test at once: the camera, every shadow
 * map, and the six faces of every shadow cube.
 */
/**
 * Camera passes (the primary view plus up to seven more — an editor's side
 * views) before the shadow passes. The cull tests every pass in one
 * dispatch, so this is a compile-time bound on views plus shadow maps.
 */
export const MAX_VIEWS = 8;

export const MAX_CULL_PASSES = MAX_VIEWS + MAX_CASCADES + MAX_SPOT_SHADOWS + MAX_POINT_SHADOWS * 6;

/** The most particle fields a frame draws; see `PARTICLE_SHADER`. */
export const MAX_PARTICLE_FIELDS = 16;
