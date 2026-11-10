/**
 * The viewport's overlay: the selection's outline and its gizmo, in SVG
 * over the engine's canvas.
 *
 * DOM rather than engine drawing, on purpose: the handles are elements,
 * so the browser hit-tests them and a drag on one never reaches the
 * engine (the camera's drag); everything else in the overlay ignores the
 * pointer, so a drag anywhere but a handle still moves the camera. It is
 * the same in 2D and 3D, because the viewport hands over geometry already
 * in client pixels (`Viewport.placement`).
 *
 * Three modes, as in every 3D tool: **move** (an arm per axis, and a
 * centre square for a free move — along the ground in 3D), **rotate** (in
 * 2D a ring turning the angle; in 3D a ring per world axis, turning the
 * quaternion about it) and **scale** (a boxed arm per axis for one side,
 * a centre box for all sides at once). A move or a turn previews by
 * posing the body (`Viewport.preview`); a scale previews as the outline
 * growing, since a body cannot be resized without rebuilding it. All
 * commit once, on release, as one edit — one step of undo per gesture.
 *
 * The overlay also draws a **ghost**: the outline of what a dragged asset
 * would become where the pointer is, so a drop lands where it looks.
 */

import { rotation, type Quaternion } from 'm2d-editor-core';
import type { Viewport, Placement, Point, Pose } from './viewport.ts';

const SVG = 'http://www.w3.org/2000/svg';
const AXIS_COLOURS = { x: '#ff6b6b', y: '#7bdc7b', z: '#62a6ff' } as const;
const ARM = 70;
const RING = 92;

export type GizmoMode = 'move' | 'rotate' | 'scale';

/** What a gesture ends with: a pose, or a size. */
export interface GizmoResult extends Pose {
  size?: { x: number; y: number; z?: number };
}

export interface OverlayOptions {
  /** Whether positions and angles snap; held Ctrl inverts it for one drag. */
  snapping(): boolean;
  /** The grid step in world units, and the angle step in radians. */
  snapStep(dimensions: 2 | 3): number;
  angleStep: number;
  /** A drag ended: write it — one result per selected object, the primary first, as one edit. */
  commit(results: Array<{ id: string; result: GizmoResult }>): void;
  /** Whether the selection may be moved (a generated scene may not). */
  editable(): boolean;
  /**
   * The object's placement as the document says — what a drag starts from.
   * Not the body's: an actor may put its body elsewhere (a platform on a
   * path starts at the path's first point), and the gizmo edits the field.
   * `uniform` says the object only scales as a whole (a model does).
   */
  placed(id: string): {
    x?: number; y?: number; z?: number; angle?: number; rotation?: Quaternion;
    width?: number; height?: number; depth?: number; uniform?: boolean;
  } | null;
}

export interface OverlayHandle {
  /** The selected objects, the primary first; every one is outlined, the gizmo sits at their centre. */
  select(ids: string[]): void;
  /** Draw (or clear) a marquee rectangle, in client pixels. */
  marquee(rect: { x: number; y: number; width: number; height: number } | null): void;
  setMode(mode: GizmoMode): void;
  readonly mode: GizmoMode;
  refresh(): void;
  /** Whether a gizmo drag is in progress. */
  readonly dragging: boolean;
  /** Show (or clear) the outline of what a drop would place, with a caption. */
  ghost(edges: Array<[Point, Point]> | null, caption?: string): void;
}

/** Where one selected object started a gesture from, as the document says. */
interface Start {
  id: string;
  position: { x: number; y: number; z?: number };
  angle: number;
  rotation?: Quaternion;
  size: { x: number; y: number; z?: number };
  uniform: boolean;
}

interface Drag {
  id: string;
  /** The other selected objects, moving with the primary. */
  others: Start[];
  startX: number;
  startY: number;
  placement: Placement;
  /** 'x' | 'y' | 'z' | 'free' | 'rotate' | 'ring-x' | 'ring-y' | 'ring-z' | 'scale-x' | 'scale-y' | 'scale-z' | 'scale-free' */
  handle: string;
  /** The sizes the drag started from, and whether they scale together. */
  size: { x: number; y: number; z?: number };
  uniform: boolean;
  /** The size being previewed, during a scale drag. */
  previewSize?: { x: number; y: number; z?: number };
}

export function createOverlay(container: HTMLElement, viewport: Viewport, options: OverlayOptions): OverlayHandle {
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add('overlay');
  container.append(svg);
  // Two layers: the selection, redrawn on every change, and the ghost,
  // which lives through them.
  const selectionLayer = document.createElementNS(SVG, 'g');
  const ghostLayer = document.createElementNS(SVG, 'g');
  ghostLayer.setAttribute('class', 'ghost');
  svg.append(selectionLayer, ghostLayer);
  let selectedIds: string[] = [];
  let mode: GizmoMode = 'move';
  let drag: Drag | null = null;
  const selected = (): string | null => selectedIds[0] ?? null;
  const marqueeLayer = document.createElementNS(SVG, 'g');
  marqueeLayer.setAttribute('class', 'marquee');
  svg.append(marqueeLayer);

  /** The document's placement of an object, over what is shown, as a gesture starts from it. */
  const startOf = (id: string): Start | null => {
    const shown = viewport.placement(id);
    if (!shown) return null;
    const placed = options.placed(id) ?? {};
    return {
      id,
      position: {
        x: placed.x ?? shown.position.x,
        y: placed.y ?? shown.position.y,
        ...(shown.dimensions === 3 && { z: placed.z ?? shown.position.z ?? 0 })
      },
      angle: placed.angle ?? 0,
      rotation: placed.rotation ?? shown.rotation,
      size: {
        x: placed.width ?? shown.size.x,
        y: placed.height ?? shown.size.y,
        ...(shown.dimensions === 3 && { z: placed.depth ?? shown.size.z ?? shown.size.x })
      },
      uniform: placed.uniform === true
    };
  };

  /** Where the gizmo sits: the mean of the selection's centres on screen (the primary's alone when the rest are off). */
  const groupCentre = (primary: Placement): Point => {
    let x = 0; let y = 0; let n = 0;
    for (const id of selectedIds) {
      const p = id === primary.id ? primary : viewport.placement(id);
      if (!p) continue;
      x += p.center.x; y += p.center.y; n++;
    }
    return n ? { x: x / n, y: y / n } : primary.center;
  };

  /** The pose of another object under the primary's gesture: the same shift, the same turn about its own centre. */
  const follow = (other: Start, primary: Start, result: GizmoResult): GizmoResult => {
    const out: GizmoResult = {};
    if (result.position) {
      out.position = { ...other.position };
      for (const axis of ['x', 'y', 'z'] as const) {
        const d = (result.position[axis] ?? primary.position[axis] ?? 0) - (primary.position[axis] ?? 0);
        if (other.position[axis] !== undefined || axis !== 'z') out.position[axis] = (other.position[axis] ?? 0) + d;
      }
    }
    if (result.angle !== undefined) out.angle = other.angle + (result.angle - primary.angle);
    if (result.rotation) {
      const delta = rotation.multiply(result.rotation, rotation.conjugate(primary.rotation ?? rotation.IDENTITY));
      out.rotation = rotation.forScene(rotation.multiply(delta, other.rotation ?? rotation.IDENTITY));
    }
    if (result.size) {
      const f = { x: result.size.x / primary.size.x, y: result.size.y / primary.size.y, z: (result.size.z ?? 1) / (primary.size.z ?? 1) };
      out.size = other.uniform
        ? { x: other.size.x * f.x, y: other.size.y * f.x, ...(other.size.z !== undefined && { z: other.size.z * f.x }) }
        : { x: other.size.x * f.x, y: other.size.y * f.y, ...(other.size.z !== undefined && { z: other.size.z * f.z }) };
    }
    return out;
  };

  const el = (name: string, attrs: Record<string, string | number>, parent: Element = selectionLayer) => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    parent.append(node);
    return node;
  };

  const local = (p: Point): Point => {
    const box = container.getBoundingClientRect();
    return { x: p.x - box.left, y: p.y - box.top };
  };

  const drawEdges = (edges: Array<[Point, Point]>, parent: Element) => {
    for (const [a, b] of edges) {
      const p = local(a);
      const q = local(b);
      el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, parent);
    }
  };

  const render = (): void => {
    selectionLayer.replaceChildren();
    const primary = selected();
    if (!primary) return;
    const placement = viewport.placement(primary);
    if (!placement) return;
    const outline = el('g', { class: 'outline' });
    // A scale in progress shows as the outline it would end with.
    const edges = drag?.previewSize && drag.id === primary
      ? viewport.outline(placement.dimensions === 3
        ? { position: placement.position, size: drag.previewSize, rotation: placement.rotation }
        : { drawnAt: placement.drawnAt, size: drag.previewSize, angle: placement.angle })
      : placement.edges;
    drawEdges(edges, outline);
    if (drag?.previewSize) outline.classList.add('preview');
    // The rest of the selection, outlined more quietly.
    for (const id of selectedIds.slice(1)) {
      const other = viewport.placement(id);
      if (other) drawEdges(other.edges, el('g', { class: 'outline also' }));
    }
    // Off the canvas there is nothing to grab; the clipped outline says where it went.
    if (!options.editable() || !placement.onScreen) return;

    const c = local(groupCentre(placement));
    const gizmo = el('g', { class: `gizmo mode-${mode}` });
    if (mode === 'rotate') {
      if (placement.dimensions === 2) {
        el('circle', { cx: c.x, cy: c.y, r: RING, fill: 'none', class: 'handle ring', 'data-handle': 'rotate' }, gizmo);
      } else {
        // Back halves first would need depth; the rings are thin enough that
        // drawing the one facing away under the others reads well.
        const rings = [...(placement.rings ?? [])].sort((a, b) => Number(a.facing) - Number(b.facing));
        for (const ring of rings) {
          if (ring.points.length < 2) continue;
          const points = ring.points.map((point) => { const p = local(point); return `${p.x},${p.y}`; }).join(' ');
          el('polyline', { points, fill: 'none', stroke: AXIS_COLOURS[ring.axis], class: 'handle ring3d', 'data-handle': `ring-${ring.axis}` }, gizmo);
        }
      }
      el('circle', { cx: c.x, cy: c.y, r: 3, class: 'pivot' }, gizmo);
      return;
    }
    const scaling = mode === 'scale';
    for (const { axis, dir } of placement.axes) {
      if (!dir.x && !dir.y) continue;
      const end = { x: c.x + dir.x * ARM, y: c.y + dir.y * ARM };
      const handle = scaling ? `scale-${axis}` : axis;
      el('line', { x1: c.x, y1: c.y, x2: end.x, y2: end.y, stroke: AXIS_COLOURS[axis], class: 'handle arm', 'data-handle': handle }, gizmo);
      if (scaling) {
        el('rect', { x: end.x - 6, y: end.y - 6, width: 12, height: 12, fill: AXIS_COLOURS[axis], class: 'handle tip', 'data-handle': handle }, gizmo);
      } else {
        el('circle', { cx: end.x, cy: end.y, r: 7, fill: AXIS_COLOURS[axis], class: 'handle tip', 'data-handle': handle }, gizmo);
      }
    }
    el('rect', {
      x: c.x - 8, y: c.y - 8, width: 16, height: 16, rx: scaling ? 1 : 3,
      class: `handle free${scaling ? ' uniform' : ''}`, 'data-handle': scaling ? 'scale-free' : 'free'
    }, gizmo);
  };

  // At once, not on the next animation frame: a dozen SVG nodes cost
  // nothing, and a GPU-bound page can starve requestAnimationFrame for
  // seconds — the outline must not wait for the world to finish drawing.
  const refresh = (): void => { render(); };

  /** Where the drag puts the object, from where it started. */
  const resolve = (clientX: number, clientY: number, ctrl: boolean): GizmoResult => {
    const { placement, startX, startY, handle } = drag!;
    const snap = options.snapping() !== ctrl;
    const step = options.snapStep(placement.dimensions);
    const round = (value: number) => (snap ? Math.round(value / step) * step : value);
    const roundAngle = (value: number) => (snap ? Math.round(value / options.angleStep) * options.angleStep : value);
    const dx = clientX - startX;
    const dy = clientY - startY;
    const start = placement.position;
    const c = groupCentre(placement);
    const turn = Math.atan2(clientY - c.y, clientX - c.x) - Math.atan2(startY - c.y, startX - c.x);

    if (handle === 'rotate') return { angle: roundAngle(placement.angle + turn) };
    if (handle.startsWith('ring-')) {
      const ring = placement.rings?.find((each) => `ring-${each.axis}` === handle);
      if (!ring) return {};
      // A turn that reads clockwise on screen is a negative turn about an
      // axis pointing at the viewer, and a positive one about an axis
      // pointing away.
      const angle = roundAngle(ring.facing ? -turn : turn);
      const q = rotation.multiply(rotation.fromAxisAngle(ring.normal, angle), placement.rotation ?? rotation.IDENTITY);
      return { rotation: rotation.forScene(q) };
    }
    if (handle.startsWith('scale-')) {
      const { size, uniform } = drag!;
      // A side's handle: the drag along its arm, as a fraction of the arm's
      // length, grows or shrinks that side. The centre (or any handle of a
      // thing that only scales whole): right and up grow all sides.
      const axis = handle.slice(6) as 'x' | 'y' | 'z' | 'free';
      const arm = axis === 'free' ? null : placement.axes.find((entry) => entry.axis === axis);
      const factor = Math.max(0.02, arm && !uniform
        ? 1 + (dx * arm.dir.x + dy * arm.dir.y) / ARM
        : 1 + (dx - dy) / 160);
      const sized = (value: number) => Math.max(snap ? step : 1e-4, snap ? Math.round((value * factor) / step) * step : value * factor);
      const next = { ...size };
      if (arm && !uniform) next[axis as 'x'] = sized(size[axis as 'x'] ?? size.x);
      else {
        next.x = sized(size.x);
        next.y = sized(size.y);
        if (size.z !== undefined) next.z = sized(size.z);
      }
      return { size: next };
    }
    if (handle === 'free' && placement.dimensions === 3) {
      const from = viewport.groundPoint(startX, startY, start.y);
      const to = viewport.groundPoint(clientX, clientY, start.y);
      if (!from || !to) return {};
      return { position: { x: round(start.x + to.x - from.x), y: start.y, z: round((start.z ?? 0) + to.z - from.z) } };
    }
    if (handle === 'free') {
      // Solve the drag against the two ground axes as drawn — exact under
      // any affine projection, the isometric and belt ones included.
      const [ax, ay] = placement.axes;
      const a = { x: ax!.dir.x * ax!.scale, y: ax!.dir.y * ax!.scale };
      const b = { x: ay!.dir.x * ay!.scale, y: ay!.dir.y * ay!.scale };
      const det = a.x * b.y - a.y * b.x;
      if (Math.abs(det) < 1e-9) return {};
      const u = (dx * b.y - dy * b.x) / det;
      const v = (a.x * dy - a.y * dx) / det;
      return { position: { x: round(start.x + u), y: round(start.y + v) } };
    }
    const axis = placement.axes.find((entry) => entry.axis === handle);
    if (!axis || axis.scale < 1e-9) return {};
    const along = (dx * axis.dir.x + dy * axis.dir.y) / axis.scale;
    const position = { ...start };
    position[handle as 'x'] = round((start[handle as 'x'] ?? 0) + along);
    return { position };
  };

  svg.addEventListener('pointerdown', (event) => {
    const target = event.target as Element;
    const handle = target.getAttribute?.('data-handle');
    const primary = selected();
    if (!handle || !primary) return;
    const shown = viewport.placement(primary);
    const start = startOf(primary);
    if (!shown || !start) return;
    const placement: Placement = { ...shown, position: start.position, angle: start.angle, rotation: start.rotation };
    event.preventDefault();
    event.stopPropagation();
    svg.setPointerCapture(event.pointerId);
    const others = selectedIds.slice(1).map(startOf).filter((each): each is Start => !!each);
    drag = { id: primary, others, startX: event.clientX, startY: event.clientY, placement, handle, size: start.size, uniform: start.uniform };
    svg.classList.add('dragging');
  });
  /** The primary's start, as a Start, for `follow`. */
  const primaryStart = (d: Drag): Start => ({ id: d.id, position: d.placement.position, angle: d.placement.angle, rotation: d.placement.rotation, size: d.size, uniform: d.uniform });
  svg.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const result = resolve(event.clientX, event.clientY, event.ctrlKey);
    if (result.size) {
      drag.previewSize = result.size;
      // The object itself takes the size, every frame of the drag; the
      // dashed outline says what the edit will write.
      viewport.previewSize(drag.id, result.size);
      const lead = primaryStart(drag);
      for (const other of drag.others) {
        const pose = follow(other, lead, result);
        if (pose.size) viewport.previewSize(other.id, pose.size);
      }
      refresh();
      return;
    }
    viewport.preview(drag.id, { position: drag.placement.position, ...result });
    const lead = primaryStart(drag);
    for (const other of drag.others) {
      const pose = follow(other, lead, result);
      viewport.preview(other.id, { position: other.position, ...pose });
    }
  });
  const finish = (event: PointerEvent, commit: boolean) => {
    if (!drag) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 1;
    const result = commit && moved ? resolve(event.clientX, event.clientY, event.ctrlKey) : null;
    const { id, placement, handle, others } = drag;
    const lead = primaryStart(drag);
    drag = null;
    svg.classList.remove('dragging');
    const committed = !!result && (!!result.position || result.angle !== undefined || !!result.rotation || !!result.size);
    if (handle.startsWith('scale-')) {
      // Committed: the edit rebuilds the objects, so the preview is simply forgotten; cancelled: put them back.
      for (const each of [id, ...others.map((other) => other.id)]) viewport.endPreviewSize(each, !committed);
    }
    if (committed) {
      options.commit([{ id, result }, ...others.map((other) => ({ id: other.id, result: follow(other, lead, result) }))]);
    } else if (!handle.startsWith('scale-')) {
      viewport.preview(id, { position: placement.position, angle: placement.angle, rotation: placement.rotation });
      for (const other of others) viewport.preview(other.id, { position: other.position, angle: other.angle, rotation: other.rotation });
    }
    refresh();
  };
  svg.addEventListener('pointerup', (event) => finish(event, true));
  svg.addEventListener('pointercancel', (event) => finish(event, false));

  viewport.onViewChange(refresh);
  window.addEventListener('resize', refresh);

  return {
    select(ids) {
      selectedIds = [...ids];
      refresh();
    },
    marquee(rect) {
      marqueeLayer.replaceChildren();
      if (!rect) return;
      const p = local({ x: rect.x, y: rect.y });
      el('rect', { x: p.x, y: p.y, width: rect.width, height: rect.height }, marqueeLayer);
    },
    setMode(next) {
      mode = next;
      refresh();
    },
    get mode() { return mode; },
    refresh,
    get dragging() { return drag !== null; },
    ghost(edges, caption) {
      ghostLayer.replaceChildren();
      if (!edges?.length) return;
      drawEdges(edges, ghostLayer);
      if (caption) {
        // The caption sits under the lowest point of the outline.
        let low = edges[0]![0];
        for (const [a, b] of edges) for (const p of [a, b]) if (p.y > low.y) low = p;
        const at = local(low);
        const text = el('text', { x: at.x, y: at.y + 16, 'text-anchor': 'middle', class: 'caption' }, ghostLayer);
        text.textContent = caption;
      }
    }
  };
}
