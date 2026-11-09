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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASSETS, HDRIS, fetchAsset, fetchHDRI, HDRI_DIR } from './fetchPolyHaven.mjs';
import { OUT_DIR, FORMAT } from './compileModel.mjs';

const args = process.argv.slice(2);
const missingOnly = args.includes('--missing');
const ids = args.filter((a) => !a.startsWith('--'));
// A compiled model from an older format (say, WebP textures before KTX2)
// exists but is stale; the stamp makes --missing rebuild the lot once.
const stampPath = resolve(OUT_DIR, '.format');
const stale = !existsSync(stampPath) || readFileSync(stampPath, 'utf8').trim() !== String(FORMAT);
const wanted = (ids.length ? ids.filter((id) => !(id in HDRIS)) : Object.keys(ASSETS))
  .filter((id) => !missingOnly || stale || !existsSync(resolve(OUT_DIR, `${id}.glb`)));

// HDR panoramas: fetched, never compiled, so they are their own step
// and the models' format stamp does not cover them. Only when named —
// no example lights with one yet (the yard's sky is procedural so its
// dusk can move), and a fresh checkout should not pay for what it does
// not draw. `node scripts/buildModels.mjs kloofendal_43d_clear_puresky`.
const hdris = ids.filter((id) => id in HDRIS);
for (const id of hdris) {
  const resolution = HDRIS[id];
  if (missingOnly && existsSync(resolve(HDRI_DIR, `${id}_${resolution}.hdr`))) continue;
  const { bytes, name, authors } = await fetchHDRI(id, resolution);
  console.log(`${id} (${name}, by ${authors.join(', ')}) at ${resolution}: ${(bytes / 1e6).toFixed(1)} MB`);
}

if (!wanted.length) {
  if (!hdris.length) console.log('Models are up to date');
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
  // Stamped only when the whole set compiled in this format — a failed
  // run throws before this, and a hand-picked subset proves nothing
  // about the models it left alone.
  if (!ids.length) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(stampPath, `${FORMAT}\n`);
  }
}
