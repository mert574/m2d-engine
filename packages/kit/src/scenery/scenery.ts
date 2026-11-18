import { Entity } from 'm2d-engine/core/entity.js';
import type { M2D } from 'm2d-engine/core/m2d.js';
import type { ActorBody, ActorSprite, VisibleArea } from '../engineTypes.ts';

/** Where scenery draws when its object gives no `zIndex`: under every layer (the background is at -1), or over every entity. */
export const BACK = -1000;
export const FRONT = 1000;

/**
 * What the kit's backdrops share: placed in the scene like any actor, so
 * the editor shows and edits them, but colliding with nothing, and drawn
 * at a `zIndex` — under the level or over it — rather than at their body.
 * A subclass paints in `paint(area, time)`: the camera's visible area,
 * so it covers the view at any zoom or rotation, and the game clock,
 * which stands still in the editor.
 *
 * Presentation only: nothing here is read by the simulation.
 */
export class Scenery extends Entity {
  /** A pinned draw order, or undefined to take the outermost on its side. */
  #depth: number | undefined;

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, zIndex = 0) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.zIndex = zIndex;
  }

  /**
   * Never drawn at its body. The engine gives a 3D entity without a `mesh`
   * block its collider as a grey box, assigned after construction; scenery
   * keeps none, whatever is assigned.
   */
  get mesh(): unknown {
    return null;
  }

  set mesh(value: unknown) {}

  /**
   * Never bounded by its body: it paints the view itself (and a strip
   * paints along its path), so the view cull never skips it.
   */
  override get drawBounds(): null {
    return null;
  }

  /** Outermost among entities that share its `zIndex`, on its side of zero; a number assigned pins it. */
  override get depth(): number {
    return this.#depth ?? (this.zIndex < 0 ? -Infinity : Infinity);
  }

  override set depth(value: number) {
    this.#depth = value;
  }

  override draw(deltaTime: number): void {
    if (this.dead || !this.visible) return;
    this.paint(this.game.camera.getVisibleArea(), this.game.time?.elapsed ?? 0);
    for (const constraint of this.constraints.values()) constraint.draw(deltaTime);
  }

  /** Draw over `area`, the view in world units, at game time `time`. */
  paint(area: VisibleArea, time: number): void {}
}

/** A float in [0, 1) from two integers: the same pair, the same number. */
export function hash(seed: number, index: number, salt = 0): number {
  let h = (seed * 374761393 + index * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export const mod = (value: number, size: number): number => ((value % size) + size) % size;
