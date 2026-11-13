/**
 * What `m2d.project.json` may hold, as schema descriptors: the project's
 * single definition, which `bootProject`, the editor's project panel and
 * the MCP `read_project` and `edit_project` tools all read. Pure data, so
 * a tool can import it without the engine. See project.js.
 */

import { s, validate } from './schema.js';

/** The file that makes a folder a project. */
export const PROJECT_FILE = 'm2d.project.json';

const colour = (options = {}) => s.string({ editor: 'color', ...options });

/**
 * What `m2d.project.json` may hold. The editor's project panel and the
 * MCP `read_project` tool both draw from this, and `bootProject` refuses
 * a file that fails it.
 */
export const PROJECT_SCHEMA = s.object({
  name: s.string({ required: true, nonEmpty: true }),
  definition: s.string({ nonEmpty: true, description: 'The game-definition module: exports register(game), and may export GAME (its simulation options)' }),
  hooks: s.string({ nonEmpty: true, description: 'The presentation hooks module: exports sceneHooks(game), and may export OPTIONS' }),
  scenes: s.string({ initial: 'scenes', description: 'The folder the scene files are in' }),
  basePath: s.string({ initial: '.', description: 'What asset URLs in the scenes are relative to' }),
  initialScene: s.ref('scene', { label: 'Initial scene', description: 'The scene the game opens on: a scene file\'s name' }),
  display: s.object({
    width: s.number({ positive: true, unit: 'px', initial: 1280, description: 'The design width the UI and view are laid out for' }),
    height: s.number({ positive: true, unit: 'px', initial: 720 }),
    aspectMode: s.enumOf(['letterbox', 'expand'], { label: 'Aspect', description: 'letterbox keeps the designed view; expand shows more world on a wider display' }),
    textureFilter: s.enumOf(['linear', 'nearest'], { label: 'Texture filter', description: 'nearest keeps pixel art crisp' }),
    worldFilter: s.enumOf(['linear', 'nearest'], { label: 'World filter' }),
    pointerLock: s.boolean({ label: 'Pointer lock' }),
    performanceStats: s.boolean({ label: 'Performance stats', description: 'The F3 readout' }),
    clearColor: colour({ label: 'Clear colour' })
  }, { label: 'Display' }),
  input: s.object({
    actions: s.record(s.array(s.string({ nonEmpty: true }), { minLength: 1, message: 'must be a list of key codes, e.g. ["Escape"]' }), {
      label: 'Actions', description: 'Action name to the physical key codes that perform it; rules fire on them and the settings menu rebinds them'
    })
  }, { label: 'Input' }),
  settings: s.union([
    s.boolean({ match: (value) => typeof value === 'boolean' }),
    s.object({
      pauseWhenOpen: s.boolean({ initial: false, label: 'Pause while open', description: 'Hold the game still while the menu is up: what a race or a timed level wants' })
    }, { match: (value) => typeof value === 'object' && value !== null })
  ], { initial: true, label: 'Settings', description: 'Mount the settings menu (O), with a Controls section for the actions. An object mounts it and tunes it', message: 'must be true, false or { pauseWhenOpen }' }),
  music: s.record(s.object({
    url: s.string({ required: true, nonEmpty: true, description: 'Relative to basePath' }),
    volume: s.number({ min: 0, max: 1, initial: 1 })
  }), { label: 'Music', description: 'Tracks loaded at boot, for screens that are not scenes' })
}, { label: 'Project' });

/** Display options as `M2D` takes them. */
export const DISPLAY_KEYS = ['width', 'height', 'aspectMode', 'textureFilter', 'worldFilter', 'pointerLock', 'performanceStats', 'clearColor'];

/**
 * Check a project declaration, throwing on the first problem with its path.
 * @param {object} project - `m2d.project.json`, parsed
 * @returns {object} The declaration, validated
 */
export function checkProject(project) {
  const issues = projectIssues(project);
  if (issues.length) throw new Error(`M2D project: ${issues[0].path || '(file)'}: ${issues[0].message}`);
  return project;
}

/** Every problem with a project declaration, each with its path. */
export function projectIssues(project) {
  const issues = [];
  class Issue extends Error {}
  validate(PROJECT_SCHEMA, project, {
    fail: (path, message) => { throw Object.assign(new Issue(message), { path }); },
    collect: (error) => {
      if (!(error instanceof Issue)) return false;
      issues.push({ path: error.path, message: error.message });
      return true;
    }
  });
  return issues;
}

/** A scene file's name: its file name without the folder and `.json`. */
export function sceneNameOf(path) {
  return path.split('/').pop().replace(/\.json$/i, '');
}
