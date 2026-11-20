import { describe, it, expect } from 'vitest';
import { makeTestGame, makeBody } from 'm2d-engine/testing';
import { Constraint } from 'm2d-engine';
import { Player } from '../src/actors/player.ts';
import { TopDownPlayer } from '../src/actors/topDownPlayer.ts';

/**
 * An actor that overrides `draw` hands the frame's time on to its
 * constraints, as `Entity.draw` does. `Player` and `TopDownPlayer` once
 * called `super.draw()` with nothing, so every constraint on them drew
 * with `deltaTime` undefined (found by the engine's declarations, Nov 2026).
 */
/** A sprite that draws nothing: enough for an entity to draw its constraints. */
const sprite = { width: 32, height: 32, draw() {}, frameAt: () => 0, getAnimation: () => null, hasAnimation: () => true };

class Recorder extends Constraint {
  seen = [];
  draw(deltaTime) {
    this.seen.push(deltaTime);
  }
}

describe('a kit actor\'s draw', () => {
  for (const Actor of [Player, TopDownPlayer]) {
    it(`${Actor.name} passes deltaTime to its constraints`, () => {
      const game = makeTestGame();
      const body = makeBody(game, 0, 0, 32, 32);
      game.physics.add(body);
      const actor = new Actor(body, sprite, game);
      const recorder = new Recorder(actor);
      actor.addConstraint('recorder', recorder);
      actor.draw(0.25);
      expect(recorder.seen).toEqual([0.25]);
    });
  }
});
