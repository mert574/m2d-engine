/**
 * The view cull: an entity whose drawing falls wholly outside the view
 * issues no draw calls this frame. Presentation only — a culled entity
 * still ticks, still collides, still replicates, and nothing in the
 * simulation can tell it was skipped.
 *
 * What is tested is the entity's `drawBounds` (core/entity.js): its drawn
 * footprint, or null for one whose drawing is not bounded by its body
 * (scenery over the view, a strip along a path), which always draws. The
 * camera grows the view by its `padding` before testing, so a constraint's
 * bar or readout above the body is still drawn as the body leaves the
 * view. The test is per view: `game.camera` is swapped for each 2D side
 * view, so an entity off the main camera still draws in a side view that
 * sees it.
 *
 * 3D needs none of this: the frame is retained and the renderer culls it
 * on the GPU against the real frustum (renderers/webgpu/shaders/cull.js).
 *
 * `r_cull 0` turns the whole thing off, which is how a suspected cull bug
 * is told from a drawing bug.
 */

import type { M2D } from './m2d.js';
import type { Entity } from './entity.ts';

/** Whether `entity` draws this frame, under `game.camera`. */
export function entityInView(game: M2D, entity: Entity): boolean {
  // On unless a game turned it off, so a stand-in game in a test culls the
  // way a real one does rather than quietly drawing everything.
  if (game.cullEntities === false) return true;
  const bounds = entity.drawBounds;
  if (!bounds) return true;
  // 2D only: a 3D camera has no isVisible, and the optional call below is
  // exactly the old behaviour (everything draws).
  const camera = game.camera as { isVisible?: (x: number, y: number, w: number, h: number) => boolean } | null;
  if (!camera?.isVisible) return true;
  return camera.isVisible(bounds.x, bounds.y, bounds.width, bounds.height);
}

/**
 * Whether an entity's 2D `light` block reaches the view. A light is far
 * wider than the body that carries it, so it is tested at its own radius
 * rather than with the entity: a lamp just off screen still lights what is
 * on it.
 */
export function lightInView(game: M2D, entity: Entity): boolean {
  if (game.cullEntities === false) return true;
  const camera = game.camera as { isVisible?: (x: number, y: number, w: number, h: number) => boolean } | null;
  if (!camera?.isVisible) return true;
  const light = entity.light!;
  const offset = light.offset ?? {};
  const { x, y } = entity.renderPosition;
  const radius = light.range ?? Math.max(entity.size.x, entity.size.y) * 2;
  return camera.isVisible(x + (offset.x ?? 0) - radius, y + (offset.y ?? 0) - radius, radius * 2, radius * 2);
}
