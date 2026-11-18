# Asset caching

Goal: an asset is downloaded once, and again only when it changed. Roadmap line: "Asset caching".

## Decisions

- **Content-hashed URLs** for every asset, emitted by the compiler and recorded in the manifest: a hashed file never changes, so it may be cached forever. GitHub Pages's short cache lifetime stops mattering.
- **A service worker serves them cache-first from Cache Storage**, and drops entries a new build no longer names.
- The focus is the download cache. Already-cached visits and micro optimizations are out of scope (owner, 17 Nov 2026).
- **Not the same layer as the engine's image cache** ([[engine-surface]], phase 10): that one keeps a decoded image for the life of a game so a level entered twice decodes once. This project is about what crosses the network at all.

## Plan

To be written.

## Backlog

## Record

Related: [[3d]] (the compiler and manifest), [[editor]] (the dev server must bypass it)
