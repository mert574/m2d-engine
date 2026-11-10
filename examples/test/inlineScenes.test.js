import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'acorn';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';

/**
 * Scenes written as object literals in source, rather than as JSON files.
 *
 * `scenes.test.js` loads every shipped `.json` scene through the real
 * validator, which is the stronger check — but it can only see files. A
 * scene built inline in a demo is invisible to it, and that gap shipped a
 * real bug: when the format went to version 2 and ids became required,
 * every scene literal in `docs/demos` and Night Circuit's race scenes was
 * left at version 1, so they failed on load and nothing noticed.
 *
 * These literals cannot be loaded here: they are written inside functions,
 * they interpolate values and call into browser APIs, so there is nothing
 * to import and nothing to `JSON.parse`. So the check is static. It reads
 * the source, finds the object literals whose shape says "scene", and
 * asserts the two things that were wrong — the version, and an id on every
 * object. It is deliberately narrow: the full schema belongs to the
 * validator, and a scene that wants full validation should be a file.
 */

const root = join(import.meta.dirname, '..', '..');

/** Source trees that may hold scene literals. */
const SEARCH = [
  join(root, 'examples', 'src'),
  join(root, 'docs', 'demos')
];

/** Every `.js` file under a directory, recursively. */
function sourcesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return name.endsWith('.js') ? [path] : [];
  });
}

/** The property node named `key` on an object literal, or undefined. */
function prop(node, key) {
  return node.properties.find(p =>
    p.type === 'Property' && !p.computed &&
    (p.key.type === 'Identifier' ? p.key.name : p.key.value) === key);
}

/**
 * Is this object literal a scene? The signature is a `version` beside a
 * `type` of `'level'` or `'ui'` — the two fields the format requires first
 * and that nothing else in the demos pairs. A record that happens to carry
 * a version (the circuit's saved best lap, an asset manifest) has no such
 * `type` and is not matched.
 */
function isScene(node) {
  if (node.type !== 'ObjectExpression') return false;
  const version = prop(node, 'version');
  const type = prop(node, 'type');
  if (!version || !type) return false;
  return type.value.type === 'Literal' && (type.value.value === 'level' || type.value.value === 'ui');
}

/** Walk every node of an ESTree tree. */
function* walk(node) {
  if (!node || typeof node.type !== 'string') return;
  yield node;
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'loc' || key === 'range') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') yield* walk(child);
    } else if (value && typeof value.type === 'string') {
      yield* walk(value);
    }
  }
}

/** Every scene literal in a source file, with the line it starts on. */
function scenesIn(path) {
  const source = readFileSync(path, 'utf8');
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const found = [];
  for (const node of walk(tree)) {
    if (isScene(node)) found.push({ node, line: node.loc.start.line, path });
  }
  return found;
}

const scenes = SEARCH.flatMap(sourcesUnder).flatMap(scenesIn)
  .map(scene => ({ ...scene, name: `${relative(root, scene.path)}:${scene.line}` }));

describe('scene literals in source', () => {
  // If the detector ever stops recognising a scene it fails silently, which
  // is how the version-1 scenes survived in the first place.
  it('finds the scene literals to check', () => {
    expect(scenes.length).toBeGreaterThan(0);
  });

  it.each(scenes)('$name is written at the current scene version', ({ node }) => {
    const version = prop(node, 'version').value;
    expect(version.type).toBe('Literal');
    expect(version.value).toBe(SCENE_VERSION);
  });

  // Ids are required and the loader never invents one, so a literal that
  // places objects has to write them. Objects built by a spread or a `map`
  // are skipped here: the id is then an expression this check cannot read,
  // and the engine's own validation covers it at load.
  it.each(scenes)('$name gives every placed object an id', ({ node }) => {
    const layers = prop(node, 'layers');
    if (!layers || layers.value.type !== 'ArrayExpression') return;

    const missing = [];
    for (const layer of layers.value.elements) {
      if (!layer || layer.type !== 'ObjectExpression') continue;
      for (const key of ['objects', 'props']) {
        const list = prop(layer, key);
        if (!list || list.value.type !== 'ArrayExpression') continue;
        for (const entry of list.value.elements) {
          if (!entry || entry.type !== 'ObjectExpression') continue;
          if (!prop(entry, 'id')) missing.push(`${key} entry on line ${entry.loc.start.line}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it.each(scenes)('$name gives every UI element an id', ({ node }) => {
    const elements = prop(node, 'elements');
    if (!elements || elements.value.type !== 'ArrayExpression') return;

    const missing = elements.value.elements
      .filter(entry => entry && entry.type === 'ObjectExpression' && !prop(entry, 'id'))
      .map(entry => `element on line ${entry.loc.start.line}`);
    expect(missing).toEqual([]);
  });
});
