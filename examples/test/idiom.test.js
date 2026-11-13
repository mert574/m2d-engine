import { describe, it, expect, afterAll } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Companion } from 'm2d-editor-host';
import { runAudit } from 'm2d-editor-host/search.ts';
import { projectGames } from './helpers.js';

/**
 * Every example is written the way m2d means games to be written
 * (knowledge-base/notes/idiomatic-m2d.md): an editor project, booted by
 * the generic boot, its look, UI, sound and flow in scene data, its hooks
 * small and only for what has no data form, nothing beside its scenes
 * that the editor cannot see, and an audit with nothing to report.
 *
 * Today's departures are listed in ALLOWED, project by project, each with
 * the phase of the idiomatic-examples plan that removes it. The list only
 * shrinks: a new departure fails here, and so does a listed one that has
 * been fixed, until its line is deleted. The plan is done when the list
 * is empty.
 */

/** The examples that are not games: shared code, the screenshot rig. */
const NOT_GAMES = new Set(['shared', 'shots']);

/**
 * Exempt, with the reason. The renderer showcase is the backend comparison
 * harness: a code-driven director with an identical load on every backend
 * (see "Where it bends" in idiomatic-m2d.md).
 */
const EXEMPT = { showcase: 'the code-driven renderer comparison harness' };

/** How many lines of code a hooks module may have before it is doing a scene's job. */
const HOOK_BUDGET = 40;

/** Calls a hook may not make, each with what replaces it in scene data. */
const FORBIDDEN = [
  { name: 'camera', pattern: /\bgame\.camera\.|\bcamera\.(zoom|orbit|follow)\(/, instead: 'world.camera' },
  { name: 'ui', pattern: /\.ui\.add\(|new UI[A-Z]\w*\(/, instead: 'hud, or a UI scene' },
  { name: 'audio', pattern: /\bplayMusic\(|\bsoundManager\.loop\(|\bplaySound\(/, instead: 'world.music, world.ambience, a sound rule' },
  { name: 'look', pattern: /\bsetPostEffects\(|\bsetAmbientLight\(|\bframe\.(sun|ambient|fog|post|bloom)\s*=/, instead: 'world.lighting, world.post' },
  { name: 'input', pattern: /\binput\.on\(|\bjustPressed\(/, instead: 'an action rule, world.camera controls' },
  { name: 'drawing', pattern: /\brenderer\.draw\w*\(/, instead: 'world.sky, world.scatter, world.particles, tile layers' },
  { name: 'instanceof', pattern: /\binstanceof\b/, instead: 'prefab names: plot, counters, rules' }
];

/**
 * Today's departures, by project folder. Each line says which phase
 * removes it, or that it is a listed exception: what the plan accepts as
 * a hook, with the reason.
 */
const ALLOWED = {
  // Night Circuit
  circuit: [
    'project-file — phase 4: the maps baked into scene files, an editor project',
    'boot — phase 4: bootProject'
  ],
  // Cinder Keep
  iso: [
    'hooks: input — exception: the satchel and the shop are the keep\'s own screens, opened by the satchel and trade actions'
  ],
  // Hedgerow Court
  maze: [
    'project-file — phase 4: the courts baked into scene files, an editor project',
    'boot — phase 4: bootProject'
  ],
  // Hollow Grove
  oblique: [
    'hooks: budget — exception: the quest, JS on the engine\'s Quest, and the talking that moves it on',
    'hooks: input — exception: the talking reads the tick\'s input, as the quest needs'
  ],
  // Physics playground
  physics: [
    'project-file — phase 4: its scene into a file, an editor project',
    'boot — phase 4: bootProject'
  ],
  // Beeline
  scroller: [
    'project-file — phase 4: the meadow as a scene with a scroll camera',
    'boot — phase 4: bootProject'
  ],
};

const src = join(import.meta.dirname, '..', 'src');
/**
 * Files git tracks under the examples. The audit sees every file on disk,
 * and a checkout can hold ignored leftovers (an old sprite generator's
 * output) that are no part of any project.
 */
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: src, encoding: 'utf8' })
  .split('\0').filter(Boolean).map((file) => join(src, file)));
// A game is a folder with a page; a stray folder of build output is not one.
const games = readdirSync(src).filter((name) => !NOT_GAMES.has(name) && statSync(join(src, name)).isDirectory() && existsSync(join(src, name, 'index.html')));

/** Lines that are code: not blank, not only a comment. */
function codeLines(text) {
  let inBlock = false;
  return text.split('\n').filter((raw) => {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      return false;
    }
    if (line.startsWith('/*')) {
      inBlock = !line.includes('*/');
      return false;
    }
    return line && !line.startsWith('//') && !line.startsWith('*');
  });
}

/** What a game folder does that idiomatic m2d does not, by name. */
function departures(folder) {
  const root = join(src, folder);
  const found = [];
  const projectFile = join(root, 'm2d.project.json');
  if (!existsSync(projectFile)) found.push('project-file');
  if (existsSync(join(root, 'layout.json'))) found.push('layout-json');
  const main = join(root, 'main.js');
  if (existsSync(main) && !readFileSync(main, 'utf8').includes('bootProject(')) found.push('boot');
  const config = existsSync(projectFile) ? JSON.parse(readFileSync(projectFile, 'utf8')) : {};
  const hooksFile = join(root, config.hooks ?? 'hooks.js');
  if (existsSync(hooksFile)) {
    const code = codeLines(readFileSync(hooksFile, 'utf8'));
    if (code.length > HOOK_BUDGET) found.push('hooks: budget');
    for (const { name, pattern } of FORBIDDEN) {
      if (code.some((line) => pattern.test(line))) found.push(`hooks: ${name}`);
    }
  }
  return found;
}

describe('the examples are idiomatic m2d', () => {
  it('lists every example folder once, as a game or as exempt', () => {
    for (const folder of [...Object.keys(ALLOWED), ...Object.keys(EXEMPT)]) expect(games, `'${folder}' is not an example folder`).toContain(folder);
  });

  for (const folder of games.filter((name) => !(name in EXEMPT))) {
    it(`${folder}: departs from it only where the plan says, and no longer where it has been fixed`, () => {
      const found = departures(folder);
      const allowed = (ALLOWED[folder] ?? []).map((line) => line.split(' — ')[0]).filter((name) => name !== 'audit');
      const added = found.filter((name) => !allowed.includes(name));
      const fixed = allowed.filter((name) => !found.includes(name));
      expect(added, `${folder} newly departs: ${added.join(', ')}. ${hintFor(added)}`).toEqual([]);
      expect(fixed, `${folder} no longer departs in: ${fixed.join(', ')}. Delete those lines from ALLOWED`).toEqual([]);
    });
  }

  describe('the audit', () => {
    const companions = [];
    afterAll(() => { for (const companion of companions) companion.close(); });

    it('finds nothing missing or unused in any project, except where allowed', { timeout: 60000 }, async () => {
      const projects = await projectGames();
      const folders = readdirSync(src).filter((name) => existsSync(join(src, name, 'm2d.project.json')));
      const failures = [];
      for (const folder of folders) {
        const companion = new Companion({ root: join(src, folder) });
        companions.push(companion);
        const game = projects.find((project) => project.root === join(src, folder))?.game ?? null;
        const audit = await runAudit(companion.session, companion.assets, game);
        const problems = [
          ...audit.missingFiles.map((use) => `missing ${use.url} (${use.scene})`),
          ...audit.unusedFiles.filter((url) => tracked.has(join(src, folder, url))).map((url) => `unused file ${url}`),
          ...audit.unusedPrefabs.map(({ scene, prefab }) => `unused prefab ${prefab} (${scene})`),
          ...audit.unusedPaths.map(({ scene, path }) => `unused path ${path} (${scene})`)
        ];
        const allowed = (ALLOWED[folder] ?? []).some((line) => line.startsWith('audit'));
        if (!allowed && problems.length) failures.push(`${folder}: ${problems.join(', ')}`);
        if (allowed && !problems.length) failures.push(`${folder}: the audit is clean now; delete its ALLOWED audit line`);
      }
      expect(failures).toEqual([]);
    });
  });
});

function hintFor(names) {
  return names.map((name) => {
    const rule = FORBIDDEN.find((each) => `hooks: ${each.name}` === name);
    if (rule) return `Use ${rule.instead} instead of a hook.`;
    if (name === 'boot') return 'main.js should be bootProject (m2d-engine/core/project.js).';
    if (name === 'layout-json') return 'Layout belongs in the scene file.';
    if (name === 'project-file') return 'Every example is an editor project with an m2d.project.json.';
    if (name === 'hooks: budget') return `A hooks module stays under ${HOOK_BUDGET} lines of code.`;
    return '';
  }).filter(Boolean).join(' ');
}
