# Contributing

The repository is an npm workspaces monorepo.

| Workspace | Contents |
| --- | --- |
| `packages/engine` | The engine, published name `m2d-engine` |
| `packages/server` | The authoritative multiplayer host, published name `m2d-server` |
| `packages/kit` | `m2d-kit`: what games compose from that is too opinionated for the engine and too reusable for one game. TypeScript, published to npm as JavaScript with its declarations; see [The kit](../reference/kit) |
| `packages/editor-core` | The editor's headless core: the scene document, the canonical writer, the command and undo model, validation. TypeScript, no DOM |
| `packages/editor-host` | The editor's companion process: watches the project, will run the asset compilers, and serves the editor's API to AI agents over MCP |
| `packages/editor` | The editor app: DOM panels around engine viewports. TypeScript and Vite |
| `examples` | The example games and the demo site |
| `docs` | This documentation site |

## Setup

Node.js 24 or later.

```bash
npm ci
npm run dev           # examples on port 3000
npm run dev:lan       # the same over HTTPS on every interface, for a browser on another machine
npm run build-assets  # build every uncommitted asset the examples load, skipping what is there (the dev server and the site build do this themselves; the tests need it first)
npm run build-models  # just the lot's Poly Haven models and textures, at the default quality levels
npm run build-models --workspace examples -- --quality all   # at every quality level, as the dev server builds them
npm run docs:dev      # documentation site
npm run editor examples/src/yard      # the editor on one game (random port, printed; PORT= pins it)
npm run editor new my-game --template 3d   # a new project from a template
npm run editor:mcp examples/src/yard  # the MCP endpoint over stdio, when no editor is running
npm test              # typecheck, engine suites, example scene validation
npm run typecheck     # every workspace that has a tsconfig
npm run build         # docs and demos into site/
```

Sprite generation and the Node test suite use `@napi-rs/canvas`, which installs a prebuilt binding from the npm registry. Install with optional dependencies enabled, since the binding is one.

The GPU test suite draws in Node on the machine's GPU, or on Mesa's CPU drivers where there is none (`mesa-vulkan-drivers`, `libgl1-mesa-dri` and `libegl1` on Debian and Ubuntu). On Linux, `@onirenaud/node-webgl` compiles a small addon on install, which needs a C++ toolchain. The browser test tier, run on demand, needs Chromium once: `npx playwright install chromium`. See [Testing](./testing) for details and system packages.

## Making changes

- Keep engine behaviour separate from example-specific actors and rules. Behaviour another game could want belongs in a constraint.
- Use elapsed seconds for timers and movement. Check simulation changes at more than one frame rate; the [determinism contract](./determinism) says what simulation code may read, and `test/determinism.test.js` must keep passing.
- Renderer changes must keep `npm test` passing. A new backend feature is mandatory for every backend and gets its conformance tests in the same change. See [Renderer](../reference/renderer).
- Adding a scene JSON field means adding a descriptor to `packages/engine/src/core/sceneSchema.js` and a row to the [scene format reference](../reference/scene-format).
- Run `npm test` and `npm run build`, then check the affected demos with `npm run preview`. Check rendering, controls, scene transitions and audio after a user gesture.
- New packages are TypeScript and extend the shared config. The engine stays JavaScript for now. See [TypeScript](./typescript).
- Update the documentation page that covers the change. Documentation lives only in `docs/`. See [Writing documentation](./writing-docs).
- Describe the verification steps and any known limitations in the change.

## Licensing

Original code and artwork are MIT. Keep dependency notices when adding artwork, fonts, music or recordings. Record their origin in `THIRD_PARTY_NOTICES.md`. Do not add third-party assets whose redistribution terms are unknown.
