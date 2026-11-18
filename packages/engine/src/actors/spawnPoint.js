import { Entity } from '../core/entity.js';

/**
 * Where a player comes into the level: a marker placed in the scene,
 * colliding with nothing, drawn as a green box in the editor and under
 * `r_showtools` and as nothing in play. When a player
 * joins a match, the server spawns the scene's `world.player` prefab at a
 * free one (`scene.freeSpawnPoint()`); a game may send a fallen avatar
 * back to one the same way. Its size is its reach: a point is taken while
 * an avatar stands inside it. Works in 2D and 3D.
 */
export class SpawnPoint extends Entity {
  static description = 'Where a player joins or comes back: a marker the server spawns avatars at';
  static tool = { color: '#34d399', label: 'spawn' };
  name = 'SpawnPoint';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
  }

  /** A marker, not a thing: the engine's default 3D box would show where it stands. */
  get mesh() {
    return null;
  }

  set mesh(value) {}

  /** Whether `entity` stands inside this point's reach. */
  holds(entity) {
    const at = this.body.position;
    const there = entity.body?.position ?? entity.position;
    const half = this.body.size;
    return Math.abs(there.x - at.x) <= half.x / 2 &&
      Math.abs(there.y - at.y) <= half.y / 2 &&
      (at.z === undefined || Math.abs((there.z ?? 0) - at.z) <= (half.z ?? half.x) / 2);
  }

  /** Nothing of its own: its box is the engine's tool pass (core/toolVolumes.js). */
  draw() {}
}
