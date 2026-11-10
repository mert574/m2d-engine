/**
 * The asset browser: the dock's Assets tab.
 *
 * **Project** — the scene's prefabs and the project's files (models,
 * images, environments), each a card that drags into the viewport to
 * place it, or places at the view's centre on a double-click. A file
 * imported from the library carries its credit.
 *
 * **Library** — search a source (Poly Haven) by words, see each result's
 * thumbnail, author and licence, and import it: the host fetches it,
 * checksummed, compiles a model, records the recipe and the credit in the
 * project, and the file appears under Project, ready to drag in. Imports
 * run in the background with their progress here.
 */

import { ICONS, KIND_ICONS, iconElement } from './icons.ts';

/** What a card stands for, and what dropping it places. */
export type Placeable =
  | { kind: 'prefab'; name: string }
  | { kind: 'file'; path: string; url: string; type: 'model' | 'image' | 'environment' | 'audio' };

export interface AssetFileEntry {
  path: string;
  url: string;
  kind: 'model' | 'image' | 'environment' | 'audio';
  bytes: number;
  credit?: { name: string; authors: string[]; license: string; page: string; source: string; id: string };
}

export interface LibraryCard {
  source: string;
  type: string;
  id: string;
  name: string;
  authors: string[];
  categories: string[];
  thumbnail: string;
  license: string;
  page: string;
}

export interface JobState {
  id: number;
  label: string;
  stage: 'queued' | 'fetching' | 'compiling' | 'done' | 'failed';
  progress: number | null;
  message?: string;
  result?: { file: AssetFileEntry };
}

export interface AssetsPanelOptions {
  /** The project's files and library, from the host. */
  load(): Promise<{ files: AssetFileEntry[]; jobs: JobState[] }>;
  /** The scene's prefabs: name and actor. */
  prefabs(): Array<{ name: string; actor?: string }>;
  /** A URL the page can show a project file at. */
  fileUrl(path: string): string;
  search(type: string, query: string): Promise<LibraryCard[]>;
  import(type: string, id: string): Promise<void>;
  /** Place at a client point, or the viewport's centre. */
  place(item: Placeable, at?: { x: number; y: number }): void;
  /** The scene's dimension, which decides what can be placed. */
  dimensions(): 2 | 3;
}

/** The drag payload's type. */
export const DRAG_TYPE = 'application/x-m2d-placeable';

export interface AssetsPanelHandle {
  refresh(): Promise<void>;
  /** The scene changed: its prefabs may have. */
  refreshPrefabs(): void;
  job(job: JobState): void;
}

export function createAssetsPanel(container: HTMLElement, options: AssetsPanelOptions): AssetsPanelHandle {
  let view: 'project' | 'library' = 'project';
  let files: AssetFileEntry[] = [];
  let query = '';
  let libraryType = 'models';
  let results: LibraryCard[] = [];
  let searching = false;
  let searchError = '';
  const jobs = new Map<number, JobState>();

  container.replaceChildren();
  container.classList.add('assets-pane');
  const bar = document.createElement('div');
  bar.className = 'assets-bar';
  const views = document.createElement('div');
  views.className = 'segmented';
  const projectButton = segment('Project', () => { view = 'project'; render(); });
  const libraryButton = segment('Library', () => { view = 'library'; render(); if (!results.length) void runSearch(); });
  views.append(projectButton, libraryButton);

  const search = document.createElement('label');
  search.className = 'search';
  search.append(iconElement(ICONS.search));
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Filter';
  search.append(input);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'control small';
  for (const [value, label] of [['models', 'Models'], ['textures', 'Textures'], ['hdris', 'HDRIs']]) {
    const option = document.createElement('option');
    option.value = value!;
    option.textContent = label!;
    typeSelect.append(option);
  }
  typeSelect.addEventListener('change', () => { libraryType = typeSelect.value; void runSearch(); });

  const source = document.createElement('span');
  source.className = 'source';
  source.innerHTML = 'Poly Haven · <span class="license">CC0</span>';

  bar.append(views, search, typeSelect, source);
  const grid = document.createElement('div');
  grid.className = 'asset-grid';
  const jobList = document.createElement('div');
  jobList.className = 'jobs';
  container.append(bar, jobList, grid);

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  input.addEventListener('input', () => {
    query = input.value.trim().toLowerCase();
    if (view === 'project') render();
    else {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { void runSearch(); }, 300);
    }
  });

  /** Only the newest search may write results: an older, slower one is dropped. */
  let searchSeq = 0;
  async function runSearch(): Promise<void> {
    const seq = ++searchSeq;
    searching = true;
    searchError = '';
    render();
    let found: LibraryCard[] = [];
    let failed = '';
    try {
      found = await options.search(libraryType, query);
    } catch (error) {
      failed = String((error as Error).message ?? error);
    }
    if (seq !== searchSeq) return;
    results = found;
    searchError = failed;
    searching = false;
    render();
  }

  function render(): void {
    projectButton.setAttribute('aria-pressed', String(view === 'project'));
    libraryButton.setAttribute('aria-pressed', String(view === 'library'));
    input.placeholder = view === 'project' ? 'Filter prefabs and files' : 'Search Poly Haven';
    typeSelect.hidden = view !== 'library';
    source.hidden = view !== 'library';
    grid.replaceChildren();
    renderJobs();
    if (view === 'project') renderProject();
    else renderLibrary();
  }

  function renderProject(): void {
    const dims = options.dimensions();
    const matches = (text: string) => !query || text.toLowerCase().includes(query);
    const prefabs = options.prefabs().filter((prefab) => matches(`${prefab.name} ${prefab.actor ?? ''}`));
    if (prefabs.length) grid.append(heading('Prefabs', 'Drag one into the scene to place another'));
    for (const prefab of prefabs) {
      grid.append(card({
        title: prefab.name,
        detail: prefab.actor ?? '',
        glyph: KIND_ICONS.prefab!,
        item: { kind: 'prefab', name: prefab.name },
        tip: `Place a ${prefab.name}`
      }));
    }
    const shown = files.filter((file) => matches(`${file.path} ${file.credit?.name ?? ''}`) && file.kind !== 'audio');
    const groups: Array<[string, AssetFileEntry['kind'], string]> = [
      ['Models', 'model', dims === 3 ? 'Drag one in: it gets a prefab sized to its mesh' : 'Models are for 3D scenes'],
      ['Images', 'image', dims === 2 ? 'Drag one in: it becomes a sprite' : 'Drop one onto an object: it becomes its texture'],
      ['Environments', 'environment', dims === 3 ? 'Drop one on the scene: it lights the level and is its sky' : 'HDR panoramas light 3D scenes']
    ];
    for (const [title, kind, tip] of groups) {
      const group = shown.filter((file) => file.kind === kind);
      if (!group.length) continue;
      grid.append(heading(title, tip));
      for (const file of group) {
        const placeable = kind === 'image' || ((kind === 'model' || kind === 'environment') && dims === 3);
        grid.append(card({
          title: file.credit?.name ?? file.path.split('/').pop()!,
          detail: `${file.path} · ${size(file.bytes)}`,
          glyph: kind === 'image' ? null : kind === 'model' ? KIND_ICONS.object! : KIND_ICONS.world!,
          image: kind === 'image' ? options.fileUrl(file.path) : undefined,
          item: placeable ? { kind: 'file', path: file.path, url: file.url, type: kind } : null,
          tip: file.credit ? `${file.credit.name} by ${file.credit.authors.join(', ')} (${file.credit.license})` : file.path,
          badge: file.credit ? file.credit.license : undefined
        }));
      }
    }
    if (!grid.children.length) {
      grid.append(note(query ? 'Nothing matches.' : 'No prefabs or asset files yet. Import from the Library, or drop files into the project folder.'));
    }
  }

  function renderLibrary(): void {
    if (searching) { grid.append(note('Searching Poly Haven…')); return; }
    if (searchError) { grid.append(note(`Search failed: ${searchError}`, true)); return; }
    if (!results.length) { grid.append(note('Nothing found.')); return; }
    const owned = new Set(files.flatMap((file) => (file.credit ? [`${file.credit.source}:${file.credit.id}`] : [])));
    for (const result of results) {
      const element = card({
        title: result.name,
        detail: result.authors.join(', '),
        image: result.thumbnail,
        item: null,
        tip: `${result.name} by ${result.authors.join(', ')} — ${result.license}, ${result.page}`,
        badge: result.license
      });
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'card-action';
      const have = owned.has(`${result.source}:${result.id}`);
      const running = [...jobs.values()].some((job) => job.label.startsWith(`${result.id} `) && !['done', 'failed'].includes(job.stage));
      action.textContent = have ? 'In project' : running ? 'Importing…' : 'Import';
      action.disabled = have || running;
      action.addEventListener('click', () => {
        action.disabled = true;
        action.textContent = 'Importing…';
        void options.import(libraryType, result.id).catch((error: unknown) => {
          action.disabled = false;
          action.textContent = 'Import';
          element.title = String((error as Error).message ?? error);
        });
      });
      element.append(action);
      grid.append(element);
    }
  }

  function renderJobs(): void {
    jobList.replaceChildren();
    const recent = [...jobs.values()].filter((job) => job.stage !== 'done' || Date.now() - (doneAt.get(job.id) ?? 0) < 8000);
    for (const job of recent) {
      const row = document.createElement('div');
      row.className = `job stage-${job.stage}`;
      const label = document.createElement('span');
      label.className = 'job-label';
      label.textContent = job.label;
      const stage = document.createElement('span');
      stage.className = 'job-stage';
      stage.textContent = job.stage === 'fetching' && job.progress !== null
        ? `fetching ${Math.round(job.progress * 100)}%`
        : job.message ? `${job.stage}: ${job.message}` : job.stage;
      const track = document.createElement('span');
      track.className = 'job-track';
      const fill = document.createElement('span');
      fill.className = 'job-fill';
      if (job.progress === null && !['done', 'failed'].includes(job.stage)) track.classList.add('indeterminate');
      fill.style.width = `${Math.round((job.stage === 'done' ? 1 : job.progress ?? 0) * 100)}%`;
      track.append(fill);
      row.append(label, track, stage);
      if (job.stage === 'done' && job.result) {
        const place = document.createElement('button');
        place.type = 'button';
        place.className = 'mini';
        place.textContent = 'Place';
        place.title = 'Place it at the centre of the view';
        const file = job.result.file;
        place.addEventListener('click', () => options.place({ kind: 'file', path: file.path, url: file.url, type: file.kind }));
        row.append(place);
      }
      jobList.append(row);
    }
  }

  function card(spec: {
    title: string; detail: string; glyph?: string | null; image?: string; item: Placeable | null; tip: string; badge?: string;
  }): HTMLElement {
    const element = document.createElement('div');
    element.className = 'asset-card';
    element.title = spec.tip;
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (spec.image) {
      const img = document.createElement('img');
      img.src = spec.image;
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      thumb.append(img);
    } else if (spec.glyph) {
      thumb.append(iconElement(spec.glyph));
    }
    if (spec.badge) {
      const badge = document.createElement('span');
      badge.className = 'thumb-badge';
      badge.textContent = spec.badge;
      thumb.append(badge);
    }
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = spec.title;
    const detail = document.createElement('div');
    detail.className = 'card-detail';
    detail.textContent = spec.detail;
    element.append(thumb, title, detail);
    if (spec.item) {
      const item = spec.item;
      element.draggable = true;
      element.classList.add('placeable');
      element.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(item));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      });
      element.addEventListener('dblclick', () => options.place(item));
    } else if (view === 'project') {
      element.classList.add('inert');
    }
    return element;
  }

  const doneAt = new Map<number, number>();

  return {
    async refresh() {
      const loaded = await options.load();
      files = loaded.files;
      for (const job of loaded.jobs) if (!jobs.has(job.id)) jobs.set(job.id, job);
      render();
    },
    refreshPrefabs() {
      if (view === 'project') render();
    },
    job(job) {
      jobs.set(job.id, job);
      if (job.stage === 'done') {
        doneAt.set(job.id, Date.now());
        setTimeout(render, 8100);
      }
      render();
    }
  };
}

function segment(text: string, click: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', click);
  return button;
}

function heading(text: string, tip: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'asset-heading';
  element.textContent = text;
  const hint = document.createElement('span');
  hint.textContent = tip;
  element.append(hint);
  return element;
}

function note(text: string, bad = false): HTMLElement {
  const element = document.createElement('div');
  element.className = `asset-note${bad ? ' bad' : ''}`;
  element.textContent = text;
  return element;
}

function size(bytes: number): string {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}
