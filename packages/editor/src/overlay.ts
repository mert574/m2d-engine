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
 * Two modes, as in every 3D tool: **move** (an arm per axis, and a centre
 * square for a free move — along the ground in 3D) and **rotate** (in 2D a
 * ring turning the angle; in 3D a ring per world axis, turning the
 * quaternion about it). A drag previews by posing the body
 * (`Viewport.preview`) and commits once, on release, as one edit — one
 * step of undo per gesture.
 */

import { rotation, type Quaternion } from 'm2d-editor-core';
import type { Viewport, Placement, Point, Pose } from './viewport.ts';

const SVG = 'http://www.w3.org/2000/svg';
const AXIS_COLOURS = { x: '#ff6b6b', y: '#7bdc7b', z: '#62a6ff' } as const;
const ARM = 70;
const RING = 92;

export type GizmoMode = 'move' | 'rotate';
export type GizmoResult = Pose;

export interface OverlayOptions {
  /** Whether positions and angles snap; held Ctrl inverts it for one drag. */
  snapping(): boolean;
  /** The grid step in world units, and the angle step in radians. */
  snapStep(dimensions: 2 | 3): number;
  angleStep: number;
  /** A drag ended: write it. */
  commit(id: string, result: GizmoResult): void;
  /** Whether the selection may be moved (a generated scene may not). */
  editable(): boolean;
  /**
   * The object's placement as the document says — what a drag starts from.
   * Not the body's: an actor may put its body elsewhere (a platform on a
   * path starts at the path's first point), and the gizmo edits the field.
   */
  placed(id: string): { x?: number; y?: number; z?: number; angle?: number; rotation?: Quaternion } | null;
}

export interface OverlayHandle {
  select(id: string | null): void;
  setMode(mode: GizmoMode): void;
  readonly mode: GizmoMode;
  refresh(): void;
  /** Whether a gizmo drag is in progress. */
  readonly dragging: boolean;
}

interface Drag {
  id: string;
  startX: number;
  startY: number;
  placement: Placement;
  /** 'x' | 'y' | 'z' | 'free' | 'rotate' | 'ring-x' | 'ring-y' | 'ring-z' */
  handle: string;
}

export function createOverlay(container: HTMLElement, viewport: Viewport, options: OverlayOptions): OverlayHandle {
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add('overlay');
  container.append(svg);
  let selected: string | null = null;
  let mode: GizmoMode = 'move';
  let drag: Drag | null = null;

  const el = (name: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    parent.append(node);
    return node;
  };

  const local = (p: Point): Point => {
    const box = container.getBoundingClientRect();
    return { x: p.x - box.left, y: p.y - box.top };
  };

  const render = (): void => {
    svg.replaceChildren();
    if (!selected) return;
    const placement = viewport.placement(selected);
    if (!placement) return;
    const outline = el('g', { class: 'outline' });
    for (const [a, b] of placement.edges) {
      const p = local(a);
      const q = local(b);
      el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, outline);
    }
    if (!options.editable()) return;

    const c = local(placement.center);
    const gizmo = el('g', { class: `gizmo mode-${mode}` });
    if (mode === 'rotate') {
      if (placement.dimensions === 2) {
        el('circle', { cx: c.x, cy: c.y, r: RING, fill: 'none', class: 'handle ring', 'data-handle': 'rotate' }, gizmo);
      } else {
        // Back halves first would need depth; the rings are thin enough that
        // drawing the one facing away under the others reads well.
        const rings = [...(placement.rings ?? [])].sort((a, b) => Number(a.facing) - Number(b.facing));
        for (const ring of rings) {
          const points = ring.points.map((point) => { const p = local(point); return `${p.x},${p.y}`; }).join(' ');
          el('polyline', { points, fill: 'none', stroke: AXIS_COLOURS[ring.axis], class: 'handle ring3d', 'data-handle': `ring-${ring.axis}` }, gizmo);
        }
      }
      el('circle', { cx: c.x, cy: c.y, r: 3, class: 'pivot' }, gizmo);
      return;
    }
    for (const { axis, dir } of placement.axes) {
      if (!dir.x && !dir.y) continue;
      const end = { x: c.x + dir.x * ARM, y: c.y + dir.y * ARM };
      el('line', { x1: c.x, y1: c.y, x2: end.x, y2: end.y, stroke: AXIS_COLOURS[axis], class: 'handle arm', 'data-handle': axis }, gizmo);
      el('circle', { cx: end.x, cy: end.y, r: 7, fill: AXIS_COLOURS[axis], class: 'handle tip', 'data-handle': axis }, gizmo);
    }
    el('rect', { x: c.x - 8, y: c.y - 8, width: 16, height: 16, rx: 3, class: 'handle free', 'data-handle': 'free' }, gizmo);
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
    const c = placement.center;
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
    if (!handle || !selected) return;
    const shown = viewport.placement(selected);
    if (!shown) return;
    const placed = options.placed(selected) ?? {};
    const placement: Placement = {
      ...shown,
      position: {
        x: placed.x ?? shown.position.x,
        y: placed.y ?? shown.position.y,
        ...(shown.dimensions === 3 && { z: placed.z ?? shown.position.z ?? 0 })
      },
      angle: placed.angle ?? 0,
      rotation: placed.rotation ?? shown.rotation
    };
    event.preventDefault();
    event.stopPropagation();
    svg.setPointerCapture(event.pointerId);
    drag = { id: selected, startX: event.clientX, startY: event.clientY, placement, handle };
    svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const result = resolve(event.clientX, event.clientY, event.ctrlKey);
    viewport.preview(drag.id, { position: drag.placement.position, ...result });
  });
  const finish = (event: PointerEvent, commit: boolean) => {
    if (!drag) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 1;
    const result = commit && moved ? resolve(event.clientX, event.clientY, event.ctrlKey) : null;
    const { id, placement } = drag;
    drag = null;
    svg.classList.remove('dragging');
    if (result && (result.position || result.angle !== undefined || result.rotation)) options.commit(id, result);
    else viewport.preview(id, { position: placement.position, angle: placement.angle, rotation: placement.rotation });
  };
  svg.addEventListener('pointerup', (event) => finish(event, true));
  svg.addEventListener('pointercancel', (event) => finish(event, false));

  viewport.onViewChange(refresh);
  window.addEventListener('resize', refresh);

  return {
    select(id) {
      selected = id;
      refresh();
    },
    setMode(next) {
      mode = next;
      refresh();
    },
    get mode() { return mode; },
    refresh,
    get dragging() { return drag !== null; }
  };
}
