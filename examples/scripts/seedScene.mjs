import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';

/**
 * A scene builder is a seed. It lays a scene out by rules once — hundreds
 * of placed things are easier to describe than to type — and from then on
 * the JSON is the scene: the editor edits it, a person edits it, a save
 * diffs against it. Rerunning a builder over that file would throw the
 * edits away, so a builder writes only a scene that is not there.
 *
 *   node scripts/buildLotScene.mjs            # refuses if lot.json exists
 *   node scripts/buildLotScene.mjs --missing  # the dev server at boot: quiet
 *   node scripts/buildLotScene.mjs --force    # rebuild, discarding edits
 *
 * Call before doing any work; returns the path to write, or exits.
 * @param {URL} url - The scene file, relative to the calling script
 * @returns {string}
 */
export function seedTarget(url) {
  const path = fileURLToPath(url);
  if (!existsSync(path) || process.argv.includes('--force')) return path;
  if (!process.argv.includes('--missing')) {
    console.log(`${relative(process.cwd(), path)} exists, and it is the editor's now: this script only seeds it. ` +
      'Pass --force to rebuild it from the script, discarding every edit made since.');
  }
  process.exit(0);
}

/**
 * A list of placed objects for a builder to fill: `add(prefab, x, y,
 * width, height, properties, extra)` rounds the placement and gives each
 * object a stable id, readable in a diff — the prefab and its ordinal
 * (`hedge-42`), in the order placed. `extra` carries the object's own
 * fields beside its placement: `angle`, `constraints`, `zIndex`.
 *
 * @returns {{ objects: object[], add: Function }}
 */
export function placer() {
  const objects = [];
  const counts = new Map();
  const add = (prefab, x, y, width, height, properties, extra) => {
    const n = (counts.get(prefab) ?? 0) + 1;
    counts.set(prefab, n);
    const object = { id: `${prefab}-${n}`, prefab, x: Math.round(x), y: Math.round(y) };
    if (width !== undefined) { object.width = Math.round(width); object.height = Math.round(height); }
    Object.assign(object, extra);
    if (properties) object.properties = properties;
    objects.push(object);
  };
  return { objects, add };
}
