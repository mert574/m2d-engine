# Troubleshooting

## Game code

| Symptom | Cause |
| --- | --- |
| A scene fails to load with `SceneValidationError` | The message names the field. Common causes are an unregistered actor, a prefab or sprite sheet name that does not match or a misspelled key |
| Collisions do nothing | `body.entity` must be set. `Entity`'s constructor sets it. A body created by hand and never wrapped in an entity has none |
| Projectiles pass through walls | The projectile's collision mask must include the `default` category. `Platform` sets no category |
| The camera does not follow the player | The entity's `name` must be exactly `Player` |
| Enemies shoot through walls | Check line of sight with `game.physics.raycast` before firing |
| Movement speed changes with frame rate | Set velocity in px/s and scale changes by `deltaTime`. Do not count frames |
| A key binding does nothing | Bindings are physical codes such as `KeyW`, `Space` and `Digit1`, never characters |
| Clicking an entity does nothing | It needs an `Interactive` constraint. If it has one, something above it in the overlay or UI band may be consuming the event |
| A removed entity still catches clicks | Call `entity.destroy()` so its `Interactive` constraint unregisters. `game.reset()` does this for every entity |
| Motion stair-steps on a high refresh display | Draw with `renderPosition` and `renderAngle`, not `position` |
| A character body jams in a corridor | The controller keeps a small gap on each side. Make the body narrower than the corridor |
| A moving platform drops its rider at each stop | Give `PathFollow` an `acceleration` low enough that friction can carry the rider |
| The canvas blurs or ignores resizes | Give the canvas a CSS size. Do not size it from its own attributes or use `object-fit` |
| Annotations turn into stairs at low resolution | Draw them through `game.worldOverlay` |
| The settings menu never appears in a custom loop | Call `game.ui.update(deltaTime)` and then `game.drawOverlays(deltaTime)` at the end of each frame |

## Development environment

| Symptom | Fix |
| --- | --- |
| `npm run test:browser` fails with `error while loading shared libraries` | Install Chromium's system libraries. See [Testing](./testing#the-browser-project) |
| `navigator.gpu` is undefined when a 3D demo is opened from another machine | WebGPU exists only in a secure context, and `http://<lan-ip>:3000` is not one. Run `npm run dev:lan`, which serves HTTPS on every interface with a self-signed certificate from `examples/scripts/devCert.mjs`, and open the `Network:` URL it prints. The browser warns about the certificate once; accept it, or import `examples/.certs/dev.crt` into the other machine's trust store. The certificate names this machine's current addresses and is regenerated when they change |
| The dev server takes minutes to start, or the lot has no trees | The 3D models are not in git: `npm run dev` fetches about 3 GB from Poly Haven and compiles it on first start at every quality level its settings offer (`examples/scripts/buildModels.mjs --missing --quality all`), once per checkout, and again once when the compiler's `FORMAT` or the yard's quality levels change. Downloads run two at a time and compiling runs four models at a time (fewer if memory is short; `--jobs N` or `M2D_BUILD_JOBS` overrides), each encoding its textures on its share of the cores (`M2D_ENCODE_THREADS`), with compiling starting as the first files land. On sixteen cores the whole set compiles at every quality level in about eight minutes once downloaded, and holds a little over 3 GB. A source file already on disk with the right checksum is never fetched again, and nothing deletes one. Offline, the yard still runs; the lot shows walls and primitives only. `npm run build-models <id>` rebuilds one model; `--download-only` fetches without compiling |
| `npm test` fails with the audit "finds nothing missing" and a list of missing files | The examples' assets are built, not committed, and the tests do not build them: run `npm run build-assets` first, which does every step the dev server does and skips what is already on disk. CI runs the same command behind a cache of the built assets (`.github/actions/example-assets`) |
| Texture or model quality changes nothing, and the console warns that a model failed to load at the new quality | The model has no file at that level, so the one already loaded stays. The dev server builds every level; `npm run build`, the tests and CI build the defaults only. Run `npm run build-models -- --quality all` in `examples/` |
| Two dev servers fight over a port | Set `PORT=<n>`; with it set, a busy port is an error instead of a silent hop to the next one. Check `ss -ltnp` for a free one first |
| The browser suite reports WebGL2 unavailable | Chromium is running without the SwiftShader flags from `vitest.browser.config.js`, `M2D_BROWSER_FLAGS` names flags this machine's GPU cannot use, or `M2D_BROWSER` points at a browser without WebGL2 |
| The gpu suite fails on `navigator.gpu` or finds no WebGPU adapter | Dawn found no Vulkan device. Install Mesa's Vulkan drivers (`mesa-vulkan-drivers` on Debian and Ubuntu), which include the lavapipe CPU device. See [Testing](./testing#the-gpu-project) |
| The gpu suite reports no WebGL2 context | ANGLE found no OpenGL or Vulkan driver. Install `libgl1-mesa-dri` and `libegl1`, or pick a backend with `NODE_WEBGL_BACKEND` |
| `@onirenaud/node-webgl` fails to install on Linux | It compiles a small addon on install, which needs Python, `make` and a C++ compiler (`build-essential` on Debian and Ubuntu) |
| The showcase's generated sprites are missing or stale | Run `npm run generate-sprites`. The dev server only generates what is missing, and only the renderer showcase uses generated art; the games ship committed textures |
| `@napi-rs/canvas` fails to install | Install with optional dependencies enabled. The platform binding is one |
| A deployed 2D demo reports `RuntimeError: unreachable` at `this.angle` on iOS Safari, followed by a Rust aliasing error | Update to a build that keeps the Rapier rotation result explicitly single precision. The first trap leaves Rapier's rigid-body set borrowed, causing the second error. Confirm the fix on the deployed origin or an equivalent HTTPS page on the device |
| A node test fails with `RuntimeError: unreachable` inside `rapier_wasm2d.js` on the first physics step | The test installed a `window` global without `performance`. Rapier reads its clock through `window.performance` when `window` exists. Use `installWindowStub()` from `test/helpers/environment.js`. The panic poisons the WASM module, so every later step in that worker fails too |
