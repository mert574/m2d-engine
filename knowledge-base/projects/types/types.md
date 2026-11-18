# Types

Goal: the engine describes itself in types that a compiler checks, so every package that stands on it is checked against the engine rather than against a description of it. Roadmap line: "Types".

## Decisions

- **`checkJs` on the engine is a project, not a flag** (measured 18 Nov 2026): turning it on in `packages/engine/tsconfig.json` reports about 5,900 errors, most of them in the renderers (`webgpuRenderer.js`, `webglRenderer.js`, `canvasRenderer.js` and the Basis transcoder) and in `m2d.js` and `scene.js`. The toolchain is ready either way — every other package is TypeScript and `npm run typecheck` runs them all.
- **The flag is per file too.** `// @ts-check` at the top of a module checks that module alone, so the engine can be taken file by file instead of in one sitting, starting with what other packages lean on hardest (`entity.js` and `constraint.js` are the cheapest: about 16 and 5 errors).
- **Until then a JSDoc type in the engine is documentation that nothing verifies.** Fix one when a consumer proves it wrong, and keep it true to the code rather than to the intention. The kit's conversion turned up four that were wrong: a `PhysicsBody` type the physics JSDoc named and never declared, the common draw options missing from every draw method's own list, a prefab template's `dimensions` marked required, and an undocumented `options` argument ([[engine-surface]], phase 11).

## The debt this leaves

Written down so it is deleted rather than inherited (owner, 18 Nov 2026):

- **`packages/editor-core/src/engine.d.ts` (139 lines) and `packages/editor/src/ambient.d.ts` (124 lines) are hand-written descriptions of the engine's surface, and they have to go** when the engine has real types. They exist only because an unchecked JavaScript engine collapses to `any`, and they are the thing this knowledge base warns about everywhere else: a stand-in that drifts from what it stands for, silently, and then vouches for code that no longer matches the engine. Four editor-core modules pull one in with a triple-slash reference (`writer.ts`, `inspect.ts`, `descriptors.ts`, `validate.ts`).
- Deleting them is part of this project's definition of done, not a follow-up: the conversion is finished when no package describes the engine to itself.
- The kit needs nothing deleted — it derives what the engine does not say from the engine's own constructor (`ConstructorParameters<typeof Entity>`), so it tightens on its own as the engine gains types. That is the pattern to prefer for a new consumer in the meantime; see the [TypeScript contributing page](../../../docs/contributing/typescript.md) for which approach fits when.

## Backlog

- Decide the shape: `checkJs` over the JSDoc, or the engine's source converted to TypeScript as the kit's was. The kit is the worked example of the second, down to the published form (compiled JavaScript with declarations, erasable syntax, `rewriteRelativeImportExtensions`).
- Whichever way: a file-by-file order that unblocks consumers first — `entity.js`, `constraint.js`, the physics boundary, `m2d.js`, then the renderers.

Related: [[engine-surface]] (the kit's conversion and what it found), [[editor]] (the two declaration files to delete), [[working-style]] (a stand-in is checked against what it stands for)
