import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Every entry the package exports loads in plain Node — no bundler, no
 * DOM — because a server imports a game that imports the kit. A module
 * that reaches for `document` or `window` at load fails here.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('the kit\'s entries', () => {
  it('each load in plain Node and export something', () => {
    for (const [sub, file] of Object.entries(pkg.exports)) {
      const specifier = sub === '.' ? pkg.name : `${pkg.name}/${sub.slice(2)}`;
      const script = `const m = await import(${JSON.stringify(specifier)}); if (!Object.keys(m).length) throw new Error('empty'); console.log(Object.keys(m).join(','));`;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(out.trim(), `${specifier} (${file})`).not.toBe('');
    }
  });

  it('the index re-exports what the entries export', async () => {
    const index = await import('../src/index.js');
    for (const name of ['Ghost', 'Bee', 'Coin', 'MovingPlatform', 'PREFAB_TEMPLATES', 'registerKitActors', 'AttackSwing', 'HitBurst', 'registerEffects', 'makeRng', 'range', 'tileTexture', 'audioOption', 'Sky', 'Scatter', 'ParticleField', 'AmbientSound', 'SCENERY_TEMPLATES', 'registerKitScenery', 'GravityDial']) {
      expect(index, name).toHaveProperty(name);
    }
  });
});
