import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestGame, makeBody } from './helpers/testGame.js';
import { Entity } from '../src/core/entity.js';
import { Grabbable } from '../src/constraints/grabbable.js';
import { Interactive } from '../src/constraints/interactive.js';
import {
  advanceInputClock, click, drag, pointerDown, pointerMove, pointerUp, resetInputClock
} from './helpers/input.js';

/**
 * `Grabbable`: the hand a physics sandbox gives the pointer.
 *
 * A grab steers the body rather than placing it, so what is asserted here
 * is velocity on the tick, not position in the frame the pointer moved —
 * the body arrives under the hand through the simulation, collisions and
 * all, and leaves it with the speed it was swung at.
 */

/** A dynamic body with a `Grabbable`, in the world and hit-testable. */
function grabbable(game, { x = 100, y = 100, size = 40, ...options } = {}) {
  const body = makeBody(game, x, y, size, size, { bodyType: 'dynamic' });
  game.physics.add(body);
  const entity = new Entity(body, null, game);
  const grab = new Grabbable(entity, options);
  entity.addConstraint('grab', grab);
  game.entities.add(entity);
  return { entity, grab, body };
}

describe('Grabbable', () => {
  let game;

  beforeEach(() => {
    game = makeTestGame();
    resetInputClock();
  });

  it('is an Interactive that drags without following', () => {
    const { grab } = grabbable(game);
    expect(grab).toBeInstanceOf(Interactive);
    expect(grab.draggable).toBe(true);
    // `follow` places the body; a grab steers it instead.
    expect(grab.follow).toBe(false);
    expect(grab.cursor).toBe('grab');
    expect(Grabbable.params.follow).toBeUndefined();
    expect(Grabbable.params.draggable).toBeUndefined();
  });

  it('steers the body toward the hand at its stiffness, and lets go on release', () => {
    const { entity, grab, body } = grabbable(game, { x: 100, y: 100, stiffness: 10 });

    pointerMove(game, 100, 100);
    pointerDown(game, 100, 100);
    advanceInputClock(120);
    pointerMove(game, 160, 100);

    // The pointer moved this frame; the body has not, yet.
    expect(body.velocity.x).toBe(0);
    expect(grab.isDragging).toBe(true);

    entity.fixedUpdate(1 / 60);
    // 60 px of distance left, times a stiffness of 10 per second.
    expect(body.velocity.x).toBeCloseTo(600, 5);
    expect(body.velocity.y).toBeCloseTo(0, 5);

    pointerUp(game, 160, 100);
    expect(grab.isDragging).toBe(false);
    // Released: the fling is whatever the last steer left on the body,
    // and no further steering happens.
    entity.fixedUpdate(1 / 60);
    expect(body.velocity.x).toBeCloseTo(600, 5);
  });

  it('keeps the grab offset, so the body does not jump under the pointer', () => {
    const { entity, body } = grabbable(game, { x: 100, y: 100, size: 40, stiffness: 1 });

    // Pressed 15px right of centre, then dragged 100px right. The body is
    // wanted at 200, where the point that was grabbed sits under the
    // pointer — 100px away. Without the offset it would be hauled to the
    // pointer itself at 215, jumping by the 15 it was grabbed off centre.
    pointerMove(game, 115, 100);
    pointerDown(game, 115, 100);
    advanceInputClock(120);
    pointerMove(game, 215, 100);
    entity.fixedUpdate(1 / 60);
    expect(body.velocity.x).toBeCloseTo(100, 5);
  });

  it('caps how fast a body may be hauled', () => {
    const { entity, body } = grabbable(game, { x: 100, y: 100, stiffness: 20, maxSpeed: 150 });
    // 500px away at a stiffness of 20 would be 10000 px/s without the cap.
    pointerMove(game, 100, 100);
    pointerDown(game, 100, 100);
    advanceInputClock(120);
    pointerMove(game, 600, 100);
    entity.fixedUpdate(1 / 60);
    expect(Math.hypot(body.velocity.x, body.velocity.y)).toBeCloseTo(150, 5);
  });

  it('removes the body on a right-click when it is removable, on the tick', () => {
    const played = [];
    game.soundManager.playSound = (key) => played.push(key);
    const { entity, body } = grabbable(game, { removable: true, removeSound: 'pop' });

    click(game, 100, 100, { button: 2, buttons: 2 });
    // Asked for, not done: the world changes on a tick.
    expect(game.entities.has(entity)).toBe(true);
    expect(entity.dead).toBe(false);

    entity.fixedUpdate(1 / 60);
    expect(entity.dead).toBe(true);
    expect(game.entities.has(entity)).toBe(false);
    expect(game.physics.bodies).not.toContain(body);
    expect(played).toEqual(['pop']);
  });

  it('ignores a right-click when it is not removable', () => {
    const { entity } = grabbable(game);
    click(game, 100, 100, { button: 2, buttons: 2 });
    entity.fixedUpdate(1 / 60);
    expect(entity.dead).toBe(false);
    expect(game.entities.has(entity)).toBe(true);
  });

  it('still calls the game\'s own handlers', () => {
    const seen = [];
    const { entity } = grabbable(game, {
      onDragStart() { seen.push('start'); },
      onDragEnd() { seen.push(`end ${this === entity}`); }
    });
    drag(game, [{ x: 100, y: 100 }, { x: 150, y: 100 }]);
    expect(seen).toEqual(['start', 'end true']);
  });
});
