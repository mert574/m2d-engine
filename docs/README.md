# m2d docs

The documentation site, built with [VitePress](https://vitepress.dev). This is the only place documentation lives.

```bash
npm run docs:dev      # from the repo root: dev server with hot reload
npm run build:docs    # from the repo root: static site into docs/dist
npm run build         # from the repo root: docs + demos into site/
```

| Path | Contents |
| --- | --- |
| `index.md` | Landing page |
| `guide/` | How to use each system |
| `examples/` | The example games index and music credits |
| `reference/` | Options, APIs and formats, in tables |
| `contributing/` | Architecture, testing, adding demos, deployment, writing style, roadmap |
| `demos/` | Runnable demo modules embedded in guide pages through the `Demo` component |
| `.vitepress/config.mjs` | Nav, sidebar, base path |
| `.vitepress/theme/` | Theme entry, the `Demo` component and custom CSS |

Writing conventions and how to embed a demo are in `contributing/writing-docs.md`.
