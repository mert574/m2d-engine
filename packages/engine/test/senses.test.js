import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestGame, makeBody } from '../src/testing/testGame.js';
import { canSee, lineOfSight } from '../src/core/senses.js';
import { CollisionLayers } from '../src/core/collisionLayers.js';
import { initPhysics, createPhysicsWorld } from '../src/core/physics/index.ts';
import { Time } from '../src/core/time.js';

/**
 * Sight: the pure query NPC senses stand on. A viewer sees what is in
 * range, inside its view cone and not behind a wall — in 2D on the (x, y)
 * plane and in 3D on (x, z), with the ray cast through the world either
 * way. These drive the helper against hand-placed bodies, so every refusal
 * is a wall or an angle the test put there.
 */

/** An entity-shaped stand-in: what canSee reads of one. */
function watcher(game, body) {
  game.physics.add(body);
  return { game, body, get position() { return body.position; } };
}

describe('lineOfSight', () => {
  it('is blocked by static geometry and open through a gap', () => {
    const game = makeTestGame();
    // A wall around y=40 at x=50; the way at y=120 stays open.
    game.physics.add(game.physics.createBox({ x: 50, y: 40, width: 10, height: 80, bodyType: 'static' }));
    expect(lineOfSight(game, { x: 0, y: 40 }, { x: 100, y: 40 })).toBe(false);
    expect(lineOfSight(game, { x: 0, y: 120 }, { x: 100, y: 120 })).toBe(true);
  });

  it('a dynamic body never blocks by default; named blocker layers decide instead', () => {
    const game = makeTestGame();
    game.collisionLayers = new CollisionLayers(['walls', 'mobs']);
    const bystander = game.physics.createBox({ x: 50, y: 0, width: 20, height: 20, bodyType: 'dynamic' });
    bystander.setCollisionFilter({ category: game.collisionLayers.bit('mobs') });
    game.physics.add(bystander);
    expect(lineOfSight(game, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true);

    // Named blockers: only their layers stop the ray, whatever the body type.
    expect(lineOfSight(game, { x: 0, y: 0 }, { x: 100, y: 0 }, { blockers: ['mobs'] })).toBe(false);
    expect(lineOfSight(game, { x: 0, y: 0 }, { x: 100, y: 0 }, { blockers: ['walls'] })).toBe(true);
  });

  it('a sensor is not a thing in the world and never blocks', () => {
    const game = makeTestGame();
    game.physics.add(game.physics.createBox({ x: 50, y: 0, width: 20, height: 20, bodyType: 'static', isSensor: true }));
    expect(lineOfSight(game, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true);
  });
});

describe('canSee', () => {
  function arena() {
    const game = makeTestGame();
    const viewer = watcher(game, makeBody(game, 0, 0, 16, 16, { bodyType: 'dynamic' }));
    const target = watcher(game, makeBody(game, 100, 0, 16, 16, { bodyType: 'dynamic' }));
    return { game, viewer, target };
  }

  it('sees a target in front, within range, and not past it', () => {
    const { viewer, target } = arena();
    expect(canSee(viewer, target, { range: 150, cone: Math.PI / 2, facing: 0 })).toBe(true);
    expect(canSee(viewer, target, { range: 50, cone: Math.PI / 2, facing: 0 })).toBe(false);
  });

  it('the cone excludes what is behind, and all around sees it', () => {
    const { viewer, target } = arena();
    // Facing away: the target sits straight behind the view cone.
    expect(canSee(viewer, target, { cone: Math.PI / 2, facing: Math.PI })).toBe(false);
    expect(canSee(viewer, target, { facing: Math.PI })).toBe(true);
  });

  it('a wall hides the target; neither body hides its own sight line', () => {
    const { game, viewer, target } = arena();
    // The viewer's and the target's own bodies sit on the ray's ends and
    // must not count as cover.
    expect(canSee(viewer, target, {})).toBe(true);
    game.physics.add(game.physics.createBox({ x: 50, y: 0, width: 10, height: 60, bodyType: 'static' }));
    expect(canSee(viewer, target, {})).toBe(false);
  });

  it('sees a bare point — a noise, a last-seen position — like an entity', () => {
    const { game, viewer } = arena();
    expect(canSee(viewer, { x: 100, y: 0 }, { range: 150 })).toBe(true);
    game.physics.add(game.physics.createBox({ x: 50, y: 0, width: 10, height: 60, bodyType: 'static' }));
    expect(canSee(viewer, { x: 100, y: 0 }, { range: 150 })).toBe(false);
  });
});

describe('canSee in 3D', () => {
  beforeAll(async () => {
    await initPhysics({ dimensions: 3 });
  });

  /** A 3D stand-in game: the ground plane is (x, z), up is +y, metres. */
  function solidGame() {
    return {
      options: { dimensions: 3 },
      collisionLayers: new CollisionLayers([]),
      physics: createPhysicsWorld({ dimensions: 3, clock: new Time({}) })
    };
  }

  it('the cone and range live on (x, z), and a wall still occludes', () => {
    const game = solidGame();
    const box = (spec) => { const body = game.physics.createBox({ bodyType: 'static', ...spec }); game.physics.add(body); return body; };
    const viewer = { game, body: null, position: { x: 0, y: 1, z: 0 } };
    const target = { game, body: null, position: { x: 0, y: 1, z: 8 } };
    viewer.body = game.physics.createBox({ x: 0, y: 1, z: 0, width: 0.6, height: 1.8, depth: 0.6, bodyType: 'dynamic' });
    game.physics.add(viewer.body);

    // Facing +z on the ground plane: atan2(dz, dx) = π/2.
    expect(canSee(viewer, target, { range: 10, cone: Math.PI / 2, facing: Math.PI / 2 })).toBe(true);
    expect(canSee(viewer, target, { range: 10, cone: Math.PI / 2, facing: -Math.PI / 2 })).toBe(false);
    expect(canSee(viewer, target, { range: 5, facing: Math.PI / 2 })).toBe(false);

    box({ x: 0, y: 1, z: 4, width: 4, height: 4, depth: 0.4 });
    expect(canSee(viewer, target, { range: 10, cone: Math.PI / 2, facing: Math.PI / 2 })).toBe(false);
  });
});
