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
  it('send every entry the kit exports to the source it is built from', () => {
    // The kit is TypeScript: its exports map points a published consumer
    // at `dist/<name>.js`, and the alias sends this repo at the source
    // that file is compiled from, which exists whether or not anyone has
    // run the build.
    const exports = JSON.parse(readFileSync(join(KIT, 'package.json'), 'utf8')).exports as Record<string, { default: string; types: string }>;
    for (const [entry, target] of Object.entries(exports)) {
      const specifier = entry === '.' ? 'm2d-kit' : `m2d-kit/${entry.slice(2)}`;
      const source = target.default.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts');
      expect(resolveAlias(specifier), specifier).toBe(join(KIT, source));
      expect(existsSync(join(KIT, source)), source).toBe(true);
    }
  });

  it('send the engine and its modules to the workspace engine', () => {
    expect(resolveAlias('m2d-engine')).toMatch(/engine[\\/]src[\\/]core[\\/]m2d\.js$/);
    expect(resolveAlias('m2d-engine/core/entity.js')).toMatch(/engine[\\/]src[\\/]core[\\/]entity\.js$/);
    expect(resolveAlias('m2d-kit-other')).toBeNull();
  });
});
