// The second half of `npm run build`: copy into `dist/` the files tsc does
// not emit — the UI fonts and the vendored Basis transcoder, which their
// modules load from beside themselves with `new URL(..., import.meta.url)`.
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const dir of ['core/ui/fonts', 'core/renderers/webgpu/basis']) {
  cpSync(`${root}src/${dir}`, `${root}dist/${dir}`, {
    recursive: true,
    filter: (path) => !path.endsWith('.d.ts') && !path.endsWith('.md')
  });
}

// tsc's `rewriteRelativeImportExtensions` covers import specifiers only, so
// the worker URL's `.ts` is rewritten here to the emitted `.js`.
import { readFileSync, writeFileSync } from 'node:fs';
const loader = `${root}dist/core/modelLoader.js`;
writeFileSync(loader, readFileSync(loader, 'utf8').replace("new URL('./gltfWorker.ts'", "new URL('./gltfWorker.js'"));
