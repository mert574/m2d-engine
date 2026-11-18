/**
 * The navmesh made visible: the baked polygons drawn over the ground, one
 * colour per agent profile, in the editor and in play under `r_shownav`.
 * A bad bake — a hole where a door is, a floor the erosion ate — is
 * something to see, not to deduce from paths that fail. In 2D the
 * triangles go to the world overlay through the scene's projection, as
 * tool boxes do; in 3D they go into the frame as a translucent mesh, a
 * hand above the ground so they do not fight the floor.
 */

/** One colour per agent, by declaration order. */
const COLORS = ['#3dd68c', '#4da3ff', '#ffb84d', '#ff6b9e'];
const FILL_ALPHA = 0.14;
const EDGE_ALPHA = 0.5;
/** How far above the ground a 3D overlay floats, in metres. */
const LIFT_3D = 0.05;

const rgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** Whether the navmesh is drawn now: `r_shownav`, or asked for by the editor. */
export function navShown(game) {
  return Boolean(game.showNav);
}

/** Every loaded mesh's triangles on the 2D world overlay. The 2D draw pass calls it after the tool boxes. */
export function drawNavMesh2D(game) {
  if (!navShown(game)) return;
  const projection = game.projection;
  let index = 0;
  for (const { debug } of game.nav.meshes.values()) {
    const color = COLORS[index++ % COLORS.length];
    const fill = rgba(color, FILL_ALPHA);
    const stroke = rgba(color, EDGE_ALPHA);
    const { positions, indices } = debug;
    for (let i = 0; i < indices.length; i += 3) {
      const points = [];
      for (let corner = 0; corner < 3; corner++) {
        const at = indices[i + corner] * 3;
        // Nav (x, z) is world (x, y); nav y is height and 2D has none.
        const x = positions[at], y = positions[at + 2];
        points.push(projection ? projection.toScreen(x, y) : { x, y });
      }
      game.worldOverlay.drawPath({ points, closed: true, fillStyle: fill, strokeStyle: stroke, lineWidth: 1 });
    }
  }
}

/** Every loaded mesh as a translucent surface in the 3D frame. The frame build calls it after the tool volumes. */
export function addNavMesh3D(scene, frame) {
  const game = scene.game;
  if (!navShown(game)) return;
  let index = 0;
  for (const mesh of game.nav.meshes.values()) {
    const color = COLORS[index++ % COLORS.length];
    if (!mesh.overlayGeometry) {
      const { positions, indices } = mesh.debug;
      const lifted = new Float32Array(positions.length);
      const normals = new Float32Array(positions.length);
      const uvs = new Float32Array((positions.length / 3) * 2);
      for (let i = 0; i < positions.length; i += 3) {
        lifted[i] = positions[i];
        lifted[i + 1] = positions[i + 1] + LIFT_3D;
        lifted[i + 2] = positions[i + 2];
        normals[i + 1] = 1;
      }
      const index32 = positions.length / 3 > 65535;
      mesh.overlayGeometry = {
        positions: lifted, normals, uvs,
        indices: index32 ? new Uint32Array(indices) : new Uint16Array(indices)
      };
    }
    frame.add(mesh.overlayGeometry, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      material: scene.meshMaterial({ opacity: 0.25, emissiveColor: color, emissive: 0.5 }),
      castShadow: false
    });
  }
}
