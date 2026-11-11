/**
 * The prop brushes (E7b): scatter and erase, over one prop group of a 3D
 * scene.
 *
 * A brush is a mode: while one is active the pointer belongs to it — a
 * drag paints instead of panning the camera or drawing a marquee — and a
 * strip over the viewport holds its settings. A stroke commits **once, on
 * release**, as one step of undo (`structure.scatterProps` /
 * `erasePropInstances`), so painting stays smooth however many instances
 * it touches; while the stroke is down, the overlay's ghost layer shows
 * the brush circle and what it has planted or will erase.
 *
 * Scatter plants instances in the brush disc at the group's own height:
 * `count` per stamp, a random turn, and a scale jittered by `jitter`.
 * Erase takes out every instance of the group the stroke covered.
 */

import { structure, isPlainObject, type Op, type PathSegment } from 'm2d-editor-core';
import type { Viewport, Point } from './viewport.ts';

export interface BrushCallbacks {
  doc(): Record<string, unknown> | null;
  edit(label: string, ops: Op[]): void;
  /** The overlay's ghost layer: edges in client pixels, with a caption. */
  ghost(edges: Array<[Point, Point]> | null, caption?: string): void;
  say(text: string): void;
  /** The brush turned on or off; the editor gates its own pointer work on `active`. */
  changed(): void;
}

export type BrushKind = 'scatter' | 'erase';

export interface BrushHandle {
  /** Enter brush mode over the prop group at `propPath`. */
  start(kind: BrushKind, propPath: PathSegment[]): void;
  stop(): void;
  readonly active: boolean;
}

interface BrushState {
  kind: BrushKind;
  propPath: PathSegment[];
  /** The group's id and prefab, for the strip and the labels. */
  group: string;
  prefab: string;
  /** Where the group lives vertically: new instances land at this height. */
  groundY: number;
}

interface Stroke {
  /** Scatter: the tuples planted so far. */
  points: structure.PropInstance[];
  /** Erase: the indices covered so far. */
  erased: Set<number>;
  /** Where the last stamp fell, to space stamps along the drag. */
  lastStamp: Point | null;
}

export function createPropBrush(panel: HTMLElement, viewport: Viewport, callbacks: BrushCallbacks): BrushHandle {
  let state: BrushState | null = null;
  let stroke: Stroke | null = null;
  const params = { radius: 4, count: 3, jitter: 0.25, turn: true };

  const strip = document.createElement('div');
  strip.id = 'brush';
  strip.hidden = true;
  panel.append(strip);

  const groupAt = (path: PathSegment[]): Record<string, unknown> | null => {
    const doc = callbacks.doc();
    let value: unknown = doc;
    for (const segment of path) value = isPlainObject(value) || Array.isArray(value) ? (value as Record<string, unknown>)[segment as never] : undefined;
    return isPlainObject(value) ? value : null;
  };

  const renderStrip = (): void => {
    strip.replaceChildren();
    if (!state) return;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = `${state.kind === 'scatter' ? 'Scatter' : 'Erase'} · ${state.group}`;
    strip.append(label);
    const field = (name: string, value: number, step: number, min: number, write: (v: number) => void): void => {
      const wrap = document.createElement('label');
      wrap.className = 'brush-field';
      wrap.append(document.createTextNode(name));
      const input = document.createElement('input');
      input.type = 'number';
      input.step = String(step);
      input.min = String(min);
      input.value = String(value);
      input.addEventListener('change', () => { const v = Number(input.value); if (Number.isFinite(v) && v >= min) write(v); });
      wrap.append(input);
      strip.append(wrap);
    };
    field('Radius', params.radius, 0.5, 0.5, (v) => { params.radius = v; });
    if (state.kind === 'scatter') {
      field('Per stamp', params.count, 1, 1, (v) => { params.count = Math.round(v); });
      field('Jitter', params.jitter, 0.05, 0, (v) => { params.jitter = v; });
      const turn = document.createElement('label');
      turn.className = 'brush-field';
      turn.append(document.createTextNode('Turn'));
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = params.turn;
      box.addEventListener('change', () => { params.turn = box.checked; });
      turn.append(box);
      strip.append(turn);
    }
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Done';
    done.title = 'Leave the brush (Esc)';
    done.addEventListener('click', stop);
    strip.append(done);
  };

  /** The brush circle on the ground, as client edges for the ghost layer. */
  const circleEdges = (centre: { x: number; y: number; z: number }): Array<[Point, Point]> => {
    const points: Point[] = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const p = viewport.project({ x: centre.x + Math.cos(a) * params.radius, y: centre.y, z: centre.z + Math.sin(a) * params.radius });
      if (p && !p.behind) points.push(p);
    }
    const edges: Array<[Point, Point]> = [];
    for (let i = 1; i < points.length; i++) edges.push([points[i - 1]!, points[i]!]);
    return edges;
  };

  /** A small ground cross where an instance was planted. */
  const crossEdges = (at: structure.PropInstance): Array<[Point, Point]> => {
    const [x, y, z] = at;
    const arm = Math.max(0.2, params.radius * 0.06);
    const p = (dx: number, dz: number) => viewport.project({ x: x + dx, y, z: z + dz });
    const a = p(-arm, 0); const b = p(arm, 0); const c = p(0, -arm); const d = p(0, arm);
    const edges: Array<[Point, Point]> = [];
    if (a && b && !a.behind && !b.behind) edges.push([a, b]);
    if (c && d && !c.behind && !d.behind) edges.push([c, d]);
    return edges;
  };

  const showGhost = (centre: { x: number; y: number; z: number } | null): void => {
    if (!state) { callbacks.ghost(null); return; }
    const edges = centre ? circleEdges(centre) : [];
    let caption = state.kind === 'scatter' ? `Scatter ${state.prefab}` : `Erase ${state.prefab}`;
    if (stroke) {
      if (state.kind === 'scatter') {
        for (const point of stroke.points) edges.push(...crossEdges(point));
        caption = `${stroke.points.length} planted`;
      } else {
        caption = `${stroke.erased.size} to erase`;
      }
    }
    callbacks.ghost(edges.length ? edges : null, caption);
  };

  const groundAt = (event: PointerEvent): { x: number; y: number; z: number } | null => {
    if (!state) return null;
    const p = viewport.groundPoint(event.clientX, event.clientY, state.groundY);
    return p ? { x: p.x, y: state.groundY, z: p.z } : null;
  };

  const stamp = (centre: { x: number; y: number; z: number }): void => {
    if (!state || !stroke) return;
    if (state.kind === 'scatter') {
      for (let i = 0; i < params.count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * params.radius;
        const scale = Math.max(0.05, 1 + (Math.random() * 2 - 1) * params.jitter);
        stroke.points.push([centre.x + Math.cos(a) * r, state.groundY, centre.z + Math.sin(a) * r, params.turn ? Math.random() * Math.PI * 2 : 0, scale]);
      }
      return;
    }
    const group = groupAt(state.propPath);
    const instances = group && Array.isArray(group.instances) ? group.instances : [];
    const reach = params.radius * params.radius;
    instances.forEach((tuple, index) => {
      if (!Array.isArray(tuple)) return;
      const dx = (tuple[0] as number) - centre.x;
      const dz = (tuple[2] as number) - centre.z;
      if (dx * dx + dz * dz <= reach) stroke!.erased.add(index);
    });
  };

  const down = (event: PointerEvent): void => {
    if (!state || event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const centre = groundAt(event);
    if (!centre) return;
    stroke = { points: [], erased: new Set(), lastStamp: { x: event.clientX, y: event.clientY } };
    stamp(centre);
    showGhost(centre);
  };

  const move = (event: PointerEvent): void => {
    if (!state) return;
    const centre = groundAt(event);
    if (stroke) {
      event.preventDefault();
      event.stopPropagation();
      if (centre) {
        const last = stroke.lastStamp;
        const moved = last ? Math.hypot(event.clientX - last.x, event.clientY - last.y) : Infinity;
        // Stamps spaced by travel on screen, so a slow drag does not pile
        // a hundred stamps onto one spot.
        if (moved > 24) {
          stroke.lastStamp = { x: event.clientX, y: event.clientY };
          stamp(centre);
        }
      }
    }
    showGhost(centre);
  };

  const up = (event: PointerEvent): void => {
    if (!state || !stroke) return;
    event.preventDefault();
    event.stopPropagation();
    const { points, erased } = stroke;
    stroke = null;
    const doc = callbacks.doc();
    if (!doc) return;
    try {
      if (state.kind === 'scatter' && points.length) {
        callbacks.edit(`Scatter ${points.length} ${state.prefab}`, structure.scatterProps(doc, state.propPath, points));
      } else if (state.kind === 'erase' && erased.size) {
        callbacks.edit(`Erase ${erased.size} ${state.prefab}`, structure.erasePropInstances(doc, state.propPath, [...erased]));
      }
    } catch (error) {
      callbacks.say(String((error as Error).message ?? error));
    }
    showGhost(groundAt(event));
  };

  const key = (event: KeyboardEvent): void => {
    if (state && event.key === 'Escape') { event.stopPropagation(); stop(); }
  };

  panel.addEventListener('pointerdown', down, { capture: true });
  panel.addEventListener('pointermove', move, { capture: true });
  panel.addEventListener('pointerup', up, { capture: true });
  panel.addEventListener('pointerleave', () => { if (state && !stroke) callbacks.ghost(null); });
  window.addEventListener('keydown', key, { capture: true });

  function stop(): void {
    if (!state) return;
    state = null;
    stroke = null;
    strip.hidden = true;
    callbacks.ghost(null);
    callbacks.say('Brush off');
    callbacks.changed();
  }

  return {
    start(kind, propPath) {
      const group = groupAt(propPath);
      if (!group) { callbacks.say('Not a prop group'); return; }
      const instances = Array.isArray(group.instances) ? group.instances : [];
      // New instances land at the height the group already lives at.
      const heights = instances.flatMap((tuple) => (Array.isArray(tuple) && typeof tuple[1] === 'number' ? [tuple[1]] : [])).sort((a, b) => a - b);
      state = {
        kind, propPath,
        group: typeof group.id === 'string' ? group.id : 'props',
        prefab: typeof group.prefab === 'string' ? group.prefab : '?',
        groundY: heights.length ? heights[Math.floor(heights.length / 2)]! : 0
      };
      strip.hidden = false;
      renderStrip();
      callbacks.say(`${kind === 'scatter' ? 'Scatter' : 'Erase'} brush on ${state.group} — drag on the ground; Esc to leave`);
      callbacks.changed();
    },
    stop,
    get active() { return state !== null; }
  };
}
