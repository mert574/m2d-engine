# TypeScript

The repository is moving to TypeScript throughout, one phase at a time
(`knowledge-base/projects/types`). The editor packages and the kit are
TypeScript already; the engine is being converted file by file, with its
unconverted modules still JavaScript with JSDoc. The engine and the kit
publish compiled JavaScript with declarations. One toolchain checks both
languages.

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
| `module`/`moduleResolution: nodenext` | Relative imports carry their extension. One emitted file then runs in Node and in a browser with no bundler |
| `target`/`lib: ES2025`, no DOM in the base | Everything the language has shipped, as long as the infrastructure runs it — ES2025 is the floor of Node 24 and of every browser that ships WebGPU. The base stays runtime-neutral: a package that touches the DOM asks for it, so a package meant to run headless cannot reach a browser API by accident |
| `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` | Never relaxed, not even for a file mid-conversion: a `.ts` file is fully strict from its first commit |
| `verbatimModuleSyntax` | A type-only import says `import type`, so what is erased at runtime is visible in the source |
| `customConditions: ["m2d-source"]` | The workspace's packages resolve to their source; see [Inside the repo](#inside-the-repo-the-source) |
| `allowJs`, `checkJs: false` | A JavaScript module not yet converted is parsed but not checked. It leaves the base when the conversion is done |
| `noEmit` | The default. A package that publishes turns it off in its `tsconfig.build.json` |

Source that runs without a build — under Node's type stripping, or Vite —
keeps to **erasable syntax**: no enums, namespaces, parameter properties
or decorators.

## No `any`

Explicit `any` is the one debt allowed while the conversion runs, and it is
counted: `scripts/typesRatchet.ts` holds each workspace's count of explicit
`any` (oxlint's `typescript/no-explicit-any`) and of JavaScript files
against `types-baseline.json`. A count above the baseline fails `npm test`.
A count below it fails too, until the gain is locked in:

```bash
node scripts/typesRatchet.ts --update
```

Nothing that silences the compiler is allowed at all: `@ts-ignore`,
`@ts-expect-error` and `@ts-nocheck` are lint errors. Where a type is hard,
write it; where the dependency is still JavaScript, `unknown` and a
narrowing check say more than `any`.

## Commands

```bash
npm run typecheck      # every workspace, then the root scripts
npm run lint           # oxlint: the banned comments
npm run types:ratchet  # the counts against the baseline
```

`npm test` runs all three first, so a type error fails the suite before
any test does. A single package:

```bash
npm run typecheck --workspace packages/<name>
```

## Publishing a package

The engine and the kit follow one pattern. `tsconfig.json` is for
checking — it keeps the `.ts` extensions the source writes
(`allowImportingTsExtensions`) and emits nothing — and
`tsconfig.build.json` extends it for the tarball:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false, "composite": true, "outDir": "dist", "rootDir": "src",
    "declaration": true, "declarationMap": true, "sourceMap": true,
    "allowImportingTsExtensions": false, "rewriteRelativeImportExtensions": true
  },
  "include": ["src/**/*"]
}
```

`rewriteRelativeImportExtensions` turns the source's `./sky.ts` into
`./sky.js` on the way out — in the JavaScript modules that import a
converted one as well — so the emitted files load in plain Node with no
loader. `prepare` builds on install, so a fresh checkout has a `dist`.

The public API is the entries in `exports`, each a name rather than a
path, and nothing else:

```json
"./physics": {
  "m2d-source": "./src/physics.ts",
  "types": "./dist/physics.d.ts",
  "default": "./dist/physics.js"
}
```

Each entry is an `index`-style module of explicit named exports
(`packages/engine/src/physics.ts`). A module no entry exports is internal
and free to change. A test asserts what ships: every entry loads in plain
Node from `dist` and has a declaration beside it
(`packages/engine/test/entries.test.ts`, `packages/kit/test/entries.test.js`).

## Inside the repo: the source

Every entry also names its source under the `m2d-source` condition, and
everything in the repo asks for it, so a change needs no build step and no
stale `dist` is ever served:

| Who | How it asks |
| --- | --- |
| TypeScript | `customConditions` in `tsconfig.base.json` |
| Vite, Vitest, VitePress, the editor's Vite | `scripts/workspaceResolve.ts`, spread into each config |
| The editor host's server and builds | `engineAlias()`, read from the packages' exports maps |
| Plain Node under `npm run` (the server's match workers, the example scripts) | `node-options=--conditions=m2d-source` in the root `.npmrc` |

A script run as `node <file>` outside npm passes `--conditions=m2d-source`
itself, or it gets `dist`.

Vitest's `setupFiles` takes a path, not a package entry, so a package that
wants the engine's physics setup points it at a one-line local file that
imports `m2d-engine/testing/setup` (`packages/kit/test/setup.ts`).

## Importing the engine from a TypeScript package

A consumer checks against the engine's **declarations**, never its source:
compiling the engine's `.ts` under the consumer's config would hold it to
the consumer's `lib` (the kit has no DOM; the engine needs it) and report
the engine's errors as the consumer's. Each TypeScript package references
the engine's build:

```json
"references": [{ "path": "../engine/tsconfig.build.json" }]
```

and checks with `tsc -b`, which builds the engine's declarations when they
are stale and substitutes them for its source. A `tsconfig.build.json`
that extends a referencing config restates the reference: `references` is
never inherited through `extends`.

While part of the engine is JavaScript, its declarations come from its
JSDoc, and an untyped parameter declares as `any`. That is the engine's
debt, paid as each module converts. When a consumer proves a JSDoc type
wrong, fix the JSDoc, true to the code rather than to the intention — the
kit's conversion found four such gaps, and phase 0 of this one found more
(`SceneLoader` taking `null`, `static params` taking `null`, the `M2D`
registries typed as possibly undefined). No package describes the engine
to itself: where the engine says too little, derive the type from what it
does say rather than writing a second description that drifts:

```ts
export type ActorBody = ConstructorParameters<typeof Entity>[0];
```

## Running TypeScript without a build

Node 24 runs `.ts` directly by stripping types, which is why the scripts
in `scripts/` and `examples/scripts/` run with no build step. Relative
imports carry a `.ts` extension (`allowImportingTsExtensions`), because
stripping runs the file the import names and never rewrites it. Node
refuses to strip a file under `node_modules`, which is one more reason a
published package ships `dist`; inside the repo the workspace links
resolve to `packages/`, so it never applies.

## The engine's conversion

A module converts by becoming `.ts` under the strict config, with its
JSDoc types turned into TypeScript and its prose kept. The JavaScript
modules that import it change their import to `.ts`. Two rules make the
conversion behave exactly as the JavaScript did:

- **A field a base constructor sets is `declare`d in the subclass.** With
  `target: ES2025`, `hp: number;` in a subclass defines the field as
  `undefined` after `super()` returns, wiping what the base set. Write
  `declare hp: number;`.
- **A narrowing helper must keep the old behaviour for every value**, not
  only the expected ones; where a JavaScript property read coerced its key,
  the TypeScript does too (`variants[String(tag)]`).
- **An in-range index asserts rather than branches.** `noUncheckedIndexedAccess`
  types every element read as possibly undefined, including a typed array's
  and a tuple's under a variable index. In the numeric kernels — a flat
  `[x, y, x, y]` coordinate array, a sixteen-float matrix, a packed particle
  buffer — the loop bounds already prove the index, so the read says so
  (`positions[2 * i]!`) instead of inventing a fallback that would change
  what a malformed input does. Where a shape is fixed and small, a tuple
  type (`Mat2D`, `Rgba`) removes the question instead; prefer that.
- **A resource that exists exactly while the renderer is ready** (`gl`, the
  batch, the passes) is read through `!` after the `#ready` check that
  guards every entry point, rather than re-checking each one.

The vendored Basis transcoder stays JavaScript, shipped as is, with a
declaration of the calls the engine makes
(`src/core/renderers/webgpu/basis/basis_transcoder.d.ts`).
