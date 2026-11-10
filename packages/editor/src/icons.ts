/**
 * The editor's icons: small inline SVGs on a 16-unit grid, stroked with
 * the current colour so they take the theme. Drawn here rather than
 * fetched — a dozen paths, no requests, no font.
 */

const svg = (body: string, size = 16) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" ` +
  `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  undo: svg('<path d="M5.5 4 2.5 7l3 3"/><path d="M2.5 7h7a4 4 0 0 1 0 8H8"/>'),
  redo: svg('<path d="M10.5 4l3 3-3 3"/><path d="M13.5 7h-7a4 4 0 0 0 0 8H8"/>'),
  save: svg('<path d="M3 2.5h8l2.5 2.5v8.5h-10.5z"/><path d="M5.5 2.5v3.5h5v-3.5"/><path d="M5 13.5v-4h6v4"/>'),
  move: svg('<path d="M8 1.5v13M1.5 8h13"/><path d="M6 3.5 8 1.5l2 2M6 12.5l2 2 2-2M3.5 6 1.5 8l2 2M12.5 6l2 2-2 2"/>'),
  rotate: svg('<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2v3h-3"/>'),
  frame: svg('<path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5"/><circle cx="8" cy="8" r="2"/>'),
  chevron: svg('<path d="M6 4l4 4-4 4"/>', 12),
  plus: svg('<path d="M8 3v10M3 8h10"/>', 12),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>', 12),
  search: svg('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>', 14),
  warning: svg('<path d="M8 2 1.5 13.5h13z"/><path d="M8 6.5v3.5M8 12v.01"/>', 14),
  leaf: svg('<path d="M3 13c0-6 4-10 10-10 0 6-4 10-10 10z"/><path d="M3 13 9 7"/>', 14),
  grid: svg('<path d="M2 6h12M2 10h12M6 2v12M10 2v12"/>', 14),
  collapse: svg('<path d="M4 10l4-4 4 4"/>', 12),
  expand: svg('<path d="M4 6l4 4 4-4"/>', 12),
  play: svg('<path d="M5 3.5v9l7.5-4.5z" fill="currentColor"/>'),
  stop: svg('<rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/>'),
  build: svg('<path d="M8 1.5 14 5v6L8 14.5 2 11V5z"/><path d="M2 5l6 3.5L14 5M8 8.5v6"/>'),
  panelLeft: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 3v10"/><path d="M3.5 5.5h1M3.5 7.5h1" />', 14),
  panelRight: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M10 3v10"/><path d="M11.5 5.5h1M11.5 7.5h1" />', 14),
  panelBottom: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 9.5h12"/>', 14)
} as const;

/** A glyph per outline kind, for the tree. */
export const KIND_ICONS: Record<string, string> = {
  scene: svg('<path d="M2.5 3.5h11v9h-11z"/><path d="M2.5 6h11"/>', 14),
  world: svg('<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11"/>', 14),
  background: svg('<path d="M2.5 3.5h11v9h-11z"/><path d="m2.5 11 3.5-3.5 3 3 2-2 2.5 2.5"/>', 14),
  group: svg('<path d="M2 4.5h4l1.5 1.5H14v6.5H2z"/>', 14),
  prefab: svg('<path d="M8 2 13.5 5v6L8 14 2.5 11V5z"/><path d="M2.5 5 8 8l5.5-3M8 8v6"/>', 14),
  layer: svg('<path d="M8 2.5 14 6 8 9.5 2 6z"/><path d="M2 9l6 3.5L14 9"/>', 14),
  object: svg('<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/>', 14),
  props: svg('<circle cx="5" cy="5" r="2"/><circle cx="11" cy="6" r="2"/><circle cx="7" cy="11" r="2"/>', 14),
  tileLayer: svg('<path d="M2.5 2.5h11v11h-11zM2.5 8h11M8 2.5v11"/>', 14),
  element: svg('<rect x="2.5" y="4.5" width="11" height="7" rx="1.5"/><path d="M5 8h6"/>', 14)
};

/** An element from markup the editor itself wrote (never document text). */
export function iconElement(markup: string): Element {
  const holder = document.createElement('span');
  holder.innerHTML = markup;
  return holder.firstElementChild!;
}
