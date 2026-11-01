import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SceneLoader } from 'm2d-engine/core/sceneLoader.js';

/**
 * Every scene the repo ships must satisfy the engine's scene schema, so
 * tightening the validator or editing a scene cannot quietly break an example.
 */

/** A game stub exposing only what the loader cross-references. */
function makeGame({ actors = [], scenes = [] } = {}) {
  return {
    actors: new Map(actors.map(name => [name, class {}])),
    sceneManager: { scenes: new Map(), scenesToLoad: scenes.map(name => ({ name })) }
  };
}

describe('shipped example scenes', () => {
  const examples = join(import.meta.dirname, '..', 'src');
  const actors = {
    platformer: ['Player', 'Bee', 'Platform', 'MovingPlatform', 'Coin', 'Trigger'],
    topdown: ['TopDownPlayer', 'Ghost', 'Platform', 'Coin', 'Trigger', 'Turret'],
    doner: []
  };
  const scenes = {
    platformer: ['mainMenu', 'level1'],
    topdown: ['mainMenu', 'level1'],
    doner: ['mainMenu', 'gameplay']
  };

  const files = readdirSync(examples)
    .flatMap(example => {
      const dir = join(examples, example, 'scenes');
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ example, name: `${example}/${f}`, path: join(dir, f) }));
    });

  it('finds the scene files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('$name validates', ({ example, path }) => {
    const game = makeGame({ actors: actors[example], scenes: scenes[example] });
    const data = JSON.parse(readFileSync(path, 'utf8'));
    expect(() => new SceneLoader(game).load(data)).not.toThrow();
  });
});
