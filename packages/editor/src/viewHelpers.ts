/**
 * The view helpers (the carried editor work): what a 3D tool draws over
 * the world to orient the eye, none of it part of the scene.
 *
 * - **Grid and axes** (G): in 3D a ground grid about the look-at point,
 *   metres with a brighter line every five, and the X and Z axes through
 *   the origin; in 2D a grid in world units stepped so the lines stay at
 *   least ~24 px apart at the current zoom, through the projection, and
 *   the axes through the origin.
 * - **Light icons** (L): a bulb at every light the scene carries, an
 *   entity's and a prop's; a spot shows its direction as an arm whose tip
 *   is a handle — drag it to turn the spot, which writes the object's
 *   `overrides.light.direction` on release, one undo step.
 * - **Camera** (C): what `world.camera` declares — in 2D the bounds it
 *   clamps to and the view the player would see at start, in 3D the
 *   orbit eye behind the player with a line to its target.
 *
 * All SVG in client pixels over the canvas, redrawn with the view, as the
 * overlay is; only the spot handles take the pointer.
 */

import { isPlainObject, type PathSegment } from 'm2d-editor-core';
import type { Viewport, Point } from './viewport.ts';

export interface HelperCallbacks {
  doc(): Record<string, unknown> | null;
  /** The document path of the placed object with this id, or null. */
  objectPath(id: string): PathSegment[] | null;
  /** Write one field; the editor turns it into an edit. */
  edit(path: PathSegment[], value: unknown, label: string): void;
  store: { get(key: string, fallback: string): string; set(key: string, value: string): void };
}

export type Helper = 'grid' | 'lights' | 'camera';

export interface HelpersHandle {
  toggle(helper: Helper): boolean;
  isOn(helper: Helper): boolean;
  refresh(): void;
}

const SVG = 'http://www.w3.org/2000/svg';
const MINOR = 'rgba(255, 255, 255, 0.07)';
const MAJOR = 'rgba(255, 255, 255, 0.16)';
const AXIS = { x: '#ff6b6b', y: '#7bdc7b', z: '#62a6ff' };

export function createViewHelpers(panel: HTMLElement, viewport: Viewport, callbacks: HelperCallbacks): HelpersHandle {
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add('overlay', 'helpers');
  panel.append(svg);
  const on: Record<Helper, boolean> = {
    grid: callbacks.store.get('helpers.grid', '0') === '1',
    lights: callbacks.store.get('helpers.lights', '0') === '1',
    camera: callbacks.store.get('helpers.camera', '0') === '1'
  };

  const local = (p: Point): Point => {
    const box = panel.getBoundingClientRect();
    return { x: p.x - box.left, y: p.y - box.top };
  };
  const el = (name: string, attrs: Record<string, string | number>, parent: Element): Element => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    parent.append(node);
    return node;
  };
  const line = (a: Point | null, b: Point | null, stroke: string, parent: Element, width = 1): void => {
    if (!a || !b) return;
    const p = local(a); const q = local(b);
    el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke, 'stroke-width': width }, parent);
  };
  /** A world point on screen, or null when behind the eye. */
  const at = (p: { x: number; y: number; z?: number }): Point | null => {
    const c = viewport.project(p);
    return c && !c.behind ? c : null;
  };
  const ground = (x: number, y: number): Point | null => viewport.groundToClient(x, y);

  // --- Grid and axes -------------------------------------------------------

  const drawGrid = (): void => {
    const g = el('g', { class: 'grid' }, svg);
    if (viewport.dimensions === 3) {
      const target = viewport.cameraTarget() ?? { x: 0, y: 0, z: 0 };
      const half = 20;
      const cx = Math.round(target.x / 5) * 5;
      const cz = Math.round(target.z / 5) * 5;
      for (let i = -half; i <= half; i++) {
        const major = (cx + i) % 5 === 0;
        line(at({ x: cx + i, y: 0, z: cz - half }), at({ x: cx + i, y: 0, z: cz + half }), major ? MAJOR : MINOR, g);
        const majorZ = (cz + i) % 5 === 0;
        line(at({ x: cx - half, y: 0, z: cz + i }), at({ x: cx + half, y: 0, z: cz + i }), majorZ ? MAJOR : MINOR, g);
      }
      // The axes through the origin, as far as the grid reaches.
      line(at({ x: -half, y: 0, z: 0 }), at({ x: half, y: 0, z: 0 }), AXIS.x, g, 1.5);
      line(at({ x: 0, y: 0, z: -half }), at({ x: 0, y: 0, z: half }), AXIS.z, g, 1.5);
      line(at({ x: 0, y: 0, z: 0 }), at({ x: 0, y: 2, z: 0 }), AXIS.y, g, 1.5);
      return;
    }
    const zoom = ((viewport.game as { camera?: { zoom?: number } } | null)?.camera?.zoom) || 1;
    const step = [8, 16, 32, 64, 128, 256, 512, 1024].find((s) => s * zoom >= 24) ?? 1024;
    const world = viewport.worldSize();
    // The visible render-plane area bounds the lines in a flat view; under
    // a projection the world's own bounds do (the ground is a diamond on
    // screen and a visible rectangle has no simple ground box).
    const area = !viewport.projected ? viewport.visibleArea() : null;
    const x0 = Math.floor((area ? area.left : 0) / step) * step;
    const x1 = Math.ceil((area ? area.right : world.width) / step) * step;
    const y0 = Math.floor((area ? area.top : 0) / step) * step;
    const y1 = Math.ceil((area ? area.bottom : world.height) / step) * step;
    if ((x1 - x0) / step > 400 || (y1 - y0) / step > 400) return;
    for (let x = x0; x <= x1; x += step) line(ground(x, y0), ground(x, y1), x % (step * 4) === 0 ? MAJOR : MINOR, g);
    for (let y = y0; y <= y1; y += step) line(ground(x0, y), ground(x1, y), y % (step * 4) === 0 ? MAJOR : MINOR, g);
    line(ground(x0, 0), ground(x1, 0), AXIS.x, g, 1.5);
    line(ground(0, y0), ground(0, y1), AXIS.y, g, 1.5);
  };

  // --- Lights -----------------------------------------------------------------

  /** The arm a spot's direction draws, in world units, so the handle sits a readable way out. */
  const armLength = (): number => (viewport.dimensions === 3 ? 1.5 : 48);

  let drag: { id: string; start: Point; direction: { x: number; y: number; z: number }; origin: { x: number; y: number; z?: number } } | null = null;

  const drawLights = (): void => {
    const g = el('g', { class: 'lights' }, svg);
    for (const light of viewport.lights()) {
      const c = at(light.position);
      if (!c) continue;
      const p = local(c);
      const icon = el('g', { class: `light${light.id ? '' : ' prop'}`, transform: `translate(${p.x} ${p.y})` }, g);
      el('circle', { r: 5, class: 'bulb' }, icon);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        el('line', { x1: Math.cos(a) * 7, y1: Math.sin(a) * 7, x2: Math.cos(a) * 10, y2: Math.sin(a) * 10, class: 'ray' }, icon);
      }
      if (!light.spot || !light.direction) continue;
      const d = light.direction;
      const n = Math.hypot(d.x, d.y, d.z ?? 0) || 1;
      const arm = armLength();
      const tip3 = { x: light.position.x + (d.x / n) * arm, y: light.position.y + (d.y / n) * arm, z: (light.position.z ?? 0) + ((d.z ?? 0) / n) * arm };
      const tip = viewport.dimensions === 3 ? at(tip3) : at({ x: light.position.x + (d.x / n) * arm, y: light.position.y + (d.y / n) * arm });
      if (!tip) continue;
      const t = local(tip);
      el('line', { x1: p.x, y1: p.y, x2: t.x, y2: t.y, class: 'arm' }, g);
      if (light.id) {
        const handle = el('circle', { cx: t.x, cy: t.y, r: 6, class: 'spot-handle', 'data-light': light.id }, g);
        handle.addEventListener('pointerdown', (event) => {
          const e = event as PointerEvent;
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          (handle as Element & { setPointerCapture(id: number): void }).setPointerCapture(e.pointerId);
          drag = { id: light.id!, start: { x: e.clientX, y: e.clientY }, direction: { x: d.x / n, y: d.y / n, z: (d.z ?? 0) / n }, origin: light.position };
        });
        handle.addEventListener('pointermove', (event) => {
          if (!drag) return;
          const e = event as PointerEvent;
          preview.direction = turned(e.clientX, e.clientY);
          refresh();
        });
        const finish = (event: Event, commit: boolean) => {
          if (!drag) return;
          const e = event as PointerEvent;
          const direction = commit ? turned(e.clientX, e.clientY) : null;
          const id = drag.id;
          drag = null;
          preview.direction = null;
          if (direction) {
            const path = callbacks.objectPath(id);
            if (path) {
              const r = (v: number) => Math.round(v * 1000) / 1000;
              callbacks.edit([...path, 'overrides', 'light', 'direction'], { x: r(direction.x), y: r(direction.y), z: r(direction.z) }, `Aim ${id}'s light`);
            }
          }
          refresh();
        };
        handle.addEventListener('pointerup', (event) => finish(event, true));
        handle.addEventListener('pointercancel', (event) => finish(event, false));
      }
    }
  };

  /** While a spot handle drags, the direction it shows. */
  const preview: { direction: { x: number; y: number; z: number } | null } = { direction: null };

  /**
   * The direction a drag turns a spot to: in 3D the screen's x turns the
   * yaw and its y the pitch, like an orbit; in 2D the arm follows the
   * pointer about the light.
   */
  const turned = (clientX: number, clientY: number): { x: number; y: number; z: number } => {
    if (!drag) return { x: 0, y: -1, z: 0 };
    if (viewport.dimensions === 2) {
      const origin = viewport.project(drag.origin);
      if (!origin) return drag.direction;
      const dx = clientX - origin.x;
      const dy = clientY - origin.y;
      const n = Math.hypot(dx, dy) || 1;
      return { x: dx / n, y: dy / n, z: 0 };
    }
    const d = drag.direction;
    const yaw = Math.atan2(d.x, d.z) + (clientX - drag.start.x) * 0.01;
    const pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, Math.asin(Math.max(-1, Math.min(1, d.y))) - (clientY - drag.start.y) * 0.01));
    return { x: Math.cos(pitch) * Math.sin(yaw), y: Math.sin(pitch), z: Math.cos(pitch) * Math.cos(yaw) };
  };

  // --- Camera ------------------------------------------------------------------

  const drawCamera = (): void => {
    const doc = callbacks.doc();
    const world = doc && isPlainObject(doc.world) ? doc.world : null;
    if (!world) return;
    const g = el('g', { class: 'camera' }, svg);
    const camera = isPlainObject(world.camera) ? world.camera : {};
    const size = viewport.worldSize();
    const player = typeof world.player === 'string' ? findObject(doc!, world.player) : null;
    if (viewport.dimensions === 2) {
      // The bounds the camera clamps to, when it has any.
      const bounds = camera.bounds === 'world'
        ? { left: 0, top: 0, right: size.width, bottom: size.height }
        : isPlainObject(camera.bounds) ? camera.bounds as { left: number; top: number; right: number; bottom: number } : null;
      if (bounds) {
        const corners = [[bounds.left, bounds.top], [bounds.right, bounds.top], [bounds.right, bounds.bottom], [bounds.left, bounds.bottom]].map(([x, y]) => ground(x!, y!));
        corners.forEach((c, i) => line(c, corners[(i + 1) % 4]!, 'rgba(124, 208, 255, 0.7)', g, 1.5));
      }
      // The view at start: the design size over the player, at the camera's zoom.
      const options = (viewport.game as { options?: { width?: number; height?: number } } | null)?.options;
      const zoom = typeof camera.zoom === 'number' ? camera.zoom : 1;
      const w = (options?.width ?? 1280) / zoom;
      const h = (options?.height ?? 720) / zoom;
      const centre = player ? { x: player.x, y: player.y } : { x: size.width / 2, y: size.height / 2 };
      const frame = [[centre.x - w / 2, centre.y - h / 2], [centre.x + w / 2, centre.y - h / 2], [centre.x + w / 2, centre.y + h / 2], [centre.x - w / 2, centre.y + h / 2]]
        .map(([x, y]) => at({ x: x!, y: y! }));
      frame.forEach((c, i) => line(c, frame[(i + 1) % 4]!, 'rgba(255, 197, 107, 0.8)', g, 1.5));
      if (frame[0]) { const p = local(frame[0]); const text = el('text', { x: p.x + 4, y: p.y + 14, class: 'caption' }, g); text.textContent = 'camera at start'; }
      return;
    }
    // 3D: the orbit eye behind its target, from the camera block's distance, yaw and pitch.
    const target = player ? { x: player.x, y: player.y, z: player.z ?? 0 } : { x: 0, y: 0, z: 0 };
    const distance = typeof camera.distance === 'number' ? camera.distance : 10;
    const yaw = typeof camera.yaw === 'number' ? camera.yaw : 0;
    const pitch = typeof camera.pitch === 'number' ? camera.pitch : 0.5;
    const eye = { x: target.x - Math.sin(yaw) * Math.cos(pitch) * distance, y: target.y + Math.sin(pitch) * distance, z: target.z - Math.cos(yaw) * Math.cos(pitch) * distance };
    const e = at(eye); const t = at(target);
    line(e, t, 'rgba(255, 197, 107, 0.8)', g, 1.5);
    if (e) {
      const p = local(e);
      el('rect', { x: p.x - 7, y: p.y - 5, width: 14, height: 10, rx: 2, class: 'cam' }, g);
      const text = el('text', { x: p.x + 10, y: p.y + 4, class: 'caption' }, g);
      text.textContent = 'camera at start';
    }
    if (t) { const p = local(t); el('circle', { cx: p.x, cy: p.y, r: 3, class: 'cam' }, g); }
  };

  const refresh = (): void => {
    svg.replaceChildren();
    if (on.grid) drawGrid();
    if (on.camera) drawCamera();
    if (on.lights) {
      drawLights();
      if (drag && preview.direction) {
        // The arm follows the drag before the edit lands.
        const o = at(drag.origin);
        const d = preview.direction;
        const arm = armLength();
        const tip = viewport.dimensions === 3
          ? at({ x: drag.origin.x + d.x * arm, y: drag.origin.y + d.y * arm, z: (drag.origin.z ?? 0) + d.z * arm })
          : at({ x: drag.origin.x + d.x * arm, y: drag.origin.y + d.y * arm });
        line(o, tip, 'rgba(255, 197, 107, 0.95)', svg, 2);
      }
    }
  };

  viewport.onViewChange(refresh);
  window.addEventListener('resize', refresh);
  refresh();

  return {
    toggle(helper) {
      on[helper] = !on[helper];
      callbacks.store.set(`helpers.${helper}`, on[helper] ? '1' : '0');
      refresh();
      return on[helper];
    },
    isOn: (helper) => on[helper],
    refresh
  };
}

/** The placed object with this id, for the camera's target. */
function findObject(doc: Record<string, unknown>, id: string): { x: number; y: number; z?: number } | null {
  for (const layer of Array.isArray(doc.layers) ? doc.layers : []) {
    for (const object of isPlainObject(layer) && Array.isArray(layer.objects) ? layer.objects : []) {
      if (isPlainObject(object) && object.id === id && typeof object.x === 'number' && typeof object.y === 'number') {
        return { x: object.x, y: object.y, z: typeof object.z === 'number' ? object.z : undefined };
      }
    }
  }
  return null;
}
