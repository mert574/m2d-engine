import { describe, it, expect } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { Constraint } from '../src/core/constraint.js';
import { SceneLoader, SCENE_VERSION } from '../src/core/sceneLoader.js';
import { s } from '../src/core/schema.js';
import { Chase } from '../src/constraints/chase.js';
import { Hover } from '../src/constraints/hover.js';
import { KeyboardControl } from '../src/constraints/keyboardControl.js';

/**
 * Constraints declared in a scene file.
 *
 * A constraint is already a component — a named behaviour with its own
 * update hooks and teardown — but until now the only way to attach one was
 * to write an actor that did it in code. That is the gap between this
 * engine and an editor: you cannot add a behaviour to a thing and tune it
 * without being a programmer. A scene can now say which constraints an
 * entity has and what they are set to, validated against the same
 * `static params` an inspector would draw.
 */

/** An actor that attaches a constraint itself, as actors have always done. */
class Guard extends Entity {
  name = 'Guard';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('chase', new Chase(this, { speed: 60, detectionRange: 400 }));
  }
}

class Prop extends Entity {
  name = 'Prop';
}

/** An actor whose numbers a prefab may set for all its objects. */
class Tunable extends Entity {
  static properties = { amount: s.number({ initial: 0 }), label: s.string() };
  name = 'Tunable';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.amount = options.amount ?? 0;
    this.label = options.label ?? '';
  }
}

function makeGame() {
  const game = new M2D(null, { headless: true, worldWidth: 640, worldHeight: 480, seed: 1 });
  game.registerActor('Guard', Guard);
  game.registerActor('Prop', Prop);
  game.registerActor('Tunable', Tunable);
  game.registerConstraint('Chase', Chase);
  game.registerConstraint('Hover', Hover);
  game.registerConstraint('KeyboardControl', KeyboardControl);
  return game;
}

/** A level whose single object uses `prefab` and `object` constraint blocks. */
function level({ prefabConstraints, objectConstraints, actor = 'Prop' } = {}) {
  return {
    version: SCENE_VERSION,
    type: 'level',
    name: 'level1',
    prefabs: {
      thing: {
        actor,
        physics: { bodyType: 'static' },
        ...(prefabConstraints && { constraints: prefabConstraints })
      }
    },
    layers: [{
      name: 'main',
      objects: [{
        id: 'thing-1', prefab: 'thing', x: 0, y: 0, width: 16, height: 16,
        ...(objectConstraints && { constraints: objectConstraints })
      }]
    }]
  };
}

async function build(config) {
  const game = makeGame();
  game.sceneManager.addScene('level1', { fetch: async () => config });
  await game.sceneManager.switchTo('level1');
  const entity = game.sceneManager.getCurrentScene().entitiesById.get('thing-1');
  return { game, entity };
}

describe('constraints declared in a scene', () => {
  it('attaches one a prefab declares, with its params', async () => {
    const { game, entity } = await build(level({
      prefabConstraints: { bob: { type: 'Hover', params: { amplitude: 12, frequency: 3 } } }
    }));

    const hover = entity.getConstraint('bob');
    expect(hover).toBeInstanceOf(Hover);
    expect(hover.amplitude).toBe(12);
    expect(hover.frequency).toBe(3);
    // Untouched params keep the constraint's own default, not a schema one.
    expect(hover.spin).toBe(0);
    game.destroy();
  });

  it('lets an object override a prefab param without resetting the rest', async () => {
    const { game, entity } = await build(level({
      prefabConstraints: { bob: { type: 'Hover', params: { amplitude: 12, frequency: 3 } } },
      objectConstraints: { bob: { params: { amplitude: 40 } } }
    }));

    const hover = entity.getConstraint('bob');
    expect(hover.amplitude).toBe(40);
    expect(hover.frequency).toBe(3);
    game.destroy();
  });

  it('retunes a constraint the actor attached, keeping what it set up', async () => {
    // The point of the feature: one guard patrols faster than the rest
    // without a second actor or a second prefab.
    const { game, entity } = await build(level({
      actor: 'Guard',
      objectConstraints: { chase: { params: { speed: 200 } } }
    }));

    const chase = entity.getConstraint('chase');
    expect(chase.speed).toBe(200);
    expect(chase.detectionRange).toBe(400);
    // The derived idle speed follows: it trails the pursuit speed, which is
    // why `configure` is overridable instead of params being plain writes.
    expect(chase.idleSpeed).toBeCloseTo(120);
    game.destroy();
  });

  it('keeps an explicitly set derived param', async () => {
    const { game, entity } = await build(level({
      actor: 'Guard',
      objectConstraints: { chase: { params: { speed: 200, idleSpeed: 10 } } }
    }));

    expect(entity.getConstraint('chase').idleSpeed).toBe(10);
    game.destroy();
  });

  it('merges key bindings rather than replacing them', async () => {
    const { game, entity } = await build(level({
      prefabConstraints: {
        control: { type: 'KeyboardControl', params: { keys: { jump: 'KeyZ' } } }
      }
    }));

    const control = entity.getConstraint('control');
    expect(control.keys.jump).toBe('KeyZ');
    expect(control.keys.left).toBe('ArrowLeft');
    game.destroy();
  });

  it('refuses an entry that tunes a slot nothing filled', async () => {
    await expect(build(level({ objectConstraints: { ghost: { params: { speed: 1 } } } })))
      .rejects.toThrow(/constraint 'ghost': nothing attached one and no type was given/);
  });

  it('refuses a type that conflicts with the constraint already in the slot', async () => {
    // Silently replacing would discard the callbacks the actor wired up;
    // silently configuring the old one would set the wrong object. The
    // author has to say which they meant.
    await expect(build(level({
      actor: 'Guard',
      objectConstraints: { chase: { type: 'Hover' } }
    }))).rejects.toThrow(/conflicts with the Chase already attached/);
  });

  it('refuses a param the constraint does not have, when applied', async () => {
    // Reached through an override, which names no type, so the loader
    // could not have resolved the class.
    await expect(build(level({
      actor: 'Guard',
      objectConstraints: { chase: { params: { speeed: 200 } } }
    }))).rejects.toThrow(/unknown field 'speeed'/);
  });
});

describe('the engine\'s own constraints and actors, unregistered', () => {
  it('attach by name without the game registering them, the game\'s registration winning', async () => {
    const game = makeGame();
    expect(game.constraintTypes.has('Footsteps')).toBe(true);        // never registered here
    expect(game.constraintTypes.isBuiltin('Footsteps')).toBe(true);
    expect(game.constraintTypes.isBuiltin('Hover')).toBe(false);     // registered by makeGame
    expect(game.constraintTypes.own.has('Footsteps')).toBe(false);
    expect([...game.constraintTypes.keys()]).toContain('PathFollow');
    expect(game.actors.has('Prop')).toBe(true);
    const data = level({ prefabConstraints: { wobble: { type: 'Hover', params: { amplitude: 2 } }, tracks: { type: 'Footsteps' } } });
    game.sceneManager.addScene('level1', { fetch: async () => data });
    await game.sceneManager.switchTo('level1');
    const entity = game.sceneManager.getCurrentScene().entitiesById.get('thing-1');
    expect(entity.getConstraint('tracks').constructor.name).toBe('Footsteps');
    // A game's own class under an engine name is the one a scene gets.
    class OwnHover extends Constraint { static params = {}; }
    game.registerConstraint('Hover', OwnHover);
    expect(game.constraintTypes.get('Hover')).toBe(OwnHover);
    expect(game.constraintTypes.isBuiltin('Hover')).toBe(false);
    game.destroy();
  });
});

describe('validating declared constraints', () => {
  const loader = () => new SceneLoader(makeGame());

  it('rejects a constraint type that is not registered', () => {
    const data = level({ prefabConstraints: { x: { type: 'Teleport' } } });
    expect(() => loader().load(data))
      .toThrow(/prefabs.thing.constraints.x.type: constraint 'Teleport' is not registered/);
  });

  it('rejects a param the constraint does not have', () => {
    const data = level({ prefabConstraints: { bob: { type: 'Hover', params: { amplitud: 3 } } } });
    expect(() => loader().load(data))
      .toThrow(/constraints.bob.params.amplitud: unknown field 'amplitud'/);
  });

  it('rejects a param of the wrong type, naming the field', () => {
    const data = level({ prefabConstraints: { bob: { type: 'Hover', params: { amplitude: 'high' } } } });
    expect(() => loader().load(data))
      .toThrow(/constraints.bob.params.amplitude: must be a number/);
  });

  it('leaves params unchecked for a class whose static params is null', () => {
    // The base's `{}` means "nothing settable"; null means "anything".
    // What an editor registers as a stand-in for a project constraint it
    // cannot load, so the project's scenes still materialize.
    class Stub extends Constraint {
      static params = null;
    }
    const game = makeGame();
    game.registerConstraint('ProjectThing', Stub);
    const data = level({ prefabConstraints: { x: { type: 'ProjectThing', params: { whatever: [1, 2] } } } });
    expect(() => new SceneLoader(game).load(data)).not.toThrow();
    // The inherited `{}` stays strict: nothing settable means nothing.
    class Mute extends Constraint {}
    game.registerConstraint('Mute', Mute);
    const strict = level({ prefabConstraints: { x: { type: 'Mute', params: { anything: 1 } } } });
    expect(() => new SceneLoader(game).load(strict)).toThrow(/unknown field 'anything'/);
  });

  it('enforces a param range', () => {
    const data = level({ prefabConstraints: { bob: { type: 'Hover', params: { frequency: -1 } } } });
    expect(() => loader().load(data)).toThrow(/constraints.bob.params.frequency/);
  });

  it('checks an override against the type its prefab declared', () => {
    // The override names no type, but the prefab did, and that is in this
    // document — so the typo is caught here rather than at load time.
    const data = level({
      prefabConstraints: { bob: { type: 'Hover', params: { amplitude: 4 } } },
      objectConstraints: { bob: { params: { amplitud: 9 } } }
    });
    expect(() => loader().load(data))
      .toThrow(/objects\[0\].constraints.bob.params.amplitud: unknown field/);
  });

  it('accepts params it cannot resolve a class for, leaving them to load time', () => {
    // An override names no type; nothing here knows which class the slot
    // holds. Scene.#applyConstraints checks it, where the entity exists.
    const data = level({ actor: 'Guard', objectConstraints: { chase: { params: { speed: 9 } } } });
    expect(() => loader().load(data)).not.toThrow();
  });

  it('skips the type check when there is no game to ask', () => {
    const bare = new SceneLoader({});
    const data = level({ prefabConstraints: { x: { type: 'Anything' } } });
    expect(() => bare.load(data)).not.toThrow();
  });
});

describe('a constraint as an editor sees it', () => {
  it('declares its tunables as schema descriptors', () => {
    expect(Hover.params.amplitude.kind).toBe('number');
    expect(Hover.params.amplitude.unit).toBe('px');
    expect(Hover.params.amplitude.initial).toBe(5);
  });

  it('records a default as `initial`, which validation does not apply', () => {
    // A `default` would be filled in on every override, resetting every
    // param the author did not mention.
    for (const [name, param] of Object.entries(Hover.params)) {
      expect(param.default, `${name} must not carry a schema default`).toBeUndefined();
    }
  });

  it('leaves callbacks out, since they cannot come from a file', () => {
    for (const ConstraintClass of [Chase, Hover, KeyboardControl]) {
      const callbacks = Object.keys(ConstraintClass.params).filter(k => k.startsWith('on'));
      expect(callbacks).toEqual([]);
    }
  });

  it('gives every constraint a params block, even an empty one', () => {
    class Bare extends Constraint {}
    expect(Bare.params).toEqual({});
  });

  it('assigns a param to the field of the same name by default', () => {
    class Tunable extends Constraint {
      static params = { size: s.number() };
      constructor(entity) { super(entity); this.size = 1; }
    }
    const constraint = new Tunable({});
    constraint.configure({ size: 9 });
    expect(constraint.size).toBe(9);
  });
});

describe('a prefab\'s own properties', () => {
  it('are what each of its objects starts with, and a placed one overrides them field by field', async () => {
    const config = level();
    config.prefabs.thing.actor = 'Tunable';
    config.prefabs.thing.properties = { amount: 5, label: 'from the prefab' };
    config.layers[0].objects[0].properties = { amount: 9 };
    const game = makeGame();
    game.registerActor('Tunable', Tunable);
    game.sceneManager.addScene('level1', { fetch: async () => config });
    await game.sceneManager.switchTo('level1');
    const entity = game.sceneManager.getCurrentScene().entitiesById.get('thing-1');
    expect(entity.amount).toBe(9);
    expect(entity.label).toBe('from the prefab');
    game.destroy();
  });
});

describe('spawnPrefab', () => {
  it('builds the prefab the scene describes, constraints and all', async () => {
    const { game } = await build(level({
      prefabConstraints: { bob: { type: 'Hover', params: { amplitude: 12 } } }
    }));
    const scene = game.sceneManager.getCurrentScene();

    const spawned = scene.spawnPrefab('thing', { x: 80, y: 40, width: 24, height: 24 });

    expect(spawned).not.toBeNull();
    expect(spawned.prefab).toBe('thing');
    expect(spawned.position).toMatchObject({ x: 80, y: 40 });
    // The point of it: a spawn is the same thing the level opened with.
    expect(spawned.getConstraint('bob')).toBeInstanceOf(Hover);
    expect(spawned.getConstraint('bob').amplitude).toBe(12);
    expect(game.entities.has(spawned)).toBe(true);
    expect(game.physics.bodies).toContain(spawned.body);
    game.destroy();
  });

  it('gives each one a scene id of its own, and finds it by it', async () => {
    const { game } = await build(level());
    const scene = game.sceneManager.getCurrentScene();

    const first = scene.spawnPrefab('thing', { x: 10, y: 10 });
    const second = scene.spawnPrefab('thing', { x: 20, y: 20 });

    // Past the one the file placed (thing-1), then counting on.
    expect([first.sceneId, second.sceneId]).toEqual(['thing-2', 'thing-3']);
    expect(scene.entitiesById.get(first.sceneId)).toBe(first);
    expect(scene.entitiesById.get(second.sceneId)).toBe(second);
    // A caller may name one itself.
    const named = scene.spawnPrefab('thing', { x: 30, y: 30, id: 'chosen' });
    expect(scene.entitiesById.get('chosen')).toBe(named);
    game.destroy();
  });

  it('counts toward a tally of its prefab', async () => {
    const config = level();
    config.world = { counters: { things: { prefab: 'thing', count: 'remaining' } } };
    const { game } = await build(config);
    const scene = game.sceneManager.getCurrentScene();

    expect(scene.counters.get('things')).toBe(1);
    scene.spawnPrefab('thing', { x: 50, y: 50 });
    expect(scene.counters.get('things')).toBe(2);
    game.destroy();
  });

  it('refuses a prefab the scene does not have', async () => {
    const { game } = await build(level());
    const scene = game.sceneManager.getCurrentScene();
    expect(scene.spawnPrefab('nothing', { x: 0, y: 0 })).toBeNull();
    game.destroy();
  });
});
