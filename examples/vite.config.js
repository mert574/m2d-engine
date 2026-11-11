import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { ensureDevCert } from './scripts/devCert.mjs';

// Custom plugin to generate sprites
const assetsPlugin = {
  name: 'assets-plugin',
  transformIndexHtml(html) {
    return html.replace(/\r\n?/g, '\n');
  },
  buildStart() {
    console.log('Generating sprites...');
    try {
      // Only the renderer showcase generates sprites: the tiny textures its
      // batching stress test needs. The games draw in code or ship textures.
      execSync('node scripts/generateSprites.js --missing showcase', { stdio: 'inherit' });
      execSync('node scripts/generateDevTextures.mjs --missing', { stdio: 'inherit' });
      execSync('node scripts/generateDevModels.mjs --missing', { stdio: 'inherit' });
      // The lot's photoscanned models are fetched and compiled, never
      // committed; the first run of a fresh checkout takes a few minutes.
      execSync('node scripts/buildModels.mjs --missing', { stdio: 'inherit' });
      // Ember Valley's painted-tile sheet and coin strip (E8): fetched
      // free art, seeded once — swapped-in local art is never overwritten.
      execSync('node scripts/buildPlatformerArt.mjs --missing', { stdio: 'inherit' });
      // The laid-out scenes are seeds: built once by rule, edited from then
      // on, so a builder only writes a scene that is not there.
      for (const builder of ['Grove', 'Keep', 'Row', 'Drift', 'Lot']) {
        execSync(`node scripts/build${builder}Scene.mjs --missing`, { stdio: 'inherit' });
      }
      console.log('Assets processed successfully');
    } catch (error) {
      console.error('Error processing assets:', error);
      throw error;
    }
  },
  writeBundle() {
    // Scene JSON contains runtime image paths that Vite cannot discover as imports.
    for (const example of ['platformer', 'maze', 'physics', 'topdown', 'oblique', 'iso', 'belt', 'drift', 'showcase', 'yard']) {
      for (const folder of ['assets', 'textures', 'models']) {
        const source = resolve(import.meta.dirname, `src/${example}/${folder}`);
        if (existsSync(source)) {
          cpSync(source, resolve(import.meta.dirname, `dist/${example}/${folder}`), { recursive: true });
        }
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
