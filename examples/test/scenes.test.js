import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SceneLoader, SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { AssetDatabase } from 'm2d-engine/core/assets.js';

/**
 * Every scene the repo ships must satisfy the engine's scene schema, so
 * tightening the validator or editing a scene cannot quietly break an example.
 */

/**
 * Constraint classes a demo may name in a scene file. The real classes,
 * not stubs: their `static params` is what declared params validate
 * against, so a mistyped param in a demo scene fails here.
 */
const CONSTRAINT_CLASSES = { Chase };

/** A game stub exposing only what the loader cross-references. */
function makeGame({ actors = [], scenes = [], constraints = [], manifest = null } = {}) {
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

/** A demo's asset manifest, if it ships one beside its scenes. */
function manifestFor(example) {
  const path = join(import.meta.dirname, '..', 'src', example, 'assets.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

describe('shipped example scenes', () => {
  const examples = join(import.meta.dirname, '..', 'src');
  const actors = {
    platformer: ['Player', 'Bee', 'Platform', 'MovingPlatform', 'Coin', 'Trigger'],
    topdown: ['TopDownPlayer', 'Ghost', 'Platform', 'Coin', 'Trigger', 'Turret'],
    oblique: ['ObliquePlayer', 'Ghost', 'Tree', 'Decor', 'Bound', 'Pond', 'Coin', 'Trigger', 'Npc', 'GroundDetail'],
    iso: ['ObliquePlayer', 'Ghost', 'Wall', 'Torch', 'Coin', 'Trigger', 'Quartermaster'],
    belt: ['ObliquePlayer', 'Ghost', 'Lamp', 'Bound', 'Trigger', 'Street', 'Foreground'],
    drift: ['Ship', 'Meteor', 'Drone', 'Salvage', 'Gate', 'Bound', 'Sky'],
    yard: ['Hero', 'Ground', 'Crate']
  };
  // Constraints each demo registers with `game.registerConstraint`, and so
  // may attach and tune from its scene files.
  const constraints = {
    platformer: ['Chase']
  };

  const files = readdirSync(examples)
    .flatMap(example => {
      const dir = join(examples, example, 'scenes');
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ example, name: `${example}/${f}`, path: join(dir, f) }));
    });

  // The documentation's first-game demo ships scene files as well.
  const docsDemo = join(import.meta.dirname, '..', '..', 'docs', 'demos', 'first-game');
  if (existsSync(docsDemo)) {
    actors['first-game'] = ['Hero', 'Platform'];
    files.push(...readdirSync(docsDemo)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ example: 'first-game', name: `docs/demos/first-game/${f}`, path: join(docsDemo, f) })));
  }

  it('finds the scene files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('$name validates', ({ example, path }) => {
    const game = makeGame({
      actors: actors[example], constraints: constraints[example],
      manifest: manifestFor(example)
    });
    const data = JSON.parse(readFileSync(path, 'utf8'));
    expect(() => new SceneLoader(game).load(data)).not.toThrow();
  });

  // Migrations exist for documents the engine does not own. A shipped scene
  // left at an older version would validate through its migration and hide
  // whatever the current format now asks for.
  it.each(files)('$name is written at the current scene version', ({ path }) => {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    expect(data.version).toBe(SCENE_VERSION);
  });
});
