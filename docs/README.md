# m2d docs

The engine's documentation site, built with [VitePress](https://vitepress.dev).

```bash
npm run docs:dev    # from the repo root: local dev server with hot reload
npm run build       # from the repo root: full site (docs + demos) into site/
```

Content lives in `index.md` (the landing page) and `guide/*.md`; the site
configuration (nav, sidebar, base path) is `.vitepress/config.mjs`.

The built docs land in `dist/` and are deployed to the root of the GitHub
Pages site, with the demo build copied alongside under `/examples/` — see the
root `build` script and `.github/workflows/pages.yml`.
