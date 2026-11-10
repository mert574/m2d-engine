/**
 * The editor's layout: the scene tree, the inspector and the dock, each
 * resizable by a handle and each shown or hidden by a toggle, remembered
 * in this browser.
 *
 * Deliberately small: three CSS variables on the frame's grid
 * (`--tree-width`, `--inspector-width`, `--dock-height`) and three classes
 * that collapse a region. Saved layouts and docking panels anywhere are on
 * the plan (editor-e2.md); this is the part every layout will need.
 */

export type Region = 'tree' | 'inspector' | 'dock';

interface Limits { fallback: number; min: number; max: () => number }

const LIMITS: Record<Region, Limits> = {
  tree: { fallback: 260, min: 180, max: () => Math.min(560, window.innerWidth * 0.4) },
  inspector: { fallback: 340, min: 260, max: () => Math.min(680, window.innerWidth * 0.45) },
  dock: { fallback: 216, min: 96, max: () => window.innerHeight * 0.7 }
};

const VARIABLE: Record<Region, string> = { tree: '--tree-width', inspector: '--inspector-width', dock: '--dock-height' };

export interface LayoutHandle {
  toggle(region: Region): void;
  setHidden(region: Region, hidden: boolean): void;
  isHidden(region: Region): boolean;
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
  const clamp = (region: Region, value: number) =>
    Math.round(Math.max(LIMITS[region].min, Math.min(LIMITS[region].max(), value)));

  const apply = (region: Region) => {
    frame.style.setProperty(VARIABLE[region], `${sizes[region]}px`);
    frame.classList.toggle(`${region}-hidden`, hidden[region]);
    for (const button of document.querySelectorAll<HTMLElement>(`[data-toggle="${region}"]`)) {
      button.setAttribute('aria-pressed', String(!hidden[region]));
    }
  };

  for (const region of Object.keys(LIMITS) as Region[]) {
    sizes[region] = clamp(region, Number(store.get(`layout.${region}`, String(LIMITS[region].fallback))) || LIMITS[region].fallback);
    hidden[region] = store.get(`layout.${region}.hidden`, '0') === '1';
    apply(region);
  }

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
        // The tree grows rightwards, the inspector leftwards, the dock upwards.
        const delta = region === 'tree' ? e.clientX - start.x : region === 'inspector' ? start.x - e.clientX : start.y - e.clientY;
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

  return {
    toggle: (region) => setHidden(region, !hidden[region]),
    setHidden,
    isHidden: (region) => hidden[region]
  };
}
