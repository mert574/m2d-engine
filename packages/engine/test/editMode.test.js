import { describe, it, expect, beforeAll, vi } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { Constraint } from '../src/core/constraint.js';
import { initPhysics } from '../src/core/physics/index.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * Edit mode: presentation without game. A scene materializes from its
 * document exactly as a load builds it — entities, constraints, ids,
 * bodies — but no game code runs against it: no lifecycle hook, no tick,
 * no game time, no transition. The contract an editor's viewport stands
 * on; see docs/plans/editor-e0.md (E0.6).
 */

class Crate extends Entity { name = 'Crate'; }

class Drift extends Constraint {
  static params = {};
  ticks = 0;
  fixedUpdate() { this.ticks += 1; }
}

beforeAll(async () => {
  await initPhysics();
});

/** A level with gravity, so any tick that runs shows up as movement. */
const LEVEL = {
  version: SCENE_VERSION, type: 'level', name: 'room',
  world: { gravity: { x: 0, y: 1000 } },
  prefabs: {
    crate: {
      actor: 'Crate',
      physics: { bodyType: 'dynamic' },
      constraints: { drift: { type: 'Drift' } }
    }
  },
  layers: [{ name: 'main', objects: [
    { id: 'crate-1', prefab: 'crate', x: 100, y: 50, width: 32, height: 32 }
  ] }]
};

function makeGame({ editMode = false, hooks = {} } = {}) {
  const game = new M2D(null, {
    headless: true, editMode, worldWidth: 640, worldHeight: 480, seed: 1
  });
  game.registerActor('Crate', Crate);
  game.registerConstraint('Drift', Drift);
  game.sceneManager.addScene('room', { fetch: async () => LEVEL, ...hooks });
  return game;
}

/** Spies for every lifecycle hook a headless scene can run. */
function spyHooks() {
  return {
    onEnter: vi.fn(), onFixedUpdate: vi.fn(), onExit: vi.fn(),
    onRender: vi.fn(), onUpdate: vi.fn()
  };
}

describe('materializing a scene in edit mode', () => {
  it('builds the document and runs no hook', async () => {
    const hooks = spyHooks();
    const game = makeGame({ editMode: true, hooks });
    await game.sceneManager.switchTo('room');

    // The world is the document, built for real.
    const scene = game.sceneManager.getCurrentScene();
    const crate = scene.entitiesById.get('crate-1');
    expect(crate).toBeDefined();
    expect(crate.sceneId).toBe('crate-1');
    expect(game.entities.size).toBe(1);
    expect(crate.getConstraint('drift')).toBeInstanceOf(Drift);

    // And no game code has run against it.
    for (const [name, spy] of Object.entries(hooks)) {
      expect(spy, name).not.toHaveBeenCalled();
    }
    game.destroy();
  });

  it('never ticks: not from step, and not into the constraints', async () => {
    const hooks = spyHooks();
    const game = makeGame({ editMode: true, hooks });
    await game.sceneManager.switchTo('room');
    const crate = game.sceneManager.getCurrentScene().entitiesById.get('crate-1');
    const y = crate.position.y;

    expect(game.step(30)).toBe(0);
    expect(game.time.steps).toBe(0);
    expect(game.time.elapsed).toBe(0);
    expect(crate.position.y).toBe(y);              // gravity never applied
    expect(crate.getConstraint('drift').ticks).toBe(0);
    expect(hooks.onFixedUpdate).not.toHaveBeenCalled();
    game.destroy();
  });

  it('keeps gameOver inert', async () => {
    const game = makeGame({ editMode: true });
    await game.sceneManager.switchTo('room');
    game.gameOver();
    expect(game.isGameOver).toBe(false);
    game.destroy();
  });

  it('runs no teardown hook when the scene unloads', async () => {
    const hooks = spyHooks();
    const game = makeGame({ editMode: true, hooks });
    await game.sceneManager.switchTo('room');
    game.sceneManager.getCurrentScene().unload();
    expect(hooks.onExit).not.toHaveBeenCalled();
    game.destroy();
  });

  it('is the flag and nothing else: the same game without it plays', async () => {
    const hooks = spyHooks();
    const game = makeGame({ hooks });
    await game.sceneManager.switchTo('room');
    const crate = game.sceneManager.getCurrentScene().entitiesById.get('crate-1');
    const y = crate.position.y;

    expect(hooks.onEnter).toHaveBeenCalledTimes(1);
    expect(game.step(30)).toBe(30);
    expect(crate.position.y).toBeGreaterThan(y);   // gravity applied
    expect(crate.getConstraint('drift').ticks).toBe(30);
    expect(hooks.onFixedUpdate).toHaveBeenCalledTimes(30);

    game.sceneManager.getCurrentScene().unload();
    expect(hooks.onExit).toHaveBeenCalledTimes(1);
    game.destroy();
  });

  it('survives the edit, play, edit cycle with nothing carried over', async () => {
    // Play-in-editor is a fresh game without the flag over the same
    // document; stopping is destroy plus a fresh edit-mode game. Each
    // stage starts from the document alone.
    const edit1 = makeGame({ editMode: true });
    await edit1.sceneManager.switchTo('room');
    const placedY = edit1.sceneManager.getCurrentScene().entitiesById.get('crate-1').position.y;
    edit1.destroy();

    const play = makeGame();
    await play.sceneManager.switchTo('room');
    play.step(60);
    const playedY = play.sceneManager.getCurrentScene().entitiesById.get('crate-1').position.y;
    expect(playedY).toBeGreaterThan(placedY);
    play.destroy();

    const edit2 = makeGame({ editMode: true });
    await edit2.sceneManager.switchTo('room');
    const crate = edit2.sceneManager.getCurrentScene().entitiesById.get('crate-1');
    expect(crate.position.y).toBe(placedY);        // the document's position, not the played one
    expect(edit2.time.steps).toBe(0);
    edit2.destroy();
  });
});
