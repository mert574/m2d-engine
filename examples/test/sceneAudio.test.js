import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Every sound and music track a shipped scene names is in the repository.
 * The files ship with the project (unlike the seed-once art), and
 * `.gitignore` drops some audio extensions, so a copy that was never
 * force-added would load on the machine that made it and nowhere else.
 */

const root = fileURLToPath(new URL('../src/', import.meta.url));
const tracked = new Set(execFileSync('git', ['ls-files', '.'], { cwd: root, encoding: 'utf8' }).split('\n'));

const scenes = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((project) => {
  let files = [];
  try { files = readdirSync(`${root}${project.name}/scenes`).filter((file) => file.endsWith('.json')); } catch { return []; }
  return files.map((file) => ({ project: project.name, file }));
});

describe('scene audio', () => {
  it.each(scenes)('$project/$file names only tracked sounds and tracks', ({ project, file }) => {
    const doc = JSON.parse(readFileSync(`${root}${project}/scenes/${file}`, 'utf8'));
    const urls = [...Object.values(doc.assets?.sounds ?? {}), ...Object.values(doc.assets?.music ?? {})].map((sound) => sound.url);
    expect(urls.filter((url) => !tracked.has(`${project}/${url}`))).toEqual([]);
  });
});
