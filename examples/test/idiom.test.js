import { describe, it, expect, afterAll } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

/** Today's departures, by project folder. Each line says which phase removes it. */
const ALLOWED = {
  // Ash Row
  belt: [
    'layout-json — phase 2: the street\'s layout moves into the scene',
    'boot — phase 2: bootProject',
    'hooks: camera — phase 2: the camera height becomes scene camera bounds',
    'hooks: input — phase 2: Escape becomes a menu action rule',
    'hooks: drawing — phase 2: the sky fill becomes the clear colour and sky',
    'audit — phase 2: facade textures and icons the hooks load become scene assets'
  ],
  // Night Circuit
  circuit: [
    'project-file — phase 4: the maps baked into scene files, an editor project',
    'boot — phase 4: bootProject'
  ],
  // Salvage Run
  drift: [
    'layout-json — phase 2: the field\'s layout moves into the scene',
    'boot — phase 2: bootProject',
    'hooks: budget — phase 2: what is left after the moves below',
    'hooks: camera — phase 2: speed zoom and the opening pose are world.camera',
    'hooks: ui — phase 2: the boost meter and minimap become hud',
    'hooks: input — phase 2: Escape becomes a menu action rule',
    'hooks: drawing — phase 2: the void fill becomes the clear colour',
    'hooks: instanceof — phase 2: minimap plots by prefab, the count is a counter',
    'audit — phase 2: the eight hand-loaded sheets become assets and sheet properties'
  ],
  // Cinder Keep
  iso: [
    'boot — phase 2: bootProject',
    'hooks: budget — phase 2: what is left after the moves below',
    'hooks: camera — phase 2: wheel zoom and the opening pose are world.camera',
    'hooks: ui — phase 2: minimap, ability bar and satchel bar become hud',
    'hooks: audio — phase 2: the descent sound becomes a notify rule',
    'hooks: input — phase 2: Escape and the satchel become action rules',
    'hooks: drawing — phase 2: the rock wash becomes the clear colour',
    'hooks: instanceof — phase 2: minimap plots by prefab, the count is a counter',
    'audit — phase 2: ability icons become assets.images'
  ],
  // Hedgerow Court
  maze: [
    'project-file — phase 4: the courts baked into scene files, an editor project',
    'boot — phase 4: bootProject'
  ],
  // Hollow Grove
  oblique: [
    'boot — phase 2: bootProject',
    'hooks: budget — phase 2: what is left after the moves below',
    'hooks: camera — phase 2: zoom limits are world.camera',
    'hooks: ui — phase 2: minimap, ability bar and dialogue become hud',
    'hooks: audio — phase 2: sounds become rules',
    'hooks: input — phase 2: keys become action rules',
    'hooks: drawing — phase 2: the ground texture becomes an asset-reference property',
    'hooks: instanceof — phase 2: minimap plots by prefab',
    'audit — phase 2: sheets and icons the hooks load become scene assets; the unplaced tree_dead prefab'
  ],
  // Physics playground
  physics: [
    'project-file — phase 4: its scene into a file, an editor project',
    'boot — phase 4: bootProject'
  ],
  // Ember Valley
  platformer: [
    'boot — phase 2: bootProject'
  ],
  // Beeline
  scroller: [
    'project-file — phase 4: the meadow as a scene with a scroll camera',
    'boot — phase 4: bootProject'
  ],
  // The Facility
  topdown: [
    'boot — phase 2: bootProject'
  ],
  // The Yard
  yard: [
    'boot — phase 2: bootProject',
    'hooks: camera — phase 2: orbit drag and wheel zoom are world.camera',
    'hooks: audio — phase 2: the wind becomes world.ambience',
    'hooks: input — phase 2: T becomes an action rule on the cycle',
    'audit — phase 2: the HDR sky and the dev models and textures the lot\'s script or hooks name'
  ]
};

const src = join(import.meta.dirname, '..', 'src');
const games = readdirSync(src).filter((name) => !NOT_GAMES.has(name) && statSync(join(src, name)).isDirectory());

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
          ...audit.unusedFiles.map((url) => `unused file ${url}`),
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
