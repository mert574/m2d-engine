# M2D Engine

A 2D game engine for the browser. Rapier 2D physics, a WebGL2 renderer with a Canvas 2D fallback, JSON scenes and one input API for keyboard, mouse, touch and pen.

**[Documentation](https://mert574.github.io/m2d-engine/)** · **[Live demos](https://mert574.github.io/m2d-engine/examples/)**

https://github.com/user-attachments/assets/1693e2b8-67f8-4b75-b6d7-31ce35f14397

## Quick start

Node.js 22 or later.

```bash
git clone https://github.com/mert574/m2d-engine.git
cd m2d-engine
npm install
npm run generate-sprites
npm run dev              # example games on http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Serve the example games |
| `npm test` | Engine suites in Node and headless Chromium, plus example scene validation |
| `npm run docs:dev` | Serve the documentation site |
| `npm run build` | Build docs and demos into `site/` |

The engine is on npm as [`m2d-engine`](https://www.npmjs.com/package/m2d-engine). In a Vite project: `npm install m2d-engine`. See [Getting started](https://mert574.github.io/m2d-engine/guide/getting-started).

The repository is an npm workspaces monorepo: `packages/engine` is the engine, `examples` holds the demo games, `docs` holds the documentation site.

## Documentation

Everything is on the documentation site. Start with [Getting started](https://mert574.github.io/m2d-engine/guide/getting-started), then [Your first game](https://mert574.github.io/m2d-engine/guide/first-game). The [reference](https://mert574.github.io/m2d-engine/reference/engine-options) covers every option and API. [Contributing](https://mert574.github.io/m2d-engine/contributing/) covers architecture, testing and the roadmap.

The documentation sources are in [`docs/`](docs/).

## License

MIT. See [LICENSE](LICENSE). Third-party dependencies keep their own licenses. Demo music by Kevin MacLeod is CC BY 4.0; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
