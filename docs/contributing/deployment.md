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

## Publishing to npm

`.github/workflows/publish.yml` publishes `m2d-engine` when a GitHub release is published. It checks that the release tag matches `v` followed by the version in `packages/engine/package.json`, runs the full test suite and publishes the engine workspace. Prereleases are rejected. The workflow uses Node.js 24 and npm trusted publishing with OIDC.

In the npm package settings, add a GitHub Actions trusted publisher with user `mert574`, repository `m2d-engine` and workflow filename `publish.yml`. Leave the environment empty and allow `npm publish`. No npm token secret is needed. A new connection must complete its first publish within two days.

For a release, update the engine package version and lockfile, commit the changes and publish a GitHub release with a matching tag such as `v1.1.0`. The tagged commit must contain the publishing workflow and package repository metadata.

For an existing release whose tag predates this setup, merge the setup first, then open Actions, Publish to npm, Run workflow and select the branch containing the exact code and package version to publish. A manual run publishes the selected ref and does not create or change a GitHub release. Publishing an existing npm version fails, so check the registry before retrying a successful run.
