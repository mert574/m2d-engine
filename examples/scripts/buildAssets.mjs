/**
 * Everything an example needs that is not committed:
 * `node scripts/buildAssets.mjs [--missing] [--quality all|default]`.
 *
 * Generated sprites, dev textures and models, the lot's fetched and
 * compiled Poly Haven models, Ember Valley's seeded art, and the laid-out
 * scenes. Each step takes `--missing` and does nothing when its output is
 * already there, so this is the one command a fresh checkout — or a CI
 * job with a warm cache — runs before the tests or the build.
 *
 * The dev server and `vite build` run it with `--missing` at start, which
 * is why the list lives here and not in `vite.config.js`: the tests need
 * the same assets, and they never load Vite. The dev server adds
 * `--quality all`, building the lot's models at every quality level its
 * settings offer; everything else builds the defaults only.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const missing = args.includes('--missing') ? ['--missing'] : [];
const quality = args.includes('--quality') ? ['--quality', args[args.indexOf('--quality') + 1]] : [];

/** Each step as the script to run and its arguments, given the `--missing` flag. */
const STEPS = [
  // Only the renderer showcase generates sprites: the tiny textures its
  // batching stress test needs. The games draw in code or ship textures.
  // Its example name is the last argument, so the flag goes before it.
  ['generateSprites.js', (flag) => [...flag, 'showcase']],
  ['generateDevTextures.mjs', (flag) => flag],
  ['generateDevModels.mjs', (flag) => flag],
  // The lot's photoscanned models are fetched and compiled, never
  // committed; the first run of a fresh checkout takes a few minutes.
  ['buildModels.mjs', (flag) => [...flag, ...quality]],
  // Ember Valley's painted-tile sheet and coin strip: fetched free art,
  // seeded once — swapped-in local art is never overwritten.
  ['buildPlatformerArt.mjs', (flag) => flag],
  // The laid-out scenes are seeds: built once by rule, edited from then
  // on, so a builder only writes a scene that is not there.
  ...['Grove', 'Keep', 'Row', 'Drift', 'Lot'].map((builder) => [`build${builder}Scene.mjs`, (flag) => flag])
];

for (const [script, argsOf] of STEPS) {
  execFileSync(process.execPath, [resolve(import.meta.dirname, script), ...argsOf(missing)], { stdio: 'inherit' });
}
