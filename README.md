# M2D Engine

A 2D game engine for the browser: Rapier physics behind an engine-owned API, a batched WebGL2 renderer with a Canvas 2D fallback, a fixed and deterministic simulation tick, JSON scenes validated on load, one input API for keyboard, mouse, touch and pen, and a themable UI with screens, a settings menu and a developer console.

**[Documentation](https://mert574.github.io/m2d-engine/)** · **[Live demos](https://mert574.github.io/m2d-engine/examples/)**

https://github.com/user-attachments/assets/1693e2b8-67f8-4b75-b6d7-31ce35f14397

## Quick start

Node.js 22 or later.

```bash
git clone https://github.com/mert574/m2d-engine.git
cd m2d-engine
npm install
npm run dev              # example games on http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Serve the example games |
| `npm run dev:lan` | Serve them over HTTPS on every interface, so a browser on another machine can run the 3D demos |
| `npm run build-models` | Fetch the yard's photoscanned models from Poly Haven and compile them into levels of detail. The dev server builds whatever is missing on start, so a fresh checkout takes a few minutes the first time |
| `npm test` | Engine suites in Node and headless Chromium, plus example scene validation |
| `npx playwright install chromium` | Once, for the headless-Chromium renderer suite |
| `npm run docs:dev` | Serve the documentation site |
| `npm run build` | Build docs and demos into `site/` |

The engine is on npm as [`m2d-engine`](https://www.npmjs.com/package/m2d-engine). In a Vite project: `npm install m2d-engine`. See [Getting started](https://mert574.github.io/m2d-engine/guide/getting-started).

The repository is an npm workspaces monorepo: `packages/engine` is the engine, `examples` holds the demo games, `docs` holds the documentation site. Every demo plays a different hand of the same engine — perspectives from side view, top-down, 3/4 and isometric to belt scroller, rotating camera, single-screen rooms and an auto-scroller, all on one flat, deterministic simulation.

## Documentation

Everything is on the documentation site. Start with [Getting started](https://mert574.github.io/m2d-engine/guide/getting-started), then [Your first game](https://mert574.github.io/m2d-engine/guide/first-game); [Perspectives](https://mert574.github.io/m2d-engine/guide/perspectives) is the tour of what the camera and draw order can do. The [reference](https://mert574.github.io/m2d-engine/reference/engine-options) covers every option and API. [Contributing](https://mert574.github.io/m2d-engine/contributing/) covers architecture, the determinism contract, testing and the roadmap.

The documentation sources are in [`docs/`](docs/).

## License

MIT. See [LICENSE](LICENSE). Third-party dependencies keep their own licenses. The demos use free, open art and music (CC0 and CC BY); every pack and track is credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
