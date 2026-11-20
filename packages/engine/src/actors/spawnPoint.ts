import { Entity } from '../core/entity.ts';
import type { M2D } from '../core/m2d.js';
import type { PhysicsBody } from '../core/physics/index.ts';
import type { SpriteSheet } from '../core/spriteSheet.ts';

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
  static override description = 'Where a player joins or comes back: a marker the server spawns avatars at';
  static override tool = { color: '#34d399', label: 'spawn' };
  override name = 'SpawnPoint';

  constructor(body: PhysicsBody, sprite: SpriteSheet | null, game: M2D) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
  }

  /** Whether `entity` stands inside this point's reach. */
  holds(entity: Entity): boolean {
    // Either dimension's point, read with z optional.
    const at = this.body.position as { x: number; y: number; z?: number };
    const there = entity.body.position as { x: number; y: number; z?: number };
    const size = this.body.size as { x: number; y: number; z?: number };
    return Math.abs(there.x - at.x) <= size.x / 2 &&
      Math.abs(there.y - at.y) <= size.y / 2 &&
      (at.z === undefined || Math.abs((there.z ?? 0) - at.z) <= (size.z ?? size.x) / 2);
  }
}
