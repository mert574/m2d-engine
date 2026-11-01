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
const SHAPE_METHODS = ['drawRect', 'drawArc', 'drawLine', 'drawPath', 'drawImage', 'drawSprite'];

export class WorldOverlay {
  /** @param {import('../m2d.js').M2D} game */
  constructor(game) {
    this.game = game;
    /** @type {Array<{method: string, options: Object}>} Shape submissions, in submission order. */
    this.shapes = [];
    /** @type {Array<Object>} Text submissions, drawn above the shapes. */
    this.labels = [];
    this.warnedOverflow = false;

    for (const method of SHAPE_METHODS) {
      this[method] = (options) => this.#submit(this.shapes, method, options);
    }

    game.overlays.add(this);
  }

  #submit(queue, method, options) {
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
    queue.push(method ? { method, options } : options);
  }

  /**
   * Draw text anchored to a world position, at a fixed UI size.
   *
   * @param {Object} options - `drawText` options, with these reinterpreted
   * @param {number} options.x - Anchor X in **world** coordinates
   * @param {number} options.y - Anchor Y in **world** coordinates
   * @param {number} [options.offsetX=0] - Offset from the anchor, in UI units
   * @param {number} [options.offsetY=0] - Offset from the anchor, in UI units
   */
  drawText(options) {
    this.#submit(this.labels, null, options);
  }

  /** Drop this frame's submissions. The engine calls this before the world pass. */
  clear() {
    this.shapes.length = 0;
    this.labels.length = 0;
  }

  /**
   * The transform that turns world coordinates into UI coordinates.
   *
   * Both spaces are measured in design-sized units, so the scale works out to
   * 1 for every viewport the engine produces and this is in practice a pure
   * translation by the content rect's origin. It is derived rather than
   * assumed so the overlay stays correct if that ever stops being true.
   */
  #worldTransform() {
    const v = this.game.viewport;
    const origin = this.game.worldToUI(0, 0);
    const scale = (v.contentWidth / v.viewWidth) / v.uiScale;
    return { x: origin.x, y: origin.y, scaleX: scale, scaleY: scale };
  }

  /** Replay the frame's submissions. Runs in the engine's overlay pass. */
  draw() {
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

    if (shapes.length > 0) {
      // One transform for the whole batch: the calls replay verbatim, in the
      // world coordinates and world sizes they were submitted with.
      ui.pushTransform(this.#worldTransform());
      for (const { method, options } of shapes) ui[method](options);
      ui.popTransform();
    }

    // Text is projected per label instead, because its size must *not* follow
    // the transform — only its anchor does.
    for (const label of labels) {
      const anchor = game.worldToUI(label.x, label.y);
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

  destroy() {
    this.clear();
    this.game.overlays.delete(this);
  }
}
