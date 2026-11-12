#!/usr/bin/env node
/**
 * The editor's GUI test harness: a real editor host per suite, a real
 * Chrome with the GPU (`packages/editor-host/src/chrome.ts`; the Windows
 * one under WSL), and real pointer input — the checks the E7b–E9 rounds
 * ran by hand, as suites.
 *
 *   node scripts/driveEditor.mjs                 # every suite
 *   node scripts/driveEditor.mjs lot template2d  # some
 *   node scripts/driveEditor.mjs --headed --out <dir>
 *
 * Every suite edits and then undoes to clean; nothing is saved. The
 * example projects are driven in place (unsaved edits only touch the
 * git-ignored `.m2d/journal/`, removed once clean), and a suite refuses a
 * scene that opens with someone's unsaved edits. The template suite makes
 * a fresh project in a temp folder. Screenshots of each suite land in
 * `--out` (a temp folder by default, printed).
 *
 * Exit code 0 when every check passed.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchGpuChrome, describeAdapter } from '../packages/editor-host/src/chrome.ts';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const serve = join(repo, 'packages/editor-host/src/serve.ts');

// --- The pieces ------------------------------------------------------------

/** An editor host on a project; resolves once it prints its URL. */
function startEditor(project) {
  return new Promise((ready, fail) => {
    const child = spawn(process.execPath, [serve, project], {
      cwd: repo,
      env: { ...process.env, INIT_CWD: repo, PORT: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let log = '';
    const timer = setTimeout(() => { child.kill(); fail(new Error(`the editor did not start:\n${log}`)); }, 60000);
    const read = (chunk) => {
      log += String(chunk);
      const found = /http:\/\/localhost:(\d+)\//.exec(log);
      if (found) {
        clearTimeout(timer);
        ready({ url: found[0], stop: () => stopProcess(child) });
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', (chunk) => { log += String(chunk); });
    child.on('exit', (code) => { clearTimeout(timer); fail(new Error(`the editor exited (${code}):\n${log}`)); });
  });
}

function stopProcess(child) {
  return new Promise((done) => {
    if (child.exitCode !== null) return done();
    child.once('exit', () => done());
    child.kill('SIGTERM');
    setTimeout(() => { child.kill('SIGKILL'); done(); }, 4000);
  });
}

/** `m2d-editor new`: a fresh project from a template. */
function createProject(folder, template) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [serve, 'new', folder, '--template', template], {
      cwd: repo,
      env: { ...process.env, INIT_CWD: repo },
      stdio: 'ignore'
    });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`m2d-editor new failed (${code})`))));
  });
}

/** Checks and their outcomes, per suite. */
class Report {
  results = [];
  constructor(suite) { this.suite = suite; }
  ok(name, detail = '') { this.check(name, true, detail); }
  check(name, pass, detail = '') {
    this.results.push({ name, pass, detail });
    console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
    return pass;
  }
}

/**
 * The frame of every suite: an editor host on the project, a fresh tab on
 * `scene`, the body, then — passed or thrown — the tab closed and the host
 * stopped. The body gets the page and only tests.
 */
async function drive(context, report, project, scene, body) {
  const editor = await startEditor(project);
  try {
    const page = await context.newPage();
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await openScene(page, editor.url, scene);
      await body(page);
      report.check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
      await page.close();
    }
  } finally {
    await editor.stop();
  }
}

/** Waits until `test` (run in the page) is truthy. */
async function until(page, test, ms = 20000) {
  await page.waitForFunction(test, undefined, { timeout: ms, polling: 100 });
}

/** The editor loaded and `scene` showing, verified clean. */
async function openScene(page, url, scene) {
  await page.goto(url);
  await until(page, () => window.m2dEditor?.remote, 60000);
  await page.evaluate((path) => window.m2dEditor.openScene(path), scene);
  const error = await page.evaluate(() => window.m2dEditor.loadError);
  if (error) throw new Error(`${scene} did not load: ${error}`);
  // Unsaved edits (a journal replayed on open) are someone's work: the
  // suite's undo would walk into them and the host would drop the journal.
  const state = await history(page);
  if (state.dirty || state.undo) {
    throw new Error(`${scene} has unsaved edits (undo: ${state.undo}); save or discard them first — the harness will not touch them`);
  }
  // A few frames for the renderer to settle.
  await page.waitForTimeout(600);
}

const history = (page) => page.evaluate(() => ({ ...window.m2dEditor.remote.state, dirty: window.m2dEditor.remote.dirty }));

/**
 * Undo with the toolbar until the document is clean again. The document
 * was clean when the suite opened it (`openScene` checks), so every step
 * here undoes the suite's own edits and nothing else.
 */
async function undoToClean(page, report) {
  for (let i = 0; i < 50; i++) {
    const state = await history(page);
    if (!state.dirty || !state.undo) break;
    await page.click('#undo');
    await page.waitForTimeout(120);
  }
  const state = await history(page);
  report.check('undo to clean', !state.dirty, state.dirty ? `still dirty, undo=${state.undo}` : '');
}

/**
 * An object whose centre, clicked, picks itself — something a person
 * could click on. Prefers one that fills some screen (many grid points
 * hit it) over a sliver.
 */
async function clickableObject(page) {
  return page.evaluate(() => {
    const { viewport } = window.m2dEditor;
    const canvas = document.getElementById('screen').getBoundingClientRect();
    const mid = { x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height / 2 };
    // Placed objects only: prop instances and composed objects pick with
    // ids the document spells differently.
    const ids = new Set(viewport.objectsWithin(() => true));
    const inside = (p) => p.x > canvas.left + 40 && p.x < canvas.right - 40 && p.y > canvas.top + 60 && p.y < canvas.bottom - 40;
    const candidates = [];
    const consider = (x, y) => {
      const id = viewport.pick(x, y);
      if (id && ids.has(id)) candidates.push({ id, x, y, d: Math.hypot(x - mid.x, y - mid.y) });
    };
    // Each object's centre first; a dense level may cover every centre
    // with a prop, so then a grid over the canvas.
    for (const id of ids) {
      const placement = viewport.placement(id);
      if (placement?.onScreen && inside(placement.center)) consider(placement.center.x, placement.center.y);
    }
    if (!candidates.length) {
      for (let gy = 0.1; gy < 0.95; gy += 0.05) {
        for (let gx = 0.05; gx < 0.96; gx += 0.05) {
          const p = { x: canvas.left + canvas.width * gx, y: canvas.top + canvas.height * gy };
          if (inside(p)) consider(p.x, p.y);
        }
      }
    }
    const hits = new Map();
    for (const c of candidates) hits.set(c.id, (hits.get(c.id) ?? 0) + 1);
    candidates.sort((a, b) => (hits.get(b.id) - hits.get(a.id)) || a.d - b.d);
    return candidates[0] ?? null;
  });
}

async function shoot(page, out, name, report) {
  await page.locator('#screen').screenshot({ path: join(out, `${name}.png`) });
  report.ok(`screenshot ${name}.png`);
}

/** Pick by click, move with the gizmo, check it is one undo step. */
async function pickAndMove(page, report) {
  // A scene that streams its models in has nothing to pick until they land.
  let target = null;
  for (let waited = 0; !target && waited < 15000; waited += 500) {
    target = await clickableObject(page);
    if (!target) await page.waitForTimeout(500);
  }
  if (!report.check('an object to click', !!target, target?.id ?? 'none on screen')) return null;
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(200);
  const selected = await page.evaluate(() => window.m2dEditor.selectedIds());
  report.check('click picks it', selected.length === 1 && selected[0] === target.id, selected.join(','));

  // The gizmo's free handle sits at the centre; drag it by real pointer moves.
  const handle = page.locator('svg.overlay [data-handle="free"]');
  if (!report.check('the gizmo shows', await handle.count() > 0)) return target;
  const box = await handle.first().boundingBox();
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const before = await history(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(from.x + step * 6, from.y + step * 3);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await history(page);
  report.check('the drag commits one edit', after.dirty && after.undo && after.undo !== before.undo, `undo: ${after.undo}`);
  return target;
}

// --- Suites -----------------------------------------------------------------

const SUITES = {
  /** The yard's lot: 3D on WebGPU, pick, move, isolate. */
  lot: (context, report, out) =>
    drive(context, report, join(repo, 'examples/src/yard'), 'scenes/lot.json', async (page) => {
      report.ok('lot opens', await describeAdapter(page));
      report.check('3D viewport', await page.evaluate(() => window.m2dEditor.viewport.dimensions) === 3);
      await shoot(page, out, 'lot-open', report);
      if (await pickAndMove(page, report)) {
        await page.click('#helper-isolate');
        await page.waitForTimeout(300);
        report.check('isolate toggles on', await page.getAttribute('#helper-isolate', 'aria-pressed') === 'true');
        await shoot(page, out, 'lot-isolated', report);
        await page.click('#helper-isolate');
      }
      await undoToClean(page, report);
    }),

  /** Ember Valley: 2D, pick, move, play and stop. */
  platformer: (context, report, out) =>
    drive(context, report, join(repo, 'examples/src/platformer'), 'scenes/level1.json', async (page) => {
      report.check('2D viewport', await page.evaluate(() => window.m2dEditor.viewport.dimensions) === 2);
      await shoot(page, out, 'platformer-open', report);
      await pickAndMove(page, report);
      await undoToClean(page, report);

      await page.keyboard.press('F5');
      await until(page, () => window.m2dEditor.playing);
      await page.evaluate(() => window.m2dEditor.idle());
      await page.waitForTimeout(1500);
      report.ok('play starts');
      await shoot(page, out, 'platformer-playing', report);
      await page.keyboard.press('F5');
      await until(page, () => !window.m2dEditor.playing);
      await page.evaluate(() => window.m2dEditor.idle());
      report.check('stop leaves the document clean', !(await history(page)).dirty);
    }),

  /** Ember Valley's named paths: select by clicking the line, drag, add and remove points. */
  paths: (context, report, out) =>
    drive(context, report, join(repo, 'examples/src/platformer'), 'scenes/level1.json', async (page) => {
      const selected = () => page.evaluate(() => {
        const path = window.m2dEditor.selectedPath?.();
        return path ? path.join('.') : null;
      });
      const lines = page.locator('svg.paths .path-line');
      report.check('both paths drawn', await lines.count() === 2, `${await lines.count()} lines`);

      const platform = await page.evaluate(() => window.m2dEditor.viewport.placement('movingPlatform-2').center);
      await page.mouse.click(platform.x, platform.y);
      await page.waitForTimeout(200);
      report.check('a click on a follower selects it, not its path', (await page.evaluate(() => window.m2dEditor.selectedIds())).join() === 'movingPlatform-2');
      report.check("the follower's route shows its handles", await page.locator('svg.paths .path-point').count() === 2);

      const lift = await page.evaluate(() => {
        const { viewport } = window.m2dEditor;
        const a = viewport.groundToClient(950, 700);
        const b = viewport.groundToClient(950, 430);
        return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
      });
      await page.evaluate(() => window.m2dEditor.select(null));
      await page.mouse.click(lift.x, lift.y);
      await page.waitForTimeout(200);
      report.check('a click on the line selects the path', await selected() === 'paths.lift', String(await selected()));

      const points = page.locator('svg.paths .path-point');
      report.check('its points have handles', await points.count() === 2);
      const box = await points.nth(1).boundingBox();
      const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + step * 8, from.y);
      await page.mouse.up();
      await page.waitForTimeout(300);
      report.check('a drag commits one edit', (await history(page)).undo === 'Move point 2 of lift', (await history(page)).undo);
      const moved = await page.evaluate(() => window.m2dEditor.remote.doc.data.paths.lift.points[1]);
      report.check('the point moved right in whole pixels', moved.x > 950 && moved.y === 430 && Number.isInteger(moved.x), JSON.stringify(moved));

      const mid = await page.evaluate(() => {
        const { viewport, remote } = window.m2dEditor;
        const [a, b] = remote.doc.data.paths.lift.points.map((p) => viewport.groundToClient(p.x, p.y));
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      });
      await page.mouse.dblclick(mid.x, mid.y);
      await page.waitForTimeout(300);
      report.check('a double-click adds a point', await points.count() === 3 && (await history(page)).undo === 'Add a point to lift', (await history(page)).undo);
      await shoot(page, out, 'paths-edited', report);

      const added = await points.nth(1).boundingBox();
      await page.keyboard.down('Alt');
      await page.mouse.click(added.x + added.width / 2, added.y + added.height / 2);
      await page.keyboard.up('Alt');
      await page.waitForTimeout(300);
      report.check('an alt-click removes it', await points.count() === 2, `${await points.count()} points`);
      await undoToClean(page, report);
    }),

  /** Ember Valley: play from the middle of the view, a prefab on its stage restarting on an edit. */
  playtest: (context, report, out) =>
    drive(context, report, join(repo, 'examples/src/platformer'), 'scenes/level1.json', async (page) => {
      const centre = await page.evaluate(() => {
        const area = window.m2dEditor.viewport.visibleArea();
        return { x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 };
      });
      await page.keyboard.press('Shift+F5');
      await until(page, () => window.m2dEditor.playing);
      await page.evaluate(() => window.m2dEditor.idle());
      const player = await page.evaluate(() => ({ ...window.m2dEditor.viewport.game.player.body.position }));
      report.check('Shift+F5 starts the player at the middle of the view', Math.abs(player.x - centre.x) < 2, `player x ${player.x.toFixed(1)}, view ${centre.x.toFixed(1)}`);
      await page.keyboard.press('F5');
      await until(page, () => !window.m2dEditor.playing);
      await page.evaluate(() => window.m2dEditor.idle());

      await page.click('.tree button.row[data-path=\'["prefabs","movingPlatform"]\']', { button: 'right' });
      await page.click('.menu .menu-item:has-text("Stage it")');
      await until(page, () => window.m2dEditor.playing);
      await page.evaluate(() => window.m2dEditor.idle());
      const staged = await page.evaluate(() => [...window.m2dEditor.viewport.game.sceneManager.getCurrentScene().entitiesById.keys()]);
      report.check('Stage it plays the prefab alone on a floor', staged.join() === 'stage-floor,stage', staged.join());
      await page.waitForTimeout(800);
      await shoot(page, out, 'playtest-stage', report);

      await page.evaluate(() => { window.__stagedGame = window.m2dEditor.viewport.game; });
      await page.evaluate(() => window.m2dEditor.edit({ label: 'Grip', ops: [{ op: 'set', path: ['prefabs', 'movingPlatform', 'physics', 'friction'], value: 0.5 }] }));
      await until(page, () => window.m2dEditor.playing && window.m2dEditor.viewport.game && window.m2dEditor.viewport.game !== window.__stagedGame);
      report.ok('an edit to the prefab restarts the stage');
      report.check('undo stays available while staging', !(await page.isDisabled('#undo')));
      await page.click('#undo');
      await page.waitForTimeout(200);
      await page.keyboard.press('F5');
      await until(page, () => !window.m2dEditor.playing);
      await page.evaluate(() => window.m2dEditor.idle());
      await undoToClean(page, report);
    }),

  /** A fresh 3D template: a crate lifted into the air, settled from the scene's menu. */
  async settle(context, report, out) {
    const folder = await mkdtemp(join(tmpdir(), 'm2d-drive-settle-'));
    try {
      const project = join(folder, 'game');
      await createProject(project, '3d');
      await drive(context, report, project, 'scenes/room.json', async (page) => {
        const crate = await page.evaluate(() => {
          const layers = window.m2dEditor.remote.doc.data.layers;
          for (const [l, layer] of layers.entries()) for (const [o, object] of layer.objects.entries()) if (object.prefab === 'crate') return { l, o, y: object.y };
          return null;
        });
        await page.evaluate(({ l, o, y }) => window.m2dEditor.edit({ label: 'Lift', ops: [{ op: 'set', path: ['layers', l, 'objects', o, 'y'], value: y + 3 }] }), crate);
        await page.click('.tree button.row[data-path="[]"]', { button: 'right' });
        await page.click('.menu .menu-item:has-text("Settle physics")');
        await until(page, () => window.m2dEditor.remote.state.undo?.startsWith('Settle'), 30000);
        const y = await page.evaluate(({ l, o }) => window.m2dEditor.remote.doc.data.layers[l].objects[o].y, crate);
        report.check('Settle physics brings the lifted crate back to rest', Math.abs(y - crate.y) < 0.05, `y ${y} (placed at ${crate.y}, lifted to ${crate.y + 3})`);
        await shoot(page, out, 'settled', report);
        await undoToClean(page, report);
      });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },

  /** A fresh 2D template: the menu UI scene and its elements. */
  async template2d(context, report, out) {
    const folder = await mkdtemp(join(tmpdir(), 'm2d-drive-template-'));
    try {
      const project = join(folder, 'game');
      await createProject(project, '2d');
      await drive(context, report, project, 'scenes/menu.json', async (page) => {
        report.check('the menu is a UI scene', await page.evaluate(() => !!window.m2dEditor.viewport.uiBox()));
        await shoot(page, out, 'template-menu', report);
        await pickAndMove(page, report);
        await undoToClean(page, report);
      });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
};

// --- Main -------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const names = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--out');
const chosen = names.length ? names : Object.keys(SUITES);
const unknown = chosen.filter((name) => !SUITES[name]);
if (unknown.length) {
  console.error(`unknown suite: ${unknown.join(', ')} (have: ${Object.keys(SUITES).join(', ')})`);
  process.exit(2);
}
const out = option('--out') ? resolve(option('--out')) : await mkdtemp(join(tmpdir(), 'm2d-drive-'));

const chrome = await launchGpuChrome({ headed: flag('--headed') });
console.log(`Chrome: ${chrome.binary} on port ${chrome.port}; screenshots in ${out}`);
const context = await chrome.browser.newContext({ viewport: { width: 1600, height: 1000 } });
const reports = [];
try {
  for (const name of chosen) {
    console.log(`\n${name}`);
    const report = new Report(name);
    reports.push(report);
    try {
      await SUITES[name](context, report, out);
    } catch (error) {
      report.check('suite ran', false, String(error.message ?? error).split('\n')[0]);
    }
  }
} finally {
  await context.close().catch(() => {});
  await chrome.close();
}

const all = reports.flatMap((report) => report.results.map((result) => ({ suite: report.suite, ...result })));
const failed = all.filter((result) => !result.pass);
await writeFile(join(out, 'report.json'), JSON.stringify(all, null, 2));
console.log(`\n${all.length - failed.length}/${all.length} checks passed${failed.length ? `; failed: ${failed.map((f) => `${f.suite}: ${f.name}`).join('; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
