/**
 * The tile painting tool (E8), over one tile layer of a 2D scene.
 *
 * Painting is a mode: while it is on the pointer belongs to it, a strip
 * over the viewport holds the tools (brush, fill, erase) and a palette
 * panel shows the layer's sheet — click a frame to paint with it. The
 * grid at the layer's `tileSize` draws over the world (through the
 * projection, so an isometric floor paints on diamonds), the hovered cell
 * highlights, and a stroke previews as filled cells.
 *
 * A stroke commits **once, on release**, as one `set` of the layer's
 * `cells` — one step of undo. A painted cell is `[column, row, tileX,
 * tileY]`, written short as `[column, row]` when it draws the layer's own
 * frame, which is how every pre-E8 document already reads.
 */

import { isPlainObject, type Op, type PathSegment } from 'm2d-editor-core';
import type { Viewport, Point } from './viewport.ts';

export interface TilePaintCallbacks {
  doc(): Record<string, unknown> | null;
  edit(label: string, ops: Op[]): void;
  say(text: string): void;
  /** The URL the sheet's image loads from (the project's basePath plus its url). */
  sheetUrl(sheet: string): string | null;
  /** Whether the shown game draws through a projection (isometric, belt). */
  projected(): boolean;
  /** The world size the shown game was built with. */
  worldSize(): { width: number; height: number };
  changed(): void;
}

export interface TilePaintHandle {
  /** Enter paint mode over the tile layer at `['tileLayers', i]`. */
  start(layerPath: PathSegment[]): void;
  stop(): void;
  readonly active: boolean;
}

type Tool = 'brush' | 'fill' | 'erase';

/** A cell's frame: its own `[tileX, tileY]`, or 'own' for the layer's default. */
type Frame = [number, number];

interface PaintState {
  layerPath: PathSegment[];
  name: string;
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  /** Ground units one cell covers. */
  tileSize: number;
  cols: number;
  rows: number;
  /** The layer's own frame, what a two-entry cell draws. */
  own: Frame;
  tool: Tool;
  /** The palette's pick. */
  frame: Frame;
  /** The stroke in progress: cell key `i,j` to frame, or null to erase. */
  stroke: Map<string, Frame | null> | null;
  hover: { i: number; j: number } | null;
}

const SVG = 'http://www.w3.org/2000/svg';

export function createTilePaint(panel: HTMLElement, viewport: Viewport, callbacks: TilePaintCallbacks): TilePaintHandle {
  let state: PaintState | null = null;

  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add('overlay', 'tilegrid');
  svg.style.display = 'none';
  panel.append(svg);

  const strip = document.createElement('div');
  strip.id = 'paint';
  strip.hidden = true;
  panel.append(strip);

  const palette = document.createElement('div');
  palette.id = 'palette';
  palette.hidden = true;
  panel.append(palette);

  const layerAt = (path: PathSegment[]): Record<string, unknown> | null => {
    let value: unknown = callbacks.doc();
    for (const segment of path) value = isPlainObject(value) || Array.isArray(value) ? (value as Record<string, unknown>)[segment as never] : undefined;
    return isPlainObject(value) ? value : null;
  };

  /** The document's cells as a map of `i,j` to frame (null entries never appear). */
  const documentCells = (): Map<string, Frame> => {
    const cells = new Map<string, Frame>();
    if (!state) return cells;
    const layer = layerAt(state.layerPath);
    for (const cell of layer && Array.isArray(layer.cells) ? layer.cells : []) {
      if (!Array.isArray(cell)) continue;
      const [i, j, tx, ty] = cell as number[];
      cells.set(`${i},${j}`, tx === undefined ? [...state.own] : [tx!, ty ?? 0]);
    }
    return cells;
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

  /** A cell's four ground corners on screen, or null when any is behind/absent. */
  const cellCorners = (i: number, j: number): Point[] | null => {
    if (!state) return null;
    const s = state.tileSize;
    const corners = [[i * s, j * s], [(i + 1) * s, j * s], [(i + 1) * s, (j + 1) * s], [i * s, (j + 1) * s]];
    const out: Point[] = [];
    for (const [x, y] of corners) {
      const p = viewport.groundToClient(x!, y!);
      if (!p) return null;
      out.push(local(p));
    }
    return out;
  };

  const redraw = (): void => {
    svg.replaceChildren();
    if (!state) return;
    const grid = el('g', { class: 'grid' }, svg);
    const s = state.tileSize;
    // The grid's lines along both ground axes, through the projection.
    for (let i = 0; i <= state.cols; i++) {
      const a = viewport.groundToClient(i * s, 0);
      const b = viewport.groundToClient(i * s, state.rows * s);
      if (a && b) { const p = local(a); const q = local(b); el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, grid); }
    }
    for (let j = 0; j <= state.rows; j++) {
      const a = viewport.groundToClient(0, j * s);
      const b = viewport.groundToClient(state.cols * s, j * s);
      if (a && b) { const p = local(a); const q = local(b); el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, grid); }
    }
    // The stroke so far: painted cells filled, erased cells crossed out.
    if (state.stroke) {
      const marks = el('g', { class: 'stroke' }, svg);
      for (const [key, frame] of state.stroke) {
        const [i, j] = key.split(',').map(Number);
        const corners = cellCorners(i!, j!);
        if (!corners) continue;
        el('polygon', {
          points: corners.map((p) => `${p.x},${p.y}`).join(' '),
          class: frame ? 'painted' : 'erased'
        }, marks);
      }
    }
    if (state.hover) {
      const corners = cellCorners(state.hover.i, state.hover.j);
      if (corners) el('polygon', { points: corners.map((p) => `${p.x},${p.y}`).join(' '), class: 'hover' }, svg);
    }
  };

  const cellUnder = (event: PointerEvent): { i: number; j: number } | null => {
    if (!state) return null;
    const ground = viewport.worldPoint(event.clientX, event.clientY);
    if (!ground) return null;
    const i = Math.floor(ground.x / state.tileSize);
    const j = Math.floor(ground.y / state.tileSize);
    return i >= 0 && j >= 0 && i < state.cols && j < state.rows ? { i, j } : null;
  };

  const paintCell = (i: number, j: number): void => {
    if (!state?.stroke) return;
    if (state.tool === 'fill') return;
    state.stroke.set(`${i},${j}`, state.tool === 'erase' ? null : [...state.frame]);
  };

  /** Flood fill from a cell, over the region sharing its current frame (or emptiness). */
  const fill = (i: number, j: number): void => {
    if (!state?.stroke) return;
    const cells = documentCells();
    const key = (a: number, b: number) => `${a},${b}`;
    const sameAs = cells.get(key(i, j));
    const matches = (a: number, b: number) => {
      const frame = cells.get(key(a, b));
      if (sameAs === undefined) return frame === undefined;
      return !!frame && frame[0] === sameAs[0] && frame[1] === sameAs[1];
    };
    const queue: Array<[number, number]> = [[i, j]];
    const seen = new Set<string>([key(i, j)]);
    while (queue.length) {
      const [a, b] = queue.pop()!;
      state.stroke.set(key(a, b), [...state.frame]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = a + dx;
        const y = b + dy;
        const k = key(x, y);
        if (x < 0 || y < 0 || x >= state.cols || y >= state.rows || seen.has(k) || !matches(x, y)) continue;
        seen.add(k);
        queue.push([x, y]);
      }
    }
  };

  const commit = (): void => {
    if (!state?.stroke || !state.stroke.size) { if (state) state.stroke = null; return; }
    const cells = documentCells();
    let painted = 0;
    let erased = 0;
    for (const [key, frame] of state.stroke) {
      if (frame) { cells.set(key, frame); painted++; }
      else if (cells.delete(key)) erased++;
    }
    state.stroke = null;
    if (!painted && !erased) { redraw(); return; }
    // Short form where the frame is the layer's own; ordered by row then
    // column, so the written document reads like the map.
    const value = [...cells.entries()]
      .map(([key, frame]) => {
        const [i, j] = key.split(',').map(Number);
        return { i: i!, j: j!, frame };
      })
      .sort((a, b) => a.j - b.j || a.i - b.i)
      .map(({ i, j, frame }) => (frame[0] === state!.own[0] && frame[1] === state!.own[1] ? [i, j] : [i, j, frame[0], frame[1]]));
    const label = painted ? `Paint ${painted} cell${painted === 1 ? '' : 's'}` : `Erase ${erased} cell${erased === 1 ? '' : 's'}`;
    callbacks.edit(label, [{ op: 'set', path: [...state.layerPath, 'cells'], value }]);
    redraw();
  };

  // --- The strip and the palette -------------------------------------------

  const renderStrip = (): void => {
    strip.replaceChildren();
    if (!state) return;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = `Paint · ${state.name}`;
    strip.append(label);
    for (const tool of ['brush', 'fill', 'erase'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool[0]!.toUpperCase() + tool.slice(1);
      button.setAttribute('aria-pressed', String(state.tool === tool));
      button.addEventListener('click', () => { state!.tool = tool; renderStrip(); });
      strip.append(button);
    }
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Done';
    done.title = 'Leave painting (Esc)';
    done.addEventListener('click', stop);
    strip.append(done);
  };

  const renderPalette = (): void => {
    palette.replaceChildren();
    if (!state) return;
    const url = callbacks.sheetUrl(state.sheet);
    if (!url) { palette.textContent = `No image for sheet '${state.sheet}'`; return; }
    const head = document.createElement('div');
    head.className = 'palette-head';
    head.textContent = `${state.sheet} · pick a tile`;
    palette.append(head);
    const holder = document.createElement('div');
    holder.className = 'palette-sheet';
    const img = document.createElement('img');
    img.src = url;
    img.draggable = false;
    const pick = document.createElement('div');
    pick.className = 'palette-pick';
    holder.append(img, pick);
    palette.append(holder);
    const place = (): void => {
      if (!state) return;
      const zoom = img.clientWidth / (img.naturalWidth || 1);
      pick.style.left = `${state.frame[0] * state.frameWidth * zoom}px`;
      pick.style.top = `${state.frame[1] * state.frameHeight * zoom}px`;
      pick.style.width = `${state.frameWidth * zoom}px`;
      pick.style.height = `${state.frameHeight * zoom}px`;
    };
    img.addEventListener('load', place);
    img.addEventListener('click', (event) => {
      if (!state || !img.naturalWidth) return;
      const box = img.getBoundingClientRect();
      const zoom = box.width / img.naturalWidth;
      state.frame = [
        Math.max(0, Math.floor((event.clientX - box.left) / (state.frameWidth * zoom))),
        Math.max(0, Math.floor((event.clientY - box.top) / (state.frameHeight * zoom)))
      ];
      if (state.tool === 'erase') state.tool = 'brush';
      renderStrip();
      place();
    });
    place();
  };

  // --- Pointer work, ahead of the camera and the marquee --------------------

  const down = (event: PointerEvent): void => {
    if (!state || event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const cell = cellUnder(event);
    if (!cell) return;
    state.stroke = new Map();
    if (state.tool === 'fill') fill(cell.i, cell.j);
    else paintCell(cell.i, cell.j);
    redraw();
  };

  const move = (event: PointerEvent): void => {
    if (!state) return;
    const cell = cellUnder(event);
    state.hover = cell;
    if (state.stroke) {
      event.preventDefault();
      event.stopPropagation();
      if (cell && state.tool !== 'fill') paintCell(cell.i, cell.j);
    }
    redraw();
  };

  const up = (event: PointerEvent): void => {
    if (!state?.stroke) return;
    event.preventDefault();
    event.stopPropagation();
    commit();
  };

  const key = (event: KeyboardEvent): void => {
    if (state && event.key === 'Escape') { event.stopPropagation(); stop(); }
  };

  panel.addEventListener('pointerdown', down, { capture: true });
  panel.addEventListener('pointermove', move, { capture: true });
  panel.addEventListener('pointerup', up, { capture: true });
  window.addEventListener('keydown', key, { capture: true });
  viewport.onViewChange(() => { if (state) redraw(); });

  function stop(): void {
    if (!state) return;
    state = null;
    strip.hidden = true;
    palette.hidden = true;
    svg.style.display = 'none';
    svg.replaceChildren();
    callbacks.say('Painting off');
    callbacks.changed();
  }

  return {
    start(layerPath) {
      const doc = callbacks.doc();
      const layer = layerAt(layerPath);
      if (!doc || !layer || typeof layer.spritesheet !== 'string') { callbacks.say('Not a tile layer'); return; }
      const assets = isPlainObject(doc.assets) ? doc.assets : {};
      const sheets = isPlainObject(assets.spritesheets) ? assets.spritesheets : {};
      const sheet = isPlainObject(sheets[layer.spritesheet]) ? sheets[layer.spritesheet] as Record<string, unknown> : null;
      if (!sheet || typeof sheet.frameWidth !== 'number') { callbacks.say(`No sprite sheet '${layer.spritesheet}' to paint from`); return; }
      const frameWidth = sheet.frameWidth;
      const frameHeight = typeof sheet.frameHeight === 'number' ? sheet.frameHeight : frameWidth;
      const scale = typeof layer.scale === 'number' ? layer.scale : 1;
      // The ground size of one cell, exactly as the engine derives it.
      const tileSize = typeof layer.tileSize === 'number'
        ? layer.tileSize
        : callbacks.projected() && layer.stretch !== true ? (frameWidth * scale) / 2 : frameWidth;
      const world = callbacks.worldSize();
      state = {
        layerPath,
        name: typeof layer.name === 'string' ? layer.name : 'tiles',
        sheet: layer.spritesheet,
        frameWidth, frameHeight, tileSize,
        cols: Math.ceil(world.width / tileSize),
        rows: Math.ceil(world.height / tileSize),
        own: [typeof layer.tileX === 'number' ? layer.tileX : 0, typeof layer.tileY === 'number' ? layer.tileY : 0],
        tool: 'brush',
        frame: [typeof layer.tileX === 'number' ? layer.tileX : 0, typeof layer.tileY === 'number' ? layer.tileY : 0],
        stroke: null,
        hover: null
      };
      strip.hidden = false;
      palette.hidden = false;
      svg.style.display = '';
      renderStrip();
      renderPalette();
      redraw();
      callbacks.say(`Painting ${state.name} — pick a tile, drag on the world; Esc to leave`);
      callbacks.changed();
    },
    stop,
    get active() { return state !== null; }
  };
}
