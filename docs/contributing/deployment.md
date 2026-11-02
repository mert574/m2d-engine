# Deployment

The site at [mert574.github.io/m2d-engine](https://mert574.github.io/m2d-engine/) is this documentation at the root and the example games under `/examples/<name>/`.

## What `npm run build` produces

1. `npm run build:docs` builds the VitePress site into `docs/dist`.
2. `npm run build:examples` builds the demos into `examples/dist` with base path `/m2d-engine/examples/`.
3. The root script copies `docs/dist` to `site/` and merges `examples/dist` into `site/examples/`, next to the examples index page the docs produce.

## The Pages workflow

`.github/workflows/pages.yml` runs on every push to `master` and on manual dispatch. It installs dependencies, installs Chromium, runs `npm test`, runs `npm run build`, uploads `site/` as the Pages artifact and deploys it. A failing test or build stops the deployment.

To enable it on a fork, set Settings, Pages, Build and deployment, Source to GitHub Actions. If the `github-pages` environment restricts branches, allow `master`. No token is needed.

## Running it manually

Actions, Deploy demo to GitHub Pages, Run workflow, select `master`. The build job is guarded on the `master` ref, so a run started from another branch does nothing.
