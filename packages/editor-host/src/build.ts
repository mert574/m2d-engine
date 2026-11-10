/**
 * Building a project into a site, and previewing it.
 *
 * A project is a Vite app: `index.html` and the module it boots. The
 * build is Vite's, run by the host with what every engine game needs —
 * the engine resolved to this workspace's copy, ES-format workers (the
 * model loader's worker imports shared modules), relative URLs so the
 * site works from any folder or host — and then the runtime assets copied
 * beside the page: scenes name their models, images and environments in
 * JSON, where Vite cannot see them as imports. What comes out is a static
 * folder (`dist/`) that any static host serves: that is the export.
 */

import { build as viteBuild, preview as vitePreview, type Alias, type PreviewServer } from 'vite';
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Project } from './project.ts';
import type { Assets } from './assets.ts';

const ENGINE = fileURLToPath(new URL('../../engine', import.meta.url));

/**
 * `m2d-engine` and `m2d-engine/...` as this workspace's engine, for the
 * editor's server and for builds: one engine, wherever the project is.
 */
export function engineAlias(): Alias[] {
  return [
    { find: /^m2d-engine$/, replacement: join(ENGINE, 'src', 'core', 'm2d.js') },
    { find: /^m2d-engine\//, replacement: join(ENGINE, 'src') + '/' }
  ];
}

export interface BuildResult {
  outDir: string;
  files: number;
  bytes: number;
  seconds: number;
  /** Runtime assets copied beside the page. */
  assets: number;
}

/** Build the project into `dist/`. `log` hears Vite's progress lines. */
export async function buildProject(project: Project, assets: Assets, log: (line: string) => void = () => {}): Promise<BuildResult> {
  const root = project.root;
  if (!existsSync(join(root, 'index.html'))) {
    throw new Error(`${root} has no index.html; a project builds from its page (the templates have one)`);
  }
  const started = performance.now();
  const outDir = join(root, 'dist');
  await viteBuild({
    configFile: false,
    root,
    base: './',
    logLevel: 'warn',
    resolve: { alias: engineAlias() },
    worker: { format: 'es' },
    publicDir: false,
    customLogger: {
      info: (message) => log(message),
      warn: (message) => log(`warning: ${message}`),
      warnOnce: (message) => log(`warning: ${message}`),
      error: (message) => log(`error: ${message}`),
      clearScreen: () => {},
      hasErrorLogged: () => false,
      hasWarned: false
    },
    build: {
      outDir,
      emptyOutDir: true,
      target: 'esnext',
      // Games register actors by name, and some code reads class names;
      // the examples build unminified for the same reason.
      minify: false
    }
  });

  // The runtime assets, at the URLs scenes name them by.
  const { basePath } = await project.config();
  const base = project.resolve(basePath);
  let copied = 0;
  for (const file of await assets.list()) {
    const from = project.resolve(file.path);
    if (!from.startsWith(base)) continue;
    const to = join(outDir, file.url);
    await mkdir(join(to, '..'), { recursive: true });
    await cp(from, to);
    copied++;
  }
  log(`copied ${copied} runtime asset${copied === 1 ? '' : 's'}`);

  let files = 0;
  let bytes = 0;
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else { files++; bytes += (await stat(full)).size; }
    }
  };
  await walk(outDir);
  return { outDir, files, bytes, assets: copied, seconds: (performance.now() - started) / 1000 };
}

let previewServer: PreviewServer | null = null;

/** Serve the built site on a free local port; one preview at a time. */
export async function previewProject(project: Project, port: number): Promise<string> {
  const outDir = join(project.root, 'dist');
  if (!existsSync(join(outDir, 'index.html'))) throw new Error('nothing built yet: build first');
  await previewServer?.close();
  previewServer = await vitePreview({
    configFile: false,
    root: project.root,
    logLevel: 'warn',
    build: { outDir },
    preview: { port, strictPort: true, host: '127.0.0.1', open: false }
  });
  return `http://localhost:${port}/`;
}

export async function closePreview(): Promise<void> {
  await previewServer?.close();
  previewServer = null;
}

/** `dist/`, project-relative, for messages. */
export function distPath(project: Project): string {
  return relative(project.root, join(project.root, 'dist')).split(sep).join('/');
}
