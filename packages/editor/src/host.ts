/**
 * The editor's side of the host.
 *
 * The app is served by `m2d-editor <project>` (packages/editor-host),
 * which pins one project for the process's life — there is no folder
 * picker and no switching mid-run; another project is another editor on
 * another port. The host serves the project's *code* through Vite, which
 * is what lets this module hand back real actor classes and fresh ones
 * after every save.
 */

export interface GameEntry {
  name: string;
  definition: string;
  scenes: string;
  basePath: string;
}

export interface SceneEntry {
  path: string;
  name: string | null;
  type: string | null;
  generator: string | null;
}

export interface HostProject {
  name: string;
  /** Absolute path of the project on disk; `/@fs${root}/...` reaches into it. */
  root: string;
  games: GameEntry[];
  scenes: SceneEntry[];
}

/** What a game-definition module exports; see m2d.project.json. */
export interface GameDefinition {
  register?: (game: unknown) => void;
  GAME?: Record<string, unknown>;
}

export async function loadProject(): Promise<HostProject> {
  const response = await fetch('/__project');
  if (!response.ok) throw new Error(`The host did not answer /__project (${response.status}); start the editor with m2d-editor <project>`);
  return await response.json() as HostProject;
}

/** One scene file's text, exactly as it is on disk. */
export async function readSceneText(path: string): Promise<string> {
  const response = await fetch(`/__scene?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error(`Could not read ${path} (${response.status})`);
  return await response.text();
}

/** The game whose scenes folder holds this scene, if the project says. */
export function gameFor(project: HostProject, scenePath: string): GameEntry | null {
  return project.games.find((game) => scenePath.startsWith(`${game.scenes}/`)) ?? null;
}

/** A project file as an importable URL. `bust` forces a fresh module after a code change. */
export function moduleUrl(project: HostProject, path: string, bust = 0): string {
  return `/@fs${project.root}/${path}${bust ? `?t=${bust}` : ''}`;
}

/** Where a game's asset URLs resolve, as the engine's `basePath`. */
export function assetBase(project: HostProject, game: GameEntry | null): string {
  return game ? `/@fs${project.root}/${game.basePath}/` : `/@fs${project.root}/`;
}

/**
 * The game's definition module, imported fresh. Vite owns invalidation:
 * when a file in the module graph changed, a new top-level request gets
 * re-evaluated children too, so `bust` only ever needs to be new.
 */
export async function loadDefinition(project: HostProject, game: GameEntry, bust = 0): Promise<GameDefinition> {
  const loaded = await import(/* @vite-ignore */ moduleUrl(project, game.definition, bust)) as GameDefinition;
  if (typeof loaded.register !== 'function') {
    throw new Error(`${game.definition} does not export register(game); see m2d.project.json`);
  }
  return loaded;
}

/**
 * Files changing on disk, from the host's watcher: scene JSON saved by
 * anything (an agent over MCP included), an asset dropped into the
 * folder, source edited. Module changes also flow through Vite's own
 * HMR; this channel is the editor's cue to reload documents and
 * re-materialize.
 */
export function onProjectFile(listener: (path: string) => void): void {
  if (import.meta.hot) {
    import.meta.hot.on('m2d:file', (data: { path: string }) => listener(data.path));
  }
}
