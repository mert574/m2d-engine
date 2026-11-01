import { defineConfig } from 'vitepress';

// The docs deploy to the root of the GitHub Pages site; the demo build is
// copied alongside them under /examples/ (see the root `build` script).
const DEMOS = 'https://mert574.github.io/m2d-engine/examples/';

export default defineConfig({
  title: 'M2D Engine',
  description: 'A lightweight 2D game engine with Rapier 2D physics and WebGL2 rendering',
  base: '/m2d-engine/',
  outDir: 'dist',
  cleanUrls: true,
  srcExclude: ['README.md'],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Demos', link: DEMOS },
      { text: 'Roadmap', link: 'https://github.com/mert574/m2d-engine/blob/master/ROADMAP.md' }
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Scenes', link: '/guide/scenes' },
          { text: 'Physics', link: '/guide/physics' },
          { text: 'Input', link: '/guide/input' },
          { text: 'Display & UI', link: '/guide/display' },
          { text: 'Example Games', link: '/guide/examples' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mert574/m2d-engine' }
    ],
    search: {
      provider: 'local'
    },
    footer: {
      message: 'Released under the MIT License.'
    }
  }
});
