# TypeScript

The engine is plain JavaScript with JSDoc. Every other package is
TypeScript, and the kit is the one that publishes: it ships compiled
JavaScript with its declarations. Both languages are checked by one
toolchain.

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
| `target`/`lib: ES2025`, no DOM in the base | Everything the language has shipped, as long as the infrastructure runs it — ES2025 is the floor of Node 24 and of every browser that ships WebGPU. The base stays runtime-neutral: a package that touches the DOM asks for it, so a package meant to run headless cannot reach a browser API by accident |
| `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` | A new package is cheaper to write strictly than to tighten later |
| `verbatimModuleSyntax` | A type-only import says `import type`, so what is erased at runtime is visible in the source |
| `allowJs`, `checkJs: false` | JavaScript is parsed but not checked, which is the state the engine is in today |
| `noEmit` | The default. A package that publishes turns it off and sets its `outDir` and `declaration`; `packages/kit/tsconfig.build.json` is the worked example |

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

## Publishing a TypeScript package

The kit is the pattern. Its `tsconfig.json` is for checking — it keeps the
`.ts` extensions the source writes (`allowImportingTsExtensions`) and
emits nothing — and `tsconfig.build.json` extends it for the tarball:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false, "outDir": "dist", "rootDir": "src",
    "declaration": true, "declarationMap": true, "sourceMap": true,
    "allowImportingTsExtensions": false, "rewriteRelativeImportExtensions": true
  },
  "include": ["src/**/*"]
}
```

`rewriteRelativeImportExtensions` turns the source's `./sky.ts` into
`./sky.js` on the way out, so the emitted files load in plain Node with no
loader. The package's `exports` point each entry at its `dist` file and
its declaration, `files` ships `dist` and `src` (the source maps point
back at the source), and `prepare` builds on install so a fresh checkout
of the monorepo has a `dist` for anything that loads the package outside a
bundler — a headless run, the server. Inside the repo the examples, the
docs demos and the editor host alias the package to its source instead, so
a change needs no build step and no stale `dist` can be served.

A test asserts what ships: every entry loads in plain Node, and a
declaration exists beside it (`packages/kit/test/entries.test.js`).

## Importing the engine from a TypeScript package

The engine is unchecked JavaScript, so parts of its surface collapse to
`any`. There are two ways to live with that, and which fits depends on
how much precision the consumer needs.

The editor packages each declare the engine surface they use —
`packages/editor-core/src/engine.d.ts`, `packages/editor/src/ambient.d.ts`
— precisely, and shrink those files to nothing when the engine gains real
types.

The kit instead takes what the engine's own source says, and nothing more:
its classes extend the engine's, so inference carries the members, and
where the engine says nothing (an actor's `body` and `sprite`), the kit
derives the type from the engine's own constructor rather than writing a
second description of it that could drift:

```ts
export type ActorBody = ConstructorParameters<typeof Entity>[0];
```

The rule of thumb: declare the surface when being wrong is expensive and
the surface is small; derive it when the engine is the only authority and
the day it says more should tighten you automatically.

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

`packages/engine/tsconfig.json` has `checkJs: false`, and the engine's
typecheck only proves the config chain resolves.

Turning it on is one flag and about 5,900 errors (measured, Nov 2026),
most of them in the renderers and in `m2d.js` — so checking the engine is
a project of its own, not the tail of another one. It stays the Types item
in the [roadmap](./roadmap). What makes it tractable is that the flag is
per file as well: `// @ts-check` at the top of a module checks that module
alone, so the engine can be taken file by file, starting with what other
packages lean on hardest.

Until then, a JSDoc type in the engine is documentation that nothing
verifies. Fix one when a consumer proves it wrong — the kit's conversion
turned up four such gaps, from a `PhysicsBody` type the JSDoc named but
never declared to draw options documented in prose and missing from every
method's own list — and keep them true to the code rather than to the
intention.
