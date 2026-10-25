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
      // Generate sprites for each example
      execSync('node scripts/generateSprites.js --missing platformer', { stdio: 'inherit' });
      execSync('node scripts/generateSprites.js --missing maze', { stdio: 'inherit' });
      execSync('node scripts/generateSprites.js --missing physics', { stdio: 'inherit' });
      execSync('node scripts/generateSprites.js --missing topdown', { stdio: 'inherit' });
      execSync('node scripts/generateSprites.js --missing showcase', { stdio: 'inherit' });
      console.log('Assets processed successfully');
    } catch (error) {
      console.error('Error processing assets:', error);
      throw error;
    }
  },
  writeBundle() {
    // Scene JSON contains runtime image paths that Vite cannot discover as imports.
    for (const example of ['platformer', 'maze', 'physics', 'topdown', 'doner', 'showcase']) {
      const source = resolve(__dirname, `src/examples/${example}/assets`);
      if (existsSync(source)) {
        cpSync(source, resolve(__dirname, `docs/examples/${example}/assets`), { recursive: true });
      }
    }
  }
};

export default defineConfig(({ command }) => ({
  root: 'src',
  base: command === 'serve' ? '/' : '/m2d-engine/',
  build: {
    // actor names are being minified, so we need to disable minification for now
    minify: false,
    outDir: '../docs',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        credits: resolve(__dirname, 'src/music-credits.html'),
        platformer: resolve(__dirname, 'src/examples/platformer/index.html'),
        maze: resolve(__dirname, 'src/examples/maze/index.html'),
        physics: resolve(__dirname, 'src/examples/physics/index.html'),
        topdown: resolve(__dirname, 'src/examples/topdown/index.html'),
        doner: resolve(__dirname, 'src/examples/doner/index.html'),
        showcase: resolve(__dirname, 'src/examples/showcase/index.html')
      }
    }
  },
  server: {
    port: 3000
  },
  plugins: [assetsPlugin],
  publicDir: false
}));
