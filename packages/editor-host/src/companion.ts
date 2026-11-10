/**
 * The companion process: the editor's local half.
 *
 * The editor is a browser app, which settles most of what it needs —
 * canvases, WebGPU, DOM panels. What a browser cannot do is reach a
 * project's code by URL, watch a folder, or run the asset pipeline:
 * `compileModel.mjs` is gltf-transform, meshoptimizer, sharp and a Basis
 * encoder, and porting all of it to WASM is a project of its own. So a
 * small local process stands beside the tab and does that work — and
 * since it is already there, it is also where the MCP server lives, which
 * is why one command gives a user both an editor and an agent endpoint.
 *
 * This class is the part both faces share: it owns the project, the
 * editing session (every open document, `session.ts`), the watcher, and
 * makes the MCP servers. `serve.ts` puts Vite in front of it for the
 * browser and serves MCP over HTTP beside it; `mcp.ts` puts stdio in front
 * of it for an agent when no editor is running. Compiling assets is E3.
 */

import { watch, type FSWatcher } from 'node:fs';
import { Project } from './project.ts';
import { Session } from './session.ts';
import { Assets } from './assets.ts';
import { createServer, type ServerOptions } from './server.ts';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface CompanionOptions {
  /** The project folder. */
  root: string;
  /** Watch the folder and report changes. Off in tests. */
  watch?: boolean;
  /** Passed to every MCP server this makes. */
  server?: ServerOptions;
}

/** A file in the project changed on disk. */
export type ChangeListener = (path: string) => void;

export class Companion {
  readonly project: Project;
  readonly session: Session;
  /** The project's asset files and its library imports. */
  readonly assets: Assets;
  /** The MCP server for a single long-lived connection (stdio, a test). */
  readonly mcp: McpServer;
  #watcher: FSWatcher | null = null;
  #listeners = new Set<ChangeListener>();
  #serverOptions: ServerOptions;

  constructor(options: CompanionOptions) {
    this.project = new Project(options.root);
    this.session = new Session(this.project);
    this.assets = new Assets(this.project);
    this.#serverOptions = options.server ?? {};
    // The long-lived server (stdio, a test) is made after `assets` exists.
    this.mcp = this.createMcp();
    // A file the session holds open changing on disk is the session's to
    // reconcile: an echo of its own save, or someone else's write.
    this.onChange((path) => { if (path.endsWith('.json')) void this.session.fileChanged(path); });
    if (options.watch) this.#watch();
  }

  /** A fresh MCP server over the session — one per HTTP request, which is how the stateless transport works. */
  createMcp(): McpServer {
    return createServer(this.session, this.#serverOptions, this.assets);
  }

  /** What only the serving host can offer the MCP servers: the game's code, a build. */
  provide(options: Partial<ServerOptions>): void {
    Object.assign(this.#serverOptions, options);
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
    this.session.close();
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
