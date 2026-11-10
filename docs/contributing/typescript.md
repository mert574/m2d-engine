# TypeScript

The engine is plain JavaScript with JSDoc. New packages are TypeScript.
Both are checked by one toolchain, so moving the engine across later is a
flag rather than a decision.

## The shared config

`tsconfig.base.json` at the repository root holds every setting that is
true of the whole monorepo. A package's own `tsconfig.json` extends it and
adds only what is particular to that package: its `include`, its `lib`,
and whether it emits.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2025", "DOM"] },
  "include": ["src/**/*.ts"]
}
```

Settings worth knowing, and why:

| Setting | Why |
| --- | --- |
| `module`/`moduleResolution: nodenext` | Relative imports carry their `.js` extension, which is what the engine's source already writes. One emitted file then runs in Node and in a browser with no bundler, which is the same no-build rule the engine package follows |
| `target`/`lib: ES2025`, no DOM in the base | Everything the language has shipped, as long as the infrastructure runs it — ES2025 is the floor of Node 24 and of the Chromium the 3D renderer requires. The base stays runtime-neutral: a package that touches the DOM asks for it, so a package meant to run headless cannot reach a browser API by accident |
| `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` | A new package is cheaper to write strictly than to tighten later |
| `verbatimModuleSyntax` | A type-only import says `import type`, so what is erased at runtime is visible in the source |
| `allowJs`, `checkJs: false` | JavaScript is parsed but not checked, which is the state the engine is in today |
| `noEmit` | The default. A package that publishes turns it off and sets its `outDir` and `declaration` |

Decorators are usable in TypeScript packages — tsc has compiled the
standard (stage 3) semantics since 5.0 — but they are not part of any
shipped ECMAScript edition yet, so they exist only where tsc has run,
never in plain `.js`.

## Commands

```bash
npm run typecheck      # every workspace that has one, from the root
```

`npm test` runs it first, so a type error fails the suite before any test
does.

A single package:

```bash
npm run typecheck --workspace packages/<name>
```

## Importing the engine from a TypeScript package

The engine is unchecked JavaScript, so its modules would otherwise
collapse to `any`. The editor packages each declare the engine surface
they use — `packages/editor-core/src/engine.d.ts`,
`packages/editor/src/ambient.d.ts` — precisely, and shrink those files to
nothing when the engine gains real types.

One rule that is easy to get wrong: a package consumed **from source** by
another package is compiled under *that* package's `tsconfig`, so
ambient declarations listed only in its own `include` are invisible.
Pull them in with a triple-slash reference from the files that need
them, which travels with the source wherever it is compiled:

```ts
/// <reference path="./engine.d.ts" />
import { SceneLoader } from 'm2d-engine/core/sceneLoader.js';
```

## Running TypeScript without a build

Node 24 runs `.ts` directly by stripping types, which is why the
generator scripts in `examples/scripts/` can `import { writeScene } from
'm2d-editor-core'` with no build step. Two conditions come with it:
source that runs this way keeps to **erasable syntax** — no enums,
namespaces, parameter properties or decorators — and relative imports
carry a `.ts` extension (`allowImportingTsExtensions`), because stripping
runs the file the import names and never rewrites it. A package that
starts publishing compiles with `rewriteRelativeImportExtensions`.

## The engine

`packages/engine/tsconfig.json` exists and has `checkJs: false`. It is a
placeholder: the Types item in the [roadmap](./roadmap) is the decision
about whether to check the engine's JSDoc or move the engine to
TypeScript, and this file is here so that whichever way it goes, the
toolchain is not also in question. Until then the engine's typecheck only
proves the config chain resolves.
