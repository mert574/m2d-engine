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
  sceneOutline, inspectNode, uniqueId, isPlainObject, validateScene, parsePath, structure, paths, rotation, stage, SceneDocument,
  type Variant, type OutlineNode, type PathSegment, type Op, type Edit, type ValidationIssue, type Quaternion
} from 'm2d-editor-core';
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { ANCHOR_ORIGINS } from 'm2d-engine/core/ui/uiElement.js';
import {
  loadProject, assetBase, loadDefinition, loadHooks, onHost, post, get, fetchDocument,
  type HostProject, type SceneEntry, type GameDefinition, type HooksModule
} from './host.ts';
import { RemoteDocument, type ReplicaChange } from './remote.ts';
import { Viewport, encodeInstance, decodeInstance } from './viewport.ts';
import { createPropBrush } from './propBrush.ts';
import { createTilePaint } from './tilePaint.ts';
import { createAnimationEditor } from './animationEditor.ts';
import { createViewHelpers, type Helper } from './viewHelpers.ts';
import { createPathTool } from './pathEditor.ts';
import { createLookPanel } from './lookPanel.ts';
import { renderThumbnail } from './thumbnails.ts';
import { createTree, type SelectMode } from './tree.ts';
import { showMenu, SEPARATOR, type MenuItem } from './menu.ts';
import { buildCatalog, type CatalogEntry } from './catalog.ts';
import { createComponentsPanel } from './componentsPanel.ts';
import { createInspector, type InspectorGroup } from './inspector.ts';
import { createOverlay, type GizmoResult, type GizmoMode } from './overlay.ts';
import { createAssetsPanel, DRAG_TYPE, type Placeable, type AssetFileEntry, type JobState, type LibraryCard } from './assetsPanel.ts';
import { resizeOps, scalesUniformly, currentSizes, setDeep as setDeepIn } from './scaling.ts';
import { createConsolePanel } from './consolePanel.ts';
import { ICONS, iconElement } from './icons.ts';
import { createLayout, type Region } from './layout.ts';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const status = $<HTMLElement>('#status');
const plate = $<HTMLElement>('#plate');
const title = $<HTMLElement>('#title');
const picker = $<HTMLSelectElement>('#scene');
const sceneMenuButton = $<HTMLButtonElement>('#scene-menu');
const arrangeStrip = $<HTMLElement>('#arrange');
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
const layoutMenuButton = $<HTMLButtonElement>('#layout-menu');
const statProblems = $<HTMLButtonElement>('#stat-problems');
const statDraw = $<HTMLElement>('#stat-draw');
const statDim = $<HTMLElement>('#stat-dim');
const statPath = $<HTMLElement>('#stat-path');
const moveTool = $<HTMLButtonElement>('#mode-move');
const rotateTool = $<HTMLButtonElement>('#mode-rotate');
const scaleTool = $<HTMLButtonElement>('#mode-scale');
const frameTool = $<HTMLButtonElement>('#frame');
const helperTools: Record<Helper | 'isolate', HTMLButtonElement> = {
  grid: $<HTMLButtonElement>('#helper-grid'),
  lights: $<HTMLButtonElement>('#helper-lights'),
  camera: $<HTMLButtonElement>('#helper-camera'),
  isolate: $<HTMLButtonElement>('#helper-isolate')
};
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
/** The outline's nodes by their path key, rebuilt with the outline: what a path lookup reads. */
let outlineIndex = new Map<string, OutlineNode>();
let definition: GameDefinition | null = null;
/** The game's presentation hooks module, for play. */
let hooksModule: HooksModule | null = null;
/** A headless game with the definition's classes: what problems are checked against. */
let validator: unknown = null;
/** Bumped per code change; makes the next definition import fresh. */
let generation = 0;
/**
 * What is selected: placed objects by id (ids survive reordering), the
 * first being the primary the inspector shows, or any one node by path.
 */
let selection: { ids: string[] } | { path: PathSegment[] } | null = null;
/** Every problem the loader finds with the document. */
let issues: ValidationIssue[] = [];
/**
 * What the real load threw, when the check passed and the build still
 * failed (a constraint entry with no type on an actor that attached
 * none): listed as a problem too, so it is not only a line on the plate.
 */
let loadError: string | null = null;
/** Whether the viewport is playing the scene rather than editing it. */
let playing = false;
/** What the running play is, when not the scene as written: from a point, or a prefab's stage. */
let playVariant: Variant | null = null;
/** Camera to return to when play stops. */
let editCamera: Record<string, unknown> | null = null;
/**
 * The project's other scene documents by name, as last fetched: what the
 * problems check and the viewport compose from when a layer instances a
 * scene. Refreshed when a scene opens and when a scene file changes.
 */
const siblings: Record<string, unknown> = {};

async function refreshSiblings(): Promise<void> {
  if (!project) return;
  for (const key of Object.keys(siblings)) delete siblings[key];
  await Promise.all(project.scenes.map(async (scene) => {
    if (!scene.name) return;
    try {
      siblings[scene.name] = (await fetchDocument(scene.path)).data;
    } catch { /* a scene that does not parse is not composed; its own problems say why */ }
  }));
}

/** The project's scenes as the viewport registers them: by name, fetching through the host (unsaved edits included). */
const projectScenes = () => (project?.scenes ?? []).flatMap((scene) => (scene.name ? [{
  name: scene.name,
  fetch: async () => (siblings[scene.name!] = (await fetchDocument(scene.path)).data)
}] : []));

const say = (text: string) => { status.textContent = text; };
const showPlate = (text: string | null) => {
  plate.textContent = text ?? '';
  plate.classList.toggle('gone', text === null);
};
const readOnly = () => !!remote?.state.generator;
/** While a prefab is staged, prefabs and assets stay editable: each edit restarts the stage. */
const stagedEdit = (path: PathSegment[]) => playing && !!playVariant?.prefab && (path[0] === 'prefabs' || path[0] === 'assets');

const tree = createTree(treePanel, (node, mode) => selectFromTree(node, mode), {
  activate: (node) => {
    if (node.kind === 'sheet') { animations.open(String(node.path[2])); return; }
    if (node.kind === 'tileLayer') { tilePaint.start(node.path); return; }
    const id = objectIdAt(node.path);
    if (id) viewport.frame(id);
  },
  menu: (node, at) => showMenu(treeMenu(node), at)
});
const inspector = createInspector(inspectorPanel, {
  edit: (path, value, label) => {
    // Changing an element's anchor re-bases its offsets, so the element
    // stays put and only the point it measures from moves (E9).
    if (path.length === 3 && path[0] === 'elements' && path[2] === 'anchor' && typeof value === 'string') {
      const element = at(path.slice(0, 2)) as { x?: number; y?: number; anchor?: string } | undefined;
      const box = viewport.uiBox();
      const from = ANCHOR_ORIGINS[element?.anchor ?? 'top-left'];
      const to = ANCHOR_ORIGINS[value];
      if (element && box && from && to) {
        const r = (v: number) => Math.round(v * 100) / 100;
        edit({
          label: `Anchor to ${value}`,
          ops: [
            { op: 'set', path, value },
            { op: 'set', path: [...path.slice(0, 2), 'x'], value: r((element.x ?? 0) + (from[0]! - to[0]!) * box.width) },
            { op: 'set', path: [...path.slice(0, 2), 'y'], value: r((element.y ?? 0) + (from[1]! - to[1]!) * box.height) }
          ]
        });
        return;
      }
    }
    // A model object's size is one size: resizing a side resizes the
    // model with it, and the other sides keep its shape (scaling.ts).
    const key = path[4];
    if (path.length === 5 && objectIdAt(path) && typeof value === 'number' && (key === 'width' || key === 'height' || key === 'depth')
      && remote && scalesUniformly(remote.doc.data, path.slice(0, 4), viewport.dimensions)) {
      edit({ label: `Resize ${objectIdAt(path)}`, ops: resizeOps(remote.doc.data, path.slice(0, 4), { [key]: value }, viewport.dimensions) });
      return;
    }
    edit({ label, ops: [{ op: 'set', path, value }] });
  },
  list: (op, label) => edit({ label, ops: [op as Op] }),
  preview: (path, value) => {
    // Position and Size fields of a placed object move the thing on screen while scrubbed.
    const id = path.length === 5 ? objectIdAt(path) : null;
    if (!id || !remote) return;
    const key = path[4] as string;
    if (value === undefined) {
      if (['width', 'height', 'depth'].includes(key)) viewport.endPreviewSize(id, false);
      return;
    }
    const object = at(path.slice(0, 4)) as Record<string, unknown>;
    const n = (k: string, d: number) => (typeof object[k] === 'number' ? object[k] as number : d);
    if (['x', 'y', 'z'].includes(key)) {
      viewport.preview(id, { position: { x: n('x', 0), y: n('y', 0), ...(viewport.dimensions === 3 && { z: n('z', 0) }), [key]: value } });
    } else if (['width', 'height', 'depth'].includes(key)) {
      const sizes = currentSizes(remote.doc.data, path.slice(0, 4), viewport.dimensions);
      const next = { width: sizes.width, height: sizes.height, depth: sizes.depth, [key]: value };
      if (scalesUniformly(remote.doc.data, path.slice(0, 4), viewport.dimensions)) {
        const factor = value / sizes[key as 'width'];
        viewport.previewSize(id, { x: sizes.width * factor, y: sizes.height * factor, z: sizes.depth * factor });
      } else {
        viewport.previewSize(id, { x: next.width, y: next.height, ...(viewport.dimensions === 3 && { z: next.depth }) });
      }
    }
  },
  rename: (path, from, to) => {
    if (!remote) return;
    try {
      edit({ label: `Rename ${from} to ${to}`, ops: structure.renameEntry(remote.doc.data, path, from, to) });
      // Follow the renamed node when it is the one shown.
      if (selection && 'path' in selection && selection.path.length === path.length + 1 && selection.path[path.length] === from) {
        select({ path: [...path, to] });
      }
    } catch (error) {
      say(String((error as Error).message ?? error));
    }
  },
  tokens: (hint) => {
    const theme = (viewport.game as { theme?: { tokens?: Record<string, unknown> } } | null)?.theme;
    if (!theme?.tokens) return [];
    // Which subtree of the theme a hint draws from; 'text' and 'align' take no tokens.
    const roots = hint === 'color' ? ['color'] : hint === 'size' ? ['font.size', 'space'] : hint === 'font' ? ['font'] : [];
    const names: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (!isPlainObject(node)) { names.push(`$${path}`); return; }
      for (const [key, child] of Object.entries(node)) walk(child, path ? `${path}.${key}` : key);
    };
    for (const root of roots) {
      const node = root.split('.').reduce<unknown>((at, key) => (isPlainObject(at) ? at[key] : undefined), theme.tokens);
      if (node !== undefined) walk(node, root);
    }
    return names;
  },
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
const snapStep = (dimensions: 2 | 3): number => (dimensions === 3 ? 0.25 : 8);
const overlay = createOverlay(viewportPanel, viewport, {
  snapping: () => snapBox.checked,
  snapStep,
  angleStep: Math.PI / 12,
  editable: () => !readOnly() && !playing,
  placed: (id) => {
    // A UI element: the document's x/y are its offsets from its anchor.
    const uiPath = elementPath(id);
    if (uiPath) {
      const element = at(uiPath) as Record<string, unknown>;
      const number = (key: string) => (typeof element[key] === 'number' ? element[key] as number : undefined);
      const properties = isPlainObject(element.properties) ? element.properties : {};
      const propNumber = (key: string) => (typeof properties[key] === 'number' ? properties[key] as number : undefined);
      return {
        x: number('x'), y: number('y'),
        width: element.type === 'rect' ? number('width') : propNumber('width'),
        height: element.type === 'rect' ? number('height') : propNumber('height'),
        uniform: false
      };
    }
    // A prop instance: the tuple is the document's word on where it stands.
    const tuplePath = instancePath(id);
    if (tuplePath) {
      const [x, y, z, yaw = 0] = at(tuplePath) as number[];
      return { x, y, z, rotation: rotation.forScene(rotation.fromAxisAngle({ x: 0, y: 1, z: 0 }, yaw)), uniform: true };
    }
    const path = objectPath(id);
    const object = path ? at(path) as Record<string, unknown> : null;
    if (!object) return null;
    const number = (key: string) => (typeof object[key] === 'number' ? object[key] as number : undefined);
    const turn = Array.isArray(object.rotation) && object.rotation.length === 4 ? object.rotation as Quaternion : undefined;
    return {
      x: number('x'), y: number('y'), z: number('z'), angle: number('angle'), rotation: turn,
      width: number('width'), height: number('height'), depth: number('depth'),
      uniform: !!remote && !!path && scalesUniformly(remote.doc.data, path, viewport.dimensions)
    };
  },
  commit: (results) => commitGizmo(results)
});
const brush = createPropBrush(viewportPanel, viewport, {
  doc: () => remote?.doc.data ?? null,
  edit: (label, ops) => edit({ label, ops }),
  ghost: (edges, caption) => overlay.ghost(edges, caption),
  say,
  changed: () => updateArrange()
});
const tilePaint = createTilePaint(viewportPanel, viewport, {
  doc: () => remote?.doc.data ?? null,
  edit: (label, ops) => edit({ label, ops }),
  say,
  sheetUrl: (sheet) => {
    const sheets = (remote?.doc.data.assets as { spritesheets?: Record<string, { url?: string }> } | undefined)?.spritesheets;
    const url = sheets?.[sheet]?.url;
    return url && project ? assetBase(project) + url : null;
  },
  projected: () => !!(viewport.game as { projection?: unknown } | null)?.projection,
  worldSize: () => {
    const options = (viewport.game as { options?: { worldWidth?: number; worldHeight?: number } } | null)?.options;
    return { width: options?.worldWidth ?? 960, height: options?.worldHeight ?? 540 };
  },
  changed: () => updateArrange()
});
const animations = createAnimationEditor({
  doc: () => remote?.doc.data ?? null,
  edit: (label, ops) => edit({ label, ops }),
  say,
  sheetUrl: (sheet) => {
    const sheets = (remote?.doc.data.assets as { spritesheets?: Record<string, { url?: string }> } | undefined)?.spritesheets;
    const url = sheets?.[sheet]?.url;
    return url && project ? assetBase(project) + url : null;
  },
  readOnly: () => readOnly() || playing
});
const helpers = createViewHelpers(viewportPanel, viewport, {
  doc: () => remote?.doc.data ?? null,
  objectPath,
  edit: (path, value, label) => edit({ label, ops: [setDeep(path, value)] }),
  store: settings
});
const pathTool = createPathTool(viewportPanel, viewport, {
  doc: () => remote?.doc.data ?? null,
  selected: () => (selection ? selectedPath() : null),
  select: (path) => select({ path }),
  apply: (ops, label) => edit({ label, ops }),
  editable: () => !readOnly() && !playing,
  snapping: () => snapBox.checked,
  snapStep,
  say
});
for (const helper of ['grid', 'lights', 'camera'] as const) {
  helperTools[helper].setAttribute('aria-pressed', String(helpers.isOn(helper)));
  helperTools[helper].addEventListener('click', () => toggleHelper(helper));
}
helperTools.isolate.addEventListener('click', toggleIsolate);
const components = createComponentsPanel($<HTMLElement>('#components'), {
  catalog: () => buildCatalog(viewport.registries),
  target: () => {
    const owner = constraintOwner();
    return owner ? { label: owner.label, kind: owner.kind } : null;
  },
  attach: (entry) => attachComponent(entry),
  newPrefab: (entry) => newPrefabOf(entry.name)
});
const lookPanel = createLookPanel($<HTMLElement>('#look'), viewport, {
  doc: () => remote?.doc.data ?? null,
  apply: (ops, label) => edit({ label, ops }),
  editable: () => !readOnly() && !playing,
  target: () => viewport.cameraTarget(),
  say
});
const lookShown = () => !$<HTMLElement>('#look').hidden;
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
  dragging: (item) => { dragItem = item; if (item?.kind === 'file') void assetInfo(item.path); if (!item) overlay.ghost(null); },
  dimensions: () => viewport.dimensions,
  thumbnail: (file) => (project ? renderThumbnail(file, assetBase(project)) : Promise.resolve(null))
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

/**
 * The document path of the prop instance an encoded id names
 * (`props:<layer>:<prop>:<index>`, see viewport.ts), checked against the
 * document, or null.
 */
function instancePath(id: string): PathSegment[] | null {
  const ref = decodeInstance(id);
  if (!ref) return null;
  const path: PathSegment[] = ['layers', ref.layer, 'props', ref.prop, 'instances', ref.index];
  return Array.isArray(at(path)) ? path : null;
}

/** The document path of the UI element with this id, if the scene holds one. */
function elementPath(id: string): PathSegment[] | null {
  const elements = remote?.doc.data.elements;
  if (!Array.isArray(elements)) return null;
  const index = elements.findIndex((element) => isPlainObject(element) && element.id === id);
  return index >= 0 ? ['elements', index] : null;
}

/** The path of the scene instance with this id (`layers[l].scenes[i]`), if there is one. */
function instancePathOf(id: string): PathSegment[] | null {
  const layers = remote?.doc.data.layers;
  if (!Array.isArray(layers)) return null;
  for (const [l, layer] of layers.entries()) {
    const scenes = isPlainObject(layer) && Array.isArray(layer.scenes) ? layer.scenes : [];
    const index = scenes.findIndex((instance) => isPlainObject(instance) && instance.id === id);
    if (index >= 0) return ['layers', l, 'scenes', index];
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
  return id ? { ids: [id] } : { path };
}

const selectedIds = (): string[] => (selection && 'ids' in selection ? selection.ids : []);
const selectedId = (): string | null => selectedIds()[0] ?? null;
const selectedPath = (): PathSegment[] =>
  (selection && 'ids' in selection
    ? objectPath(selection.ids[0]!) ?? instancePath(selection.ids[0]!) ?? elementPath(selection.ids[0]!)
    : selection?.path) ?? [];

/** The tree row a selected thing sits under: an instance highlights its group. */
const treePathOf = (id: string): PathSegment[] | null =>
  objectPath(id) ?? elementPath(id) ?? instancePath(id)?.slice(0, 4) ?? null;

function select(next: typeof selection): void {
  selection = next;
  // Selected things that no longer exist drop out; none left falls back to the scene.
  if (selection && 'ids' in selection) {
    const ids = selection.ids.filter((id) => objectPath(id) || instancePath(id) || elementPath(id));
    selection = ids.length ? { ids } : null;
  }
  const others = selectedIds().slice(1).map(treePathOf).filter((path): path is PathSegment[] => !!path);
  tree.select(selectedId() ? treePathOf(selectedId()!) ?? [] : selectedPath(), others);
  overlay.select(playing ? [] : selectedIds());
  pathTool.refresh();
  if (isolating) {
    // The isolated set follows the selection; nothing selected shows everything again.
    if (!selectedIds().length) { isolating = false; helperTools.isolate.setAttribute('aria-pressed', 'false'); }
    viewport.isolate(isolating ? selectedIds() : null);
  }
  frameTool.disabled = !selectedId() || playing;
  updateArrange();
  components.refresh();
  showInspector();
}

/** A click in the tree: on its own, toggling into the set (Ctrl), or a range of the layer's objects (Shift). */
function selectFromTree(node: OutlineNode, mode: SelectMode): void {
  const id = node.path.length === 4 ? objectIdAt(node.path) : null;
  if (!id || mode === 'replace') { select(selectionFor(node.path)); return; }
  if (mode === 'toggle') { toggleSelected(id); return; }
  // A range: from the primary to this one, in the layer's order.
  const anchor = selectedId();
  const anchorPath = anchor ? objectPath(anchor) : null;
  if (!anchorPath || anchorPath[1] !== node.path[1]) { toggleSelected(id); return; }
  const layer = remote?.doc.data.layers as Array<{ objects?: Array<{ id?: unknown }> }> | undefined;
  const objects = layer?.[node.path[1] as number]?.objects ?? [];
  const [from, to] = [anchorPath[3] as number, node.path[3] as number].sort((a, b) => a - b) as [number, number];
  const range = objects.slice(from, to + 1).flatMap((object) => (typeof object.id === 'string' ? [object.id] : []));
  select({ ids: [anchor!, ...range.filter((each) => each !== anchor)] });
}

/** Add an object to the selection, or take it out; the primary stays the primary. */
function toggleSelected(id: string): void {
  const ids = selectedIds();
  if (ids.includes(id)) select(ids.length > 1 ? { ids: ids.filter((each) => each !== id) } : null);
  else select({ ids: [...ids, id] });
}

/** Select every object of a prefab: the one asked for, else the primary's. */
/** A new path across the middle of the view, selected so its points can be dragged at once. */
function newPath(): void {
  if (!remote) return;
  const area = viewport.dimensions === 2 ? viewport.visibleArea() : null;
  const target = viewport.dimensions === 3 ? viewport.cameraTarget() : null;
  const r = (value: number) => Math.round(value * 1000) / 1000;
  const start = area
    ? { x: Math.round((area.left * 3 + area.right) / 4), y: Math.round((area.top + area.bottom) / 2) }
    : { x: r((target?.x ?? 0) - 2), y: r(target?.y ?? 0), z: r(target?.z ?? 0) };
  const span = area ? Math.round((area.right - area.left) / 2) : 4;
  const { ops, name } = structure.addPath(remote.doc.data, 'path', start, span);
  edit({ label: `New path ${name}`, ops });
  select({ path: ['paths', name] });
  say(`Drag ${name}'s points; double-click its line to add one, Alt-click a point to remove it`);
}

function selectAllOfPrefab(prefab?: string): void {
  if (!remote) return;
  const name = prefab ?? (() => { const id = selectedId(); const path = id ? objectPath(id) : null; const object = path ? at(path) as { prefab?: unknown } : null; return typeof object?.prefab === 'string' ? object.prefab : null; })();
  if (!name) return;
  const ids = structure.objectsOfPrefab(remote.doc.data, name);
  if (ids.length) { select({ ids }); say(`Selected ${ids.length} ${name}${ids.length === 1 ? '' : 's'}`); }
}

/** The outline, indexed by path key — once per outline, not once per lookup over six hundred nodes. */
function indexOutline(root: OutlineNode | null): Map<string, OutlineNode> {
  const index = new Map<string, OutlineNode>();
  const stack = root ? [root] : [];
  while (stack.length) {
    const node = stack.pop()!;
    index.set(JSON.stringify(node.path), node);
    for (const child of node.children ?? []) stack.push(child);
  }
  return index;
}

/** The node at a path in the outline, for the inspector's title. */
function nodeAt(root: OutlineNode | null, path: PathSegment[]): OutlineNode | null {
  if (!root) return null;
  return outlineIndex.get(JSON.stringify(path)) ?? null;
}

/** The deepest outline node a document path is in: what a problem selects. */
function nodeContaining(path: PathSegment[]): OutlineNode | null {
  for (let length = path.length; length >= 0; length--) {
    const node = nodeAt(outline, path.slice(0, length));
    if (node) return node;
  }
  return null;
}

/**
 * The inspector's tabs for a kind of node. A placed object: where it is,
 * what it is, what it changes about its prefab. A prefab: its body, its
 * look, its constraints. Anything else is one tab of cards.
 */
function groupsFor(kind: string, dimensions: 2 | 3): InspectorGroup[] | undefined {
  if (kind === 'object') {
    return [
      { id: 'transform', label: 'Transform', keys: dimensions === 3 ? ['x', 'y', 'z', 'width', 'height', 'depth', 'rotation', 'zIndex'] : ['x', 'y', 'width', 'height', 'angle', 'zIndex'] },
      { id: 'object', label: 'Object', keys: ['id', 'prefab', 'properties', 'constraints'], rest: true },
      { id: 'overrides', label: 'Overrides', keys: ['overrides'] }
    ];
  }
  if (kind === 'world') {
    return [
      { id: 'world', label: 'World', keys: ['dimensions', 'width', 'height', 'gravity', 'sort', 'projection', 'environment', 'player'], rest: true },
      { id: 'camera', label: 'Camera', keys: ['camera'] },
      { id: 'look', label: 'Look', keys: ['lighting', 'post', 'cycle'] },
      { id: 'rules', label: 'Rules', keys: ['rules', 'killPlane'] },
      { id: 'sound', label: 'Sound', keys: ['music'] }
    ];
  }
  if (kind === 'prefab') {
    return [
      { id: 'body', label: 'Body', keys: ['actor', 'physics'], rest: true },
      { id: 'look', label: 'Look', keys: ['spritesheet', 'defaultAnimation', 'mesh', 'light'] },
      { id: 'constraints', label: 'Constraints', keys: ['constraints'] }
    ];
  }
  return undefined;
}

const startsWith = (path: PathSegment[], prefix: PathSegment[]) => prefix.every((segment, i) => path[i] === segment);

function showInspector(): void {
  if (!remote) return;
  const path = selectedPath();
  const node = nodeAt(outline, path);
  // A prop instance has no tree node of its own; it reads as its group plus an index.
  const instance = !node && path.length === 6 && path[2] === 'props' && path[4] === 'instances';
  const groupId = instance ? (at(path.slice(0, 4)) as { id?: string } | undefined)?.id : undefined;
  const heading = instance
    ? `${groupId ?? 'props'} · ${String(path[5])}`
    : path.length && node ? node.label : remote.doc.name ?? 'Scene';
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
  const kind = node?.kind ?? (path.length === 2 && path[0] === 'prefabs' ? 'prefab' : 'scene');
  inspector.show(heading, rows, {
    readOnly: readOnly() || (playing && !stagedEdit(path)),
    issues: here,
    kind: instance ? 'instance' : node ? (node.detail && node.kind === 'object' ? node.detail : node.kind) : 'scene',
    groups: groupsFor(kind, viewport.dimensions),
    live: kind === 'object' && selectedId() ? viewport.liveConstraints(selectedId()!) : undefined
  });
}

// --- Problems ------------------------------------------------------------

/** Check the document and show what is wrong, everywhere it is shown. */
function checkProblems(): void {
  if (!remote) return;
  issues = validateScene(remote.doc.data, validator, { scenes: siblings }).issues;
  if (loadError && !issues.length) issues = [{ path: '', message: `The scene did not load: ${loadError}` }];
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
      inspector.reveal(issue.path);
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
    // The project's scene names, so a button's onClick or a rule's switch
    // naming a sibling scene checks as registered — the viewport's game
    // knows them the same way.
    const manager = (game as { sceneManager?: { addScene(name: string, scene: object): void } }).sceneManager;
    for (const scene of project?.scenes ?? []) {
      if (scene.name) manager?.addScene(scene.name, { fetch: async () => ({}) });
    }
    validator = game;
  } catch (error) {
    say(`Problems are checked without the game's classes: ${String((error as Error).message ?? error)}`);
  }
}

// --- Editing -------------------------------------------------------------

/** Every edit from this tab goes here: the replica applies it and tells the panels. */
function edit(change: Edit): void {
  if (!remote) return;
  if (playing && !change.ops.every((op) => stagedEdit(op.path))) {
    say(playVariant?.prefab ? 'Staging a prefab — only prefabs and assets edit; stop (F5) for the rest' : 'Playing — stop (F5) to edit');
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

/** A gesture ended: one edit for every object it moved, turned or resized. */
function commitGizmo(results: Array<{ id: string; result: GizmoResult }>): void {
  if (!remote) return;
  const ops: Op[] = [];
  const round = (value: number) => Math.round(value * 1e4) / 1e4;
  let verb = 'Move';
  for (const { id, result } of results) {
    // A UI element: a move writes its offsets, a resize its size where its
    // kind keeps it (rect at the top level, the rest under properties).
    const uiPath = elementPath(id);
    if (uiPath) {
      const element = at(uiPath) as { type?: string };
      if (result.position) {
        ops.push({ op: 'set', path: [...uiPath, 'x'], value: Math.round(result.position.x) });
        ops.push({ op: 'set', path: [...uiPath, 'y'], value: Math.round(result.position.y) });
      }
      if (result.size && element.type !== 'text') {
        if (element.type === 'rect') {
          ops.push({ op: 'set', path: [...uiPath, 'width'], value: Math.round(result.size.x) });
          ops.push({ op: 'set', path: [...uiPath, 'height'], value: Math.round(result.size.y) });
        } else {
          const properties = isPlainObject((element as Record<string, unknown>).properties)
            ? { ...(element as { properties: Record<string, unknown> }).properties } : {};
          properties.width = Math.round(result.size.x);
          properties.height = Math.round(result.size.y);
          ops.push({ op: 'set', path: [...uiPath, 'properties'], value: properties });
        }
      }
      verb = result.size ? 'Resize' : 'Move';
      continue;
    }
    // A prop instance commits as its whole tuple: one set, and the props
    // rebuild in place when it lands.
    const tuplePath = instancePath(id);
    if (tuplePath) {
      const info = viewport.instanceAt(id);
      let [x = 0, y = 0, z = 0, yaw = 0, scale = 1] = at(tuplePath) as number[];
      if (result.position) { x = result.position.x ?? x; y = result.position.y ?? y; z = result.position.z ?? z; }
      if (result.rotation) yaw = 2 * Math.atan2(result.rotation[1], result.rotation[3]);
      if (result.size && info && info.size.x > 1e-9) scale = Math.max(1e-4, scale * (result.size.x / info.size.x));
      ops.push({ op: 'set', path: tuplePath, value: [round(x), round(y), round(z), round(yaw), round(scale)] });
      verb = result.size ? 'Resize' : result.rotation ? 'Rotate' : 'Move';
      continue;
    }
    const path = objectPath(id);
    if (!path) continue;
    if (result.position) {
      for (const axis of ['x', 'y', 'z'] as const) {
        const value = result.position[axis];
        if (value !== undefined) ops.push({ op: 'set', path: [...path, axis], value: round(value) });
      }
    }
    if (result.angle !== undefined) ops.push({ op: 'set', path: [...path, 'angle'], value: round(result.angle) });
    if (result.rotation) ops.push({ op: 'set', path: [...path, 'rotation'], value: result.rotation });
    if (result.size) {
      const sizes = { width: result.size.x, height: result.size.y, ...(result.size.z !== undefined && { depth: result.size.z }) };
      ops.push(...resizeOps(remote.doc.data, path, sizes, viewport.dimensions));
    }
    verb = result.size ? 'Resize' : result.angle !== undefined || result.rotation ? 'Rotate' : 'Move';
  }
  const what = results.length === 1 ? results[0]!.id : `${results.length} objects`;
  if (ops.length) edit({ label: `${verb} ${what}`, ops });
}

function removeSelected(): void {
  const ids = selectedIds();
  if (!ids.length || !remote) return;
  const objectIds = ids.filter((id) => objectPath(id));
  // Instances erase per group, as one set each.
  const groups = new Map<string, { path: PathSegment[]; indices: number[] }>();
  for (const id of ids) {
    const path = instancePath(id);
    if (!path) continue;
    const key = JSON.stringify(path.slice(0, 4));
    const entry = groups.get(key) ?? { path: path.slice(0, 4), indices: [] };
    entry.indices.push(path[5] as number);
    groups.set(key, entry);
  }
  // Elements remove highest index first, so the earlier removals' paths hold.
  const elementIndices = ids
    .map((id) => elementPath(id)?.[1] as number | undefined)
    .filter((index): index is number => typeof index === 'number')
    .sort((a, b) => b - a);
  const ops: Op[] = [
    ...structure.removeObjects(remote.doc.data, objectIds),
    ...[...groups.values()].flatMap(({ path, indices }) => structure.erasePropInstances(remote!.doc.data, path, indices)),
    ...elementIndices.map((index): Op => ({ op: 'remove', path: ['elements'], index }))
  ];
  if (ops.length) edit({ label: `Delete ${ids.length === 1 ? (objectIds[0] ?? ids[0]) : `${ids.length} things`}`, ops });
}

/** Copies of the selected objects (or prop instances) beside them, selected after. */
function duplicateSelected(): void {
  const ids = selectedIds();
  if (!ids.length || !remote) return;
  const step = viewport.dimensions === 3 ? 1 : 16;
  // UI elements copy beside themselves with fresh ids.
  const elementPaths = ids.map(elementPath).filter((path): path is PathSegment[] => !!path);
  if (elementPaths.length) {
    const ops: Op[] = [];
    const made: string[] = [];
    const elements = remote.doc.data.elements as unknown[];
    const scratch = JSON.parse(JSON.stringify(remote.doc.data)) as Record<string, unknown>;
    elementPaths.forEach((path, i) => {
      const copy = JSON.parse(JSON.stringify(at(path))) as Record<string, unknown>;
      copy.id = uniqueId(scratch, typeof copy.id === 'string' ? copy.id : 'element');
      if (typeof copy.x === 'number') copy.x += 16;
      if (typeof copy.y === 'number') copy.y += 16;
      (scratch.elements as unknown[]).push(copy);
      ops.push({ op: 'insert', path: ['elements'], index: elements.length + i, value: copy });
      made.push(copy.id as string);
    });
    edit({ label: `Duplicate ${made.length === 1 ? made[0] : `${made.length} elements`}`, ops });
    select({ ids: made });
    return;
  }
  const instancePaths = ids.map(instancePath).filter((path): path is PathSegment[] => !!path);
  if (instancePaths.length) {
    const ops: Op[] = [];
    const made: string[] = [];
    const added = new Map<string, number>();
    for (const path of instancePaths) {
      const tuple = (at(path) as number[]).slice();
      tuple[0] = (tuple[0] ?? 0) + step;
      const key = JSON.stringify(path.slice(0, 4));
      const group = at(path.slice(0, 4)) as { instances: unknown[] };
      const index = group.instances.length + (added.get(key) ?? 0);
      ops.push({ op: 'insert', path: path.slice(0, 5), index, value: tuple });
      made.push(encodeInstance({ layer: path[1] as number, prop: path[3] as number, index }));
      added.set(key, (added.get(key) ?? 0) + 1);
    }
    edit({ label: `Duplicate ${instancePaths.length === 1 ? 'an instance' : `${instancePaths.length} instances`}`, ops });
    select({ ids: made });
    return;
  }
  const made = pasteObjects(ids.map((id) => at(objectPath(id)!) as Record<string, unknown>), { x: step }, 'Duplicate');
  if (made) select({ ids: made });
}

/** Insert copies into the primary's layer (else the first), ids made unique, as one edit. Returns the new ids. */
function pasteObjects(objects: Array<Record<string, unknown>>, offset: { x?: number; y?: number; z?: number }, verb: string): string[] | null {
  if (!remote || !objects.length) return null;
  const layer = (selectedId() ? objectPath(selectedId()!)?.[1] as number : undefined) ?? 0;
  try {
    const { ops, ids } = structure.insertObjects(remote.doc.data, objects, layer, offset);
    edit({ label: `${verb} ${objects.length === 1 ? ids[0] : `${objects.length} objects`}`, ops });
    return ids;
  } catch (error) {
    say(String((error as Error).message ?? error));
    return null;
  }
}

/** The clipboard: placed objects as JSON, in localStorage so another scene's tab can paste them. */
const CLIPBOARD = 'm2d-editor.clipboard';
function copySelected(): void {
  const ids = selectedIds().filter((id) => objectPath(id));
  if (!ids.length) {
    if (selectedIds().length) say('Prop instances duplicate (Ctrl+D) rather than copy');
    return;
  }
  const objects = ids.map((id) => at(objectPath(id)!));
  localStorage.setItem(CLIPBOARD, JSON.stringify({ dimensions: viewport.dimensions, objects }));
  say(`Copied ${ids.length === 1 ? ids[0] : `${ids.length} objects`}`);
}
function pasteClipboard(): void {
  const raw = localStorage.getItem(CLIPBOARD);
  if (!raw || !remote) { say('Nothing to paste'); return; }
  const { dimensions, objects } = JSON.parse(raw) as { dimensions: 2 | 3; objects: Array<Record<string, unknown>> };
  if (dimensions !== viewport.dimensions) { say(`The clipboard holds ${dimensions}D objects; this scene is ${viewport.dimensions}D`); return; }
  // Into this scene: the prefabs must exist here; those that do not are named.
  const prefabs = isPlainObject(remote.doc.data.prefabs) ? remote.doc.data.prefabs : {};
  const missing = [...new Set(objects.map((o) => o.prefab).filter((name) => typeof name !== 'string' || !(name in prefabs)))];
  if (missing.length) { say(`This scene has no prefab ${missing.map(String).join(', ')}; make it first`); return; }
  const step = viewport.dimensions === 3 ? 1 : 16;
  const made = pasteObjects(objects, { x: step }, 'Paste');
  if (made) select({ ids: made });
}

/** Line the selection up or spread it out on one axis. */
function arrangeSelected(axis: 'x' | 'y' | 'z', how: 'min' | 'center' | 'max' | 'distribute'): void {
  const ids = selectedIds();
  if (ids.length < 2 || !remote) return;
  const ops = structure.arrangeObjects(remote.doc.data, ids, axis, how);
  if (ops.length) edit({ label: `${how === 'distribute' ? 'Distribute' : 'Align'} ${ids.length} objects on ${axis}`, ops });
}

/** The Arrange strip over the viewport: shown with two or more objects selected, or any prop instance. */
function updateArrange(): void {
  const ids = selectedIds();
  const instances = ids.filter((id) => instancePath(id));
  if (instances.length && !playing && !readOnly()) {
    arrangeStrip.hidden = false;
    arrangeStrip.replaceChildren();
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = instances.length === 1
      ? (viewport.instanceAt(instances[0]!)?.group ?? 'instance')
      : `${instances.length} instances`;
    arrangeStrip.append(label);
    if (ids.length === 1) {
      const promote = document.createElement('button');
      promote.type = 'button';
      promote.textContent = 'To object';
      promote.title = 'Turn this instance into a placed object, lossless';
      promote.addEventListener('click', () => {
        if (!remote) return;
        try {
          const { ops, id } = structure.promotePropInstance(remote.doc.data, instancePath(ids[0]!)!);
          edit({ label: `Promote an instance to ${id}`, ops });
          select({ ids: [id] });
        } catch (error) {
          say(String((error as Error).message ?? error));
        }
      });
      arrangeStrip.append(promote);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.title = 'Delete the selected instances (Del)';
    remove.addEventListener('click', removeSelected);
    arrangeStrip.append(remove);
    return;
  }
  arrangeStrip.hidden = ids.length < 2 || playing;
  if (arrangeStrip.hidden) return;
  arrangeStrip.replaceChildren();
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = `${ids.length} selected`;
  arrangeStrip.append(label);
  const axes = viewport.dimensions === 3 ? (['x', 'y', 'z'] as const) : (['x', 'y'] as const);
  for (const axis of axes) {
    const group = document.createElement('span');
    group.className = `axis axis-${axis}`;
    const name = document.createElement('b');
    name.textContent = axis.toUpperCase();
    group.append(name);
    for (const [how, glyph, title] of [['min', '⇤', 'Align to the least'], ['center', '⇹', 'Align to the middle'], ['max', '⇥', 'Align to the greatest'], ['distribute', '⋯', 'Distribute evenly']] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = glyph;
      button.title = `${title} on ${axis}`;
      button.addEventListener('click', () => arrangeSelected(axis, how));
      group.append(button);
    }
    arrangeStrip.append(group);
  }
}

// --- Structure: the tree's menu, prefabs, constraints, scenes --------------

/** The node a constraint would attach to: the selected object or prefab. */
function constraintOwner(): { path: PathSegment[]; label: string; kind: 'object' | 'prefab' } | null {
  const id = selectedId();
  if (id) { const path = objectPath(id); return path ? { path, label: id, kind: 'object' } : null; }
  const path = selection && 'path' in selection ? selection.path : null;
  if (path && path.length === 2 && path[0] === 'prefabs') return { path, label: String(path[1]), kind: 'prefab' };
  return null;
}

function attachComponent(entry: CatalogEntry): void {
  const owner = constraintOwner();
  if (!remote || !owner) { say('Select an object or a prefab to attach a constraint to'); return; }
  const params: Record<string, unknown> = {};
  const { ops, slot } = structure.attachConstraint(remote.doc.data, owner.path, entry.name, params);
  edit({ label: `Attach ${entry.name} to ${owner.label}`, ops });
  inspector.reveal(`${owner.path.map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i ? `.${seg}` : seg)).join('')}.constraints.${slot}`);
}

function newPrefabOf(actor: string): void {
  if (!remote) return;
  const { ops, name } = structure.addPrefab(remote.doc.data, actor.charAt(0).toLowerCase() + actor.slice(1), actor, viewport.dimensions);
  edit({ label: `New prefab ${name}`, ops });
  select({ path: ['prefabs', name] });
}

/** Add a UI element of `kind`, valid from birth, and select it. */
function addElementOf(kind: structure.ElementKind): void {
  if (!remote) return;
  try {
    const assetsBlock = isPlainObject(remote.doc.data.assets) ? remote.doc.data.assets : {};
    const sheets = Object.keys(isPlainObject(assetsBlock.spritesheets) ? assetsBlock.spritesheets : {});
    const scene = project?.scenes.find((each) => each.name && each.path !== entry?.path)?.name ?? undefined;
    const { ops, id } = structure.addElement(remote.doc.data, kind, { scene, sprite: sheets[0] });
    edit({ label: `Add ${kind} ${id}`, ops });
    select({ ids: [id] });
  } catch (error) {
    say(String((error as Error).message ?? error));
  }
}

/** The element palette: one entry per kind the format holds. */
const elementPalette = (): MenuItem[] =>
  structure.ELEMENT_KINDS.map((kind) => ({ label: `Add ${kind}`, action: () => addElementOf(kind) }));

/** What can be done with a tree node, by its kind. */
function treeMenu(node: OutlineNode): MenuItem[] {
  if (!remote) return [];
  const data = remote.doc.data;
  const layers = Array.isArray(data.layers) ? data.layers as Array<{ name?: unknown }> : [];
  const layerName = (i: number) => (typeof layers[i]?.name === 'string' ? layers[i]!.name as string : `Layer ${i}`);
  const items: MenuItem[] = [];
  if (node.kind === 'object') {
    const ids = selectedIds().length > 1 && selectedIds().includes(objectIdAt(node.path) ?? '') ? selectedIds() : [objectIdAt(node.path)!];
    const many = ids.length > 1;
    const object = at(node.path) as { prefab?: string };
    items.push(
      { label: 'Frame', hint: 'F', action: () => viewport.frame(ids[0]!) },
      { label: many ? `Duplicate ${ids.length}` : 'Duplicate', hint: 'Ctrl+D', action: duplicateSelected },
      { label: 'Copy', hint: 'Ctrl+C', action: copySelected },
      SEPARATOR,
      {
        label: 'Move to layer',
        children: layers.map((_, i) => ({
          label: layerName(i), disabled: !many && i === node.path[1],
          action: () => {
            const ops = ids.flatMap((id) => { const path = objectPath(id); return path ? structure.moveObject(remote!.doc.data, path, i) : []; });
            // Paths shift as objects leave a layer; apply one at a time through the document instead.
            if (ids.length === 1) edit({ label: `Move ${ids[0]} to ${layerName(i)}`, ops });
            else for (const id of ids) { const path = objectPath(id); if (path) edit({ label: `Move ${id} to ${layerName(i)}`, ops: structure.moveObject(remote!.doc.data, path, i) }); }
          }
        }))
      },
      { label: 'Bring forward', disabled: many, action: () => { const path = node.path; edit({ label: `Reorder ${ids[0]}`, ops: structure.moveObject(data, path, path[1] as number, (path[3] as number) + 1) }); } },
      { label: 'Send backward', disabled: many || node.path[3] === 0, action: () => { const path = node.path; edit({ label: `Reorder ${ids[0]}`, ops: structure.moveObject(data, path, path[1] as number, (path[3] as number) - 1) }); } },
      SEPARATOR,
      { label: `Select all ${object?.prefab ?? ''}`.trim(), hint: 'Ctrl+Shift+A', disabled: !object?.prefab, action: () => selectAllOfPrefab(object?.prefab) },
      { label: 'Make a prefab of this', disabled: many, action: () => { try { const { ops, name } = structure.objectToPrefab(data, node.path); edit({ label: `Prefab ${name} from ${ids[0]}`, ops }); } catch (error) { say(String((error as Error).message ?? error)); } } },
      ...(viewport.dimensions === 3 ? [{
        label: 'Make a prop instance', disabled: many,
        action: () => { try { const { ops, group } = structure.demoteObjectToProp(data, node.path); edit({ label: `Demote ${ids[0]} into ${group}`, ops }); select({ path: ['layers', node.path[1]!] }); } catch (error) { say(String((error as Error).message ?? error)); } }
      }] : []),
      SEPARATOR,
      { label: many ? `Delete ${ids.length}` : 'Delete', hint: 'Del', danger: true, action: removeSelected }
    );
  } else if (node.kind === 'sceneInstance') {
    const instance = at(node.path) as { id?: string; scene?: string } | undefined;
    items.push(
      { label: `Open scene ${instance?.scene ?? ''}`.trim(), disabled: !instance?.scene, action: () => { const next = project?.scenes.find((scene) => scene.name === instance?.scene); if (next) enqueue(() => open(next)); } },
      SEPARATOR,
      { label: 'Delete instance', hint: 'Del', danger: true, action: () => edit({ label: `Delete ${instance?.id ?? 'instance'}`, ops: [{ op: 'remove', path: node.path.slice(0, 3), index: node.path[3] as number }] }) }
    );
  } else if (node.kind === 'layer') {
    const index = node.path[1] as number;
    const others = (project?.scenes ?? []).filter((scene) => scene.name && scene.type === 'level' && scene.path !== entry?.path);
    items.push(
      {
        label: 'Instance a scene',
        disabled: !others.length,
        children: others.map((scene) => ({
          label: scene.name!,
          action: () => {
            const where = dropPoint() ?? { x: 0, y: 0 };
            try {
              const { ops, id } = structure.addSceneInstance(data, index, scene.name!, viewport.dimensions === 3 ? { x: where.x, y: 0, z: where.z ?? 0 } : { x: where.x, y: where.y });
              edit({ label: `Instance ${scene.name} as ${id}`, ops });
              select({ path: ['layers', index, 'scenes', (Array.isArray((layers[index] as { scenes?: unknown[] }).scenes) ? ((layers[index] as { scenes: unknown[] }).scenes.length) : 0)] });
            } catch (error) { say(String((error as Error).message ?? error)); }
          }
        }))
      },
      SEPARATOR
    );
    items.push(
      { label: 'New layer below', action: () => { const name = prompt('Layer name', `layer-${layers.length + 1}`); if (name) edit({ label: `Add layer ${name}`, ops: structure.addLayer(data, name, index + 1) }); } },
      { label: 'Rename', action: () => { const name = prompt('Layer name', layerName(index)); if (name) edit({ label: `Rename layer to ${name}`, ops: [{ op: 'set', path: ['layers', index, 'name'], value: name }] }); } },
      SEPARATOR,
      { label: 'Move up', disabled: index === 0, action: () => edit({ label: `Move ${layerName(index)} up`, ops: structure.moveLayer(data, index, index - 1) }) },
      { label: 'Move down', disabled: index >= layers.length - 1, action: () => edit({ label: `Move ${layerName(index)} down`, ops: structure.moveLayer(data, index, index + 1) }) },
      SEPARATOR,
      { label: 'Delete layer', danger: true, disabled: layers.length <= 1, action: () => { if (confirm(`Delete ${layerName(index)} and everything in it?`)) edit({ label: `Delete ${layerName(index)}`, ops: structure.removeLayer(data, index) }); } }
    );
  } else if (node.kind === 'props') {
    const group = at(node.path) as { id?: string; prefab?: string; instances?: unknown[] } | undefined;
    const count = Array.isArray(group?.instances) ? group.instances.length : 0;
    const name = group?.id ?? 'the group';
    items.push(
      { label: 'Scatter brush', action: () => brush.start('scatter', node.path) },
      { label: 'Erase brush', action: () => brush.start('erase', node.path) },
      SEPARATOR,
      { label: `Delete group (${count} instance${count === 1 ? '' : 's'})`, danger: true, action: () => {
        if (!count || confirm(`Delete ${name} and its ${count} instances?`)) {
          edit({ label: `Delete ${name}`, ops: [{ op: 'remove', path: node.path.slice(0, 3), index: node.path[3] as number }] });
        }
      } }
    );
  } else if (node.kind === 'sheet') {
    const key = String(node.path[2]);
    items.push(
      { label: 'Animations…', action: () => animations.open(key) },
      { label: 'Rename', action: () => { const to = prompt('Sheet name', key); if (to && to !== key) { try { edit({ label: `Rename ${key} to ${to}`, ops: structure.renameEntry(data, ['assets', 'spritesheets'], key, to) }); select({ path: ['assets', 'spritesheets', to] }); } catch (error) { say(String((error as Error).message ?? error)); } } } },
      SEPARATOR,
      { label: 'Delete sheet', danger: true, action: () => { if (confirm(`Delete sprite sheet ${key}? Prefabs and tile layers that draw it will fail until re-pointed.`)) edit({ label: `Delete sheet ${key}`, ops: structure.removeEntry(data, ['assets', 'spritesheets'], key) }); } }
    );
  } else if (node.kind === 'tileLayer') {
    const index = node.path[1] as number;
    const tiles = Array.isArray(data.tileLayers) ? data.tileLayers as unknown[] : [];
    items.push(
      { label: 'Paint…', action: () => tilePaint.start(node.path) },
      SEPARATOR,
      { label: 'Delete tile layer', danger: true, action: () => {
        if (confirm(`Delete ${node.label}?`)) {
          edit({ label: `Delete ${node.label}`, ops: tiles.length > 1 ? [{ op: 'remove', path: ['tileLayers'], index }] : [{ op: 'set', path: ['tileLayers'] }] });
        }
      } }
    );
  } else if (node.kind === 'prefab') {
    const name = String(node.path[1]);
    const uses = structure.objectsOfPrefab(data, name).length;
    items.push(
      { label: 'New prefab…', action: () => { showDock('components'); say('Pick an actor in Components and press New prefab'); } },
      { label: 'Stage it', hint: 'play it alone', action: () => { select({ path: ['prefabs', name] }); enqueue(() => startPlay({ prefab: name })); } },
      { label: 'Duplicate', action: () => { const { ops, name: copy } = structure.duplicatePrefab(data, name); edit({ label: `Duplicate prefab ${name}`, ops }); select({ path: ['prefabs', copy] }); } },
      { label: 'Rename', action: () => { const to = prompt('Prefab name', name); if (to && to !== name) { try { edit({ label: `Rename ${name} to ${to}`, ops: structure.renameEntry(data, ['prefabs'], name, to) }); select({ path: ['prefabs', to] }); } catch (error) { say(String((error as Error).message ?? error)); } } } },
      SEPARATOR,
      { label: `Select instances (${uses})`, disabled: !uses, action: () => selectAllOfPrefab(name) },
      SEPARATOR,
      { label: 'Delete prefab', danger: true, action: () => { if (!uses || confirm(`${uses} object${uses === 1 ? ' uses' : 's use'} ${name}; delete it anyway? They will fail to load until re-pointed.`)) edit({ label: `Delete prefab ${name}`, ops: structure.removeEntry(data, ['prefabs'], name) }); } }
    );
  } else if (node.kind === 'path') {
    const name = String(node.path[1]);
    const users = paths.pathUsers(data, name);
    items.push(
      { label: 'New path', action: newPath },
      { label: 'Rename', action: () => { const to = prompt('Path name', name); if (to && to !== name) { try { edit({ label: `Rename ${name} to ${to}`, ops: structure.renameEntry(data, ['paths'], name, to) }); select({ path: ['paths', to] }); } catch (error) { say(String((error as Error).message ?? error)); } } } },
      SEPARATOR,
      { label: 'Delete path', danger: true, action: () => { if (!users || confirm(`${users} follower${users === 1 ? ' uses' : 's use'} ${name}; delete it anyway? They will fail to load until re-pointed.`)) edit({ label: `Delete path ${name}`, ops: structure.removeEntry(data, ['paths'], name) }); } }
    );
  } else if (node.kind === 'group' && node.path[0] === 'paths') {
    items.push({ label: 'New path', action: newPath });
  } else if (node.kind === 'group' && node.path[0] === 'prefabs') {
    items.push({ label: 'New prefab…', action: () => { showDock('components'); say('Pick an actor in Components and press New prefab'); } });
  } else if (node.kind === 'element') {
    const index = node.path[1] as number;
    const elements = Array.isArray(data.elements) ? data.elements as unknown[] : [];
    const id = (at(node.path) as { id?: string } | undefined)?.id;
    items.push(
      { label: 'Duplicate', hint: 'Ctrl+D', disabled: !id, action: () => { select({ ids: [id!] }); duplicateSelected(); } },
      { label: 'Draw earlier', disabled: index === 0, action: () => edit({ label: `Reorder ${id ?? 'element'}`, ops: [{ op: 'remove', path: ['elements'], index }, { op: 'insert', path: ['elements'], index: index - 1, value: at(node.path) }] }) },
      { label: 'Draw later', disabled: index >= elements.length - 1, action: () => edit({ label: `Reorder ${id ?? 'element'}`, ops: [{ op: 'remove', path: ['elements'], index }, { op: 'insert', path: ['elements'], index: index + 1, value: at(node.path) }] }) },
      SEPARATOR,
      { label: 'Delete', hint: 'Del', danger: true, action: () => edit({ label: `Delete ${id ?? 'element'}`, ops: [{ op: 'remove', path: ['elements'], index }] }) }
    );
  } else if (node.kind === 'group' && node.path[0] === 'elements') {
    items.push(...elementPalette());
  } else if (node.kind === 'scene' && data.type === 'ui') {
    items.push(...elementPalette());
  } else if (node.kind === 'scene') {
    items.push(
      { label: 'New layer', action: () => { const name = prompt('Layer name', `layer-${layers.length + 1}`); if (name) edit({ label: `Add layer ${name}`, ops: structure.addLayer(data, name) }); } },
      { label: 'New prefab…', action: () => { showDock('components'); say('Pick an actor in Components and press New prefab'); } },
      { label: 'New path', action: newPath },
      SEPARATOR,
      { label: 'Play from here', hint: 'Shift+F5', action: playFromHere },
      { label: selectedIds().length ? `Settle physics (${selectedIds().length} selected)` : 'Settle physics', action: () => { void settlePhysics(); } }
    );
    if (viewport.dimensions === 2 && data.type === 'level') {
      items.push({ label: 'New tile layer…', action: () => {
        const assetsBlock = isPlainObject(data.assets) ? data.assets : {};
        const sheets = Object.keys(isPlainObject(assetsBlock.spritesheets) ? assetsBlock.spritesheets : {});
        if (!sheets.length) { say('Add a sprite sheet first — drop an image into the scene'); return; }
        const tiles = Array.isArray(data.tileLayers) ? data.tileLayers as unknown[] : [];
        const name = prompt('Tile layer name', `tiles-${tiles.length + 1}`);
        if (!name) return;
        const value = { name, spritesheet: sheets[0], cells: [] };
        edit({
          label: `Add tile layer ${name}`,
          ops: Array.isArray(data.tileLayers)
            ? [{ op: 'insert', path: ['tileLayers'], index: tiles.length, value }]
            : [{ op: 'set', path: ['tileLayers'], value: [value] }]
        });
        tilePaint.start(['tileLayers', tiles.length]);
      } });
    }
  }
  return items;
}

/** New, duplicate, rename and delete scene files, through the host. */
function sceneMenu(): MenuItem[] {
  const current = entry;
  const run = (label: string, action: () => Promise<void>) => { void action().catch((error: unknown) => say(`${label} failed: ${String((error as Error).message ?? error)}`)); };
  const create = async (body: Record<string, unknown>) => {
    const { path } = await post<{ path: string }>('/__scene', { action: 'create', ...body });
    project = await loadProject();
    listScenes();
    const next = project.scenes.find((scene) => scene.path === path);
    if (next) enqueue(() => open(next));
  };
  return [
    { label: 'New 2D level…', action: () => { const name = prompt('Scene name', 'level-2'); if (name) run('New scene', () => create({ name, type: 'level', dimensions: 2 })); } },
    { label: 'New 3D level…', action: () => { const name = prompt('Scene name', 'level-3d'); if (name) run('New scene', () => create({ name, type: 'level', dimensions: 3 })); } },
    { label: 'New UI scene…', action: () => { const name = prompt('Scene name', 'menu'); if (name) run('New scene', () => create({ name, type: 'ui' })); } },
    SEPARATOR,
    { label: 'Duplicate this scene…', disabled: !current, action: () => { const name = prompt('Name of the copy', `${current!.name ?? 'scene'}-copy`); if (name) run('Duplicate', () => create({ name, path: current!.path })); } },
    { label: 'Rename this scene…', disabled: !current || !!remote?.dirty, action: () => {
      const name = prompt('New file name', current!.path.split('/').pop()!.replace(/\.json$/, ''));
      if (!name) return;
      run('Rename', async () => {
        const { path } = await post<{ path: string }>('/__scene', { action: 'rename', path: current!.path, name });
        project = await loadProject();
        listScenes();
        const next = project.scenes.find((scene) => scene.path === path);
        if (next) enqueue(() => open(next));
      });
    } },
    SEPARATOR,
    { label: 'Delete this scene', danger: true, disabled: !current || (project?.scenes.length ?? 0) < 2, action: () => {
      if (!confirm(`Delete ${current!.path} for good?`)) return;
      run('Delete', async () => {
        await post('/__scene', { action: 'delete', path: current!.path });
        project = await loadProject();
        listScenes();
        const next = project.scenes[0];
        if (next) enqueue(() => open(next)); else { remote?.close(); remote = null; viewport.close(); showPlate('This project has no scenes yet.'); }
      });
    } }
  ];
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
  outlineIndex = indexOutline(outline);
  assets.refreshPrefabs();
  if (change.kind === 'reset') {
    if (lookShown()) lookPanel.refresh();
    select(selection);
    enqueue(() => materialize(true));
    say(`${remote.path} — ${change.reason}`);
    updateBar();
    problemsSoon();
    return;
  }
  const applied = viewport.apply(change.ops, remote.doc.data);
  helpers.refresh();
  if (lookShown()) lookPanel.refresh();
  if (applied.kind === 'invalid') {
    say(`Not drawn: the scene has ${applied.issues.length} problem${applied.issues.length === 1 ? '' : 's'} — see Problems`);
  } else {
    if (applied.kind === 'rebuild') enqueue(() => materialize(true));
    // After the rebuild's enqueue, which it replaces: the queue keeps the last job.
    if (playing && playVariant?.prefab && change.ops.some((op) => op.path[0] === 'prefabs' || op.path[0] === 'assets')) enqueue(() => startPlay());
    if (change.label) say(`${change.label}${change.origin && change.origin !== 'editor' ? ` — by ${change.origin}` : ''}`);
  }
  select(selection);
  updateBar();
  problemsSoon();
}

function updateBar(): void {
  const state = remote?.state;
  undoButton.disabled = !state?.undo || (playing && !playVariant?.prefab);
  redoButton.disabled = !state?.redo || (playing && !playVariant?.prefab);
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
/** Who waits for the queue to drain (automation's `idle()`). */
let drained: Array<() => void> = [];
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
    const waiters = drained;
    drained = [];
    for (const resume of waiters) resume();
  })();
}

/** Resolves once nothing is queued or running: a scene opened, a play started, a rebuild done. */
function idle(): Promise<void> {
  if (!running && !waiting) return Promise.resolve();
  return new Promise((resume) => { drained.push(resume); });
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
      scenes: projectScenes(),
      library: siblings
    });
    if (!shown) return;
  } catch (error) {
    viewport.close();
    const count = issues.length;
    showPlate(count
      ? `This scene does not load: ${count} problem${count === 1 ? '' : 's'}.\nThe tree, the fields and the Problems panel are still the document's.`
      : String((error as Error).message ?? error));
    say(`${remote.path}: does not load`);
    if (!count) {
      loadError = String((error as Error).message ?? error);
      checkProblems();
    }
    showDock('problems');
    return;
  }
  if (loadError) {
    loadError = null;
    problemsSoon();
  }
  viewport.drawOnDemand = powerBox.checked;
  if (keepView) viewport.restoreCamera(camera);
  if (isolating) viewport.isolate(selectedIds());
  showPlate(null);
  updateBar();
  // The registries are the game's now; resolve the inspector against them.
  select(selection);
}

async function open(next: SceneEntry): Promise<void> {
  if (!project) return;
  brush.stop();
  tilePaint.stop();
  remote?.close();
  remote = null;
  selection = null;
  issues = [];
  loadError = null;
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
  await refreshSiblings();
  outline = sceneOutline(remote.doc.data);
  outlineIndex = indexOutline(outline);
  tree.show(outline);
  checkProblems();
  select(null);
  updateBar();
  assets.refreshPrefabs();
  await materialize(false);
  lookPanel.refresh();
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
  return setDeepIn(remote?.doc.data, path, value);
}

// --- The drop ghost --------------------------------------------------------

/** The asset card being dragged, from the assets panel's dragstart to its dragend. */
let dragItem: Placeable | null = null;
/** What the host says about a file — a model's bounds, an image's size — fetched once per path. */
const assetInfos = new Map<string, Promise<{ bounds?: { min: number[]; max: number[] }; width?: number; height?: number }>>();
function assetInfo(path: string) {
  let info = assetInfos.get(path);
  if (!info) {
    info = get<{ bounds?: { min: number[]; max: number[] }; width?: number; height?: number }>(`/__asset-info?path=${encodeURIComponent(path)}`).catch(() => ({}));
    assetInfos.set(path, info);
    void info.then((got) => { assetInfoNow.set(path, got); });
  }
  return info;
}
/** The last answer for a path, without waiting: the ghost draws with what has arrived. */
const assetInfoNow = new Map<string, { bounds?: { min: number[]; max: number[] }; width?: number; height?: number }>();

/**
 * The outline of what dropping `item` at a client point would place —
 * the exact spot and size, so the drop lands where it looks — with a
 * caption. Null when there is nothing to show (an environment lights the
 * whole level).
 */
function ghostFor(item: Placeable, client: { x: number; y: number }): { edges: Array<[{ x: number; y: number }, { x: number; y: number }]>; caption: string } | null {
  if (!remote) return null;
  const where = dropPoint(client);
  if (!where) return null;
  const threeD = viewport.dimensions === 3;
  const fallback = threeD ? 1 : 32;
  let size: { x: number; y: number; z?: number } | null = null;
  let caption = '';
  if (item.kind === 'prefab') {
    const layers = remote.doc.data.layers;
    const objects = Array.isArray(layers) ? layers.flatMap((layer) => (isPlainObject(layer) && Array.isArray(layer.objects) ? layer.objects : [])) : [];
    const like = objects.find((o) => isPlainObject(o) && o.prefab === item.name) as Record<string, unknown> | undefined;
    const n = (key: string, d: number) => (typeof like?.[key] === 'number' ? like[key] as number : d);
    size = { x: n('width', fallback), y: n('height', fallback), ...(threeD && { z: n('depth', n('width', fallback)) }) };
    caption = item.name;
  } else if (item.type === 'model' && threeD) {
    const info = assetInfoNow.get(item.path);
    if (!info) void assetInfo(item.path);
    const min = info?.bounds?.min ?? [-0.5, 0, -0.5];
    const max = info?.bounds?.max ?? [0.5, 1, 0.5];
    size = { x: Math.max(0.05, max[0]! - min[0]!), y: Math.max(0.05, max[1]! - min[1]!), z: Math.max(0.05, max[2]! - min[2]!) };
    caption = keyFrom(item.path);
  } else if (item.type === 'image' && threeD) {
    // A texture goes onto the object under the pointer: show which.
    const id = viewport.pick(client.x, client.y);
    const placement = id ? viewport.placement(id) : null;
    return placement ? { edges: placement.edges, caption: `Texture ${id}` } : null;
  } else if (item.type === 'image') {
    const info = assetInfoNow.get(item.path);
    if (!info) void assetInfo(item.path);
    const width = info?.width ?? 64;
    const height = info?.height ?? 64;
    const fit = Math.min(1, 256 / Math.max(width, height));
    size = { x: Math.round(width * fit), y: Math.round(height * fit) };
    caption = keyFrom(item.path);
  } else {
    return null;
  }
  const position = threeD ? { x: where.x, y: size.y / 2, z: where.z ?? 0 } : { x: where.x, y: where.y };
  const edges = viewport.outline({ position, size });
  const at = threeD ? `${where.x.toFixed(2)}, ${where.z?.toFixed(2) ?? '0'} m` : `${where.x}, ${where.y} px`;
  return { edges, caption: `${caption} · ${at}` };
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
    select({ ids: [id] });
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
  select({ ids: [object.id as string] });
}

// --- Play ----------------------------------------------------------------

/** Play the scene as the document stands, unsaved edits included, with the game's hooks. */
async function startPlay(variant: Variant | null = playVariant): Promise<void> {
  if (!project || !remote) return;
  playVariant = variant;
  brush.stop();
  tilePaint.stop();
  if (!playing) editCamera = viewport.captureCamera();
  playing = true;
  editorFrame.classList.add('playing');
  select(selection);
  updateBar();
  const current = remote;
  const others = project.scenes.filter((scene) => scene.name && scene.path !== current.path);
  try {
    const played = variant ? new SceneDocument(stage.variantOf(current.doc.data, variant), current.path) : current.doc;
    const shown = await viewport.show(played, {
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
    const what = variant?.prefab ? `prefab ${variant.prefab} on its stage (edits to it restart the stage)` : `${current.doc.name ?? current.path}${variant?.from ? ' from here' : ''}${bare}`;
    say(`Playing ${what} — F5 or Stop to return`);
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
  playVariant = null;
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
  else enqueue(() => startPlay(null));
}

/** Play with the player at the middle of the view: the camera's target in 3D, the view's centre in 2D. */
function playFromHere(): void {
  if (!remote || playing) return;
  const area = viewport.dimensions === 2 ? viewport.visibleArea() : null;
  const target = viewport.dimensions === 3 ? viewport.cameraTarget() : null;
  const from = area
    ? { x: Math.round((area.left + area.right) / 2), y: Math.round((area.top + area.bottom) / 2) }
    : target && { x: target.x, y: target.y + 1, z: target.z };
  if (!from) return;
  enqueue(() => startPlay({ from }));
}

/** Run the physics briefly in the host and write where dynamic bodies came to rest: the selection's, or every one. */
async function settlePhysics(): Promise<void> {
  if (!remote || playing || readOnly()) return;
  const ids = selectedIds();
  say('Settling…');
  try {
    const { settled } = await post<{ settled: { moved: string[] } | null }>('/__settle', { path: remote.path, ...(ids.length && { ids }) });
    say(settled ? `Settled ${settled.moved.length} object${settled.moved.length === 1 ? '' : 's'}` : 'Nothing moved: no dynamic body was out of rest');
  } catch (error) {
    say(`Settle failed: ${String((error as Error).message ?? error)}`);
  }
}

function updatePlayButton(): void {
  playButton.disabled = !remote;
  playButton.classList.toggle('playing', playing);
  playButton.replaceChildren(iconElement(playing ? ICONS.stop : ICONS.play));
  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = playing ? 'Stop' : 'Play';
  playButton.append(text);
  playButton.title = playing ? 'Stop and return to editing (F5)' : 'Play the scene as it stands, unsaved edits included (F5; Shift+F5 from the middle of the view)';
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

function toggleHelper(helper: Helper): void {
  const on = helpers.toggle(helper);
  helperTools[helper].setAttribute('aria-pressed', String(on));
  say(`${helper === 'grid' ? 'Grid and axes' : helper === 'lights' ? 'Light icons' : 'Camera gizmo'} ${on ? 'on' : 'off'}`);
}

/** Isolate: only the selection shows (and no props); off again with the key, or when the selection is cleared. */
let isolating = false;
function toggleIsolate(): void {
  const ids = selectedIds();
  if (!isolating && !ids.length) { say('Select something to isolate'); return; }
  isolating = !isolating;
  viewport.isolate(isolating ? ids : null);
  helperTools.isolate.setAttribute('aria-pressed', String(isolating));
  say(isolating ? `Isolating ${ids.length === 1 ? ids[0] : `${ids.length} objects`} — I to show everything` : 'Showing everything');
}

/** Camera bookmarks: Shift+1…9 remembers the editor's camera for this scene, 1…9 returns to it. */
function cameraBookmark(slot: number, save: boolean): void {
  if (!remote) return;
  const key = `camera.${remote.path}.${slot}`;
  if (save) {
    const state = viewport.captureCamera();
    if (!state) return;
    settings.set(key, JSON.stringify(state));
    say(`Camera ${slot} saved`);
    return;
  }
  const raw = settings.get(key, '');
  if (!raw) { say(`No camera ${slot} yet — Shift+${slot} saves one`); return; }
  viewport.restoreCamera(JSON.parse(raw) as Record<string, unknown>);
  viewport.game?.invalidate();
  overlay.refresh();
  say(`Camera ${slot}`);
}

function setMode(mode: GizmoMode): void {
  overlay.setMode(mode);
  moveTool.setAttribute('aria-pressed', String(mode === 'move'));
  rotateTool.setAttribute('aria-pressed', String(mode === 'rotate'));
  scaleTool.setAttribute('aria-pressed', String(mode === 'scale'));
}

type DockTab = 'assets' | 'components' | 'problems' | 'history' | 'look' | 'console' | 'build';
const DOCK_TABS: DockTab[] = ['assets', 'components', 'problems', 'history', 'look', 'console', 'build'];

function showDock(tab: DockTab): void {
  for (const button of document.querySelectorAll<HTMLElement>('.tab')) {
    button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  }
  for (const pane of document.querySelectorAll<HTMLElement>('[data-pane]')) pane.hidden = pane.dataset.pane !== tab;
  if (tab === 'console') consolePanel.seen();
  if (tab === 'assets') void assets.refresh().catch(() => {});
  if (tab === 'components') components.refresh();
  if (tab === 'look') lookPanel.refresh();
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
sceneMenuButton.addEventListener('click', () => {
  const box = sceneMenuButton.getBoundingClientRect();
  showMenu(sceneMenu(), { x: box.left, y: box.bottom + 4 });
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
scaleTool.addEventListener('click', () => setMode('scale'));
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

/** The layout menu: where the dock sits, mirrored side panels, and arrangements saved by name in this browser. */
function layoutMenu(): MenuItem[] {
  const currentTab = settings.get('dock.tab', 'assets');
  const open = (tab: string | undefined) => { if (tab && DOCK_TABS.includes(tab as DockTab)) showDock(tab as DockTab); syncDockToggle(); overlay.refresh(); };
  const saved = layout.saved();
  return [
    { label: layout.dockSide === 'bottom' ? '✓ Dock below the viewport' : 'Dock below the viewport', action: () => layout.setDockSide('bottom') },
    { label: layout.dockSide === 'right' ? '✓ Dock beside the viewport' : 'Dock beside the viewport', action: () => layout.setDockSide('right') },
    { label: layout.mirrored ? '✓ Mirrored (inspector left, tree right)' : 'Mirrored (inspector left, tree right)', action: () => layout.setMirrored(!layout.mirrored) },
    SEPARATOR,
    ...saved.map((name): MenuItem => ({
      label: name,
      children: [
        { label: 'Use', action: () => { open(layout.load(name)); say(`Layout ${name}`); } },
        { label: 'Overwrite with the current', action: () => { layout.save(name, currentTab); say(`Saved layout ${name}`); } },
        { label: 'Delete', danger: true, action: () => { layout.remove(name); say(`Deleted layout ${name}`); } }
      ]
    })),
    { label: 'Save layout as…', action: () => { const name = prompt('Layout name', saved.length ? `layout-${saved.length + 1}` : 'my layout'); if (name) { layout.save(name, currentTab); say(`Saved layout ${name}`); } } },
    SEPARATOR,
    { label: 'Reset to the default layout', action: () => { layout.reset(); open('assets'); } }
  ];
}
layoutMenuButton.addEventListener('click', () => {
  const box = layoutMenuButton.getBoundingClientRect();
  showMenu(layoutMenu(), { x: box.right - 260, y: box.bottom + 4 });
});

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

// A click on the world selects what is under it (Ctrl adds or takes
// away); a drag is the camera's, unless Shift is held, when it is a
// marquee that selects every object whose centre it covers.
let down: { x: number; y: number; shift: boolean; ctrl: boolean } | null = null;
viewportPanel.addEventListener('pointerdown', (event) => {
  down = event.button === 0 && event.target instanceof HTMLCanvasElement && !playing
    ? { x: event.clientX, y: event.clientY, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey } : null;
});
viewportPanel.addEventListener('pointermove', (event) => {
  if (!down?.shift || overlay.dragging) return;
  const x = Math.min(down.x, event.clientX); const y = Math.min(down.y, event.clientY);
  overlay.marquee({ x, y, width: Math.abs(event.clientX - down.x), height: Math.abs(event.clientY - down.y) });
});
viewportPanel.addEventListener('pointerup', (event) => {
  if (!down || overlay.dragging) return;
  const start = down;
  down = null;
  overlay.marquee(null);
  const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
  if (start.shift && moved > 4) {
    const left = Math.min(start.x, event.clientX); const right = Math.max(start.x, event.clientX);
    const top = Math.min(start.y, event.clientY); const bottom = Math.max(start.y, event.clientY);
    const inside = viewport.objectsWithin((c: { x: number; y: number }) => c.x >= left && c.x <= right && c.y >= top && c.y <= bottom);
    if (!inside.length) { if (!start.ctrl) select(null); return; }
    select({ ids: start.ctrl ? [...new Set([...selectedIds(), ...inside])] : inside });
    say(`Selected ${inside.length} object${inside.length === 1 ? '' : 's'}`);
    return;
  }
  if (moved > 4) return;
  const id = viewport.pick(event.clientX, event.clientY);
  // A composed object (`room-1/crate`) belongs to its scene instance: that is what gets selected.
  const owner = id?.includes('/') ? instancePathOf(id.split('/')[0]!) : null;
  if (owner) { select({ path: owner }); return; }
  if (start.ctrl && id) toggleSelected(id);
  else if (id) select({ ids: [id] });
  else if (!pathTool.onSelectedLine(event.clientX, event.clientY)) {
    const path = pathTool.pathAt(event.clientX, event.clientY);
    select(path ? { path: ['paths', path] } : null);
  }
});
viewportPanel.addEventListener('dblclick', (event) => {
  if (event.target instanceof HTMLCanvasElement) pathTool.addPointAt(event.clientX, event.clientY);
});

// Drop an asset card on the viewport to place it.
viewportPanel.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE) || playing) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  viewportPanel.classList.add('drop-target');
  // The payload is sealed until the drop; the panel told us what it is.
  const ghost = dragItem ? ghostFor(dragItem, { x: event.clientX, y: event.clientY }) : null;
  overlay.ghost(ghost?.edges ?? null, ghost?.caption);
});
viewportPanel.addEventListener('dragleave', () => { viewportPanel.classList.remove('drop-target'); overlay.ghost(null); });
viewportPanel.addEventListener('drop', (event) => {
  viewportPanel.classList.remove('drop-target');
  overlay.ghost(null);
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
    if (event.shiftKey && !playing) playFromHere();
    else togglePlay();
    return;
  }
  // Alt+1, 2, 3: the scene tree, the dock, the inspector.
  if (event.altKey && !mod && ['Digit1', 'Digit2', 'Digit3'].includes(event.code)) {
    event.preventDefault();
    layout.toggle((['tree', 'dock', 'inspector'] as const)[Number(event.code.slice(-1)) - 1]!);
    syncDockToggle();
    return;
  }
  // While playing, the keyboard is the game's; while flying (the right
  // button held over the viewport), W A S D Q E are the camera's.
  if (playing || viewport.flying) return;
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
  } else if (mod && event.code === 'KeyC' && selectedIds().length) {
    event.preventDefault();
    copySelected();
  } else if (mod && event.code === 'KeyV') {
    event.preventDefault();
    pasteClipboard();
  } else if (mod && event.shiftKey && event.code === 'KeyA') {
    event.preventDefault();
    selectAllOfPrefab();
  } else if (event.code === 'Delete' || event.code === 'Backspace') {
    const path = selection && 'path' in selection ? selection.path : null;
    if (path && path.length === 4 && path[2] === 'scenes') {
      edit({ label: `Delete ${(at(path) as { id?: string } | undefined)?.id ?? 'instance'}`, ops: [{ op: 'remove', path: path.slice(0, 3), index: path[3] as number }] });
    } else removeSelected();
  } else if (event.code === 'Escape') {
    select(null);
  } else if (!mod && event.code === 'KeyF') {
    const id = selectedId();
    if (id) viewport.frame(id);
  } else if (!mod && event.code === 'KeyW') {
    setMode('move');
  } else if (!mod && event.code === 'KeyE') {
    setMode('rotate');
  } else if (!mod && event.code === 'KeyR') {
    setMode('scale');
  } else if (!mod && event.code === 'KeyG') {
    toggleHelper('grid');
  } else if (!mod && event.code === 'KeyL') {
    toggleHelper('lights');
  } else if (!mod && event.code === 'KeyC') {
    toggleHelper('camera');
  } else if (!mod && event.code === 'KeyI') {
    toggleIsolate();
  } else if (!mod && /^Digit[1-9]$/.test(event.code)) {
    cameraBookmark(Number(event.code.slice(-1)), event.shiftKey);
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
const siblingsChanged = settled(() => { void refreshSiblings().then(() => problemsSoon()); }, 300);
onHost<{ path: string }>('m2d:file', ({ path }) => {
  if (path.endsWith('.json') && !project?.scenes.some((scene) => scene.path === path)) refreshListing();
  if (path.endsWith('.json') && project?.scenes.some((scene) => scene.path === path && scene.path !== entry?.path)) siblingsChanged();
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
  m2dEditor: {
    viewport, place, togglePlay, select, selectedIds, selectedPath, edit, idle,
    /** Play a variant (from a point, or a prefab's stage), or the scene as written; resolves once it runs. */
    async play(variant: Variant = {}) {
      await idle();
      enqueue(() => startPlay(variant.from || variant.prefab ? variant : null));
      await idle();
    },
    /** Open a scene by path; resolves once it is shown (or failed: see `loadError`). */
    async openScene(path: string) {
      const next = project?.scenes.find((scene) => scene.path === path);
      if (!next) throw new Error(`no scene at ${path}`);
      await idle();
      enqueue(() => open(next));
      await idle();
      // The queue coalesces: a job enqueued while this one waited (a hot
      // reload, a file event) replaces it. Showing the wrong scene is an
      // error here, not in the editor.
      if (entry?.path !== path) throw new Error(`the open of ${path} was superseded; ${entry?.path ?? 'nothing'} is showing`);
    },
    get scenePath() { return entry?.path ?? null; },
    get loadError() { return loadError; },
    get remote() { return remote; }, get issues() { return issues; }, get playing() { return playing; }
  }
});
