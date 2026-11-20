import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The published form: every entry in the exports map loads in plain Node
 * from `dist` (no bundler, no loader, no `m2d-source` condition), exports
 * something, and has a declaration beside it. The build runs first, so
 * the check never passes against a stale `dist`.
 *
 * A server imports a game that imports the engine, so a module that
 * reaches for the DOM at load fails here. The `testing` entries are the
 * exception by design: they install DOM stand-ins and need their optional
 * peers, which this repo has.
 */

type Entry = { 'm2d-source': string; types: string; default: string };

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string; exports: Record<string, Entry>;
};

beforeAll(() => {
  execFileSync('npm', ['run', '--silent', 'build'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
}, 120000);

describe('the engine\'s entries', () => {
  it('are the published API and nothing else: no wildcard, no file paths', () => {
    for (const sub of Object.keys(pkg.exports)) {
      expect(sub, 'an entry is a name, not a path').not.toMatch(/\*|\.js$|\.ts$/);
    }
  });

  it('each load in plain Node from dist and export something', () => {
    for (const sub of Object.keys(pkg.exports)) {
      const specifier = sub === '.' ? pkg.name : `${pkg.name}/${sub.slice(2)}`;
      const script = `const m = await import(${JSON.stringify(specifier)}); if (!Object.keys(m).length && !${JSON.stringify(sub)}.endsWith('/setup')) throw new Error('empty'); console.log('ok');`;
      // No inherited NODE_OPTIONS: the repo's `.npmrc` would add the source condition.
      const env = { ...process.env, NODE_OPTIONS: '' };
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(out.trim(), specifier).toBe('ok');
    }
  });

  it('ship a declaration beside every entry, and point the source condition at the source', () => {
    for (const [sub, entry] of Object.entries(pkg.exports)) {
      const types = new URL(`../${entry.types.slice(2)}`, import.meta.url);
      expect(existsSync(types), `${sub}: ${entry.types}`).toBe(true);
      expect(existsSync(new URL(`../${entry['m2d-source'].slice(2)}`, import.meta.url)), `${sub}: ${entry['m2d-source']}`).toBe(true);
      expect(entry.default.replace('./dist/', './src/').replace(/\.js$/, ''), sub)
        .toBe(entry['m2d-source'].replace(/\.(ts|js)$/, ''));
    }
  });

  it('carry the runtime files modules load beside themselves', () => {
    for (const file of ['core/ui/fonts/exo-latin.woff2', 'core/renderers/webgpu/basis/basis_transcoder.js', 'core/renderers/webgpu/basis/basis_transcoder.wasm', 'core/gltfWorker.js']) {
      expect(existsSync(new URL(`../dist/${file}`, import.meta.url)), file).toBe(true);
    }
  });
});
