import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { expect } from 'vitest';
import { join } from 'node:path';

/**
 * Shared machinery for the tests that sweep every shipped scene: the
 * shipped projects booted with their own definitions, the file discovery,
 * and a headless playthrough harness.
 */

/** Every shipped scene file: the demos' and the docs' first-game demo. */
export function sceneFiles() {
  const examples = join(import.meta.dirname, '..', 'src');
  const files = readdirSync(examples)
    .flatMap(example => {
      const dir = join(examples, example, 'scenes');
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ example, name: `${example}/${f}`, path: join(dir, f) }));
    });

  const docsDemo = join(import.meta.dirname, '..', '..', 'docs', 'demos', 'first-game', 'scenes');
  if (existsSync(docsDemo)) {
    files.push(...readdirSync(docsDemo)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ example: 'first-game', name: `docs/demos/first-game/scenes/${f}`, path: join(docsDemo, f) })));
  }
  return files;
}

/** Where each shipped project's folder is, from `examples/src`: every example, and the walkthrough under docs. */
function projectFolders() {
  const src = join(import.meta.dirname, '..', 'src');
  const examples = readdirSync(src).filter((name) => existsSync(join(src, name, 'm2d.project.json')));
  return new Map([...examples.map((name) => [name, name]), ['first-game', '../../docs/demos/first-game']]);
}

let shipped = null;

/**
 * Every shipped project booted headless with its own definition — the
 * classes and constraints it really registers — and its scenes registered
 * by name, as bootProject registers them, so a menu's onClick to a level of
 * the game's resolves and a typo is refused. Keyed by the name the scene
 * files list it under (`first-game` is the walkthrough). Booted once per
 * test file.
 * @returns {Promise<Map<string, {name: string, root: string, game: object, scenes: string[]}>>}
 */
export function shippedGames() {
  shipped ??= (async () => {
    const out = new Map();
    for (const [key, folder] of projectFolders()) {
      const { game, config, root, sceneDir } = await bootHeadless(folder);
      const scenes = readdirSync(sceneDir).filter((f) => f.endsWith('.json')).map((f) => join(sceneDir, f));
      for (const path of scenes) {
        const data = JSON.parse(readFileSync(path, 'utf8'));
        game.sceneManager.addScene(data.name, { fetch: async () => data });
      }
      out.set(key, { name: config.name, root, game, scenes });
    }
    return out;
  })();
  return shipped;
}

/** The shipped projects, as a list. */
export async function projectGames() {
  return [...(await shippedGames()).values()];
}

/** Every shipped asset manifest. */
export function manifestFiles() {
  const examples = join(import.meta.dirname, '..', 'src');
  return readdirSync(examples)
    .map(example => ({ example, name: `${example}/assets.json`, path: join(examples, example, 'assets.json') }))
    .filter(({ path }) => existsSync(path));
}

/**
 * An example's headless game, booted as `bootProject` boots it (its
 * definition's options, the project's actions and choices) with its cast
 * registered; what every headless test of an example starts from.
 */
export async function bootHeadless(folder, { seed } = {}) {
  const { M2D } = await import('m2d-engine/core/m2d.js');
  const { initPhysics } = await import('m2d-engine/core/physics/index.js');
  const { projectOptions } = await import('m2d-engine/core/project.js');
  const root = join(import.meta.dirname, '..', 'src', folder);
  const config = JSON.parse(readFileSync(join(root, 'm2d.project.json'), 'utf8'));
  const definition = await import(join(root, config.definition));
  const options = definition.GAME ?? {};
  const dimensions = options.dimensions === 3 ? 3 : 2;
  await initPhysics(dimensions === 3 ? { dimensions: 3 } : undefined);
  const game = new M2D(null, { ...options, ...projectOptions(config), headless: true, ...(seed !== undefined && { seed }) });
  definition.register(game);
  return { game, config, root, dimensions, sceneDir: join(root, config.scenes ?? 'scenes') };
}

/**
 * One example played headless: the scene asked for, a stand-in for the
 * menu (a headless game has no UI, and a rule's `switch` needs somewhere
 * to go), collision handlers on, and the input fed by the test. What
 * comes back is the game and the few moves every playthrough makes.
 */
export async function playHeadless(folder, sceneName, { seed = 1 } = {}) {
  const { game, dimensions, sceneDir } = await bootHeadless(folder, { seed });
  const data = JSON.parse(readFileSync(join(sceneDir, `${sceneName}.json`), 'utf8'));
  game.sceneManager.addScene(sceneName, { fetch: async () => data });
  game.sceneManager.addScene('mainMenu', { fetch: async () => ({ version: data.version, type: 'level', name: 'mainMenu', world: { dimensions }, prefabs: {}, layers: [{ name: 'main', objects: [] }] }) });
  await game.sceneManager.switchTo(sceneName);
  game.setupCollisionHandlers();
  const scene = game.sceneManager.getCurrentScene();

  let held = { down: [], pressed: [], heading: 0 };
  game.input.setSnapshotSource(() => held);
  /** Run ticks, and insist they all ran: a game stops ticking while a scene loads, and a stray switch would otherwise freeze a test into passing. */
  const run = (ticks) => { expect(game.step(ticks), 'a scene switch stopped the ticks').toBe(ticks); };

  return {
    game, scene, data, run,
    /** Hold keys for some ticks, the view facing `heading`. */
    hold(codes, ticks, heading = 0) {
      held = { down: codes, pressed: [], heading };
      run(ticks);
      held = { down: [], pressed: [], heading };
    },
    /** Press keys for one tick, with a quiet tick after; the quiet one may not run if the press switched scenes. */
    press(...codes) {
      held = { down: codes, pressed: codes, heading: 0 };
      run(1);
      held = { down: [], pressed: [], heading: 0 };
      game.step(1);
    },
    /** Put the player somewhere, still, and let the contacts register. */
    standAt({ x, y }) {
      game.player.body.setPosition({ x, y });
      game.player.body.setVelocity({ x: 0, y: 0 });
      run(3);
    },
    /** The objects the file places from a prefab. */
    placed: (prefab) => data.layers.flatMap((layer) => layer.objects).filter((object) => object.prefab === prefab),
    /** The scene's rule on an event. */
    rule: (event) => scene.rules.rules.find((candidate) => candidate.when.event === event),
    /** How many ticks a rule's `switch` waits before it runs. */
    switchDelay(event) {
      const rule = scene.rules.rules.find((candidate) => candidate.when.event === event);
      const after = rule.then.find((action) => action.do === 'switch').after ?? 0;
      return Math.round(after / game.time.fixedTimestep);
    },
    /** The scene showing now, by name. */
    current: () => game.sceneManager.getCurrentScene().config.name,
    /** A switch that has begun has finished: the stand-in scenes load in microtasks alone. */
    async settled() { while (game.sceneManager.loading) await Promise.resolve(); }
  };
}
