/**
 * The editor's layout: the scene tree, the inspector and the dock, each
 * resizable by a handle and each shown or hidden by a toggle, remembered
 * in this browser.
 *
 * Three CSS variables on the frame's grid (`--tree-width`,
 * `--inspector-width`, `--dock-height` or `--dock-width`), three classes
 * that collapse a region, and two placements: the dock sits under the
 * viewport or beside it (`dock-right`), and the side panels can swap
 * (`mirrored`: inspector left, tree right). **Named layouts** save the
 * whole arrangement — sizes, what is hidden, the dock's side and tab —
 * under a name in this browser, and restore it in one step.
 */

export type Region = 'tree' | 'inspector' | 'dock';

interface Limits { fallback: number; min: number; max: () => number }

const LIMITS: Record<Region, Limits> = {
  tree: { fallback: 260, min: 180, max: () => Math.min(560, window.innerWidth * 0.4) },
  inspector: { fallback: 340, min: 260, max: () => Math.min(680, window.innerWidth * 0.45) },
  dock: { fallback: 216, min: 96, max: () => window.innerHeight * 0.7 }
};

const VARIABLE: Record<Region, string> = { tree: '--tree-width', inspector: '--inspector-width', dock: '--dock-height' };

export type DockSide = 'bottom' | 'right';

/** Everything a named layout remembers. */
export interface LayoutState {
  sizes: Record<Region, number>;
  hidden: Record<Region, boolean>;
  dock: DockSide;
  mirrored: boolean;
  /** The dock's open tab, kept by the editor; carried along. */
  tab?: string;
}

export interface LayoutHandle {
  toggle(region: Region): void;
  setHidden(region: Region, hidden: boolean): void;
  isHidden(region: Region): boolean;
  /** Where the dock sits: under the viewport, or beside it. */
  readonly dockSide: DockSide;
  setDockSide(side: DockSide): void;
  /** Whether the tree and the inspector have swapped sides. */
  readonly mirrored: boolean;
  setMirrored(mirrored: boolean): void;
  /** The arrangement as it stands, to save under a name. */
  capture(tab?: string): LayoutState;
  /** Put an arrangement in place; returns its dock tab for the editor to open. */
  apply(state: LayoutState): string | undefined;
  /** The layouts saved in this browser, by name. */
  saved(): string[];
  save(name: string, tab?: string): void;
  load(name: string): string | undefined;
  remove(name: string): void;
  /** Back to the defaults: every panel shown at its fallback size, the dock below. */
  reset(): void;
}

export interface LayoutOptions {
  frame: HTMLElement;
  center: HTMLElement;
  store: { get(key: string, fallback: string): string; set(key: string, value: string): void };
  /** The regions changed size or visibility: the viewport and its overlay follow. */
  changed(): void;
}

export function createLayout({ frame, center, store, changed }: LayoutOptions): LayoutHandle {
  const sizes = {} as Record<Region, number>;
  const hidden = {} as Record<Region, boolean>;
  let dockSide: DockSide = store.get('layout.dock.side', 'bottom') === 'right' ? 'right' : 'bottom';
  let mirrored = store.get('layout.mirrored', '0') === '1';
  const clamp = (region: Region, value: number) =>
    Math.round(Math.max(LIMITS[region].min, Math.min(LIMITS[region].max(), value)));

  const apply = (region: Region) => {
    // The dock's one size is a height below the viewport and a width beside it.
    const variable = region === 'dock' && dockSide === 'right' ? '--dock-width' : VARIABLE[region];
    if (region === 'dock') frame.style.removeProperty(dockSide === 'right' ? '--dock-height' : '--dock-width');
    frame.style.setProperty(variable, `${sizes[region]}px`);
    frame.classList.toggle(`${region}-hidden`, hidden[region]);
    for (const button of document.querySelectorAll<HTMLElement>(`[data-toggle="${region}"]`)) {
      button.setAttribute('aria-pressed', String(!hidden[region]));
    }
  };
  const applyPlacement = () => {
    frame.classList.toggle('dock-right', dockSide === 'right');
    frame.classList.toggle('mirrored', mirrored);
    apply('dock');
  };

  for (const region of Object.keys(LIMITS) as Region[]) {
    sizes[region] = clamp(region, Number(store.get(`layout.${region}`, String(LIMITS[region].fallback))) || LIMITS[region].fallback);
    hidden[region] = store.get(`layout.${region}.hidden`, '0') === '1';
    apply(region);
  }
  applyPlacement();

  const handle = (region: Region, edge: string) => {
    const element = document.createElement('div');
    element.className = `splitter splitter-${edge}`;
    element.dataset.region = region;
    element.title = 'Drag to resize · double-click to reset';
    element.setAttribute('role', 'separator');
    element.setAttribute('aria-orientation', region === 'dock' ? 'horizontal' : 'vertical');
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || hidden[region]) return;
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      element.classList.add('dragging');
      frame.classList.add('resizing');
      const start = { x: event.clientX, y: event.clientY, size: sizes[region] };
      const move = (e: PointerEvent) => {
        // The tree grows rightwards, the inspector leftwards, the dock upwards
        // (or leftwards beside the viewport); mirrored, the side panels swap.
        const sideways = (region === 'tree') !== mirrored ? e.clientX - start.x : start.x - e.clientX;
        const delta = region === 'dock' ? (dockSide === 'right' ? start.x - e.clientX : start.y - e.clientY) : sideways;
        sizes[region] = clamp(region, start.size + delta);
        apply(region);
        changed();
      };
      const up = () => {
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', up);
        element.classList.remove('dragging');
        frame.classList.remove('resizing');
        store.set(`layout.${region}`, String(sizes[region]));
        changed();
      };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', up);
    });
    element.addEventListener('dblclick', () => {
      sizes[region] = LIMITS[region].fallback;
      store.set(`layout.${region}`, String(sizes[region]));
      apply(region);
      changed();
    });
    center.append(element);
  };
  handle('tree', 'left');
  handle('inspector', 'right');
  handle('dock', 'dock');

  const setHidden = (region: Region, value: boolean) => {
    hidden[region] = value;
    store.set(`layout.${region}.hidden`, value ? '1' : '0');
    apply(region);
    changed();
  };

  // A window narrower than the panels would leave no viewport: shrink them back.
  window.addEventListener('resize', () => {
    for (const region of Object.keys(LIMITS) as Region[]) {
      const fitted = clamp(region, sizes[region]);
      if (fitted !== sizes[region]) { sizes[region] = fitted; apply(region); }
    }
    changed();
  });

  const LAYOUTS = 'layout.saved';
  const savedAll = (): Record<string, LayoutState> => {
    try { return JSON.parse(store.get(LAYOUTS, '{}')) as Record<string, LayoutState>; } catch { return {}; }
  };
  const capture = (tab?: string): LayoutState => ({ sizes: { ...sizes }, hidden: { ...hidden }, dock: dockSide, mirrored, tab });
  const applyState = (state: LayoutState): string | undefined => {
    dockSide = state.dock === 'right' ? 'right' : 'bottom';
    mirrored = state.mirrored === true;
    store.set('layout.dock.side', dockSide);
    store.set('layout.mirrored', mirrored ? '1' : '0');
    for (const region of Object.keys(LIMITS) as Region[]) {
      sizes[region] = clamp(region, Number(state.sizes?.[region]) || LIMITS[region].fallback);
      hidden[region] = state.hidden?.[region] === true;
      store.set(`layout.${region}`, String(sizes[region]));
      store.set(`layout.${region}.hidden`, hidden[region] ? '1' : '0');
      apply(region);
    }
    applyPlacement();
    changed();
    return state.tab;
  };

  return {
    toggle: (region) => setHidden(region, !hidden[region]),
    setHidden,
    isHidden: (region) => hidden[region],
    get dockSide() { return dockSide; },
    setDockSide(side) {
      dockSide = side;
      store.set('layout.dock.side', side);
      applyPlacement();
      changed();
    },
    get mirrored() { return mirrored; },
    setMirrored(value) {
      mirrored = value;
      store.set('layout.mirrored', value ? '1' : '0');
      applyPlacement();
      changed();
    },
    capture,
    apply: applyState,
    saved: () => Object.keys(savedAll()).sort(),
    save(name, tab) {
      const all = savedAll();
      all[name] = capture(tab);
      store.set(LAYOUTS, JSON.stringify(all));
    },
    load(name) {
      const state = savedAll()[name];
      return state ? applyState(state) : undefined;
    },
    remove(name) {
      const all = savedAll();
      delete all[name];
      store.set(LAYOUTS, JSON.stringify(all));
    },
    reset() {
      applyState({
        sizes: { tree: LIMITS.tree.fallback, inspector: LIMITS.inspector.fallback, dock: LIMITS.dock.fallback },
        hidden: { tree: false, inspector: false, dock: false },
        dock: 'bottom', mirrored: false
      });
    }
  };
}
