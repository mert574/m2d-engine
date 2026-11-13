/**
 * A game as a project: `m2d.project.json`, read by one boot.
 *
 * A project is one game's folder. Its declaration says which module
 * defines the game (`register(game)`, the actors, constraints and
 * intents), which holds its presentation hooks, where its scenes live,
 * which one it opens on, how it is displayed and which named input
 * actions it has. The editor opens the same file, so what the page boots
 * and what the editor plays agree, and an agent changes either over MCP.
 *
 * `bootProject` is the page's whole job:
 *
 * ```js
 * import { bootProject } from 'm2d-engine/core/project.js';
 * import project from './m2d.project.json';
 * import * as definition from './game.js';
 * import * as hooks from './hooks.js';
 *
 * await bootProject(document.getElementById('screen'), {
 *   project, definition, hooks,
 *   scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
 *   basePath: import.meta.env.BASE_URL + 'my-game/'
 * });
 * ```
 *
 * The scene list is the scenes folder: each file is a scene named after
 * its file. The world's size is each scene's own (`world.width`), not an
 * option declared a second time beside it.
 */

import { M2D } from './m2d.js';
import { DISPLAY_KEYS, checkProject, sceneNameOf } from './projectSchema.js';
import { initPhysics } from './physics/index.js';
import { SettingsMenu } from './ui/settingsMenu.js';

export { PROJECT_FILE, PROJECT_SCHEMA, checkProject, projectIssues, sceneNameOf } from './projectSchema.js';

/** M2D options a project declares: its display, actions, opening scene and boot music. */
export function projectOptions(project, { basePath = '' } = {}) {
  const display = project.display ?? {};
  return {
    ...Object.fromEntries(DISPLAY_KEYS.filter((key) => display[key] !== undefined).map((key) => [key, display[key]])),
    ...(project.input?.actions && { actions: project.input.actions }),
    ...(project.initialScene && { initialScene: project.initialScene }),
    ...(project.music && {
      music: Object.fromEntries(Object.entries(project.music).map(([key, track]) => [key, { src: basePath + track.url, volume: track.volume ?? 1 }]))
    })
  };
}

/**
 * A scene's hooks from both modules: the definition's simulation hooks
 * (`onEnter`, `onFixedUpdate`, `onExit`, which a headless server runs too)
 * and the hooks module's presentation ones, per scene. A hook both name
 * runs the definition's first.
 * @param {Record<string, object>} [simulation]
 * @param {Record<string, object>} [presentation]
 */
export function combineSceneHooks(simulation = {}, presentation = {}) {
  const combined = {};
  for (const name of new Set([...Object.keys(simulation ?? {}), ...Object.keys(presentation ?? {})])) {
    const a = simulation?.[name] ?? {};
    const b = presentation?.[name] ?? {};
    const scene = { ...a, ...b };
    for (const key of Object.keys(a)) {
      if (typeof a[key] === 'function' && typeof b[key] === 'function') scene[key] = (...args) => { a[key](...args); return b[key](...args); };
    }
    combined[name] = scene;
  }
  return combined;
}

/**
 * Boot a project: physics (and WebGPU for a 3D game), the game with the
 * project's options, its definition registered, every scene added with
 * its hooks, the settings menu, and `start`.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} parts
 * @param {object} parts.project - `m2d.project.json`
 * @param {{register: Function, GAME?: object, sceneHooks?: Function}} parts.definition - The definition module;
 *   its optional `sceneHooks(game)` holds simulation hooks, merged with the hooks module's
 * @param {{sceneHooks?: Function, OPTIONS?: object}} [parts.hooks] - The hooks module
 * @param {Record<string, (() => Promise<object>)|object>} parts.scenes - Scene file
 *   path to its data, or to a loader for it (`import.meta.glob`)
 * @param {string} [parts.basePath=''] - What the scenes' asset URLs resolve against
 * @param {object} [parts.options] - M2D options over everything else (a query
 *   string's choice of opening scene)
 * @param {(game: M2D) => void} [parts.setup] - Called after the scenes are
 *   added and before `start`: what the page adds that is not the project's
 * @returns {Promise<M2D>}
 */
export async function bootProject(canvas, { project, definition, hooks = null, scenes = {}, basePath = '', options = {}, setup = null }) {
  checkProject(project);
  if (typeof definition?.register !== 'function') {
    throw new Error(`M2D project '${project.name}': the definition module does not export register(game)`);
  }
  const game = definition.GAME ?? {};
  const dimensions = (options.dimensions ?? game.dimensions) === 3 ? 3 : 2;
  if (dimensions === 3) {
    const { initWebGPU, webgpuSupported } = await import('./renderers/index.js');
    if (!webgpuSupported()) throw new Error(`M2D project '${project.name}' is 3D and needs WebGPU: Chrome or Edge with a GPU`);
    await Promise.all([initWebGPU(), initPhysics({ dimensions: 3 })]);
  } else {
    await initPhysics();
  }

  const m2d = new M2D(canvas, {
    ...game,
    ...hooks?.OPTIONS,
    ...projectOptions(project, { basePath }),
    basePath,
    saveId: project.name,
    ...options
  });
  definition.register(m2d);
  const sceneHooks = combineSceneHooks(definition.sceneHooks?.(m2d), hooks?.sceneHooks?.(m2d));
  for (const [path, source] of Object.entries(scenes)) {
    const name = sceneNameOf(path);
    const fetch = typeof source === 'function'
      ? async () => { const loaded = await source(); return loaded?.default ?? loaded; }
      : async () => source;
    m2d.sceneManager.addScene(name, { fetch, ...sceneHooks[name] });
  }
  if (project.settings !== false && !m2d.headless) {
    new SettingsMenu(m2d, typeof project.settings === 'object' ? project.settings : {});
  }
  setup?.(m2d);
  await m2d.start();
  return m2d;
}
