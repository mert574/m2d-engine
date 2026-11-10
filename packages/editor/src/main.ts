/**
 * The editor app's entry point.
 *
 * Served by `m2d-editor <project>` (packages/editor-host), which pins one
 * project — one game. The bar picks which of its scenes to edit; the
 * scene's document is the host's, and this tab edits a replica of it
 * (`remote.ts`), so an agent over MCP and the person here share one
 * document and one history.
 *
 * An edit flows one way, from any source — the inspector, a gizmo, a key,
 * a dropped asset, an agent, an undo: the replica applies its ops, then
 * the tree, the inspector, the problems and the viewport catch up. The
 * viewport applies a change in place when it can (one rebuilt object, in
 * its draw slot) and rebuilds the game when it cannot, camera held either
 * way; a document the engine rejects keeps the last good picture.
 *
 * Problems are every issue the loader finds, checked against a headless
 * game with the definition's real classes (the *validator*), so they are
 * listed even when the scene cannot be drawn at all.
 *
 * Play (F5) runs the document as it stands — unsaved edits included — in
 * a fresh game without edit mode, with the project's hooks; stop returns
 * to the document exactly as it was, the camera where it was.
 *
 * Hot reload: when a module the game imports changes, the definition and
 * the hooks are re-imported fresh and the scene re-materializes from the
 * document — never the file: there may be unsaved edits — with the camera
 * held still; a play in progress starts again on the new code.
 */

import {
  sceneOutline, inspectNode, uniqueId, isPlainObject, validateScene, parsePath,
  type OutlineNode, type PathSegment, type Op, type Edit, type ValidationIssue, type Quaternion
} from 'm2d-editor-core';
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import {
  loadProject, assetBase, loadDefinition, loadHooks, onHost, post, get, fetchDocument,
  type HostProject, type SceneEntry, type GameDefinition, type HooksModule
} from './host.ts';
import { RemoteDocument, type ReplicaChange } from './remote.ts';
import { Viewport } from './viewport.ts';
import { createTree } from './tree.ts';
import { createInspector } from './inspector.ts';
import { createOverlay, type GizmoResult, type GizmoMode } from './overlay.ts';
import { createAssetsPanel, DRAG_TYPE, type Placeable, type AssetFileEntry, type JobState, type LibraryCard } from './assetsPanel.ts';
import { createConsolePanel } from './consolePanel.ts';
import { ICONS, iconElement } from './icons.ts';
import { createLayout, type Region } from './layout.ts';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const status = $<HTMLElement>('#status');
const plate = $<HTMLElement>('#plate');
const title = $<HTMLElement>('#title');
const picker = $<HTMLSelectElement>('#scene');
const undoButton = $<HTMLButtonElement>('#undo');
const redoButton = $<HTMLButtonElement>('#redo');
const saveButton = $<HTMLButtonElement>('#save');
const snapBox = $<HTMLInputElement>('#snap');
const powerBox = $<HTMLInputElement>('#power');
const detachButton = $<HTMLButtonElement>('#detach');
const historyList = $<HTMLOListElement>('#history');
const problemList = $<HTMLUListElement>('#problems');
const problemCount = $<HTMLElement>('#problem-count');
const historyCount = $<HTMLElement>('#history-count');
const consoleCount = $<HTMLElement>('#console-count');
const dockToggle = $<HTMLButtonElement>('#dock-toggle');
const statProblems = $<HTMLButtonElement>('#stat-problems');
const statDraw = $<HTMLElement>('#stat-draw');
const statDim = $<HTMLElement>('#stat-dim');
const statPath = $<HTMLElement>('#stat-path');
const moveTool = $<HTMLButtonElement>('#mode-move');
const rotateTool = $<HTMLButtonElement>('#mode-rotate');
const frameTool = $<HTMLButtonElement>('#frame');
const viewportPanel = $<HTMLElement>('#viewport');
const treePanel = $<HTMLElement>('[data-region="tree"]');
const inspectorPanel = $<HTMLElement>('[data-region="inspector"]');
const editorFrame = $<HTMLElement>('#editor');
const playButton = $<HTMLButtonElement>('#play');
const buildButton = $<HTMLButtonElement>('#build');
const buildRun = $<HTMLButtonElement>('#build-run');
const buildPreview = $<HTMLButtonElement>('#build-preview');
const buildSummary = $<HTMLElement>('#build-summary');
const buildLog = $<HTMLOListElement>('#build-log');
const newButton = $<HTMLButtonElement>('#new-project');
const newDialog = $<HTMLDialogElement>('#new-dialog');
const newForm = $<HTMLFormElement>('#new-form');
const newError = $<HTMLElement>('#new-error');
const newWhere = $<HTMLElement>('#new-where');

// Icons on every button that names one.
for (const button of document.querySelectorAll<HTMLElement>('[data-icon]')) {
  button.prepend(iconElement(ICONS[button.dataset.icon as keyof typeof ICONS]));
}

/** The editor's own settings, kept in this browser. */
const settings = {
  get(key: string, fallback: string): string { return localStorage.getItem(`m2d-editor.${key}`) ?? fallback; },
  set(key: string, value: string): void { localStorage.setItem(`m2d-editor.${key}`, value); }
};

const viewport = new Viewport(document.getElementById('screen') as HTMLCanvasElement);

/** The panels' sizes and visibility; the viewport's canvas follows on its own (the engine observes it). */
let layoutFrame = 0;
const layout = createLayout({
  frame: $<HTMLElement>('#editor'),
  center: $<HTMLElement>('.center'),
  store: settings,
  changed: () => {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      viewport.game?.invalidate();
      overlay?.refresh();
    });
  }
});

let project: HostProject | null = null;
let remote: RemoteDocument | null = null;
let entry: SceneEntry | null = null;
let outline: OutlineNode | null = null;
let definition: GameDefinition | null = null;
/** The game's presentation hooks module, for play. */
let hooksModule: HooksModule | null = null;
/** A headless game with the definition's classes: what problems are checked against. */
let validator: unknown = null;
/** Bumped per code change; makes the next definition import fresh. */
let generation = 0;
/** What is selected: a placed object by id (it survives reordering), or any node by path. */
let selection: { id: string } | { path: PathSegment[] } | null = null;
/** Every problem the loader finds with the document. */
let issues: ValidationIssue[] = [];
/** Whether the viewport is playing the scene rather than editing it. */
let playing = false;
/** Camera to return to when play stops. */
let editCamera: Record<string, unknown> | null = null;

const say = (text: string) => { status.textContent = text; };
const showPlate = (text: string | null) => {
  plate.textContent = text ?? '';
  plate.classList.toggle('gone', text === null);
};
const readOnly = () => !!remote?.state.generator;

const tree = createTree(treePanel, (node) => select(selectionFor(node.path)), {
  activate: (node) => {
    const id = objectIdAt(node.path);
    if (id) viewport.frame(id);
  }
});
const inspector = createInspector(inspectorPanel, {
  edit: (path, value, label) => edit({ label, ops: [{ op: 'set', path, value }] }),
  list: (op, label) => edit({ label, ops: [op as Op] }),
  refs: (scope) => {
    const data = remote?.doc.data;
    const keys = (value: unknown) => (isPlainObject(value) ? Object.keys(value) : []);
    const assetBlock = isPlainObject(data?.assets) ? data.assets : {};
    if (scope === 'prefab') return keys(data?.prefabs);
    if (scope === 'spritesheet') return keys(assetBlock.spritesheets);
    if (scope === 'model') return keys(assetBlock.models);
    if (scope === 'environment') return keys(assetBlock.environments);
    if (scope === 'actor') return [...(viewport.registries.actors?.keys() ?? [])];
    if (scope === 'constraint') return [...(viewport.registries.constraintTypes?.keys() ?? [])];
    if (scope === 'scene') return project?.scenes.flatMap((scene) => (scene.name ? [scene.name] : [])) ?? [];
    return [];
  }
});
const overlay = createOverlay(viewportPanel, viewport, {
  snapping: () => snapBox.checked,
  snapStep: (dimensions) => (dimensions === 3 ? 0.25 : 8),
  angleStep: Math.PI / 12,
  editable: () => !readOnly() && !playing,
  placed: (id) => {
    const path = objectPath(id);
    const object = path ? at(path) as Record<string, unknown> : null;
    if (!object) return null;
    const number = (key: string) => (typeof object[key] === 'number' ? object[key] as number : undefined);
    const turn = Array.isArray(object.rotation) && object.rotation.length === 4 ? object.rotation as Quaternion : undefined;
    return { x: number('x'), y: number('y'), z: number('z'), angle: number('angle'), rotation: turn };
  },
  commit: (id, result) => commitGizmo(id, result)
});
const consolePanel = createConsolePanel($<HTMLElement>('#console'), () => viewport.game as never, (count) => {
  consoleCount.textContent = count ? String(count) : '';
  consoleCount.classList.toggle('zero', !count);
});
const assets = createAssetsPanel($<HTMLElement>('#assets'), {
  load: () => get<{ files: AssetFileEntry[]; jobs: JobState[] }>('/__assets'),
  prefabs: () => {
    const prefabs = remote?.doc.data.prefabs;
    return isPlainObject(prefabs)
      ? Object.entries(prefabs).map(([name, prefab]) => ({ name, actor: isPlainObject(prefab) && typeof prefab.actor === 'string' ? prefab.actor : undefined }))
      : [];
  },
  fileUrl: (path) => `/@fs${project?.root}/${path}`,
  search: (type, query) => get<LibraryCard[]>(`/__library/search?source=polyhaven&type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`),
  import: async (type, id) => { await post('/__library/import', { source: 'polyhaven', type, id, resolution: '2k' }); },
  place: (item, point) => { void place(item, point); },
  dimensions: () => viewport.dimensions
});

// --- Selection -----------------------------------------------------------

/** The data at a document path. */
function at(path: PathSegment[]): unknown {
  let value: unknown = remote?.doc.data;
  for (const segment of path) {
    value = isPlainObject(value) || Array.isArray(value) ? (value as Record<string, unknown>)[segment as never] : undefined;
  }
  return value;
}

/** The path of the placed object with this id, if there is one. */
function objectPath(id: string): PathSegment[] | null {
  const layers = remote?.doc.data.layers;
  if (!Array.isArray(layers)) return null;
  for (const [l, layer] of layers.entries()) {
    const objects = isPlainObject(layer) && Array.isArray(layer.objects) ? layer.objects : [];
    const index = objects.findIndex((object) => isPlainObject(object) && object.id === id);
    if (index >= 0) return ['layers', l, 'objects', index];
  }
  return null;
}

/** The id of the placed object a path is in, if it is in one. */
function objectIdAt(path: PathSegment[]): string | null {
  if (path.length < 4 || path[0] !== 'layers' || path[2] !== 'objects') return null;
  const id = (at(path.slice(0, 4)) as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' ? id : null;
}

function selectionFor(path: PathSegment[]): typeof selection {
  const id = path.length === 4 ? objectIdAt(path) : null;
  return id ? { id } : { path };
}

const selectedPath = (): PathSegment[] =>
  (selection && 'id' in selection ? objectPath(selection.id) : selection?.path) ?? [];
const selectedId = (): string | null => (selection && 'id' in selection ? selection.id : null);

function select(next: typeof selection): void {
  selection = next;
  // A selected object that no longer exists falls back to the scene.
  if (selection && 'id' in selection && !objectPath(selection.id)) selection = null;
  tree.select(selectedPath());
  overlay.select(playing ? null : selectedId());
  frameTool.disabled = !selectedId() || playing;
  showInspector();
}

/** The node at a path in the outline, for the inspector's title. */
function nodeAt(root: OutlineNode | null, path: PathSegment[]): OutlineNode | null {
  if (!root) return null;
  const key = JSON.stringify(path);
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (JSON.stringify(node.path) === key) return node;
    stack.push(...(node.children ?? []));
  }
  return null;
}

/** The deepest outline node a document path is in: what a problem selects. */
function nodeContaining(path: PathSegment[]): OutlineNode | null {
  for (let length = path.length; length >= 0; length--) {
    const node = nodeAt(outline, path.slice(0, length));
    if (node) return node;
  }
  return null;
}

const startsWith = (path: PathSegment[], prefix: PathSegment[]) => prefix.every((segment, i) => path[i] === segment);

function showInspector(): void {
  if (!remote) return;
  const path = selectedPath();
  const node = nodeAt(outline, path);
  const heading = path.length && node ? node.label : remote.doc.name ?? 'Scene';
  const here = issues.filter((issue) => startsWith(parsePath(issue.path), path));
  let rows = inspectNode(remote.doc.data, path, { registries: viewport.registries });
  // A placed object shows only what its level's dimension can take: a 2D
  // level rejects z, depth and rotation, a 3D one angle — unless the
  // document sets one anyway, which then shows with its problem.
  if (path.length === 4 && path[0] === 'layers' && path[2] === 'objects') {
    const world = remote.doc.data.world as { dimensions?: unknown } | undefined;
    const hidden = world?.dimensions === 3 ? ['angle'] : ['z', 'depth', 'rotation'];
    rows = rows.filter((row) => row.present || !hidden.includes(row.key));
  }
  inspector.show(heading, rows, {
    readOnly: readOnly() || playing,
    issues: here,
    kind: node ? (node.detail && node.kind === 'object' ? node.detail : node.kind) : 'scene'
  });
}

// --- Problems ------------------------------------------------------------

/** Check the document and show what is wrong, everywhere it is shown. */
function checkProblems(): void {
  if (!remote) return;
  issues = validateScene(remote.doc.data, validator).issues;
  tree.setProblems(issues.map((issue) => parsePath(issue.path)));
  problemCount.textContent = String(issues.length);
  problemCount.classList.toggle('zero', issues.length === 0);
  statProblems.replaceChildren(iconElement(issues.length ? ICONS.warning : ICONS.grid));
  statProblems.append(document.createTextNode(issues.length ? `${issues.length} problem${issues.length === 1 ? '' : 's'}` : 'No problems'));
  statProblems.className = `stat ${issues.length ? 'bad' : 'good'}`;
  problemList.replaceChildren();
  if (!issues.length) {
    const item = document.createElement('li');
    item.className = 'none';
    item.textContent = 'The engine loads this scene without complaint.';
    problemList.append(item);
  }
  for (const issue of issues) {
    const item = document.createElement('li');
    item.append(iconElement(ICONS.warning));
    const where = document.createElement('code');
    const node = nodeContaining(parsePath(issue.path));
    where.textContent = issue.path || '(document)';
    const text = document.createElement('span');
    text.textContent = issue.message;
    item.append(where, text);
    item.title = node ? `Select ${node.label}` : '';
    item.addEventListener('click', () => {
      if (!node) return;
      select(selectionFor(node.path));
      const row = inspectorPanel.querySelector(`[data-path="${CSS.escape(issue.path)}"]`);
      row?.scrollIntoView({ block: 'center' });
    });
    problemList.append(item);
  }
  showInspector();
}
const problemsSoon = settled(checkProblems, 120);

/** A headless game with the definition's classes, for checking actor properties and constraint params. */
async function buildValidator(): Promise<void> {
  validator = null;
  if (!definition?.register) return;
  try {
    const options = definition.GAME ?? {};
    await initPhysics(options.dimensions === 3 ? { dimensions: 3 } : undefined);
    const game = new M2D(null, { ...options, headless: true });
    definition.register(game);
    validator = game;
  } catch (error) {
    say(`Problems are checked without the game's classes: ${String((error as Error).message ?? error)}`);
  }
}

// --- Editing -------------------------------------------------------------

/** Every edit from this tab goes here: the replica applies it and tells the panels. */
function edit(change: Edit): void {
  if (!remote) return;
  if (playing) {
    say('Playing — stop (F5) to edit');
    return;
  }
  if (readOnly() && !change.ops.every((op) => op.path[0] === 'generator')) {
    say(`${remote.path} is generated by ${remote.state.generator} — detach it to edit`);
    return;
  }
  try {
    remote.edit(change);
  } catch (error) {
    say(String((error as Error).message ?? error));
  }
}

function commitGizmo(id: string, result: GizmoResult): void {
  const path = objectPath(id);
  if (!path) return;
  const ops: Op[] = [];
  const round = (value: number) => Math.round(value * 1e4) / 1e4;
  if (result.position) {
    for (const axis of ['x', 'y', 'z'] as const) {
      const value = result.position[axis];
      if (value !== undefined) ops.push({ op: 'set', path: [...path, axis], value: round(value) });
    }
  }
  if (result.angle !== undefined) ops.push({ op: 'set', path: [...path, 'angle'], value: round(result.angle) });
  if (result.rotation) ops.push({ op: 'set', path: [...path, 'rotation'], value: result.rotation });
  const turned = result.angle !== undefined || result.rotation;
  if (ops.length) edit({ label: `${turned ? 'Rotate' : 'Move'} ${id}`, ops });
}

function removeSelected(): void {
  const id = selectedId();
  const path = id ? objectPath(id) : null;
  if (!id || !path) return;
  edit({ label: `Delete ${id}`, ops: [{ op: 'remove', path: path.slice(0, 3), index: path[3] as number }] });
}

function duplicateSelected(): void {
  const id = selectedId();
  const path = id ? objectPath(id) : null;
  if (!id || !path || !remote) return;
  const copy = JSON.parse(JSON.stringify(at(path))) as Record<string, unknown>;
  copy.id = uniqueId(remote.doc.data, id);
  const step = viewport.dimensions === 3 ? 1 : 16;
  if (typeof copy.x === 'number') copy.x += step;
  edit({ label: `Duplicate ${id}`, ops: [{ op: 'insert', path: path.slice(0, 3), index: (path[3] as number) + 1, value: copy }] });
  select({ id: copy.id as string });
}

/** The replica changed: everything that shows it catches up. */
function changed(change: ReplicaChange): void {
  if (!remote) return;
  if (change.kind === 'state') {
    if (change.reason === 'conflict') say(`${remote.path} changed on disk — keeping your unsaved edits`);
    if (change.reason === 'saved') say(`Saved ${remote.path}`);
    updateBar();
    return;
  }
  // Most edits move or retune; only some change the tree. Re-rendering a
  // six-hundred-row tree per gizmo release is waste, so compare first.
  const next = sceneOutline(remote.doc.data);
  if (JSON.stringify(next) !== JSON.stringify(outline)) tree.show(next);
  outline = next;
  assets.refreshPrefabs();
  if (change.kind === 'reset') {
    select(selection);
    enqueue(() => materialize(true));
    say(`${remote.path} — ${change.reason}`);
    updateBar();
    problemsSoon();
    return;
  }
  const applied = viewport.apply(change.ops, remote.doc.data);
  if (applied.kind === 'invalid') {
    say(`Not drawn: the scene has ${applied.issues.length} problem${applied.issues.length === 1 ? '' : 's'} — see Problems`);
  } else {
    if (applied.kind === 'rebuild') enqueue(() => materialize(true));
    if (change.label) say(`${change.label}${change.origin && change.origin !== 'editor' ? ` — by ${change.origin}` : ''}`);
  }
  select(selection);
  updateBar();
  problemsSoon();
}

function updateBar(): void {
  const state = remote?.state;
  undoButton.disabled = !state?.undo || playing;
  redoButton.disabled = !state?.redo || playing;
  undoButton.title = state?.undo ? `Undo ${state.undo} (Ctrl+Z)` : 'Nothing to undo';
  redoButton.title = state?.redo ? `Redo ${state.redo} (Ctrl+Shift+Z)` : 'Nothing to redo';
  const dirty = remote?.dirty ?? false;
  saveButton.disabled = !remote || !dirty || readOnly();
  saveButton.classList.toggle('dirty', dirty && !readOnly());
  saveButton.querySelector('.text')!.textContent = dirty ? 'Save' : 'Saved';
  detachButton.hidden = !readOnly();
  updatePlayButton();
  document.title = `${dirty ? '• ' : ''}${remote?.doc.name ?? 'scene'} — ${project?.name ?? 'M2D Editor'}`;
  statPath.textContent = remote?.path ?? '';
  statDim.textContent = remote ? `${viewport.dimensions}D` : '';

  // The history: what is applied, oldest first, then what redo would bring back.
  const applied = state?.history ?? [];
  historyCount.textContent = String(applied.length);
  const items = applied.map((label, index) => {
    const item = document.createElement('li');
    const agent = /\(agent\)$/.test(label);
    item.append(document.createTextNode(agent ? label.replace(/ \(agent\)$/, '') : label));
    if (agent) {
      item.classList.add('agent');
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = 'agent';
      item.append(who);
    }
    if (index === applied.length - 1) item.classList.add('current');
    const back = applied.length - 1 - index;
    item.title = back ? `Undo ${back} step${back === 1 ? '' : 's'} to here` : 'The current state';
    item.addEventListener('click', () => { for (let i = 0; i < back; i++) remote?.undo(); });
    return item;
  });
  if (state?.redo) {
    const item = document.createElement('li');
    item.className = 'undone';
    item.textContent = state.redo;
    item.title = 'Redo';
    item.addEventListener('click', () => remote?.redo());
    items.push(item);
  }
  historyList.replaceChildren(...items);
  if (!historyList.hidden) historyList.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
}

function updateDrawStat(): void {
  statDraw.replaceChildren(iconElement(ICONS.leaf));
  statDraw.append(document.createTextNode(powerBox.checked ? `Power saving · ${M2D.EDIT_IDLE_FPS} fps at rest` : 'Live: every frame'));
  statDraw.classList.toggle('good', powerBox.checked);
}

// --- Loading -------------------------------------------------------------

/**
 * One load at a time, and the newest wins: opening a scene, a code reload,
 * a rebuild, play and stop all replace the viewport's game, and run
 * concurrently they would interleave over it. A request arriving while one
 * runs replaces whatever was waiting, so a burst costs one more rebuild.
 */
let waiting: (() => Promise<void>) | null = null;
let running = false;
function enqueue(job: () => Promise<void>): void {
  waiting = job;
  if (running) return;
  running = true;
  void (async () => {
    while (waiting) {
      const next = waiting;
      waiting = null;
      await next().catch((error: unknown) => { showPlate(String((error as Error).message ?? error)); });
    }
    running = false;
  })();
}

/** File events arrive in bursts; they settle briefly before they queue. */
function settled(action: () => void, ms = 60): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; action(); }, ms);
  };
}

/** Build the viewport's edit game from the replica, the camera held when asked. */
async function materialize(keepView: boolean): Promise<void> {
  if (!project || !remote || playing) return;
  const camera = keepView ? viewport.captureCamera() : null;
  try {
    const shown = await viewport.show(remote.doc, {
      definition,
      presentation: hooksModule?.OPTIONS,
      basePath: assetBase(project),
      sceneNames: project.scenes.flatMap((scene) => (scene.name ? [scene.name] : []))
    });
    if (!shown) return;
  } catch (error) {
    viewport.close();
    const count = issues.length;
    showPlate(count
      ? `This scene does not load: ${count} problem${count === 1 ? '' : 's'}.\nThe tree, the fields and the Problems panel are still the document's.`
      : String((error as Error).message ?? error));
    say(`${remote.path}: does not load`);
    if (count) showDock('problems');
    return;
  }
  viewport.drawOnDemand = powerBox.checked;
  if (keepView) viewport.restoreCamera(camera);
  showPlate(null);
  updateBar();
  // The registries are the game's now; resolve the inspector against them.
  select(selection);
}

async function open(next: SceneEntry): Promise<void> {
  if (!project) return;
  remote?.close();
  remote = null;
  selection = null;
  issues = [];
  playing = false;
  editorFrame.classList.remove('playing');
  entry = next;
  picker.value = next.path;
  history.replaceState(null, '', `#${encodeURIComponent(next.path)}`);
  showPlate(`Opening ${next.path}…`);
  try {
    remote = await RemoteDocument.open(next.path);
  } catch (error) {
    viewport.close();
    showPlate(String((error as Error).message ?? error));
    say(`${next.path}: could not open`);
    return;
  }
  remote.onChange(changed);
  definition = await loadDefinition(project, generation).catch((error: unknown) => {
    say(`The game's code failed to load (${String((error as Error).message ?? error)}); placeholders only`);
    return null;
  });
  hooksModule = await loadHooks(project, generation).catch((error: unknown) => {
    say(`The game's hooks failed to load (${String((error as Error).message ?? error)}); play runs the bare scene`);
    return null;
  });
  await buildValidator();
  outline = sceneOutline(remote.doc.data);
  tree.show(outline);
  checkProblems();
  select(null);
  updateBar();
  assets.refreshPrefabs();
  await materialize(false);
  if (remote) {
    const notes = [
      remote.state.generator ? `generated by ${remote.state.generator}, read-only` : '',
      project.definition ? '' : 'no game code declared — placeholders only'
    ].filter(Boolean);
    say(`Opened ${next.name ?? next.path}${notes.length ? ` (${notes.join('; ')})` : ''}`);
  }
}

/** A module the game imports changed: fresh classes, same document, same camera. */
async function reloadCode(): Promise<void> {
  if (!project || !remote) return;
  generation = Date.now();
  try {
    definition = await loadDefinition(project, generation);
    hooksModule = await loadHooks(project, generation);
  } catch (error) {
    showPlate(`Hot reload failed: ${String((error as Error).message ?? error)}`);
    return;
  }
  await buildValidator();
  checkProblems();
  if (playing) {
    // Fresh code, a fresh play: the old game's state was the old code's.
    await startPlay();
    say(`${remote.path} — code reloaded, playing again`);
    return;
  }
  await materialize(true);
  say(`${remote.path} — code reloaded`);
}

function listScenes(): void {
  if (!project) return;
  picker.replaceChildren(...project.scenes.map((scene) => {
    const option = document.createElement('option');
    option.value = scene.path;
    option.textContent = `${scene.name ?? scene.path}${scene.generator ? ' (generated)' : ''}`;
    option.title = scene.path;
    return option;
  }));
  picker.disabled = project.scenes.length === 0;
  if (entry) picker.value = entry.path;
}

// --- Placing assets ------------------------------------------------------

/** A name usable as a prefab or asset key, from a file name. */
function keyFrom(path: string): string {
  const base = path.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_');
  return /^[A-Za-z]/.test(base) ? base : `asset_${base}`;
}

/** The actor a placed asset gets: Prop when the game registers it, else what its static meshes or sprites already use. */
function sceneryActor(kind: 'mesh' | 'spritesheet'): string | null {
  const actors = viewport.registries.actors;
  if (actors?.has('Prop')) return 'Prop';
  const prefabs = remote?.doc.data.prefabs;
  if (isPlainObject(prefabs)) {
    for (const prefab of Object.values(prefabs)) {
      if (isPlainObject(prefab) && prefab[kind] && isPlainObject(prefab.physics) && prefab.physics.bodyType === 'static' && typeof prefab.actor === 'string') {
        return prefab.actor;
      }
    }
  }
  return actors ? [...actors.keys()][0] ?? null : null;
}

/** An op that sets `value` at `path`, creating the first missing container on the way. */
function setDeep(path: PathSegment[], value: unknown): Op {
  for (let depth = 1; depth < path.length; depth++) {
    if (at(path.slice(0, depth)) === undefined) {
      let nested: unknown = value;
      for (let i = path.length - 1; i >= depth; i--) nested = { [path[i] as string]: nested };
      return { op: 'set', path: path.slice(0, depth), value: nested };
    }
  }
  return { op: 'set', path, value };
}

/** Where a drop lands, in document coordinates; the view's centre when no point is given. */
function dropPoint(point?: { x: number; y: number }): { x: number; y: number; z?: number } | null {
  const box = viewport.canvas.getBoundingClientRect();
  const client = point ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  if (viewport.dimensions === 3) {
    const p = viewport.groundPoint(client.x, client.y, 0);
    return p ? { x: Math.round(p.x * 100) / 100, y: 0, z: Math.round(p.z * 100) / 100 } : null;
  }
  const p = viewport.worldPoint(client.x, client.y);
  return p ? { x: Math.round(p.x), y: Math.round(p.y) } : null;
}

/**
 * Place an asset: a prefab gets another instance, sized like the ones
 * already placed; a model gets a scene asset, a prefab whose collider fits
 * its mesh (from the host's bounds) and an object standing on the ground;
 * an image in a 2D scene gets a sprite sheet, a prefab and an object at
 * its own size. One edit, one step of undo, selected after.
 */
async function place(item: Placeable, point?: { x: number; y: number }): Promise<void> {
  if (!remote || playing) return;
  if (readOnly()) { say('Detach the scene from its generator to place things in it'); return; }
  const where = dropPoint(point);
  if (!where) return;
  const layers = remote.doc.data.layers;
  if (!Array.isArray(layers) || !layers.length) { say('The scene has no layer to place into'); return; }
  const objects = isPlainObject(layers[0]) && Array.isArray(layers[0].objects) ? layers[0].objects : [];
  const target: PathSegment[] = ['layers', 0, 'objects'];
  const ops: Op[] = [];
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const prefabs = isPlainObject(remote.doc.data.prefabs) ? remote.doc.data.prefabs : {};
  let object: Record<string, unknown>;
  let label: string;

  if (item.kind === 'prefab') {
    const like = objects.find((o) => isPlainObject(o) && o.prefab === item.name) as Record<string, unknown> | undefined;
    object = { id: uniqueId(remote.doc.data, item.name), prefab: item.name, ...where };
    for (const key of ['width', 'height', 'depth', 'zIndex', 'rotation', 'properties']) if (like?.[key] !== undefined) object[key] = like[key];
    if (viewport.dimensions === 3) object.y = r((typeof object.height === 'number' ? object.height : 1) / 2);
    label = `Place ${item.name}`;
  } else if (item.type === 'model') {
    if (viewport.dimensions !== 3) { say('Models go into 3D scenes'); return; }
    const actor = sceneryActor('mesh');
    if (!actor) { say("The game registers no actor to give this model; register the engine's Prop"); return; }
    const info = await get<{ bounds?: { min: number[]; max: number[] } }>(`/__asset-info?path=${encodeURIComponent(item.path)}`);
    const min = info.bounds?.min ?? [-0.5, 0, -0.5];
    const max = info.bounds?.max ?? [0.5, 1, 0.5];
    const size = [0, 1, 2].map((i) => Math.max(0.05, r(max[i]! - min[i]!)));
    const centre = [0, 1, 2].map((i) => r((max[i]! + min[i]!) / 2));
    const name = keyFrom(item.path);
    const models = (remote.doc.data.assets as { models?: Record<string, { url?: string }> } | undefined)?.models ?? {};
    const modelKey = Object.entries(models).find(([, model]) => model.url === item.url)?.[0] ?? name;
    if (!models[modelKey]) ops.push(setDeep(['assets', 'models', modelKey], { url: item.url }));
    if (!prefabs[name]) {
      ops.push(setDeep(['prefabs', name], {
        actor,
        physics: { bodyType: 'static' },
        // The body is the mesh's box, centred on it: the model is offset to sit in it.
        mesh: { model: modelKey, offset: { x: -centre[0]!, y: -centre[1]!, z: -centre[2]! } }
      }));
    }
    object = { id: uniqueId(remote.doc.data, name), prefab: name, x: where.x, y: r(size[1]! / 2), z: where.z ?? 0, width: size[0], height: size[1], depth: size[2] };
    label = `Place ${name}`;
  } else if (item.type === 'image' && viewport.dimensions === 3) {
    // A texture: onto the object under the drop; with no drop point (a
    // double-click, Place), onto the selection.
    const id = point ? viewport.pick(point.x, point.y) : selectedId();
    const path = id ? objectPath(id) : null;
    if (!id || !path) { say('Drop a texture onto an object to give it that texture'); return; }
    // A texture tiles over a shape; a model brings its own materials.
    const object = at(path) as { prefab?: string; overrides?: { mesh?: { model?: unknown } } };
    const prefab = isPlainObject(remote.doc.data.prefabs) ? remote.doc.data.prefabs[object.prefab ?? ''] as { mesh?: { model?: unknown } } | undefined : undefined;
    if (object.overrides?.mesh?.model ?? prefab?.mesh?.model) { say(`${id} draws a model, which has its own materials; textures tile over shapes`); return; }
    const existing = (at([...path, 'overrides', 'mesh', 'texture']) as { size?: number } | undefined);
    edit({
      label: `Texture ${id}`,
      ops: [setDeep([...path, 'overrides', 'mesh', 'texture'], { url: item.url, size: existing?.size ?? 1 })]
    });
    select({ id });
    return;
  } else if (item.type === 'environment') {
    if (viewport.dimensions !== 3) { say('An environment lights a 3D scene'); return; }
    const environments = (remote.doc.data.assets as { environments?: Record<string, { url?: string }> } | undefined)?.environments ?? {};
    const key = Object.entries(environments).find(([, environment]) => environment.url === item.url)?.[0] ?? keyFrom(item.path);
    if (!environments[key]) ops.push(setDeep(['assets', 'environments', key], { url: item.url }));
    ops.push(setDeep(['world', 'environment'], key));
    edit({ label: `Light with ${key}`, ops });
    select({ path: ['world'] });
    return;
  } else if (item.type === 'image') {
    const actor = sceneryActor('spritesheet');
    if (!actor) { say("The game registers no actor to give this sprite; register the engine's Prop"); return; }
    const info = await get<{ width?: number; height?: number }>(`/__asset-info?path=${encodeURIComponent(item.path)}`);
    const width = info.width ?? 64;
    const height = info.height ?? 64;
    const name = keyFrom(item.path);
    const sheets = (remote.doc.data.assets as { spritesheets?: Record<string, { url?: string }> } | undefined)?.spritesheets ?? {};
    const sheetKey = Object.entries(sheets).find(([, sheet]) => sheet.url === item.url)?.[0] ?? name;
    if (!sheets[sheetKey]) {
      ops.push(setDeep(['assets', 'spritesheets', sheetKey], {
        url: item.url, frameWidth: width, frameHeight: height, animations: { default: { frames: [[0, 0]] } }
      }));
    }
    if (!prefabs[name]) {
      ops.push(setDeep(['prefabs', name], { actor, spritesheet: sheetKey, defaultAnimation: 'default', physics: { bodyType: 'static', isSensor: true } }));
    }
    // A big image placed at a size the scene can hold, its shape kept.
    const fit = Math.min(1, 256 / Math.max(width, height));
    object = { id: uniqueId(remote.doc.data, name), prefab: name, ...where, width: Math.round(width * fit), height: Math.round(height * fit) };
    label = `Place ${name}`;
  } else {
    say('Sounds are played by game code, not placed');
    return;
  }
  ops.push({ op: 'insert', path: target, index: objects.length, value: object });
  edit({ label, ops });
  select({ id: object.id as string });
}

// --- Play ----------------------------------------------------------------

/** Play the scene as the document stands, unsaved edits included, with the game's hooks. */
async function startPlay(): Promise<void> {
  if (!project || !remote) return;
  if (!playing) editCamera = viewport.captureCamera();
  playing = true;
  editorFrame.classList.add('playing');
  select(selection);
  updateBar();
  const current = remote;
  const others = project.scenes.filter((scene) => scene.name && scene.path !== current.path);
  try {
    const shown = await viewport.show(current.doc, {
      definition,
      presentation: hooksModule?.OPTIONS,
      basePath: assetBase(project),
      play: {
        hooks: hooksModule?.sceneHooks,
        scenes: others.map((scene) => ({ name: scene.name!, fetch: async () => (await fetchDocument(scene.path)).data })),
        leave: (scene) => {
          if (!playing) return;
          stopPlay();
          say(`The game went to '${scene}', a scene its page builds in code — play stopped`);
        }
      }
    });
    if (!shown) return;
    showPlate(null);
    const bare = hooksModule?.sceneHooks ? '' : ' (no hooks module declared: the bare scene)';
    say(`Playing ${current.doc.name ?? current.path}${bare} — F5 or Stop to return`);
  } catch (error) {
    consolePanel.print(`Play failed: ${String((error as Error).message ?? error)}`, 'error');
    playing = false;
    editorFrame.classList.remove('playing');
    await materialize(false);
    viewport.restoreCamera(editCamera);
    say(`Play failed — see the Console: ${String((error as Error).message ?? error)}`);
    updateBar();
  }
}

/** Back to editing: the document never moved, so the edit view rebuilds from it. */
function stopPlay(): void {
  if (!playing) return;
  playing = false;
  editorFrame.classList.remove('playing');
  updateBar();
  enqueue(async () => {
    await materialize(false);
    viewport.restoreCamera(editCamera);
    select(selection);
    say(`Stopped — back to editing ${remote?.path ?? ''}`);
  });
}

function togglePlay(): void {
  if (!remote) return;
  if (playing) stopPlay();
  else enqueue(startPlay);
}

function updatePlayButton(): void {
  playButton.disabled = !remote;
  playButton.classList.toggle('playing', playing);
  playButton.replaceChildren(iconElement(playing ? ICONS.stop : ICONS.play));
  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = playing ? 'Stop' : 'Play';
  playButton.append(text);
  playButton.title = playing ? 'Stop and return to editing (F5)' : 'Play the scene as it stands, unsaved edits included (F5)';
}

// --- Build ---------------------------------------------------------------

interface BuildEvent {
  stage: string;
  line?: string;
  message?: string;
  result?: { outDir: string; files: number; bytes: number; seconds: number; assets: number };
}

async function runBuild(): Promise<void> {
  showDock('build');
  buildRun.disabled = true;
  buildButton.disabled = true;
  buildLog.replaceChildren();
  buildSummary.className = 'build-summary';
  buildSummary.textContent = 'Building…';
  try {
    await post('/__build');
  } catch (error) {
    buildProgress({ stage: 'failed', message: String((error as Error).message ?? error) });
  }
}

/** Escape sequences Vite colours its log with. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function buildProgress(event: BuildEvent): void {
  if (event.stage === 'log' && event.line) {
    const item = document.createElement('li');
    item.textContent = event.line.replace(ANSI, '');
    if (/^warning/.test(event.line)) item.className = 'warn';
    if (/^error/.test(event.line)) item.className = 'error';
    buildLog.append(item);
    buildLog.scrollTop = buildLog.scrollHeight;
    return;
  }
  if (event.stage === 'building') return;
  buildRun.disabled = false;
  buildButton.disabled = false;
  if (event.stage === 'done' && event.result) {
    const r = event.result;
    buildSummary.className = 'build-summary good';
    buildSummary.textContent = `Built ${r.files} files (${(r.bytes / 1e6).toFixed(1)} MB, ${r.assets} runtime asset${r.assets === 1 ? '' : 's'}) into ${r.outDir}/ in ${r.seconds.toFixed(1)} s — a static site: upload the folder to any host.`;
    buildPreview.disabled = false;
    say('Build done');
  } else {
    buildSummary.className = 'build-summary bad';
    buildSummary.textContent = `Build failed: ${event.message ?? 'see the log'}`;
    say('Build failed');
  }
}

// --- New project ---------------------------------------------------------

function openNewDialog(): void {
  newError.hidden = true;
  newForm.reset();
  delete (newForm.elements.namedItem('folder') as HTMLInputElement).dataset.typed;
  updateWhere();
  newDialog.showModal();
}

function updateWhere(): void {
  const folder = (newForm.elements.namedItem('folder') as HTMLInputElement).value.trim() || 'my-game';
  const parent = project?.root.split('/').slice(0, -1).join('/') ?? '';
  newWhere.textContent = `${parent}/${folder}`;
}

// --- Chrome --------------------------------------------------------------

function setMode(mode: GizmoMode): void {
  overlay.setMode(mode);
  moveTool.setAttribute('aria-pressed', String(mode === 'move'));
  rotateTool.setAttribute('aria-pressed', String(mode === 'rotate'));
}

type DockTab = 'assets' | 'problems' | 'history' | 'console' | 'build';
const DOCK_TABS: DockTab[] = ['assets', 'problems', 'history', 'console', 'build'];

function showDock(tab: DockTab): void {
  for (const button of document.querySelectorAll<HTMLElement>('.tab')) {
    button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  }
  for (const pane of document.querySelectorAll<HTMLElement>('[data-pane]')) pane.hidden = pane.dataset.pane !== tab;
  if (tab === 'console') consolePanel.seen();
  if (tab === 'assets') void assets.refresh().catch(() => {});
  setDockHidden(false);
  settings.set('dock.tab', tab);
}

function setDockHidden(hidden: boolean): void {
  layout.setHidden('dock', hidden);
  syncDockToggle();
}

function syncDockToggle(): void {
  const hidden = layout.isHidden('dock');
  dockToggle.replaceChildren(iconElement(hidden ? ICONS.collapse : ICONS.expand));
  dockToggle.title = hidden ? 'Show the panel' : 'Hide the panel';
}

// --- Wiring --------------------------------------------------------------

picker.addEventListener('change', () => {
  const next = project?.scenes.find((scene) => scene.path === picker.value);
  if (!next || next.path === entry?.path) return;
  if (remote?.dirty && !confirm(`${entry?.path} has unsaved edits. They stay open in the host; switch anyway?`)) {
    picker.value = entry?.path ?? '';
    return;
  }
  enqueue(() => open(next));
});
undoButton.addEventListener('click', () => remote?.undo());
redoButton.addEventListener('click', () => remote?.redo());
saveButton.addEventListener('click', () => remote?.save());
detachButton.addEventListener('click', () => {
  if (!remote?.state.generator) return;
  if (!confirm(`Detach ${remote.path} from ${remote.state.generator}? The script will no longer own this file; ` +
    'from now on it is edited here and the script is not rerun over it.')) return;
  edit({ label: 'Detach from generator', ops: [{ op: 'set', path: ['generator'] }] });
});
moveTool.addEventListener('click', () => setMode('move'));
rotateTool.addEventListener('click', () => setMode('rotate'));
frameTool.addEventListener('click', () => { const id = selectedId(); if (id) viewport.frame(id); });
playButton.addEventListener('click', togglePlay);
buildButton.addEventListener('click', () => { void runBuild(); });
buildRun.addEventListener('click', () => { void runBuild(); });
buildPreview.addEventListener('click', () => {
  void post<{ url: string }>('/__preview').then(({ url }) => { window.open(url, '_blank'); say(`Previewing the built site at ${url}`); })
    .catch((error: unknown) => say(String((error as Error).message ?? error)));
});
newButton.addEventListener('click', openNewDialog);
$<HTMLButtonElement>('#new-cancel').addEventListener('click', () => newDialog.close());
newForm.addEventListener('input', (event) => {
  const name = newForm.elements.namedItem('name') as HTMLInputElement;
  const folder = newForm.elements.namedItem('folder') as HTMLInputElement;
  // The folder follows the name until it is typed itself.
  if (event.target === name && !folder.dataset.typed) folder.value = name.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (event.target === folder) folder.dataset.typed = '1';
  updateWhere();
});
newForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(newForm);
  const create = $<HTMLButtonElement>('#new-create');
  create.disabled = true;
  create.textContent = 'Creating…';
  void post<{ url: string; root: string }>('/__new', {
    name: String(data.get('name') ?? ''), folder: String(data.get('folder') ?? ''), template: String(data.get('template') ?? '2d')
  }).then(({ url, root }) => {
    newDialog.close();
    say(`Created ${root} — its editor is at ${url}`);
    window.open(url, '_blank');
  }).catch((error: unknown) => {
    newError.hidden = false;
    newError.textContent = String((error as Error).message ?? error);
  }).finally(() => {
    create.disabled = false;
    create.textContent = 'Create and open';
  });
});
for (const button of document.querySelectorAll<HTMLElement>('.tab')) {
  button.addEventListener('click', () => showDock(button.dataset.tab as DockTab));
}
dockToggle.addEventListener('click', () => setDockHidden(!layout.isHidden('dock')));
for (const button of document.querySelectorAll<HTMLElement>('[data-toggle]')) {
  button.addEventListener('click', () => {
    layout.toggle(button.dataset.toggle as Region);
    syncDockToggle();
  });
}
statProblems.addEventListener('click', () => showDock('problems'));

powerBox.checked = settings.get('power', '1') === '1';
powerBox.addEventListener('change', () => {
  settings.set('power', powerBox.checked ? '1' : '0');
  viewport.drawOnDemand = powerBox.checked;
  updateDrawStat();
});
snapBox.checked = settings.get('snap', '0') === '1';
snapBox.addEventListener('change', () => settings.set('snap', snapBox.checked ? '1' : '0'));
const savedTab = settings.get('dock.tab', 'assets') as DockTab;
const dockWasHidden = layout.isHidden('dock');
showDock(DOCK_TABS.includes(savedTab) ? savedTab : 'assets');
setDockHidden(dockWasHidden);
updateDrawStat();

// A click on the world selects what is under it; a drag is the camera's.
let down: { x: number; y: number } | null = null;
viewportPanel.addEventListener('pointerdown', (event) => {
  down = event.button === 0 && event.target instanceof HTMLCanvasElement && !playing ? { x: event.clientX, y: event.clientY } : null;
});
viewportPanel.addEventListener('pointerup', (event) => {
  if (!down || overlay.dragging) return;
  const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
  down = null;
  if (moved > 4) return;
  const id = viewport.pick(event.clientX, event.clientY);
  select(id ? { id } : null);
});

// Drop an asset card on the viewport to place it.
viewportPanel.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE) || playing) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  viewportPanel.classList.add('drop-target');
});
viewportPanel.addEventListener('dragleave', () => viewportPanel.classList.remove('drop-target'));
viewportPanel.addEventListener('drop', (event) => {
  viewportPanel.classList.remove('drop-target');
  const payload = event.dataTransfer?.getData(DRAG_TYPE);
  if (!payload) return;
  event.preventDefault();
  void place(JSON.parse(payload) as Placeable, { x: event.clientX, y: event.clientY });
});

document.addEventListener('keydown', (event) => {
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    || event.target instanceof HTMLTextAreaElement;
  const mod = event.ctrlKey || event.metaKey;
  if (event.code === 'F5') {
    event.preventDefault();
    togglePlay();
    return;
  }
  // Alt+1, 2, 3: the scene tree, the dock, the inspector.
  if (event.altKey && !mod && ['Digit1', 'Digit2', 'Digit3'].includes(event.code)) {
    event.preventDefault();
    layout.toggle((['tree', 'dock', 'inspector'] as const)[Number(event.code.slice(-1)) - 1]!);
    syncDockToggle();
    return;
  }
  // While playing, the keyboard is the game's.
  if (playing) return;
  if (mod && event.code === 'KeyS') {
    event.preventDefault();
    if (remote?.dirty && !readOnly()) remote.save();
    return;
  }
  if (typing) return;
  if (mod && event.code === 'KeyZ') {
    event.preventDefault();
    if (event.shiftKey) remote?.redo(); else remote?.undo();
  } else if (mod && event.code === 'KeyY') {
    event.preventDefault();
    remote?.redo();
  } else if (mod && event.code === 'KeyD') {
    event.preventDefault();
    duplicateSelected();
  } else if (event.code === 'Delete' || event.code === 'Backspace') {
    removeSelected();
  } else if (event.code === 'Escape') {
    select(null);
  } else if (!mod && event.code === 'KeyF') {
    const id = selectedId();
    if (id) viewport.frame(id);
  } else if (!mod && event.code === 'KeyW') {
    setMode('move');
  } else if (!mod && event.code === 'KeyE') {
    setMode('rotate');
  }
});

window.addEventListener('beforeunload', (event) => {
  // The edits are safe in the host; closing the tab loses nothing. But a
  // tab closed by accident is worth one question while they are unsaved.
  if (remote?.dirty) event.preventDefault();
});

// Vite spaces a burst of saves out as it re-transforms; a code reload
// rebuilds the game anyway, so waiting a little longer costs nothing.
const codeChanged = settled(() => { enqueue(reloadCode); }, 150);
onHost<{ path: string }>('m2d:module', () => { codeChanged(); });
const refreshListing = settled(() => {
  void loadProject().then((fresh) => { project = fresh; listScenes(); }).catch(() => {});
}, 250);
const assetsChanged = settled(() => { void assets.refresh().catch(() => {}); }, 300);
onHost<{ path: string }>('m2d:file', ({ path }) => {
  if (path.endsWith('.json') && !project?.scenes.some((scene) => scene.path === path)) refreshListing();
  if (/\.(glb|gltf|png|jpe?g|webp|hdr|wav|mp3|ogg)$/i.test(path)) assetsChanged();
});
onHost<{ path: string; client?: string; message: string }>('m2d:error', ({ message }) => { say(message); });
onHost<JobState>('m2d:job', (job) => {
  assets.job(job);
  if (job.stage === 'done') { say(`Imported ${job.label} — drag it in from Assets, or press Place`); void assets.refresh().catch(() => {}); }
  if (job.stage === 'failed') say(`Import of ${job.label} failed: ${job.message}`);
});
onHost<BuildEvent>('m2d:build', buildProgress);

try {
  project = await loadProject();
  title.textContent = project.name;
  listScenes();
  const wanted = decodeURIComponent(location.hash.slice(1));
  const first = project.scenes.find((scene) => scene.path === wanted) ?? project.scenes[0];
  if (first) enqueue(() => open(first));
  else showPlate('This project has no scenes yet.');
} catch (error) {
  showPlate(String((error as Error).message ?? error));
}

// For browser automation (tests, an agent driving the page): the live
// viewport and the open replica. Read-only by convention.
Object.assign(window, {
  m2dEditor: { viewport, place, togglePlay, get remote() { return remote; }, get issues() { return issues; }, get playing() { return playing; } }
});
