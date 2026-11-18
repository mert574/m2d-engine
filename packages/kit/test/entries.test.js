import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Every entry the package exports loads in plain Node — no bundler, no
 * DOM — because a server imports a game that imports the kit. A module
 * that reaches for `document` or `window` at load fails here.
 *
 * What is tested is the *published* form: the source is TypeScript, and
 * what ships is what `npm run build` emits into `dist`, which is also
 * what the exports map points at. The build runs first, so the check can
 * never pass against a stale one.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

beforeAll(() => {
  execFileSync('npm', ['run', '--silent', 'build'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
}, 120000);

describe('the kit\'s entries', () => {
  it('each load in plain Node and export something', () => {
    for (const [sub, entry] of Object.entries(pkg.exports)) {
      const specifier = sub === '.' ? pkg.name : `${pkg.name}/${sub.slice(2)}`;
      const file = entry.default;
      const script = `const m = await import(${JSON.stringify(specifier)}); if (!Object.keys(m).length) throw new Error('empty'); console.log(Object.keys(m).join(','));`;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(out.trim(), `${specifier} (${file})`).not.toBe('');
    }
  });

  it('ships a declaration file beside every entry, so a TypeScript consumer sees real types', () => {
    for (const [sub, entry] of Object.entries(pkg.exports)) {
      const types = new URL(`../${entry.types.slice(2)}`, import.meta.url);
      expect(existsSync(types), `${sub}: ${entry.types}`).toBe(true);
      const text = readFileSync(types, 'utf8');
      // A declaration of `any` for everything would load and say nothing.
      expect(text, `${sub}`).toMatch(/export (declare )?(class|function|const|type|interface|\{)/);
    }
  });

  it('the index re-exports what the entries export', async () => {
    const index = await import('../src/index.ts');
    for (const name of ['Ghost', 'Bee', 'Coin', 'MovingPlatform', 'PREFAB_TEMPLATES', 'registerKitActors', 'AttackSwing', 'HitBurst', 'registerEffects', 'makeRng', 'range', 'tileTexture', 'audioOption', 'Sky', 'Scatter', 'ParticleField', 'AmbientSound', 'SCENERY_TEMPLATES', 'registerKitScenery', 'GravityDial', 'PathStrip', 'Clip']) {
      expect(index, name).toHaveProperty(name);
    }
  });
});
