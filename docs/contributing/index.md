# Contributing

The repository is an npm workspaces monorepo.

| Workspace | Contents |
| --- | --- |
| `packages/engine` | The engine, published name `m2d-engine` |
| `examples` | The example games and the demo site |
| `docs` | This documentation site |

## Setup

Node.js 22 or later.

```bash
npm ci
npm run dev           # examples on port 3000
npm run dev:lan       # the same over HTTPS on every interface, for a browser on another machine
npm run docs:dev      # documentation site
npm test              # engine suites plus example scene validation
npm run build         # docs and demos into site/
```

Sprite generation and the Node test suite use `@napi-rs/canvas`, which installs a prebuilt binding from the npm registry. Install with optional dependencies enabled, since the binding is one.

The browser test suite needs Chromium once: `npx playwright install chromium`. See [Testing](./testing) for details and system packages.

## Making changes

- Keep engine behaviour separate from example-specific actors and rules. Behaviour another game could want belongs in a constraint.
- Use elapsed seconds for timers and movement. Check simulation changes at more than one frame rate; the [determinism contract](./determinism) says what simulation code may read, and `test/determinism.test.js` must keep passing.
- Renderer changes must keep both backends passing `npm test`. A new backend feature is either mandatory for every backend or declared through `capabilities` with callers degrading. See [Capabilities](../reference/renderer#capabilities).
- Check visual changes on both backends. Every example accepts `?renderer=canvas` and `?renderer=webgl`.
- Adding a scene JSON field means adding a descriptor to `packages/engine/src/core/sceneSchema.js` and a row to the [scene format reference](../reference/scene-format).
- Run `npm test` and `npm run build`, then check the affected demos with `npm run preview`. Check rendering, controls, scene transitions and audio after a user gesture.
- Update the documentation page that covers the change. Documentation lives only in `docs/`. See [Writing documentation](./writing-docs).
- Describe the verification steps and any known limitations in the change.

## Licensing

Original code and artwork are MIT. Keep dependency notices when adding artwork, fonts, music or recordings. Record their origin in `THIRD_PARTY_NOTICES.md`. Do not add third-party assets whose redistribution terms are unknown.
