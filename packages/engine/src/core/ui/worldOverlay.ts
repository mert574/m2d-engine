import { viewToUI } from '../viewport.ts';
import type {
  ArcOptions, ImageOptions, LineOptions, PathOptions, RectOptions, SpriteOptions, TextOptions
} from '../renderers/baseRenderer.ts';
import type { M2D } from '../m2d.js';

/** A point on the ground plane; `z` is the third axis in a 3D game. */
export interface GroundPoint {
  x: number;
  y: number;
  z?: number;
}

/** A path whose points may carry a third axis, projected in a 3D game. */
export interface OverlayPathOptions extends PathOptions {
  points: GroundPoint[];
}

/** A line whose ends may carry a third axis. */
export interface OverlayLineOptions extends LineOptions {
  z1?: number;
  z2?: number;
}

/** An arc on the ground; `screenRadius` says the radius is already UI units. */
export interface OverlayArcOptions extends ArcOptions {
  z?: number;
  screenRadius?: boolean;
}

/** A label anchored to a world position, sized in UI units. */
export interface OverlayTextOptions extends TextOptions {
  /** Anchor Z, in a 3D game: a label behind the camera is not drawn. */
  z?: number;
  /** Offset from the anchor, in UI units. */
  offsetX?: number;
  /** Offset from the anchor, in UI units. */
  offsetY?: number;
}

/** What a shape submission carries, whichever method made it. */
export type OverlayShapeOptions =
  RectOptions | OverlayArcOptions | OverlayLineOptions | OverlayPathOptions | ImageOptions | SpriteOptions;

/** The renderer methods the overlay accepts. */
export type ShapeMethod = 'drawRect' | 'drawArc' | 'drawLine' | 'drawPath' | 'drawImage' | 'drawSprite';

/**
 * A circle's outline as path points on the ground: around (x, y) flat, or
 * around (x, z) at height `y` in 3D. What a debug ring is drawn with in a
 * 3D scene, where `drawArc` is a screen-space circle — a ring that should
 * lie on the floor is a path of projected points.
 */
export function groundCircle(
  { x, y, z }: GroundPoint, radius: number, segments = 32
): GroundPoint[] {
  const points: GroundPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(z === undefined
      ? { x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius }
      : { x: x + Math.cos(a) * radius, y, z: z + Math.sin(a) * radius });
  }
  return points;
}

/**
 * World-anchored overlay: annotations drawn *on* the world, not *in* it.
 *
 * Debug and diagnostic graphics — an actor's attention radius, an attack
 * range, a target dot, a facing vector, a readout over an enemy's head — are
 * not world content. They are a layer on top of the game, and a viewer reads
 * them as one. Drawing them through the world renderer rasterizes them into
 * the world surface, so they inherit the render resolution: at 0.25x a range
 * ring becomes a staircase and a 3-unit target dot disappears entirely, while
 * the sprites they annotate merely look blocky, which is the intended effect.
 *
 * This overlay is where that content belongs. Callers submit draw calls in
 * **world coordinates** during the world pass; the engine replays them in the
 * overlay pass, after the scene's UI, at the display's full pixel density.
 * The API deliberately mirrors the renderer's, so moving a call here is a
 * one-word change:
 *
 *   this.game.renderer.drawArc({ x, y, radius: this.range, ... });   // blurs
 *   this.game.worldOverlay.drawArc({ x, y, radius: this.range, ... }); // sharp
 *
 * ## Geometry is world-sized, text is UI-sized
 *
 * The two kinds of annotation want different things, and this is the one
 * place they differ:
 *
 * - **Shapes keep world units.** A 200-unit detection ring has to stay glued
 *   to the 200 units of world it describes, so positions *and* sizes go
 *   through the world-to-UI transform. Only the rasterization changes.
 * - **Text keeps a fixed UI size.** A readout is there to be read. Its
 *   anchor is a world position, but `fontSize` and `offsetX/offsetY` are UI
 *   units, so it stays exactly as legible at any resolution and never scales
 *   with the view.
 *
 * Shapes are drawn first and text on top, so a label is never hidden under a
 * ring that was submitted after it.
 *
 * Nothing escapes onto the letterbox bars: the whole overlay is clipped to
 * the world's content rect, so an annotation tracking an actor at the edge of
 * the view disappears exactly where the world does.
 *
 * The engine owns one instance, `game.worldOverlay`, cleared at the top of
 * every world frame — submissions are per-frame, made from `draw()` like any
 * other draw call.
 */

/**
 * How far outside the content rect a *text* anchor may land before the label
 * is dropped. Generous on purpose: it only has to stop a large map's worth of
 * off-screen readouts from being rasterized for nothing, not to be a tight
 * cull. Shapes are not culled this way — a ring whose centre is off screen
 * can still have an arc crossing the view — the clip handles them instead.
 */
const CULL_MARGIN = 200;

/** Submissions kept per frame; past this a runaway caller is dropped, once, with a warning. */
const MAX_ITEMS = 2000;

/** Renderer methods the overlay accepts, all taking world coordinates. */
const SHAPE_METHODS: ShapeMethod[] = ['drawRect', 'drawArc', 'drawLine', 'drawPath', 'drawImage', 'drawSprite'];

export class WorldOverlay {
  game: M2D;
  /** Shape submissions, in submission order. */
  shapes: Array<{ method: ShapeMethod; options: OverlayShapeOptions }>;
  /** Text submissions, drawn above the shapes. */
  labels: OverlayTextOptions[];
  warnedOverflow: boolean;

  // Submitted through one queue; each is installed in the constructor.
  declare drawRect: (options: RectOptions) => void;
  declare drawArc: (options: OverlayArcOptions) => void;
  declare drawLine: (options: OverlayLineOptions) => void;
  declare drawPath: (options: OverlayPathOptions) => void;
  declare drawImage: (options: ImageOptions) => void;
  declare drawSprite: (options: SpriteOptions) => void;

  constructor(game: M2D) {
    this.game = game;
    this.shapes = [];
    this.labels = [];
    this.warnedOverflow = false;

    for (const method of SHAPE_METHODS) {
      // One submitter per method, installed under the method's own name.
      (this as Record<ShapeMethod, (options: OverlayShapeOptions) => void>)[method] =
        (options) => this.#submit(this.shapes, method, options);
    }
  }

  /** Whether anything was submitted this frame. */
  get hasSubmissions(): boolean {
    return this.shapes.length > 0 || this.labels.length > 0;
  }

  #submit(
    queue: Array<{ method: ShapeMethod; options: OverlayShapeOptions }> | OverlayTextOptions[],
    method: ShapeMethod | null, options: OverlayShapeOptions | OverlayTextOptions
  ): void {
    if (this.shapes.length + this.labels.length >= MAX_ITEMS) {
      if (!this.warnedOverflow) {
        this.warnedOverflow = true;
        console.warn(
          `M2D: more than ${MAX_ITEMS} world-overlay submissions in one frame; dropping the rest. ` +
          'A game loop that replaces the engine loop must call game.drawOverlays() each frame.'
        );
      }
      return;
    }
    if (method) (queue as Array<{ method: ShapeMethod; options: OverlayShapeOptions }>)
      .push({ method, options: options as OverlayShapeOptions });
    else (queue as OverlayTextOptions[]).push(options as OverlayTextOptions);
  }

  /**
   * Draw text anchored to a world position, at a fixed UI size.
   *
   * `x` and `y` are the anchor in **world** coordinates; see
   * `OverlayTextOptions` for what the rest mean here.
   */
  drawText(options: OverlayTextOptions): void {
    this.#submit(this.labels, null, options);
  }

  /** Drop this frame's submissions. The engine calls this before the world pass. */
  clear(): void {
    this.shapes.length = 0;
    this.labels.length = 0;
  }

  /**
   * The transform that turns the world's render plane into UI coordinates:
   * where the camera puts the origin and one unit along x, so the camera's
   * zoom and rotation come through as well as its position. Shapes are
   * submitted on the render plane (already projected, under a projection),
   * so this does not project again.
   */
  #worldTransform(): { x: number; y: number; rotation: number; scaleX: number; scaleY: number } {
    const { camera, viewport } = this.game;
    const toUI = (x: number, y: number) => {
      const view = camera.worldToScreen(x, y);
      return viewToUI({ x: view.x, y: view.y, viewport });
    };
    const origin = toUI(0, 0);
    const unit = toUI(1, 0);
    const dx = unit.x - origin.x;
    const dy = unit.y - origin.y;
    const scale = Math.hypot(dx, dy);
    return { x: origin.x, y: origin.y, rotation: Math.atan2(dy, dx), scaleX: scale, scaleY: scale };
  }

  /** Replay the frame's submissions. Runs in the engine's overlay pass. */
  draw(): void {
    const { shapes, labels } = this;
    if (shapes.length === 0 && labels.length === 0) return;
    this.shapes = [];
    this.labels = [];

    const game = this.game;
    const ui = game.uiRenderer;
    const v = game.viewport;

    // The world's content rect in UI units. The overlay belongs to the world,
    // so it stops where the world does instead of running onto the bars.
    const content = {
      x: v.contentX / v.uiScale,
      y: v.contentY / v.uiScale,
      width: v.contentWidth / v.uiScale,
      height: v.contentHeight / v.uiScale
    };

    ui.pushClip(content);

    // Shapes are drawn in the ground plane's coordinates, which a 3D view
    // has no flat transform for. There, lines, paths and arcs — the
    // annotation shapes debug views draw — are projected point by point
    // through the camera instead (their points carry z); their widths are
    // UI units, as a label's size is, and an arc's radius projects unless
    // `screenRadius` says it already is UI units. Rects, images and
    // sprites stay flat-only.
    const three = this.game.renderer.dimensions === 3;
    const transform = three ? null : this.#worldTransform();
    if (shapes.length > 0 && transform) {
      // One transform for the whole batch: the calls replay verbatim, in the
      // world coordinates and world sizes they were submitted with.
      ui.pushTransform(transform);
      for (const { method, options } of shapes) {
        // The pair was made together by the submitter of that name.
        const call = ui[method] as (options: OverlayShapeOptions) => void;
        call.call(ui, options);
      }
      ui.popTransform();
    } else if (shapes.length > 0 && three) {
      const project = (x: number, y: number, z?: number) => game.worldToUI(x, y, z ?? 0);
      for (const entry of shapes) {
        if (entry.method === 'drawPath') {
          const options = entry.options as OverlayPathOptions;
          if (!Array.isArray(options.points)) continue;
          // A point behind the camera does not project; the rest still draw.
          const points = options.points
            .map((p) => project(p.x, p.y, p.z))
            .filter((p): p is { x: number; y: number } => !!p);
          if (points.length > 1) ui.drawPath({ ...options, points });
        } else if (entry.method === 'drawLine') {
          const options = entry.options as OverlayLineOptions;
          const a = project(options.x1, options.y1, options.z1);
          const b = project(options.x2, options.y2, options.z2);
          if (a && b) ui.drawLine({ ...options, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        } else if (entry.method === 'drawArc') {
          const options = entry.options as OverlayArcOptions;
          const centre = project(options.x, options.y, options.z);
          if (!centre) continue;
          const radius = options.screenRadius
            ? options.radius
            : (() => { const edge = project(options.x + options.radius, options.y, options.z); return edge ? Math.hypot(edge.x - centre.x, edge.y - centre.y) : 0; })();
          if (radius > 0.5) ui.drawArc({ ...options, x: centre.x, y: centre.y, radius });
        }
      }
    }

    // Text is projected per label instead, because its size must *not* follow
    // the transform — only its anchor does.
    for (const label of labels) {
      const anchor = game.worldToUI(label.x, label.y, label.z);
      if (!anchor) continue;
      const x = anchor.x + (label.offsetX || 0);
      const y = anchor.y + (label.offsetY || 0);
      if (
        x < content.x - CULL_MARGIN || x > content.x + content.width + CULL_MARGIN ||
        y < content.y - CULL_MARGIN || y > content.y + content.height + CULL_MARGIN
      ) continue;

      ui.drawText({ ...label, x, y });
    }

    ui.popClip();
  }

  destroy(): void {
    this.clear();
  }
}
