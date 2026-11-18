import { parseColor } from './renderers/geometry/color.js';
import { geometryFor } from './renderers/geometry/primitives.js';
import { toLinear } from './presentation3d.js';

/**
 * Tool entities: the ones a level needs but a player never sees — a
 * trigger, a spawn point, an invisible wall, a gravity dial. Their class
 * says so with `static tool = { color, label }`, and the engine draws each
 * as a semi-transparent box of that colour over its body, the way a level
 * editor shows its tool brushes: always in the editor, and in play when
 * the `r_showtools` cvar is on, for debugging. In 2D the box is outlined
 * and labelled on the world overlay, above everything; in 3D it is a
 * translucent, faintly glowing shape of the body.
 *
 * An entity may set `toolColor` to colour its own box, and `toolLabel` to
 * say more than its kind.
 */

/** How solid a box's fill is, and its outline. */
const FILL_ALPHA = 0.3;
const EDGE_ALPHA = 0.9;
const OPACITY_3D = 0.28;
/** How far from the camera, in metres, a 3D box's label is still drawn. */
const LABEL_REACH_3D = 40;

/** Whether tool entities are drawn now: in the editor, or in play with `r_showtools` on. */
export function toolsShown(game) {
  return Boolean(game.editMode || game.showTools);
}

/** An entity's tool look, `{ color, label }`, or null for an entity that is not a tool. */
export function toolOf(entity) {
  const tool = entity.constructor?.tool;
  if (!tool) return null;
  return { color: entity.toolColor ?? tool.color, label: entity.toolLabel ?? tool.label };
}

/** What a box says: its kind, and the id of the object it was placed as. */
const labelOf = (entity, tool) => (entity.sceneId ? `${tool.label} · ${entity.sceneId}` : tool.label);

const rgba = (color, alpha) => {
  const [r, g, b] = parseColor(color).map((c) => Math.round(c * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * One entity's box on the world overlay: its body's footprint on the
 * ground, turned with it and seen through the scene's projection (a
 * diamond in an isometric level), labelled at its topmost corner.
 */
export function drawToolVolume2D(entity, tool = toolOf(entity)) {
  if (!tool) return;
  const game = entity.game;
  const body = entity.body;
  const { x, y } = body.renderPosition;
  const hw = body.size.x / 2;
  const hh = body.size.y / 2;
  const angle = body.renderAngle ?? body.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ground = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos }));
  const projection = game.projection;
  const points = projection ? ground.map((p) => projection.toScreen(p.x, p.y)) : ground;
  game.worldOverlay.drawPath({ points, closed: true, fillStyle: rgba(tool.color, FILL_ALPHA), strokeStyle: rgba(tool.color, EDGE_ALPHA), lineWidth: 1.5 });
  // The label's anchor is a world point: the overlay projects it itself.
  let top = 0;
  for (let i = 1; i < points.length; i++) if (points[i].y < points[top].y || (points[i].y === points[top].y && points[i].x < points[top].x)) top = i;
  game.worldOverlay.drawText({
    text: labelOf(entity, tool),
    x: ground[top].x, y: ground[top].y, offsetX: 4, offsetY: 12,
    fillStyle: rgba(tool.color, 1), fontSize: '11px', fontFamily: 'system-ui', fontWeight: '600',
    textAlign: 'left', textBaseline: 'alphabetic'
  });
}

/** Every tool entity's box, when they are shown. The 2D scene's draw pass calls it after the world. */
export function drawToolVolumes2D(game) {
  if (!toolsShown(game)) return;
  for (const entity of game.entities) {
    if (entity.dead) continue;
    const tool = toolOf(entity);
    if (tool) drawToolVolume2D(entity, tool);
  }
}

/** A tool colour's see-through, faintly glowing surface; the scene caches the material by what it says. */
function toolSurface(scene, color) {
  const [r, g, b] = parseColor(color);
  return {
    color: [toLinear(r), toLinear(g), toLinear(b)],
    material: scene.meshMaterial({ opacity: OPACITY_3D, emissiveColor: color, emissive: 0.6 })
  };
}

/** Every tool entity's shape into the 3D frame, translucent and casting no shadow, when they are shown. */
export function addToolVolumes3D(scene, frame) {
  const game = scene.game;
  if (!toolsShown(game)) return;
  const eye = game.camera.position;
  for (const entity of game.entities) {
    if (entity.dead) continue;
    const tool = toolOf(entity);
    if (!tool) continue;
    const body = entity.body;
    const { geometry, scale } = geometryFor(body.shape, body.size);
    const { color, material } = toolSurface(scene, tool.color);
    const at = body.renderPosition;
    frame.add(geometry, { position: at, rotation: body.renderRotation, scale, color, material, castShadow: false });
    // Labelled above its top, near enough to read: a level's far side is not a wall of names.
    if (Math.hypot(at.x - eye.x, at.y - eye.y, at.z - eye.z) > LABEL_REACH_3D) continue;
    game.worldOverlay.drawText({
      text: labelOf(entity, tool), x: at.x, y: at.y + body.size.y / 2, z: at.z, offsetY: -6,
      fillStyle: rgba(tool.color, 1), strokeStyle: 'rgba(0, 0, 0, 0.6)', lineWidth: 3,
      fontSize: '13px', fontFamily: 'system-ui', fontWeight: '600', textAlign: 'center', textBaseline: 'alphabetic'
    });
  }
}
