#!/usr/bin/env node
/**
 * `m2d-editor <project-folder>` — the editor, hosting one project.
 *
 * The host is what makes this an IDE rather than a map viewer: the
 * browser cannot load a project's *code* from a folder handle — code
 * needs URLs, bare-import resolution, a TypeScript transform and an
 * invalidation graph — so the host serves the project through Vite. The
 * editor app then imports the project's real actor and constraint
 * classes, and when a source file changes Vite invalidates the module
 * graph and the app re-imports and re-materializes: that is the code hot
 * reload, and it is the same machinery Godot and Unity have as script
 * reloading, mapped onto ES modules.
 *
 * One process, one project, chosen at boot. Switching projects is
 * starting another editor on another folder (and another port), which is
 * also how several agents work side by side without fighting over one.
 *
 * The project directory stays a plain folder: copy, move or drop a
 * multi-gigabyte asset into it with the file manager — nothing streams
 * through the browser — and the watcher tells the editor it landed.
 *
 * The port is a free one chosen at random each start (printed); `PORT=`
 * pins it.
 */

import { createServer, searchForWorkspaceRoot, type ViteDevServer, type Plugin } from 'vite';
import { createServer as netServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Companion } from './companion.ts';

/** A free port the OS hands out, so parallel editors never fight. */
function freePort(): Promise<number> {
  return new Promise((ready, fail) => {
    const probe = netServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => ready(port));
    });
  });
}

/** The project endpoints and the file-change channel, as a Vite plugin. */
function hostPlugin(companion: Companion): Plugin {
  const json = (res: { setHeader(k: string, v: string): void; end(body: string): void; statusCode: number }, body: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  return {
    name: 'm2d-editor-host',
    /**
     * A change under the project must not fall back to Vite's full page
     * reload: nothing hot-accepts the project's modules (the app imports
     * them dynamically), so Vite would reload the tab and lose the
     * editor's state. The graph is already invalidated by the time this
     * runs, so the app's own channel (`m2d:file`, below) re-imports and
     * gets fresh code — the in-place reload. The editor app's own modules
     * keep Vite's normal HMR.
     */
    handleHotUpdate(ctx) {
      if (ctx.file.startsWith(companion.project.root)) return [];
      return undefined;
    },
    configureServer(server: ViteDevServer) {
      // Scene JSON and asset changes ride a custom event; module changes
      // go through Vite's own graph, which `import()` sees as fresh code.
      companion.onChange((path) => {
        server.ws.send({ type: 'custom', event: 'm2d:file', data: { path } });
      });

      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://host');
        const handle = async (): Promise<void> => {
          if (url.pathname === '/__project') {
            const [config, scenes] = await Promise.all([companion.project.config(), companion.project.scenes()]);
            json(res, { ...config, root: companion.project.root, scenes });
            return;
          }
          if (url.pathname === '/__scene') {
            const path = url.searchParams.get('path') ?? '';
            res.setHeader('Content-Type', 'application/json');
            res.end(await readFile(companion.project.resolve(path), 'utf8'));
            return;
          }
          next();
        };
        handle().catch((error: unknown) => json(res, { error: String((error as Error).message ?? error) }, 400));
      });
    }
  };
}

const args = process.argv.slice(2);
const root = resolve(args.find((arg) => !arg.startsWith('-')) ?? '.');
const companion = new Companion({ root, watch: true });
if (!(await companion.project.exists())) {
  console.error(`m2d-editor: no such folder: ${companion.project.root}`);
  process.exit(1);
}

// The app the host serves is this repo's own editor package.
const appRoot = fileURLToPath(new URL('../../editor', import.meta.url));
const port = Number(process.env.PORT) || await freePort();

const server = await createServer({
  configFile: false,
  root: appRoot,
  server: {
    port,
    strictPort: true,
    fs: {
      // The app and the engine (the workspace), and the project —
      // wherever it is. `/@fs/` URLs are how the app reaches the latter.
      allow: [searchForWorkspaceRoot(appRoot), companion.project.root]
    }
  },
  plugins: [hostPlugin(companion)]
});

await server.listen();
const config = await companion.project.config();
console.log(`m2d-editor: ${config.name} (${companion.project.root})`);
console.log(`            http://localhost:${port}/`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    companion.close();
    void server.close().then(() => process.exit(0));
  });
}
