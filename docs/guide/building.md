# Building

A game built with the engine is a static site. This page covers the build with Vite and what to check in the result.

## Build

```bash
npm run build
npx vite preview
```

Vite writes the site into `dist/`. The physics module is a separate chunk of about 3.4 MB, 1.3 MB compressed, and is fetched when `initPhysics()` runs. The WASM binary is embedded in that chunk, so no server configuration for `.wasm` files is needed.

Top-level `await` in the entry module needs a build target that supports it. Vite 7 and later use one by default. On an older Vite, set `build.target` to `es2022` or move the startup into an async function.

## Base path

A site served from a sub-path, such as GitHub Pages at `https://user.github.io/repo/`, needs the path in two places.

```javascript
// vite.config.js
export default { base: '/repo/' };
```

```javascript
new M2D(canvas, { basePath: '/repo/' });
```

`base` makes Vite emit asset URLs under the sub-path. `basePath` does the same for sprite sheet URLs in scene JSON, which Vite cannot see. Rather than hardcoding both environments, derive it: `basePath: import.meta.env.BASE_URL` follows whatever `base` the current server uses, so the same code runs on the dev server and when published. The example games do this, appending their own folder name.

## Checklist

- The canvas has a CSS size. The engine sizes its drawing buffer from the element.
- `?renderer=canvas` runs the game on the Canvas backend, which is what a visitor without WebGL2 sees.
- Scene JSON `url` fields resolve under `basePath` on the published site.
