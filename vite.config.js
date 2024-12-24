import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        platformer: resolve(__dirname, 'src/examples/platformer/index.html'),
        maze: resolve(__dirname, 'src/examples/maze/index.html'),
        physics: resolve(__dirname, 'src/examples/physics/index.html')
      }
    }
  },
  server: {
    port: 3000
  }
}); 