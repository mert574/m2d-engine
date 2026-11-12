#!/usr/bin/env node
/**
 * `m2d-editor <project-folder>` — the editor, hosting one game.
 *
 * The host is what makes this an IDE rather than a map viewer: the
 * browser cannot load a project's *code* from a folder handle — code
 * needs URLs, bare-import resolution, a TypeScript transform and an
 * invalidation graph — so the host serves the project through Vite. The
 * editor app then imports the game's real actor and constraint classes,
 * and when a file its definition imports changes, Vite invalidates the
 * module graph and the app re-imports and re-materializes: the same
 * machinery Godot and Unity have as script reloading, on ES modules.
 *
 * One process, one project, one game, chosen at boot. Another game is
 * another editor on another folder and another port, which is also how
 * several agents work side by side without fighting over one.
 *
 * The host owns the open documents (`session.ts`): the editor's tabs edit
 * replicas over Vite's socket, and agents edit the same documents over
 * MCP at `/mcp` on the same port — one history for both.
 *
 * The project directory stays a plain folder: copy, move or drop a
 * multi-gigabyte asset into it with the file manager — nothing streams
 * through the browser — and the watcher tells the editor it landed.
 *
 * The port is a free one chosen at random each start (printed); `PORT=`
 * pins it.
 */

import { createServer, searchForWorkspaceRoot, type ViteDevServer, type Plugin, type ModuleNode } from 'vite';
import { createServer as netServer } from 'node:net';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve, sep } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Companion } from './companion.ts';
import { PROJECT_FILE, type ProjectConfig } from './project.ts';
import { createProject, TEMPLATES } from './templates.ts';
import { SceneCamera } from './shots.ts';
import { settle, type RunScene } from './playtest.ts';
import { runAudit, findUses } from './search.ts';
import { engineAlias, buildProject, previewProject, closePreview } from './build.ts';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { structure, SCENE_VERSION, type Edit } from 'm2d-editor-core';

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

/** Folders under `dir` that declare a project, a few levels down — for the usage message. */
async function findProjects(dir: string, depth = 3): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  if (entries.some((entry) => entry.isFile() && entry.name === PROJECT_FILE)) found.push(dir);
  if (depth === 0) return found;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || ['node_modules', 'dist', 'site'].includes(entry.name)) continue;
    found.push(...await findProjects(join(dir, entry.name), depth - 1));
  }
  return found;
}

let building = false;

/**
 * Another editor, on another project and a port of its own — one process
 * per project is the rule. Detached, so it outlives this one; its output
 * goes to a log file in the temp folder. Resolves with its URL once it
 * listens.
 */
async function launchEditor(projectRoot: string): Promise<string> {
  const port = await freePort();
  const log = join(tmpdir(), `m2d-editor-${port}.log`);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), projectRoot], {
    detached: true,
    stdio: ['ignore', openSync(log, 'a'), openSync(log, 'a')],
    env: { ...process.env, PORT: String(port), INIT_CWD: projectRoot }
  });
  child.unref();
  const url = `http://localhost:${port}/`;
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise((wait) => setTimeout(wait, 150));
    try {
      if ((await fetch(`${url}__project`)).ok) return url;
    } catch { /* not listening yet */ }
  }
  throw new Error(`the new editor did not start; see ${log}`);
}

/** Everything that imports `modules`, transitively, by file. */
function importersOf(modules: readonly ModuleNode[]): Set<string> {
  const files = new Set<string>();
  const queue = [...modules];
  for (let module = queue.pop(); module; module = queue.pop()) {
    for (const importer of module.importers) {
      if (!importer.file || files.has(importer.file)) continue;
      files.add(importer.file);
      queue.push(importer);
    }
  }
  return files;
}

type Response = { setHeader(k: string, v: string): void; end(body: string): void; statusCode: number };

/** A request's JSON body, capped: these endpoints take small commands, never files. */
function readBody(req: AsyncIterable<unknown>): Promise<unknown> {
  return (async () => {
    let text = '';
    for await (const chunk of req) {
      text += String(chunk);
      if (text.length > 64 * 1024) throw new Error('request body too large');
    }
    return text ? JSON.parse(text) as unknown : {};
  })();
}

/** The project endpoints, the edit channel and MCP, as a Vite plugin. */
function hostPlugin(companion: Companion, config: ProjectConfig, appRoot: string, port: number, camera: SceneCamera): Plugin {
  let server: ViteDevServer | null = null;
  // Vite reports files with forward slashes on every platform.
  const slash = (path: string) => path.split(sep).join('/');
  const root = slash(companion.project.root);
  const app = slash(appRoot);
  const definition = config.definition ? slash(join(companion.project.root, config.definition)) : null;
  const hooks = config.hooks ? slash(join(companion.project.root, config.hooks)) : null;
  /** Whether a change to `file` (imported by `importers`) is the game's code. */
  const gameCode = (file: string, importers: Set<string>) =>
    [definition, hooks].some((entry) => entry && (file === entry || importers.has(entry)));
  const json = (res: Response, body: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  // The game, loaded in Node through Vite's SSR loader, so MCP checks an
  // agent's edit against the classes the game really registers, and can
  // run a scene. The modules are loaded once and dropped when their code
  // changes; each run gets a fresh game.
  type Engine = { M2D: new (canvas: null, options: object) => HeadlessGame };
  type HeadlessGame = {
    registerActor(name: string, actor: unknown): void;
    sceneManager: { addScene(name: string, config: object): void; switchTo(name: string): Promise<unknown>; getCurrentScene(): { entitiesById: Map<string, { position: { x: number; y: number; z?: number }; dead?: boolean; body?: { bodyType?: string; angle?: number; rotation?: { x: number; y: number; z: number; w: number } } }> } };
    step(ticks: number): number;
    entities: Set<{ sceneId?: string }>;
  };
  let modules: Promise<{ engine: Engine; physics: { initPhysics(o?: object): Promise<void> }; definition: { register?: (game: unknown) => void; GAME?: Record<string, unknown> } } | null> | null = null;
  const loadModules = () => {
    if (!definition || !server) return Promise.resolve(null);
    const vite = server;
    modules ??= (async () => ({
      engine: await vite.ssrLoadModule('m2d-engine/core/m2d.js') as unknown as Engine,
      physics: await vite.ssrLoadModule('m2d-engine/core/physics/index.js') as unknown as { initPhysics(o?: object): Promise<void> },
      definition: await vite.ssrLoadModule(definition) as { register?: (game: unknown) => void; GAME?: Record<string, unknown> }
    }))().catch((error: unknown) => {
      console.warn(`m2d-editor: the game's code did not load in the host (${(error as Error).message}); MCP checks are structural only`);
      modules = null;
      return null;
    });
    return modules;
  };
  const makeGame = async (): Promise<HeadlessGame | null> => {
    const loaded = await loadModules();
    if (!loaded) return null;
    const options = loaded.definition.GAME ?? {};
    await loaded.physics.initPhysics(options.dimensions === 3 ? { dimensions: 3 } : undefined);
    const made = new loaded.engine.M2D(null, { ...options, headless: true });
    loaded.definition.register?.(made);
    // The project's scenes as the session holds them: cross-scene refs (a
    // button's onClick, a rule's switch) check as registered, and a level
    // that instances another composes from its real document.
    try {
      const manager = (made as unknown as { sceneManager?: { addScene(name: string, scene: object): void } }).sceneManager;
      for (const scene of await companion.project.scenes()) {
        if (scene.name) manager?.addScene(scene.name, { fetch: async () => structuredClone((await companion.session.document(scene.path)).data) });
      }
    } catch { /* names are a convenience; validation still runs without them */ }
    return made;
  };
  let validatorGame: Promise<HeadlessGame | null> | null = null;
  const runScene: RunScene = async (data, ticks) => {
    const made = await makeGame();
    if (!made) throw new Error("the game's code did not load in the host");
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ').slice(0, 300)); };
    const started = performance.now();
    try {
      // Its own name: the project's copy of this scene is registered under
      // the scene's name already, and the first registration is the one loaded.
      const name = `${typeof data.name === 'string' ? data.name : 'scene'}:run`;
      made.sceneManager.addScene(name, { fetch: async () => structuredClone(data) });
      await made.sceneManager.switchTo(name);
      const scene = made.sceneManager.getCurrentScene();
      const start = new Map([...scene.entitiesById].map(([id, entity]) => [id, { ...entity.position }]));
      const placed = made.entities.size;
      let ran = 0;
      while (ran < ticks) {
        const stepped = made.step(Math.min(60, ticks - ran));
        ran += stepped;
        if (!stepped) break;
      }
      const r = (v: number) => Math.round(v * 1000) / 1000;
      const objects = [...scene.entitiesById].filter(([, entity]) => !entity.dead).map(([id, entity]) => {
        const p = entity.position;
        const s = start.get(id) ?? p;
        const body = entity.body;
        const q = p.z !== undefined ? body?.rotation : undefined;
        return {
          id, bodyType: body?.bodyType ?? 'dynamic', x: r(p.x), y: r(p.y), ...(p.z !== undefined && { z: r(p.z) }),
          ...(q ? { rotation: [q.x, q.y, q.z, q.w] as [number, number, number, number] } : body?.angle !== undefined && { angle: body.angle }),
          moved: r(Math.hypot(p.x - s.x, p.y - s.y, (p.z ?? 0) - (s.z ?? 0)))
        };
      });
      const removed = [...start.keys()].filter((id) => !scene.entitiesById.has(id) || scene.entitiesById.get(id)?.dead);
      const spawned = Math.max(0, made.entities.size - placed + removed.length);
      return { ticks: ran, seconds: r((performance.now() - started) / 1000), objects, removed, spawned, errors };
    } finally {
      console.error = original;
    }
  };
  companion.provide({
    game: () => (validatorGame ??= makeGame()),
    runScene,
    build: () => buildProject(companion.project, companion.assets),
    screenshot: (shot) => camera.shoot(shot)
  });

  return {
    name: 'm2d-editor-host',
    /**
     * A change to code the game's definition imports — inside the project
     * or out of it, `../shared/` included — is the editor's to reload in
     * place: nothing hot-accepts the game's modules (the app imports them
     * dynamically), so Vite's fallback would reload the tab and lose the
     * editor's state. This hook runs once the graph is invalidated, so an
     * `import()` the app makes on hearing `m2d:module` gets fresh code.
     *
     * Code the editor app imports itself (the engine, mostly) keeps Vite's
     * own handling: a half-reloaded engine — the game's classes extending
     * a different `Entity` from the app's — would be worse than a reload.
     * Anything else under the project (a build script, a bundle written
     * into `dist/`) reloads nothing.
     */
    handleHotUpdate(ctx) {
      if (!ctx.modules.length) return ctx.file.startsWith(`${root}/`) ? [] : undefined;
      const importers = importersOf(ctx.modules);
      if ([...importers].some((file) => file.startsWith(`${app}/`))) return undefined;
      if (gameCode(ctx.file, importers)) {
        modules = null;
        validatorGame = null;
        server?.ws.send({ type: 'custom', event: 'm2d:module', data: { path: slash(relative(companion.project.root, ctx.file)) } });
        return [];
      }
      return ctx.file.startsWith(`${root}/`) ? [] : undefined;
    },
    configureServer(dev: ViteDevServer) {
      server = dev;
      const session = companion.session;

      // Files that are not code: scene JSON saved by anything, assets
      // landing. Code changes ride `m2d:module`, above.
      companion.onChange((path) => {
        if (/\.(m?[jt]s|[jt]sx)$/.test(path)) return;
        dev.ws.send({ type: 'custom', event: 'm2d:file', data: { path } });
      });
      // Every change to an open document, to every tab.
      session.onChange((event) => {
        dev.ws.send({ type: 'custom', event: 'm2d:change', data: event as never });
      });
      // Library imports' progress.
      companion.assets.onJob((job) => {
        dev.ws.send({ type: 'custom', event: 'm2d:job', data: job as never });
      });

      // The tabs' half of the edit channel. A refused request is answered
      // to its sender alone, which then resyncs.
      type Request = { path: string; client?: string; id?: number; edit?: Edit };
      const handle = (event: string, act: (request: Request) => Promise<unknown>) => {
        dev.ws.on(event, (request: Request, client) => {
          act(request).catch((error: unknown) => {
            client.send('m2d:error', {
              path: request.path, client: request.client, id: request.id,
              message: String((error as Error).message ?? error)
            });
          });
        });
      };
      const editor = (request: Request) => ({ origin: 'editor', client: request.client, id: request.id });
      handle('m2d:edit', (request) => session.edit(request.path, request.edit as Edit, editor(request)));
      handle('m2d:undo', (request) => session.undo(request.path, editor(request)));
      handle('m2d:redo', (request) => session.redo(request.path, editor(request)));
      handle('m2d:save', (request) => session.save(request.path, editor(request)));

      dev.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://host');
        const respond = async (): Promise<void> => {
          if (url.pathname === '/__project') {
            json(res, { ...await companion.project.config(), root: companion.project.root, scenes: await companion.project.scenes() });
            return;
          }
          if (url.pathname === '/__assets') {
            const assets = companion.assets;
            json(res, { files: await assets.list(), library: await assets.library(), jobs: assets.jobs });
            return;
          }
          if (url.pathname === '/__audit') {
            json(res, await runAudit(session, companion.assets, await (validatorGame ??= makeGame())));
            return;
          }
          if (url.pathname === '/__uses') {
            const scope = url.searchParams.get('scope') ?? '';
            const name = url.searchParams.get('name') ?? '';
            json(res, await findUses(session, scope, name, await (validatorGame ??= makeGame())));
            return;
          }
          if (url.pathname === '/__settle' && req.method === 'POST') {
            const body = await readBody(req) as { path?: string; seconds?: number; ids?: string[]; client?: string };
            if (!body.path) throw new Error('a settle needs a scene path');
            json(res, { settled: await settle(session, runScene, body.path, { seconds: body.seconds, ids: body.ids }, { origin: 'editor', client: body.client }) });
            return;
          }
          if (url.pathname === '/__thumb' && req.method === 'POST') {
            // The editor rendered a thumbnail (it has the GPU; the host does not): keep it by the file's key.
            const body = await readBody(req) as { key?: string; png?: string };
            if (!body.key || !body.png) throw new Error('a thumbnail is { key, png } (png as base64)');
            json(res, { thumb: await companion.assets.storeThumbnail(body.key, Buffer.from(body.png, 'base64')) });
            return;
          }
          if (url.pathname === '/__asset-info') {
            json(res, await companion.assets.info(url.searchParams.get('path') ?? ''));
            return;
          }
          if (url.pathname === '/__library/search') {
            const params = url.searchParams;
            json(res, await companion.assets.search(params.get('source') ?? 'polyhaven', params.get('type') ?? 'models', params.get('q') ?? ''));
            return;
          }
          if (url.pathname === '/__library/import' && req.method === 'POST') {
            const body = await readBody(req) as { source?: string; type?: string; id?: string; resolution?: string };
            json(res, companion.assets.import(body.source ?? 'polyhaven', body.type ?? 'models', body.id ?? '', body.resolution));
            return;
          }
          if (url.pathname === '/__build' && req.method === 'POST') {
            // One build at a time; its log lines and result ride the socket.
            if (building) throw new Error('a build is already running');
            building = true;
            const send = (data: Record<string, unknown>) => dev.ws.send({ type: 'custom', event: 'm2d:build', data: data as never });
            send({ stage: 'building' });
            buildProject(companion.project, companion.assets, (line) => send({ stage: 'log', line }))
              .then((result) => send({ stage: 'done', result: { ...result, outDir: relative(companion.project.root, result.outDir) || '.' } }))
              .catch((error: unknown) => send({ stage: 'failed', message: String((error as Error).message ?? error) }))
              .finally(() => { building = false; });
            json(res, { started: true });
            return;
          }
          if (url.pathname === '/__preview' && req.method === 'POST') {
            json(res, { url: await previewProject(companion.project, await freePort()) });
            return;
          }
          if (url.pathname === '/__new' && req.method === 'POST') {
            const body = await readBody(req) as { folder?: string; template?: string; name?: string };
            if (!body.folder) throw new Error('a new project needs a folder');
            // Relative to the folder this project sits in: a sibling by default.
            const made = await createProject(resolve(companion.project.root, '..', body.folder), body.template ?? '2d', body.name);
            json(res, { ...made, url: await launchEditor(made.root) });
            return;
          }
          if (url.pathname === '/__scene' && req.method === 'POST') {
            // The scene picker's New, Duplicate, Rename and Delete; the same
            // moves the MCP tools make (create_scene, rename_scene, delete_scene).
            const body = await readBody(req) as { action?: string; path?: string; name?: string; type?: 'level' | 'ui'; dimensions?: 2 | 3 };
            const project = companion.project;
            if (body.action === 'create') {
              if (!body.name) throw new Error('a scene needs a name');
              const data = body.path
                ? { ...JSON.parse((await session.document(body.path)).text) as Record<string, unknown>, name: body.name, generator: undefined }
                : structure.blankScene(body.name, body.type ?? 'level', SCENE_VERSION, body.dimensions ?? 2);
              json(res, { path: await project.createScene(body.name, data) });
              return;
            }
            if (body.action === 'rename') {
              if (!body.path || !body.name) throw new Error('a rename needs a path and a name');
              if (session.isDirty(body.path)) throw new Error(`${body.path} has unsaved edits; save it first`);
              const path = await project.renameScene(body.path, body.name);
              session.forget(body.path);
              json(res, { path });
              return;
            }
            if (body.action === 'delete') {
              if (!body.path) throw new Error('a delete needs a path');
              await project.deleteScene(body.path);
              session.forget(body.path);
              json(res, { deleted: body.path });
              return;
            }
            throw new Error(`unknown scene action '${body.action}'`);
          }
          if (url.pathname === '/__doc') {
            json(res, await session.snapshot(url.searchParams.get('path') ?? ''));
            return;
          }
          if (url.pathname === '/mcp') {
            // Stateless: a server and a transport per request, both closed
            // with it. Only this machine, by name, may talk to it — a page
            // elsewhere rebinding a DNS name to 127.0.0.1 may not.
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: undefined,
              enableDnsRebindingProtection: true,
              allowedHosts: [`localhost:${port}`, `127.0.0.1:${port}`]
            });
            const mcp = companion.createMcp();
            res.on('close', () => { void transport.close(); void mcp.close(); });
            await mcp.connect(transport);
            await transport.handleRequest(req, res);
            return;
          }
          next();
        };
        respond().catch((error: unknown) => json(res, { error: String((error as Error).message ?? error) }, 400));
      });
    }
  };
}

// The folder is relative to where the command was typed, not to the
// package `npm run` moved into.
const args = process.argv.slice(2);
const typedIn = process.env.INIT_CWD ?? process.cwd();
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((arg, i) => !arg.startsWith('-') && !['--template', '--name'].includes(args[i - 1] ?? ''));

// `m2d-editor new <folder> [--template 2d|3d] [--name "Title"] [--open]`
if (positional[0] === 'new') {
  const folder = positional[1];
  if (!folder) {
    console.error(`Usage: m2d-editor new <folder> [--template ${Object.keys(TEMPLATES).join('|')}] [--name "Title"] [--open]`);
    process.exit(1);
  }
  try {
    const made = await createProject(resolve(typedIn, folder), option('--template') ?? '2d', option('--name'));
    console.log(`m2d-editor: created ${made.name} at ${made.root}`);
    if (!args.includes('--open')) {
      const shown = relative(typedIn, made.root);
      console.log(`            open it with: m2d-editor ${shown.startsWith('..') ? made.root : shown || '.'}`);
      process.exit(0);
    }
    positional.splice(0, 2, made.root);
  } catch (error) {
    console.error(`m2d-editor: ${(error as Error).message}`);
    process.exit(1);
  }
}
const root = resolve(typedIn, positional[0] ?? '.');
const companion = new Companion({ root, watch: true });
if (!(await companion.project.exists())) {
  console.error(`m2d-editor: no such folder: ${companion.project.root}`);
  process.exit(1);
}
if (!(await companion.project.declared())) {
  const near = await findProjects(typedIn);
  console.error(`m2d-editor: ${companion.project.root} has no ${PROJECT_FILE}; a project is one game's folder.`);
  if (near.length) {
    console.error('Projects here:');
    for (const dir of near) console.error(`  ${relative(typedIn, dir) || '.'}`);
  }
  console.error('Usage: m2d-editor <project-folder>   (npm run editor <project-folder>)');
  process.exit(1);
}

// The app the host serves is this repo's own editor package.
const appRoot = fileURLToPath(new URL('../../editor', import.meta.url));
const port = Number(process.env.PORT) || await freePort();
const config = await companion.project.config();
// screenshot_scene's browser, started on the first shot.
const camera = new SceneCamera(`http://localhost:${port}/`);

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
  // The engine resolves to this workspace's copy wherever the project is:
  // a project outside the repository has no node_modules of its own here,
  // and one inside it must share the app's engine, not load a second.
  resolve: { alias: engineAlias() },
  plugins: [hostPlugin(companion, config, appRoot, port, camera)]
});

await server.listen();
console.log(`m2d-editor: ${config.name} (${companion.project.root})`);
console.log(`            http://localhost:${port}/`);
console.log(`            MCP: http://localhost:${port}/mcp`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    companion.close();
    void Promise.all([closePreview(), camera.close()]).then(() => server.close()).then(() => process.exit(0));
  });
}
