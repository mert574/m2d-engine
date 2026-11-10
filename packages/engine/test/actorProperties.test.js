import { describe, it, expect, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { initPhysics } from '../src/core/physics/index.js';
import { SceneLoader, SCENE_VERSION } from '../src/core/sceneLoader.js';
import { actorPropertiesSchema } from '../src/core/sceneSchema.js';
import { fieldsOf } from '../src/core/schema.js';
import { s } from '../src/core/schema.js';

/**
 * An actor declaring what a scene may set, the way a constraint declares
 * `static params`.
 *
 * Before this an actor's `properties` were `s.any`: a typo did nothing,
 * visibly, until someone wondered why the guard would not move, and no
 * inspector could draw the fields because nothing could be asked what
 * they were. Declaring them buys both — and an actor that declares
 * nothing keeps the old free-form contract, so this is per actor.
 */

class Guard extends Entity {
  name = 'Guard';
  static properties = {
    speed: s.number({ initial: 60, positive: true, unit: 'px/s', label: 'Patrol speed' }),
    alert: s.boolean({ initial: false }),
    taunt: s.string()
  };
}

/** No schema: anything goes, as before. */
class Drifter extends Entity { name = 'Drifter'; }

beforeAll(async () => {
  await initPhysics();
});

const level = (properties, actor = 'Guard') => ({
  version: SCENE_VERSION, type: 'level', name: 'room',
  prefabs: { thing: { actor, physics: { bodyType: 'static' } } },
  layers: [{ name: 'main', objects: [{ id: 'a', prefab: 'thing', x: 0, y: 0, properties }] }]
});

function makeGame() {
  const game = new M2D(null, { headless: true, worldWidth: 320, worldHeight: 240, seed: 1 });
  game.registerActor('Guard', Guard);
  game.registerActor('Drifter', Drifter);
  return game;
}

describe('static properties on an actor', () => {
  it('accepts what the actor declares', () => {
    const game = makeGame();
    expect(() => new SceneLoader(game).load(level({ speed: 120, alert: true, taunt: 'halt' })))
      .not.toThrow();
    game.destroy();
  });

  it('rejects a property the actor does not declare, naming its path', () => {
    const game = makeGame();
    expect(() => new SceneLoader(game).load(level({ spead: 120 })))
      .toThrow(/layers\[0\]\.objects\[0\]\.properties\.spead.*unknown field 'spead'/s);
    game.destroy();
  });

  it('rejects a property of the wrong type', () => {
    const game = makeGame();
    expect(() => new SceneLoader(game).load(level({ speed: 'fast' })))
      .toThrow(/properties\.speed/);
    expect(() => new SceneLoader(game).load(level({ speed: -5 })))
      .toThrow(/must be a positive number/);
    game.destroy();
  });

  it('does not fill in an initial, so setting one property leaves the rest alone', () => {
    // `initial` is inspector metadata; applying it here would mean a
    // scene that sets `speed` also pins `alert`, which the actor's own
    // constructor should decide.
    const game = makeGame();
    const loaded = new SceneLoader(game).load(level({ speed: 120 }));
    expect(loaded.layers[0].objects[0].properties).toEqual({ speed: 120 });
    game.destroy();
  });

  it('leaves an actor that declares nothing unchecked', () => {
    const game = makeGame();
    expect(() => new SceneLoader(game).load(level({ whatever: { deep: [1, 2] } }, 'Drifter')))
      .not.toThrow();
    game.destroy();
  });

  it('skips the check when there is no game to name the actor', () => {
    // The structural pass, as for constraint params: no registry to ask.
    expect(() => new SceneLoader(null).load(level({ spead: 1 }))).not.toThrow();
  });

  it('reaches the actor as its options', async () => {
    const game = makeGame();
    game.sceneManager.addScene('room', { fetch: async () => level({ speed: 120, taunt: 'halt' }) });
    await game.sceneManager.switchTo('room');
    const guard = game.sceneManager.getCurrentScene().entitiesById.get('a');
    expect(guard).toBeInstanceOf(Guard);
    game.destroy();
  });

  it('joins the class chain, a subclass adding to its bases', () => {
    class Captain extends Guard {
      name = 'Captain';
      static properties = { rank: s.string({ initial: 'captain' }) };
    }
    const game = makeGame();
    game.registerActor('Captain', Captain);
    // Its own and its base's both pass…
    expect(() => new SceneLoader(game).load(level({ rank: 'major', speed: 90 }, 'Captain')))
      .not.toThrow();
    // …and neither opens the door to anything else.
    expect(() => new SceneLoader(game).load(level({ nonsense: 1 }, 'Captain'))).toThrow(/unknown field/);
    expect(fieldsOf(actorPropertiesSchema(Captain)).map(f => f.key))
      .toEqual(['speed', 'alert', 'taunt', 'rank']);
    game.destroy();
  });

  it('checks a subclass that declares nothing against its base', () => {
    class Sentry extends Guard { name = 'Sentry'; }
    const game = makeGame();
    game.registerActor('Sentry', Sentry);
    expect(() => new SceneLoader(game).load(level({ speed: 70 }, 'Sentry'))).not.toThrow();
    expect(() => new SceneLoader(game).load(level({ spead: 70 }, 'Sentry'))).toThrow(/unknown field/);
    game.destroy();
  });

  it('is what an inspector reads', () => {
    const fields = fieldsOf(actorPropertiesSchema(Guard));
    expect(fields.map(f => f.key)).toEqual(['speed', 'alert', 'taunt']);
    expect(fields[0]).toMatchObject({ kind: 'number', initial: 60, unit: 'px/s', label: 'Patrol speed' });
    // An actor with no schema yields no fields rather than throwing.
    expect(fieldsOf(actorPropertiesSchema(Drifter))).toEqual([]);
  });
});
