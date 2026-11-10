/**
 * Rewrite every shipped scene and asset manifest in canonical form.
 *
 * The writer is idempotent, so running this over an already-canonical
 * tree changes nothing; after a hand edit it restores the one form every
 * save and regeneration diffs against. `test/sceneWriter.test.js` asserts
 * the files on disk are canonical, so this is the command that makes a
 * failing tree pass.
 *
 *   node scripts/formatScenes.mjs
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeScene, writeManifest } from 'm2d-editor-core';

const examples = fileURLToPath(new URL('../src', import.meta.url));
const docsDemo = fileURLToPath(new URL('../../docs/demos/first-game', import.meta.url));

const files = [];
for (const example of readdirSync(examples)) {
  const scenes = join(examples, example, 'scenes');
  if (existsSync(scenes)) {
    for (const file of readdirSync(scenes)) {
      if (file.endsWith('.json')) files.push({ path: join(scenes, file), write: writeScene });
    }
  }
  const manifest = join(examples, example, 'assets.json');
  if (existsSync(manifest)) files.push({ path: manifest, write: writeManifest });
}
if (existsSync(docsDemo)) {
  for (const file of readdirSync(docsDemo)) {
    if (file.endsWith('.json')) files.push({ path: join(docsDemo, file), write: writeScene });
  }
}

let changed = 0;
for (const { path, write } of files) {
  const text = readFileSync(path, 'utf8');
  const canonical = write(JSON.parse(text));
  if (canonical !== text) {
    writeFileSync(path, canonical);
    changed++;
    console.log(`formatted ${path}`);
  }
}
console.log(`${files.length} files, ${changed} rewritten`);
