import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { Footsteps } from 'm2d-engine/constraints/footsteps.js';
import { AssetDatabase } from 'm2d-engine/core/assets.js';
import { BUILTIN_ACTORS, BUILTIN_CONSTRAINTS, Registry } from 'm2d-engine/core/builtins.js';

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
const CONSTRAINT_CLASSES = { Chase, Footsteps };

/** Actors each demo registers with `game.registerActor`. */
export const DEMO_ACTORS = {
  platformer: ['Player', 'Bee', 'Platform', 'MovingPlatform', 'Coin', 'Trigger', 'ValleyBackdrop'],
  topdown: ['TopDownPlayer', 'Ghost', 'Platform', 'Coin', 'Trigger', 'Turret', 'FloorMarks', 'CeilingLamp'],
  oblique: ['ObliquePlayer', 'Ghost', 'Tree', 'Decor', 'Bound', 'Pond', 'Coin', 'Trigger', 'Npc', 'GroundDetail'],
  iso: ['ObliquePlayer', 'Ghost', 'Wall', 'Torch', 'Coin', 'Trigger', 'Quartermaster'],
  belt: ['ObliquePlayer', 'Ghost', 'Lamp', 'Bound', 'Trigger', 'Street', 'Foreground'],
  drift: ['Ship', 'Meteor', 'Drone', 'Salvage', 'Gate', 'Bound', 'Sky'],
  yard: ['Hero', 'Ground', 'Crate'],
  physics: ['Ball', 'Box', 'Housing', 'Girder', 'Peg', 'Spout', 'WorkshopBackdrop'],
  'first-game': ['Hero', 'Platform']
};

/** Constraints each demo registers, and so may attach from its scenes. */
export const DEMO_CONSTRAINTS = {
  platformer: ['Chase'],
  yard: ['Footsteps']
};

/** A game stub exposing only what the loader cross-references. */
export function makeGame({ actors = [], scenes = [], constraints = [], manifest = null } = {}) {
  // Registries, not plain maps: a scene may name an engine actor or
  // constraint the game never registered, exactly as it may in play.
  const actorMap = new Registry(BUILTIN_ACTORS);
  for (const name of actors) actorMap.set(name, class {});
  const constraintMap = new Registry(BUILTIN_CONSTRAINTS);
  for (const name of constraints) constraintMap.set(name, CONSTRAINT_CLASSES[name]);
  const assets = new AssetDatabase();
  if (manifest) assets.load(manifest, { actors: actorMap });
  return {
    actors: actorMap,
    constraintTypes: constraintMap,
    assets,
    sceneManager: { scenes: new Map(), scenesToLoad: scenes.map(name => ({ name })) }
  };
}

/** The game stub for one demo, its manifest loaded when it ships one. */
export function gameFor(example) {
  return makeGame({
    actors: DEMO_ACTORS[example],
    constraints: DEMO_CONSTRAINTS[example],
    manifest: manifestFor(example)
  });
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

  const docsDemo = join(import.meta.dirname, '..', '..', 'docs', 'demos', 'first-game');
  if (existsSync(docsDemo)) {
    files.push(...readdirSync(docsDemo)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ example: 'first-game', name: `docs/demos/first-game/${f}`, path: join(docsDemo, f) })));
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
  const { M2D } = await import('m2d-engine/core/m2d.js');
  const { initPhysics } = await import('m2d-engine/core/physics/index.js');
  const src = join(import.meta.dirname, '..', 'src');
  const folders = readdirSync(src).filter(name => existsSync(join(src, name, 'm2d.project.json')));
  return Promise.all(folders.map(async (folder) => {
    const root = join(src, folder);
    const config = JSON.parse(readFileSync(join(root, 'm2d.project.json'), 'utf8'));
    const definition = await import(join(root, config.definition));
    const options = definition.GAME ?? {};
    await initPhysics(options.dimensions === 3 ? { dimensions: 3 } : undefined);
    const game = new M2D(null, { ...options, headless: true });
    definition.register(game);
    const scenes = join(root, config.scenes ?? 'scenes');
    return {
      name: config.name,
      root,
      game,
      scenes: readdirSync(scenes).filter(f => f.endsWith('.json')).map(f => join(scenes, f))
    };
  }));
}

/** Every shipped asset manifest. */
export function manifestFiles() {
  const examples = join(import.meta.dirname, '..', 'src');
  return readdirSync(examples)
    .map(example => ({ example, name: `${example}/assets.json`, path: join(examples, example, 'assets.json') }))
    .filter(({ path }) => existsSync(path));
}
