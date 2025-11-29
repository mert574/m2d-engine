import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';

// Custom plugin to generate sprites
const assetsPlugin = {
  name: 'assets-plugin',
  buildStart() {
    console.log('Generating sprites...');
    try {
      // Generate sprites for each example
      execSync('node scripts/generateSprites.js platformer', { stdio: 'inherit' });
      execSync('node scripts/generateSprites.js maze', { stdio: 'inherit' });
      execSync('node scripts/generateSprites.js physics', { stdio: 'inherit' });
      execSync('node scripts/generateSprites.js topdown', { stdio: 'inherit' });
      console.log('Assets processed successfully');
    } catch (error) {
      console.error('Error processing assets:', error);
      throw error;
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
        platformer: resolve(__dirname, 'src/examples/platformer/index.html'),
        maze: resolve(__dirname, 'src/examples/maze/index.html'),
        physics: resolve(__dirname, 'src/examples/physics/index.html'),
        topdown: resolve(__dirname, 'src/examples/topdown/index.html'),
        doner: resolve(__dirname, 'src/examples/doner/index.html')
      }
    }
  },
  server: {
    port: 3000
  },
  plugins: [assetsPlugin],
  publicDir: false
})); 