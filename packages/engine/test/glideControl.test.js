import { describe, it, expect } from 'vitest';
import { makeTestGame, makeBody } from './helpers/testGame.js';
import { Entity } from '../src/core/entity.js';
import { GlideControl } from '../src/constraints/glideControl.js';

/**
 * One-press gliding on a 32px grid. The world under test is a T junction:
 *
 *        x:  48   80   112  144  176
 *   y=48:   [ ]  [ ]  [ ]  [ ]  [ ]     a corridor five cells long
 *   y=80:             [ ]                one cell hanging below the middle
 *
 * built from walls around it, as the maze builds its hedges.
 */
const GRID = 32;

function makeWorld() {
  const game = makeTestGame();
  // A top-down world, like the mazes this control is for.
  game.physics.setGravity({ x: 0, y: 0 });
  const wall = (cx, cy, w = 1, h = 1) => {
    const body = makeBody(game, (cx + w / 2) * GRID, (cy + h / 2) * GRID, w * GRID, h * GRID, { bodyType: 'static' });
    game.physics.add(body);
  };
  // Enclose the T: a 7x4 block of wall with the corridor carved out.
  wall(0, 0, 7, 1);           // top
  wall(0, 1, 1, 3);           // left
  wall(6, 1, 1, 3);           // right
  wall(1, 2, 2, 1);           // below corridor, left of the stem
  wall(4, 2, 2, 1);           // below corridor, right of the stem
  wall(1, 3, 5, 1);           // bottom
  const player = new Entity(
    makeBody(game, 48, 48, 26, 26, { bodyType: 'character', shape: 'circle' }),
    null, game);
  game.physics.add(player.body);
  const control = new GlideControl(player, { speed: 240 });
  const tick = (presses = []) => {
    for (const code of presses) game.input.snapshot.pressed.add(code);
    control.fixedUpdate(1 / 60);
    game.physics.step(1 / 60);
    game.input.snapshot.pressed.clear();
  };
  return { game, player, control, tick };
}

describe('GlideControl', () => {
  it('glides from one press and parks on the centre of the last open cell', () => {
    const { player, control, tick } = makeWorld();
    tick(['ArrowRight']);
    for (let i = 0; i < 90; i++) tick();
    expect(control.dir).toBe(null);
    expect(player.body.position.x).toBeCloseTo(176, 0);
    expect(player.body.position.y).toBeCloseTo(48, 0);
  });

  it('stops when the direction of travel is pressed again', () => {
    const { player, control, tick } = makeWorld();
    tick(['ArrowRight']);
    for (let i = 0; i < 5; i++) tick();
    const mid = player.body.position.x;
    tick(['ArrowRight']);
    for (let i = 0; i < 10; i++) tick();
    expect(control.dir).toBe(null);
    expect(player.body.position.x).toBeCloseTo(mid, 0);
  });

  it('takes a turn pressed early, at the junction', () => {
    const { player, control, tick } = makeWorld();
    tick(['ArrowRight']);
    // Press Down two cells before the stem of the T: buffered, then taken.
    tick(['ArrowDown']);
    for (let i = 0; i < 40; i++) tick();
    expect(player.body.position.x).toBeCloseTo(112, 0);
    expect(player.body.position.y).toBeGreaterThan(60);
  });

  it('takes a turn pressed a beat late, snapping back to the junction', () => {
    const { player, control, tick } = makeWorld();
    tick(['ArrowRight']);
    // Run until just past the stem (x ≈ 124), then ask for the turn.
    for (let i = 0; i < 19; i++) tick();
    expect(player.body.position.x).toBeGreaterThan(114);
    tick(['ArrowDown']);
    for (let i = 0; i < 30; i++) tick();
    expect(player.body.position.x).toBeCloseTo(112, 0);
    expect(player.body.position.y).toBeGreaterThan(60);
  });

  it('lets a buffered press expire against a wall', () => {
    const { control, tick } = makeWorld();
    tick(['ArrowUp']);
    for (let i = 0; i < 30; i++) tick();
    expect(control.dir).toBe(null);
    expect(control.queued).toBe(null);
  });

  it('reverses immediately', () => {
    const { player, tick } = makeWorld();
    tick(['ArrowRight']);
    for (let i = 0; i < 10; i++) tick();
    tick(['ArrowLeft']);
    for (let i = 0; i < 30; i++) tick();
    expect(player.body.position.x).toBeCloseTo(48, 0);
  });
});
