/**
 * The companion process: the editor's local half.
 *
 * The editor is a browser app, which settles most of what it needs —
 * canvases, WebGPU, a project folder through the File System Access API.
 * What a browser cannot do is run the asset pipeline: `compileModel.mjs`
 * is gltf-transform, meshoptimizer, sharp and a Basis encoder, and
 * porting all of it to WASM is a project of its own. So a small local
 * process stands beside the tab and does the native work — and since it
 * is already there, it is also where the MCP server lives, which is why
 * one command gives a user both an editor and an agent endpoint.
 *
 * This round is the skeleton: it serves nothing yet (Vite serves the app
 * in development) and compiles nothing yet (E3). What it does is own the
 * project, watch it for changes, and hold the MCP server — the three
 * things everything later hangs off.
 */

import { watch, type FSWatcher } from 'node:fs';
import { Project } from './project.ts';
import { createServer } from './server.ts';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface CompanionOptions {
  /** The project folder. */
  root: string;
  /** Watch the folder and report changes. Off in tests. */
  watch?: boolean;
}

/** A file in the project changed on disk. */
export type ChangeListener = (path: string) => void;

export class Companion {
  readonly project: Project;
  readonly mcp: McpServer;
  #watcher: FSWatcher | null = null;
  #listeners = new Set<ChangeListener>();

  constructor(options: CompanionOptions) {
    this.project = new Project(options.root);
    this.mcp = createServer(this.project);
    if (options.watch) this.#watch();
  }

  /**
   * Hear about files changing under the project — what a scene hot
   * reload (E4) and the asset browser (E3) will both want. Returns an
   * unsubscribe.
   */
  onChange(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  /** Stop watching and let the process exit. */
  close(): void {
    this.#watcher?.close();
    this.#watcher = null;
    this.#listeners.clear();
  }

  #watch(): void {
    // Recursive watching is not supported on every platform; where it is
    // not, the editor falls back to reloading by hand rather than the
    // companion failing to start over a convenience.
    try {
      this.#watcher = watch(this.project.root, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const path = filename.toString().split(/[\\/]/).join('/');
        if (path.includes('node_modules/') || path.startsWith('.')) return;
        for (const listener of this.#listeners) listener(path);
      });
    } catch (error) {
      console.warn(`m2d-editor: watching ${this.project.root} failed (${(error as Error).message}); ` +
        'changes on disk will not be noticed');
    }
  }
}
