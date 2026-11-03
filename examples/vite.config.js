import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { cpSync, existsSync } from 'node:fs';

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
      console.log('Assets processed successfully');
    } catch (error) {
      console.error('Error processing assets:', error);
      throw error;
    }
  },
  writeBundle() {
    // Scene JSON contains runtime image paths that Vite cannot discover as imports.
    for (const example of ['platformer', 'maze', 'physics', 'topdown', 'showcase']) {
      for (const folder of ['assets', 'textures']) {
        const source = resolve(import.meta.dirname, `src/${example}/${folder}`);
        if (existsSync(source)) {
          cpSync(source, resolve(import.meta.dirname, `dist/${example}/${folder}`), { recursive: true });
        }
      }
    }
  }
};

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
        physics: resolve(import.meta.dirname, 'src/physics/index.html'),
        topdown: resolve(import.meta.dirname, 'src/topdown/index.html'),
        circuit: resolve(import.meta.dirname, 'src/circuit/index.html'),
        showcase: resolve(import.meta.dirname, 'src/showcase/index.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true
  },
  plugins: [assetsPlugin],
  publicDir: false
}));
