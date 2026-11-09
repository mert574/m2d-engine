/**
 * Builds the compiled Poly Haven models the examples load:
 * `node scripts/buildModels.mjs [--missing] [--jobs N] [--download-only] [ids...]`.
 *
 * Neither the sources nor the compiled files are committed — a scan is
 * hundreds of megabytes and the repository is not where that belongs —
 * so this fetches what `fetchPolyHaven.mjs` lists and compiles it with
 * `compileModel.mjs`, each model in a process of its own (a tree needs a
 * few gigabytes while it is cut). The dev server runs it with `--missing`
 * at start, as it generates the renderer showcase's sprites, so a fresh
 * checkout builds the lot on first run.
 *
 * Two stages, overlapped. Downloads run two at a time — Poly Haven's CDN
 * is the limit there, not this machine — and a model is handed to the
 * compile pool the moment its files are on disk, so compiling starts
 * while the rest is still arriving. The pool is sized to the machine:
 * one job per core, but never more than memory allows, since a tree
 * being decimated holds a few gigabytes (`--jobs` or `M2D_BUILD_JOBS`
 * overrides). Nothing is downloaded twice — a file whose md5 matches is
 * kept — and nothing here deletes a source; the directory is the cache.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { availableParallelism, totalmem } from 'node:os';
import { ASSETS, HDRIS, fetchAsset, fetchHDRI, HDRI_DIR } from './fetchPolyHaven.mjs';
import { OUT_DIR, FORMAT } from './compileModel.mjs';

const args = process.argv.slice(2);
const missingOnly = args.includes('--missing');
const downloadOnly = args.includes('--download-only');
const jobsArg = args.indexOf('--jobs');
// The value after `--jobs` is a number, not an id; without `--jobs` there is no such value.
const ids = args.filter((a, i) => !a.startsWith('--') && (jobsArg < 0 || i !== jobsArg + 1));

/** Downloads in flight at once: the CDN is the limit, two saturates it. */
const DOWNLOADS = 2;
/** Bytes a compile may need while a scan is cut; sizes the pool against RAM. */
const COMPILE_BYTES = 4.5e9;
const JOBS = Math.max(1, Number(
  jobsArg >= 0 ? args[jobsArg + 1]
    : process.env.M2D_BUILD_JOBS
    ?? Math.min(availableParallelism(), Math.floor(totalmem() / COMPILE_BYTES))));

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

/** Run `work` over `items`, at most `limit` at a time, in order of arrival. */
async function pool(items, limit, work) {
  const queue = [...items];
  const results = [];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) results.push(await work(queue.shift()));
  });
  await Promise.all(runners);
  return results;
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** One model through the compiler in its own process, as a promise. */
function compile(id) {
  return new Promise((done, fail) => {
    execFile(process.execPath, ['--max-old-space-size=4096', resolve(import.meta.dirname, 'compileModel.mjs'), id],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          fail(new Error(`${id}: compile failed\n${stderr.split('\n').filter((l) => l && !/^(Slice|Mode|Encoding|Total slices|basis_compressor|Flipping|Processing)/.test(l)).slice(-12).join('\n')}`));
          return;
        }
        done(stdout.split('\n').find((l) => l.startsWith(`${id}:`))?.replace(`${id}: `, '') ?? 'compiled');
      });
  });
}

if (!wanted.length) {
  if (!hdris.length) console.log('Models are up to date');
} else {
  const started = Date.now();
  console.log(`Building ${wanted.length} model${wanted.length === 1 ? '' : 's'}: downloading ${DOWNLOADS} at a time, compiling ${JOBS} at a time (${availableParallelism()} cores, ${(totalmem() / 1e9).toFixed(0)} GB).`);

  // The compile pool is fed as downloads land, so the two stages overlap.
  // Each download resolves into a job the pool picks up; the pool itself
  // is one promise chain per slot pulling from a shared queue.
  const ready = [];
  let downloadsLeft = wanted.length;
  const compiles = [];
  const failures = [];
  let compiling = 0;
  let wake = null;
  const kick = () => { wake?.(); wake = null; };

  const compiler = (async () => {
    if (downloadOnly) return;
    while (downloadsLeft > 0 || ready.length) {
      if (!ready.length || compiling >= JOBS) {
        await new Promise((resolve) => { wake = resolve; });
        continue;
      }
      const id = ready.shift();
      compiling++;
      const t0 = Date.now();
      compiles.push(compile(id).then((line) => {
        console.log(`  compiled  ${id}: ${line} (${seconds(Date.now() - t0)})`);
      }, (error) => {
        failures.push(error);
        console.error(`  FAILED    ${error.message}`);
      }).finally(() => { compiling--; kick(); }));
    }
    await Promise.all(compiles);
  })();

  await pool(wanted, DOWNLOADS, async (id) => {
    const t0 = Date.now();
    const { bytes, name, fetched } = await fetchAsset(id, ASSETS[id] ?? '2k');
    console.log(`  ${fetched ? 'fetched   ' : 'on disk   '}${id} (${name}, ${(bytes / 1e6).toFixed(0)} MB${fetched ? `, ${seconds(Date.now() - t0)}` : ''})`);
    ready.push(id);
    downloadsLeft--;
    kick();
  });
  await compiler;

  if (failures.length) {
    console.error(`${failures.length} of ${wanted.length} models failed; the format stamp was not written.`);
    process.exit(1);
  }
  console.log(`${wanted.length} models in ${seconds(Date.now() - started)} → ${OUT_DIR}`);
  // Stamped only when the whole set compiled in this format — a failed
  // run exits above, and a hand-picked subset proves nothing about the
  // models it left alone.
  if (!ids.length && !downloadOnly) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(stampPath, `${FORMAT}\n`);
  }
}
