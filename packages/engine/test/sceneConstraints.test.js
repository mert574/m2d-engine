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

function makeGame() {
  const game = new M2D(null, { headless: true, worldWidth: 640, worldHeight: 480, seed: 1 });
  game.registerActor('Guard', Guard);
  game.registerActor('Prop', Prop);
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
