import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { AssetDatabase } from 'm2d-engine/core/assets.js';

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
const CONSTRAINT_CLASSES = { Chase };

/** Actors each demo registers with `game.registerActor`. */
export const DEMO_ACTORS = {
  platformer: ['Player', 'Bee', 'Platform', 'MovingPlatform', 'Coin', 'Trigger'],
  topdown: ['TopDownPlayer', 'Ghost', 'Platform', 'Coin', 'Trigger', 'Turret'],
  oblique: ['ObliquePlayer', 'Ghost', 'Tree', 'Decor', 'Bound', 'Pond', 'Coin', 'Trigger', 'Npc', 'GroundDetail'],
  iso: ['ObliquePlayer', 'Ghost', 'Wall', 'Torch', 'Coin', 'Trigger', 'Quartermaster'],
  belt: ['ObliquePlayer', 'Ghost', 'Lamp', 'Bound', 'Trigger', 'Street', 'Foreground'],
  drift: ['Ship', 'Meteor', 'Drone', 'Salvage', 'Gate', 'Bound', 'Sky'],
  yard: ['Hero', 'Ground', 'Crate'],
  'first-game': ['Hero', 'Platform']
};

/** Constraints each demo registers, and so may attach from its scenes. */
export const DEMO_CONSTRAINTS = {
  platformer: ['Chase']
};

/** A game stub exposing only what the loader cross-references. */
export function makeGame({ actors = [], scenes = [], constraints = [], manifest = null } = {}) {
  const actorMap = new Map(actors.map(name => [name, class {}]));
  const assets = new AssetDatabase();
  if (manifest) assets.load(manifest, { actors: actorMap });
  return {
    actors: actorMap,
    constraintTypes: new Map(constraints.map(name => [name, CONSTRAINT_CLASSES[name]])),
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

/** Every shipped asset manifest. */
export function manifestFiles() {
  const examples = join(import.meta.dirname, '..', 'src');
  return readdirSync(examples)
    .map(example => ({ example, name: `${example}/assets.json`, path: join(examples, example, 'assets.json') }))
    .filter(({ path }) => existsSync(path));
}
