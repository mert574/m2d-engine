import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { ensureDevCert } from './scripts/devCert.mjs';
import { qualityVariants } from 'm2d-engine/core/quality.js';

/**
 * The folders an example's models are built into at quality levels other
 * than the defaults: the dev server's, which the site does not ship.
 */
function variantFolders(example) {
  const projectFile = resolve(import.meta.dirname, `src/${example}/m2d.project.json`);
  if (!existsSync(projectFile)) return new Set();
  const { quality } = JSON.parse(readFileSync(projectFile, 'utf8'));
  return new Set(qualityVariants(quality).map((variant) => variant.folder).filter(Boolean));
}

/** `serve` for the dev server, `build` for the site. */
let command = 'build';

// Custom plugin to generate sprites
const assetsPlugin = {
  name: 'assets-plugin',
  config(_, env) {
    command = env.command;
  },
  transformIndexHtml(html) {
    return html.replace(/\r\n?/g, '\n');
  },
  buildStart() {
    console.log('Building the assets that are not committed...');
    try {
      // The steps themselves are in scripts/buildAssets.mjs, so the tests
      // and CI can build the same assets without Vite. The dev server
      // builds the lot at every quality level its settings menu offers;
      // the site ships the defaults, and offers none (see yard/main.js).
      execSync(`node scripts/buildAssets.mjs --missing --quality ${command === 'serve' ? 'all' : 'default'}`, { stdio: 'inherit' });
      console.log('Assets processed successfully');
    } catch (error) {
      console.error('Error processing assets:', error);
      throw error;
    }
  },
  writeBundle(output) {
    // Scene JSON names runtime files (images, models, sounds, music) that
    // Vite cannot discover as imports, so each example's folders of them
    // are copied beside its page in the build's output folder.
    const out = output.dir ?? resolve(import.meta.dirname, 'dist');
    const examples = readdirSync(resolve(import.meta.dirname, 'src'))
      .filter((name) => existsSync(resolve(import.meta.dirname, `src/${name}/index.html`)));
    for (const example of examples) {
      const variants = variantFolders(example);
      // A library's raw downloads (`library/sources`) are the editor's, not
      // the game's; the models' other quality levels are the dev server's.
      const shipped = (path) => !path.includes('/library/sources') && !path.split('/').some((part) => variants.has(part));
      for (const folder of ['assets', 'textures', 'models', 'sounds', 'music', 'library']) {
        const source = resolve(import.meta.dirname, `src/${example}/${folder}`);
        if (existsSync(source)) cpSync(source, resolve(out, `${example}/${folder}`), { recursive: true, filter: shipped });
      }
    }
  }
};

// The dev server on another machine. WebGPU (`navigator.gpu`) exists only in
// a secure context, so testing a 3D demo from a second computer on the LAN
// needs HTTPS as well as a reachable host. `npm run dev:lan` sets both.
//
//   M2D_HOST=0.0.0.0   listen on every interface (default: localhost only)
//   M2D_HTTPS=1        serve HTTPS with the self-signed cert from scripts/devCert.mjs
//   PORT=3100          the port; with PORT set, a busy port is an error, not a
//                      silent hop to the next one, since several agents share
//                      this machine and each must know which server is theirs
function devServer() {
  const host = process.env.M2D_HOST;
  const https = process.env.M2D_HTTPS === '1';
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const server = {
    port,
    strictPort: Boolean(process.env.PORT),
    host: host || undefined,
    // A LAN server is for a browser elsewhere; do not open one here.
    open: !host && !https
  };
  if (https) {
    const { keyPath, certPath } = ensureDevCert();
    server.https = { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  }
  return server;
}

export default defineConfig(({ command }) => ({
  root: 'src',
  // Deployed under the docs site: the demo hub lives at /m2d-engine/examples/.
  base: command === 'serve' ? '/' : '/m2d-engine/examples/',
  build: {
    // actor names are being minified, so we need to disable minification for now
    minify: false,
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        // The published index at /examples/ is docs/examples/index.md; src/index.html
        // is only the dev server's landing page.
        platformer: resolve(import.meta.dirname, 'src/platformer/index.html'),
        maze: resolve(import.meta.dirname, 'src/maze/index.html'),
        scroller: resolve(import.meta.dirname, 'src/scroller/index.html'),
        physics: resolve(import.meta.dirname, 'src/physics/index.html'),
        topdown: resolve(import.meta.dirname, 'src/topdown/index.html'),
        circuit: resolve(import.meta.dirname, 'src/circuit/index.html'),
        oblique: resolve(import.meta.dirname, 'src/oblique/index.html'),
        iso: resolve(import.meta.dirname, 'src/iso/index.html'),
        belt: resolve(import.meta.dirname, 'src/belt/index.html'),
        drift: resolve(import.meta.dirname, 'src/drift/index.html'),
        showcase: resolve(import.meta.dirname, 'src/showcase/index.html'),
        yard: resolve(import.meta.dirname, 'src/yard/index.html')
      }
    }
  },
  server: devServer(),
  // The engine's model-loader worker imports shared modules, which only an
  // ES-format worker bundle can hold.
  worker: { format: 'es' },
  plugins: [assetsPlugin],
  publicDir: false
}));
