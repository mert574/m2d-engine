/**
 * A project on disk: the folder the editor and an agent both work in.
 *
 * The host reaches it through `node:fs` and serves it to the browser
 * through Vite (`serve.ts`); the browser never holds the folder itself.
 * It is deliberately the smaller idea — a folder with scenes in it, an
 * asset manifest beside them and `m2d.project.json` declaring the game.
 * What a project *is* grows with E5 (templates, build settings); until
 * something needs more, it is this.
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { SceneDocument } from 'm2d-editor-core';

/** A scene file found in a project. */
export interface SceneEntry {
  /** Project-relative, with forward slashes: `src/yard/scenes/yard.json`. */
  path: string;
  name: string | null;
  type: string | null;
  generator: string | null;
}

/**
 * The project's declaration, `m2d.project.json` at its root. A project is
 * one game: the editor opens it, runs its code and edits its scenes, and
 * another game is another project — another folder, another editor.
 */
export interface ProjectConfig {
  name: string;
  /** The game-definition module, project-relative: exports `register(game)` and may export `GAME` options. Null: no code, placeholders only. */
  definition: string | null;
  /**
   * The presentation hooks module, project-relative, or null: exports
   * `sceneHooks(game)` → `{ [scene]: { onEnter, onShow, onRender, ... } }`.
   * Kept apart from the definition so a headless game never loads it; the
   * game's page and the editor's play mode use it.
   */
  hooks: string | null;
  /** The folder its scene JSON lives in, project-relative. Default `scenes`. */
  scenes: string;
  /** What asset URLs in its scenes are relative to, project-relative. Default the root. */
  basePath: string;
}

/** The file that makes a folder a project. */
export const PROJECT_FILE = 'm2d.project.json';

export class Project {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /**
   * Resolve a project-relative path, refusing to leave the project. An
   * agent names paths, so this is the boundary that keeps a tool call
   * from reading `../../.ssh/id_rsa`.
   */
  resolve(path: string): string {
    const full = resolve(this.root, path);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error(`Project: '${path}' is outside the project`);
    }
    return full;
  }

  /**
   * The project's declaration, with defaults for what it leaves out. A
   * folder without one still opens: its scenes just have no code to run
   * them with, and the editor says so.
   */
  async config(): Promise<ProjectConfig> {
    const fallback: ProjectConfig = { name: this.root.split(sep).pop() ?? 'project', definition: null, hooks: null, scenes: 'scenes', basePath: '.' };
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(await readFile(join(this.root, PROJECT_FILE), 'utf8')) as Record<string, unknown>;
    } catch {
      return fallback;
    }
    const text = (value: unknown, otherwise: string) => (typeof value === 'string' && value ? value : otherwise);
    return {
      name: text(raw.name, fallback.name),
      definition: typeof raw.definition === 'string' && raw.definition ? raw.definition : null,
      hooks: typeof raw.hooks === 'string' && raw.hooks ? raw.hooks : null,
      scenes: text(raw.scenes, fallback.scenes),
      basePath: text(raw.basePath, fallback.basePath)
    };
  }

  /** Whether the folder declares itself a project. */
  async declared(): Promise<boolean> {
    try {
      return (await stat(join(this.root, PROJECT_FILE))).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Every `.json` scene in the game's scenes folder, by walking it — or
   * under the whole project, when that folder does not exist.
   */
  async scenes(): Promise<SceneEntry[]> {
    const found: SceneEntry[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!entry.name.endsWith('.json')) continue;
        const doc = await this.#read(full);
        // A scene is a document with a version and a scene type; the
        // project's package.json and its tsconfig are not scenes.
        if (doc?.type !== 'level' && doc?.type !== 'ui') continue;
        found.push({
          path: relative(this.root, full).split(sep).join('/'),
          name: doc.name,
          type: doc.type,
          generator: doc.generator
        });
      }
    };
    const { scenes } = await this.config();
    const folder = this.resolve(scenes);
    const hasFolder = await stat(folder).then((entry) => entry.isDirectory(), () => false);
    await walk(hasFolder ? folder : this.root);
    found.sort((a, b) => a.path.localeCompare(b.path));
    return found;
  }

  /** Open one scene as a document. */
  async openScene(path: string): Promise<SceneDocument> {
    return SceneDocument.parse(await this.readText(path), path);
  }

  /** A project file's text. */
  async readText(path: string): Promise<string> {
    return readFile(this.resolve(path), 'utf8');
  }

  /**
   * Write a document back in canonical form, returning the text written.
   * Refuses a generated scene:
   * the next run of its script would overwrite this, so saving one is
   * not a save but a loss waiting to happen. Detach it first by deleting
   * its `generator`.
   */
  async saveScene(doc: SceneDocument): Promise<string> {
    if (!doc.path) throw new Error('Project: the document has no path to save to');
    if (doc.generator) {
      throw new Error(
        `Project: '${doc.path}' is generated by ${doc.generator} and is read-only; ` +
        "edit that script, or delete the scene's 'generator' field to detach it");
    }
    const text = doc.text;
    await writeFile(this.resolve(doc.path), text);
    doc.markSaved();
    return text;
  }

  /** Whether the project folder is there at all. */
  async exists(): Promise<boolean> {
    try {
      return (await stat(this.root)).isDirectory();
    } catch {
      return false;
    }
  }

  async #read(full: string): Promise<{ type: string | null; name: string | null; generator: string | null } | null> {
    try {
      const data = JSON.parse(await readFile(full, 'utf8')) as Record<string, unknown>;
      return {
        type: typeof data.type === 'string' ? data.type : null,
        name: typeof data.name === 'string' ? data.name : null,
        generator: typeof data.generator === 'string' ? data.generator : null
      };
    } catch {
      return null;
    }
  }
}
