import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { engineAlias } from '../src/build.ts';

/**
 * A project the editor serves or builds gets the workspace's engine and
 * kit, installed or not: a fresh one from a template has nothing in
 * node_modules, and both templates import the kit.
 */

const ENGINE = fileURLToPath(new URL('../../engine', import.meta.url));
const KIT = fileURLToPath(new URL('../../kit', import.meta.url));

/** Where the aliases send a specifier, or null when none matches. */
function resolveAlias(specifier: string): string | null {
  for (const { find, replacement } of engineAlias()) {
    const pattern = find as RegExp;
    if (pattern.test(specifier)) return specifier.replace(pattern, replacement);
  }
  return null;
}

describe('the workspace aliases', () => {
  for (const [name, dir] of [['m2d-engine', ENGINE], ['m2d-kit', KIT]] as const) {
    it(`send every entry ${name} exports to the source it is built from`, () => {
      // Both packages publish `dist/`; the alias sends this repo at the
      // source that file is compiled from, which exists whether or not
      // anyone has run the build.
      const exports = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).exports as Record<string, { default: string; 'm2d-source': string }>;
      for (const [entry, target] of Object.entries(exports)) {
        const specifier = entry === '.' ? name : `${name}/${entry.slice(2)}`;
        const source = target['m2d-source'];
        expect(source, specifier).toMatch(/^\.\/src\//);
        expect(resolveAlias(specifier), specifier).toBe(join(dir, source));
        expect(existsSync(join(dir, source)), source).toBe(true);
      }
    });
  }

  it('leave anything that is not an entry alone', () => {
    expect(resolveAlias('m2d-engine/core/entity.ts')).toBeNull();
    expect(resolveAlias('m2d-kit-other')).toBeNull();
  });
});
