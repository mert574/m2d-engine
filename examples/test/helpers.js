import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { expect } from 'vitest';
import { join } from 'node:path';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { GlideControl } from 'm2d-kit/controls';
import { Sky, Scatter, ParticleField, AmbientSound } from 'm2d-kit/scenery';
import { GravityDial } from 'm2d-kit/actors';
import { Footsteps } from 'm2d-engine/constraints/footsteps.js';
import { AssetDatabase } from 'm2d-engine/core/assets.js';
import { BUILTIN_ACTORS, BUILTIN_CONSTRAINTS, Registry } from 'm2d-engine/core/builtins.js';
import { CollisionLayers } from 'm2d-engine/core/collisionLayers.js';

/**
 * Shared machinery for the tests that sweep every shipped scene:
 * which actors and constraints each demo registers, a game stub exposing
 * only what the loader cross-references, and the file discovery.
 */

/**
 * Constraint classes a demo may name in a scene file. The real classes,
 * not stubs: their `static params` is what declared params validate
 * against, so a mistyped param in a demo scene fails here.
 */
const CONSTRAINT_CLASSES = { Chase, Footsteps, GlideControl };

/**
 * The kit actors each demo registers, as the real classes for the same
 * reason: a field's kind is checked against the level's dimension, and a
 * dial's counter against the level's counters, by the actor itself. Only
 * where the demo registers them: Salvage Run has a `Sky` of its own.
 */
const SCENERY = { Sky, Scatter, ParticleField, AmbientSound };
export const KIT_CLASSES = { platformer: SCENERY, yard: SCENERY, physics: { GravityDial } };

/** Actors each demo registers with `game.registerActor`. */
export const DEMO_ACTORS = {
  platformer: ['Player', 'Bee', 'Platform', 'MovingPlatform', 'Coin', 'ValleyGate', 'ValleyBackdrop'],
  topdown: ['TopDownPlayer', 'Ghost', 'Platform', 'Coin', 'ExtractionPad', 'Turret', 'FloorMarks', 'CeilingLamp'],
  oblique: ['ObliquePlayer', 'Ghost', 'Tree', 'Decor', 'Bound', 'Pond', 'Coin', 'Clearing', 'Npc', 'GroundDetail'],
  iso: ['ObliquePlayer', 'Ghost', 'Wall', 'Torch', 'Coin', 'Stair', 'Quartermaster'],
  belt: ['ObliquePlayer', 'Ghost', 'Lamp', 'Bound', 'Trigger', 'Street', 'Foreground'],
  drift: ['Ship', 'Meteor', 'Drone', 'Salvage', 'Gate', 'Bound', 'Sky'],
  yard: ['Hero', 'Ground', 'Crate'],
  physics: ['Ball', 'Box', 'Housing', 'Girder', 'Peg', 'Spout', 'WorkshopBackdrop'],
  circuit: ['Road', 'RaceDirector', 'TrafficCar', 'Cone', 'Barrel', 'OilSlick', 'BoostPad', 'GateArm', 'Checkpoint', 'IceStretch', 'Tunnel'],
  maze: ['Gardener', 'Hedge', 'Fountain', 'FlowerBed', 'GardenBackdrop'],
  scroller: ['Meadow', 'ForeMeadow', 'ScrollFront', 'Bee', 'Flower', 'Pollen', 'Thistle', 'Wasp', 'Web', 'Hive'],
  'first-game': ['Hero']
};

/** Constraints each demo registers, and so may attach from its scenes. */
export const DEMO_CONSTRAINTS = {
  platformer: ['Chase'],
  maze: ['GlideControl'],
  yard: ['Footsteps']
};

/** A game stub exposing only what the loader cross-references. */
export function makeGame({ actors = [], classes = {}, scenes = [], constraints = [], manifest = null, layers = [] } = {}) {
  // Registries, not plain maps: a scene may name an engine actor or
  // constraint the game never registered, exactly as it may in play.
  const actorMap = new Registry(BUILTIN_ACTORS);
  for (const name of actors) actorMap.set(name, class {});
  for (const [name, klass] of Object.entries(classes)) actorMap.set(name, klass);
  const constraintMap = new Registry(BUILTIN_CONSTRAINTS);
  for (const name of constraints) constraintMap.set(name, CONSTRAINT_CLASSES[name]);
  const assets = new AssetDatabase();
  if (manifest) assets.load(manifest, { actors: actorMap });
  return {
    actors: actorMap,
    constraintTypes: constraintMap,
    collisionLayers: new CollisionLayers(layers),
    assets,
    sceneManager: { scenes: new Map(), scenesToLoad: scenes.map(name => ({ name })) }
  };
}

/**
 * The game stub for one demo, its manifest loaded when it ships one and
 * its scenes registered as its project registers them, by name — so a
 * menu's `onClick` to a level of its own resolves, and one to a scene the
 * game does not have is refused as it would be in play.
 */
export function gameFor(example) {
  const projectFile = join(import.meta.dirname, '..', 'src', example, 'm2d.project.json');
  const layers = existsSync(projectFile) ? JSON.parse(readFileSync(projectFile, 'utf8')).layers ?? [] : [];
  return makeGame({
    actors: DEMO_ACTORS[example],
    classes: KIT_CLASSES[example] ?? {},
    constraints: DEMO_CONSTRAINTS[example],
    manifest: manifestFor(example),
    scenes: sceneNamesOf(example),
    layers
  });
}

/** The names of the scene files a demo ships. */
function sceneNamesOf(example) {
  const dir = join(import.meta.dirname, '..', 'src', example, 'scenes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).name)
    .filter(Boolean);
}

/** A demo's asset manifest, if it ships one beside its scenes. */
export function manifestFor(example) {
  const path = join(import.meta.dirname, '..', 'src', example, 'assets.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

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

/**
 * The games among the examples that are editor projects — a folder with an
 * `m2d.project.json` — each as a real headless game with its definition's
 * `register(game)` run on it: the classes, intents and manifest the game
 * itself boots with, so declared actor `properties` and constraint
 * `params` are checked the way they are in play. The stubs above cannot
 * do that: a `class {}` declares nothing, and a scene field its real
 * actor rejects passes against it.
 */
export async function projectGames() {
  const src = join(import.meta.dirname, '..', 'src');
  const folders = readdirSync(src).filter(name => existsSync(join(src, name, 'm2d.project.json')));
  return Promise.all(folders.map(async (folder) => {
    const { game, config, root, sceneDir } = await bootHeadless(folder);
    const scenes = readdirSync(sceneDir).filter(f => f.endsWith('.json')).map(f => join(sceneDir, f));
    // Registered by name, as bootProject registers them: a menu's onClick
    // to a level of the game's resolves, and a typo is refused.
    for (const path of scenes) {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      game.sceneManager.addScene(data.name, { fetch: async () => data });
    }
    return { name: config.name, root, game, scenes };
  }));
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
