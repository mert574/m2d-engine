/**
 * Builds the compiled Poly Haven models the examples load:
 * `node scripts/buildModels.mjs [--missing] [ids...]`.
 *
 * Neither the sources nor the compiled files are committed — a scan is
 * hundreds of megabytes and the repository is not where that belongs —
 * so this fetches what `fetchPolyHaven.mjs` lists and compiles it with
 * `compileModel.mjs`, each model in a process of its own (a tree needs a
 * few gigabytes while it is cut). The dev server runs it with `--missing`
 * at start, as it generates the renderer showcase's sprites, so a fresh
 * checkout builds the lot on first run: about 1.5 GB fetched and a few
 * minutes of compiling, once.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASSETS, fetchAsset } from './fetchPolyHaven.mjs';
import { OUT_DIR } from './compileModel.mjs';

const args = process.argv.slice(2);
const missingOnly = args.includes('--missing');
const ids = args.filter((a) => !a.startsWith('--'));
const wanted = (ids.length ? ids : Object.keys(ASSETS)).filter((id) => !missingOnly || !existsSync(resolve(OUT_DIR, `${id}.glb`)));

if (!wanted.length) {
  console.log('Models are up to date');
} else {
  console.log(`Building ${wanted.length} model${wanted.length === 1 ? '' : 's'} (fetching sources from Poly Haven, then compiling)...`);
  for (const id of wanted) {
    const { bytes, name } = await fetchAsset(id, ASSETS[id] ?? '2k');
    process.stdout.write(`  ${id} (${name}, ${(bytes / 1e6).toFixed(0)} MB fetched)... `);
    const out = execFileSync(process.execPath, ['--max-old-space-size=4096', resolve(import.meta.dirname, 'compileModel.mjs'), id], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    const line = out.split('\n').find((l) => l.startsWith(`${id}:`)) ?? 'compiled';
    console.log(line.replace(`${id}: `, ''));
  }
}
