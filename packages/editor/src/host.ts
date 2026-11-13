/**
 * The editor's side of the host.
 *
 * The app is served by `m2d-editor <project>` (packages/editor-host),
 * which pins one project — one game — for the process's life: no picker,
 * no switching; another game is another editor on another port. The host
 * serves the game's *code* through Vite, which is what lets this module
 * hand back real actor classes and fresh ones after every save, and it
 * holds the open documents, which this module reaches over Vite's socket.
 */

import type { Op } from 'm2d-editor-core';

export interface SceneEntry {
  path: string;
  name: string | null;
  type: string | null;
  generator: string | null;
}

/** The project, as `/__project` describes it: one game. */
export interface HostProject {
  name: string;
  /** Absolute path of the project on disk; `/@fs${root}/...` reaches into it. */
  root: string;
  /** The definition module, project-relative, or null: no code, placeholders only. */
  definition: string | null;
  /** The presentation hooks module, project-relative, or null. */
  hooks: string | null;
  /** What scene asset URLs are relative to, project-relative. */
  basePath: string;
  /** The scene the game opens on, or null. */
  initialScene: string | null;
  /** `display` from the project file: design size, filters, clear colour. */
  display: Record<string, unknown>;
  /** Named input actions to key codes, as `input.actions` declares them. */
  actions: Record<string, string[]>;
  scenes: SceneEntry[];
}

/**
 * The M2D options the project file contributes to a game the editor
 * makes, played or edited: its actions (so a rule on one fires in play),
 * its clear colour and filters, over the hooks module's `OPTIONS`.
 */
export function projectGameOptions(project: HostProject, hooksOptions?: Record<string, unknown>): Record<string, unknown> {
  const display = project.display ?? {};
  const pick = (key: string) => (display[key] !== undefined ? { [key]: display[key] } : {});
  return { ...hooksOptions, ...pick('clearColor'), ...pick('textureFilter'), ...pick('worldFilter'), actions: project.actions ?? {} };
}

/** What a game-definition module exports; see m2d.project.json. */
export interface GameDefinition {
  register?: (game: unknown) => void;
  GAME?: Record<string, unknown>;
  /** Simulation scene hooks (`onEnter`, `onFixedUpdate`, `onExit`), merged with the hooks module's for play. */
  sceneHooks?: (game: unknown) => Record<string, Record<string, unknown>>;
}

/** What the host says about a document besides its data; see the host's session.ts. */
export interface DocState {
  dirty: boolean;
  generator: string | null;
  history: string[];
  undo: string | null;
  redo: string | null;
}

export interface ChangeEvent {
  path: string;
  revision: number;
  kind: 'edit' | 'undo' | 'redo' | 'saved' | 'reset' | 'conflict';
  ops?: Op[];
  label?: string;
  origin?: string;
  client?: string;
  id?: number;
  state: DocState;
}

export interface Snapshot {
  path: string;
  data: Record<string, unknown>;
  revision: number;
  state: DocState;
}

async function getJSON<T>(url: string, what: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(`${what}: ${body?.error ?? response.status}`);
  return body;
}

export async function loadProject(): Promise<HostProject> {
  return getJSON<HostProject>('/__project', 'The host did not describe the project (start the editor with m2d-editor <project>)');
}

/** An open document as the host holds it, opening it there first if need be. */
export async function fetchDocument(path: string): Promise<Snapshot> {
  return getJSON<Snapshot>(`/__doc?path=${encodeURIComponent(path)}`, `Could not open ${path}`);
}

/** A project file as an importable URL. `bust` forces a fresh module after a code change. */
export function moduleUrl(project: HostProject, path: string, bust = 0): string {
  return `/@fs${project.root}/${path}${bust ? `?t=${bust}` : ''}`;
}

/** Where the game's asset URLs resolve, as the engine's `basePath`. */
export function assetBase(project: HostProject): string {
  const base = project.basePath === '.' ? '' : `${project.basePath.replace(/^\.\//, '').replace(/\/$/, '')}/`;
  return `/@fs${project.root}/${base}`;
}

/**
 * The game's definition module, imported fresh. Vite owns invalidation:
 * when a file in the module graph changed, a new top-level request gets
 * re-evaluated children too, so `bust` only ever needs to be new.
 */
export async function loadDefinition(project: HostProject, bust = 0): Promise<GameDefinition | null> {
  if (!project.definition) return null;
  const loaded = await import(/* @vite-ignore */ moduleUrl(project, project.definition, bust)) as GameDefinition;
  if (typeof loaded.register !== 'function') {
    throw new Error(`${project.definition} does not export register(game); see m2d.project.json`);
  }
  return loaded;
}

/** What a hooks module exports; see m2d.project.json. */
export interface HooksModule {
  sceneHooks?: (game: unknown) => Record<string, Record<string, unknown>>;
  /** M2D options the game's look depends on (a texture filter), applied when editing and playing. */
  OPTIONS?: Record<string, unknown>;
}

/** The game's presentation hooks module, imported fresh, or null when the project has none. */
export async function loadHooks(project: HostProject, bust = 0): Promise<HooksModule | null> {
  if (!project.hooks) return null;
  return await import(/* @vite-ignore */ moduleUrl(project, project.hooks, bust)) as HooksModule;
}

/** POST a small JSON command to the host and read its answer. */
export async function post<T>(url: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answer = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !answer) throw new Error(answer?.error ?? `${url}: ${response.status}`);
  return answer;
}

/** GET JSON from the host. */
export function get<T>(url: string): Promise<T> {
  return getJSON<T>(url, url);
}

/** Tell the host something: an edit, an undo, a save. */
export function send(event: string, data: Record<string, unknown>): void {
  import.meta.hot?.send(event, data);
}

/** Hear the host: `m2d:change`, `m2d:error`, `m2d:file`, `m2d:module`. */
export function onHost<T>(event: string, listener: (data: T) => void): void {
  import.meta.hot?.on(event, listener as (data: unknown) => void);
}
