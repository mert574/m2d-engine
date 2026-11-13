import { defineConfig } from 'vitepress';

// The docs deploy to the root of the GitHub Pages site. The demo build is
// merged into /examples/ next to the examples index page (see the root
// `build` script).

export default defineConfig({
  title: 'M2D Engine',
  description: 'A 2D and 3D game engine for the browser with Rapier physics and WebGL2 and WebGPU rendering',
  base: '/m2d-engine/',
  outDir: 'dist',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['README.md', 'demos/**'],
  // The engine's model-loader worker imports shared modules, which only an
  // ES-format worker bundle can hold.
  vite: { worker: { format: 'es' } },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'Reference', link: '/reference/engine-options', activeMatch: '/reference/' },
      { text: 'Contributing', link: '/contributing/', activeMatch: '/contributing/' },
      { text: 'Examples', link: '/examples/', activeMatch: '/examples/' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Start',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Your first game', link: '/guide/first-game' }
          ]
        },
        {
          text: 'Building a game',
          items: [
            { text: 'Scenes', link: '/guide/scenes' },
            { text: 'Entities and constraints', link: '/guide/entities' },
            { text: 'Physics', link: '/guide/physics' },
            { text: 'Input', link: '/guide/input' },
            { text: 'Touch', link: '/guide/touch' },
            { text: 'Camera', link: '/guide/camera' },
            { text: 'Perspectives', link: '/guide/perspectives' },
            { text: 'Display and resolution', link: '/guide/display' },
            { text: 'UI', link: '/guide/ui' },
            { text: 'Sprites and animation', link: '/guide/sprites' },
            { text: 'Sound', link: '/guide/sound' },
            { text: 'Game loop', link: '/guide/game-loop' },
            { text: 'Time, ticks and timers', link: '/guide/time' },
            { text: 'Headless games', link: '/guide/headless' },
            { text: 'Multiplayer', link: '/guide/multiplayer' },
            { text: 'Building', link: '/guide/building' },
            { text: 'The editor', link: '/guide/editor' }
          ]
        },
        {
          text: 'More',
          items: [
            { text: 'Example games', link: '/examples/' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Example games', link: '/examples/' },
            { text: 'Music credits', link: '/examples/music-credits' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Engine options', link: '/reference/engine-options' },
            { text: 'Scene format', link: '/reference/scene-format' },
            { text: 'Asset manifest', link: '/reference/asset-manifest' },
            { text: 'Physics API', link: '/reference/physics' },
            { text: 'Renderer API', link: '/reference/renderer' },
            { text: 'Input events', link: '/reference/input-events' },
            { text: 'UI components', link: '/reference/ui' },
            { text: 'Developer console', link: '/reference/console' },
            { text: 'Built-in actors', link: '/reference/actors' },
            { text: 'Built-in constraints', link: '/reference/constraints' },
            { text: 'Gameplay helpers', link: '/reference/gameplay' }
          ]
        }
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Overview', link: '/contributing/' },
            { text: 'Architecture', link: '/contributing/architecture' },
            { text: 'Determinism', link: '/contributing/determinism' },
            { text: 'Testing', link: '/contributing/testing' },
            { text: 'TypeScript', link: '/contributing/typescript' },
            { text: 'Writing a renderer backend', link: '/contributing/renderer-backend' },
            { text: 'Adding a demo', link: '/contributing/adding-a-demo' },
            { text: 'Deployment', link: '/contributing/deployment' },
            { text: 'Writing documentation', link: '/contributing/writing-docs' },
            { text: 'Troubleshooting', link: '/contributing/troubleshooting' },
            { text: 'Roadmap', link: '/contributing/roadmap' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mert574/m2d-engine' }
    ],
    editLink: {
      pattern: 'https://github.com/mert574/m2d-engine/edit/master/docs/:path',
      text: 'Edit this page on GitHub'
    },
    search: {
      provider: 'local'
    },
    footer: {
      message: 'Released under the MIT License.'
    }
  }
});
