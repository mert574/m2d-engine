/**
 * The path tool: every named path drawn over the world, faintly, and the
 * selection's paths (a path picked in the tree, or the routes a selected
 * object follows) with a handle on each point.
 *
 * - Click a path's line to select it (`pathAt`); an object under the
 *   pointer wins, since a route always runs through its follower.
 * - Drag a point to move it; one edit on release.
 * - Double-click the selected line to add a point there (`addPointAt`).
 * - Alt-click a point to remove it (a path keeps two).
 *
 * The line is the engine's own `Path`, so what is drawn is what a
 * follower travels. SVG in client pixels over the canvas, like the
 * gizmo; only the point handles take the pointer.
 */

import { Path } from 'm2d-engine/core/path.js';
import { isPlainObject, paths, structure, type Op, type PathSegment, type PathPoint, type PointList } from 'm2d-editor-core';
import type { Viewport, Point } from './viewport.ts';

export interface PathToolCallbacks {
  doc(): Record<string, unknown> | null;
  /** The document path of what is selected: an object, a path, or nothing. */
  selected(): PathSegment[] | null;
  select(path: PathSegment[]): void;
  apply(ops: Op[], label: string): void;
  editable(): boolean;
  /** Whether a drag snaps; held Ctrl inverts it. */
  snapping(): boolean;
  snapStep(dimensions: 2 | 3): number;
  say(message: string): void;
}

export interface PathToolHandle {
  refresh(): void;
  /** The named path whose line passes under a client point, or null. */
  pathAt(clientX: number, clientY: number): string | null;
  /** Whether a client point lies on a line of the selection's paths. */
  onSelectedLine(clientX: number, clientY: number): boolean;
  /** Add a point where a client point lies on a selected line; false when it lies on none. */
  addPointAt(clientX: number, clientY: number): boolean;
}

/** How near the pointer has to be to a line to be on it, in client px. */
const LINE_SLOP = 6;

const SVG = 'http://www.w3.org/2000/svg';

interface Drag {
  list: PointList;
  index: number;
  start: PathPoint;
  at: PathPoint;
}

export function createPathTool(panel: HTMLElement, viewport: Viewport, callbacks: PathToolCallbacks): PathToolHandle {
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add('overlay', 'paths');
  panel.append(svg);
  let drag: Drag | null = null;

  const el = (name: string, attrs: Record<string, string | number>, parent: Element) => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    parent.append(node);
    return node;
  };

  const local = (p: Point): Point => {
    const box = panel.getBoundingClientRect();
    return { x: p.x - box.left, y: p.y - box.top };
  };

  const toClient = (p: PathPoint): Point | null =>
    viewport.dimensions === 3 ? viewport.project({ x: p.x, y: p.y, z: p.z ?? 0 }) : viewport.groundToClient(p.x, p.y);

  /** Where the pointer puts a point: on the ground in 2D, on the point's own height in 3D. */
  const fromClient = (clientX: number, clientY: number, like: PathPoint): PathPoint | null => {
    if (viewport.dimensions === 3) {
      const ground = viewport.groundPoint(clientX, clientY, like.y);
      return ground ? { x: ground.x, y: like.y, z: ground.z } : null;
    }
    return viewport.worldPoint(clientX, clientY);
  };

  const snapped = (point: PathPoint, invert: boolean): PathPoint => {
    const dimensions = viewport.dimensions;
    const step = callbacks.snapping() !== invert ? callbacks.snapStep(dimensions) : 0;
    const round = (value: number) => (step ? Math.round(value / step) * step : dimensions === 3 ? Math.round(value * 1000) / 1000 : Math.round(value));
    return { x: round(point.x), ...(dimensions === 3 ? { y: point.y, z: round(point.z ?? 0) } : { y: round(point.y) }) };
  };

  const pointsOf = (list: PointList): PathPoint[] => {
    const value = structure.valueAt(callbacks.doc(), list.points);
    const points = Array.isArray(value) ? value as PathPoint[] : [];
    return drag && drag.list.points.join('/') === list.points.join('/')
      ? points.map((point, i) => (i === drag!.index ? drag!.at : point))
      : points;
  };

  const screenLine = (list: PointList, points: PathPoint[]): Point[] =>
    new Path({ points, closed: list.closed, smooth: list.smooth }).line.flatMap((point) => {
      const c = toClient(point);
      return c ? [c] : [];
    });

  const svgPoints = (line: Point[]): string => line.map((c) => { const p = local(c); return `${p.x},${p.y}`; }).join(' ');

  const onLine = (line: Point[], x: number, y: number): boolean => line.some((a, i) => {
    const b = line[i + 1];
    if (!b) return false;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)) <= LINE_SLOP;
  });

  const activeLists = (doc: Record<string, unknown>): PointList[] => {
    const selectedPath = callbacks.selected();
    return selectedPath ? paths.pointListsFor(doc, selectedPath) : [];
  };

  const namedLists = (doc: Record<string, unknown>): PointList[] =>
    Object.keys(isPlainObject(doc.paths) ? doc.paths : {}).flatMap((name) => paths.pointListsFor(doc, ['paths', name]));

  const render = (): void => {
    svg.replaceChildren();
    const doc = callbacks.doc();
    if (!doc || viewport.playing) return;
    const active = activeLists(doc);
    const activeKeys = new Set(active.map((list) => list.points.join('/')));

    for (const list of namedLists(doc)) {
      if (activeKeys.has(list.points.join('/'))) continue;
      const points = pointsOf(list);
      if (points.length >= 2) el('polyline', { points: svgPoints(screenLine(list, points)), class: 'path-line' }, svg);
    }

    for (const list of active) {
      const points = pointsOf(list);
      if (points.length < 2) continue;
      el('polyline', { points: svgPoints(screenLine(list, points)), class: 'path-line active' }, svg);
      if (!callbacks.editable()) continue;
      points.forEach((point, index) => {
        const c = toClient(point);
        if (!c) return;
        const p = local(c);
        const handle = el('circle', { cx: p.x, cy: p.y, r: index === 0 ? 7 : 5.5, class: `path-point${index === 0 ? ' first' : ''}` }, svg);
        handle.addEventListener('pointerdown', (event) => {
          const e = event as PointerEvent;
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.altKey) { removePoint(list, index); return; }
          svg.setPointerCapture(e.pointerId);
          drag = { list, index, start: point, at: point };
        });
      });
    }
  };

  const describe = (list: PointList) => list.name ?? 'the path';

  svg.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const moved = fromClient(event.clientX, event.clientY, drag.start);
    if (!moved) return;
    drag.at = snapped(moved, event.ctrlKey);
    render();
  });
  const finish = (commit: boolean): void => {
    if (!drag) return;
    const { list, index, start, at } = drag;
    drag = null;
    const moved = at.x !== start.x || at.y !== start.y || at.z !== start.z;
    if (commit && moved) callbacks.apply([{ op: 'set', path: [...list.points, index], value: at }], `Move point ${index + 1} of ${describe(list)}`);
    render();
  };
  svg.addEventListener('pointerup', () => finish(true));
  svg.addEventListener('pointercancel', () => finish(false));

  const pathAt = (clientX: number, clientY: number): string | null => {
    const doc = callbacks.doc();
    if (!doc || viewport.playing) return null;
    const hit = namedLists(doc).find((list) => onLine(screenLine(list, pointsOf(list)), clientX, clientY));
    return hit?.name ?? null;
  };

  const selectedLineAt = (clientX: number, clientY: number): { list: PointList; points: PathPoint[] } | null => {
    const doc = callbacks.doc();
    if (!doc || viewport.playing) return null;
    for (const list of activeLists(doc)) {
      const points = pointsOf(list);
      if (points.length >= 2 && onLine(screenLine(list, points), clientX, clientY)) return { list, points };
    }
    return null;
  };

  const addPointAt = (clientX: number, clientY: number): boolean => {
    const hit = callbacks.editable() ? selectedLineAt(clientX, clientY) : null;
    const at = hit ? fromClient(clientX, clientY, hit.points[0]!) : null;
    if (!hit || !at) return false;
    const route = new Path({ points: hit.points, closed: hit.list.closed, smooth: hit.list.smooth });
    const along = route.nearest(at);
    const after = route.stops.findLastIndex((stop) => stop <= along);
    callbacks.apply(paths.insertPoint(hit.list.points, Math.max(0, after), snapped(at, false)), `Add a point to ${describe(hit.list)}`);
    return true;
  };

  const removePoint = (list: PointList, index: number): void => {
    try {
      callbacks.apply(paths.removePoint(callbacks.doc(), list.points, index), `Remove point ${index + 1} of ${describe(list)}`);
    } catch (error) {
      callbacks.say(String((error as Error).message ?? error));
    }
  };

  viewport.onViewChange(render);
  window.addEventListener('resize', render);

  return { refresh: render, pathAt, addPointAt, onSelectedLine: (x, y) => selectedLineAt(x, y) !== null };
}
