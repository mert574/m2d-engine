import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestGame, makeBody, expectBalancedStacks } from 'm2d-engine/test/helpers/testGame.js';
import { Rocket } from '../src/actors/rocket.ts';
import { Turret } from '../src/actors/turret.ts';

/**
 * The turret's and the rocket's abstract draw calls: the right primitives,
 * balanced transform stacks, debug annotations on the sharp overlay and
 * nowhere else. Backend-independent, like the engine's draw-call suite.
 */
describe('the turret and its rocket', () => {
  let game;
  let renderer;
  let overlay;

  beforeEach(() => {
    game = makeTestGame();
    renderer = game.renderer;
    overlay = game.worldOverlay;
  });

  describe('Rocket', () => {
    it('draws its body and fins within one balanced transform', () => {
      const rocket = new Rocket(makeBody(game, 80, 40, 24, 8), null, game, {
        direction: { x: 1, y: 0 }
      });
      renderer.setDebugEnabled(false);
      renderer.reset();
      rocket.draw();

      expect(renderer.callsTo('drawRect')).toHaveLength(1);
      expect(renderer.callsTo('drawPath')).toHaveLength(4);
      expectBalancedStacks(renderer);
    });

    it('adds a velocity vector only while debug rendering is on', () => {
      const rocket = new Rocket(makeBody(game, 80, 40, 24, 8), null, game, {
        direction: { x: 1, y: 0 }
      });

      renderer.setDebugEnabled(false);
      renderer.reset();
      rocket.draw();
      expect(overlay.shapes).toHaveLength(0);

      renderer.setDebugEnabled(true);
      renderer.reset();
      rocket.draw();
      // The vector is an annotation, so it goes to the sharp overlay, while
      // the rocket's own body stays in the world pass.
      expect(renderer.callsTo('drawLine')).toHaveLength(0);
      expect(overlay.shapes.map(s => s.method)).toEqual(['drawLine']);
    });

    it('closes every polygon it draws', () => {
      const rocket = new Rocket(makeBody(game, 80, 40, 24, 8), null, game, {
        direction: { x: 1, y: 0 }
      });
      renderer.setDebugEnabled(false);
      renderer.reset();
      rocket.draw();

      for (const path of renderer.optionsFor('drawPath')) {
        expect(path.closed).toBe(true);
        expect(path.points.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('Turret', () => {
    function makeTurret() {
      return new Turret(makeBody(game, 120, 90, 32, 32, { bodyType: 'static' }), null, game, {});
    }

    it('draws base, ring, barrel and centre dot with a balanced transform', () => {
      const turret = makeTurret();
      renderer.setDebugEnabled(false);
      renderer.reset();
      turret.draw();

      // base, outer ring, centre dot
      expect(renderer.callsTo('drawArc')).toHaveLength(3);
      // barrel + barrel tip, inside the rotation transform
      expect(renderer.callsTo('drawRect')).toHaveLength(2);
      expectBalancedStacks(renderer);
    });

    it('rotates the barrel to the aim direction', () => {
      const turret = makeTurret();
      turret.aimDirection = { x: 0, y: 1 };
      renderer.setDebugEnabled(false);
      renderer.reset();
      turret.draw();

      expect(renderer.optionsFor('pushTransform')[0].rotation).toBeCloseTo(Math.PI / 2, 5);
    });

    it('adds range, aim line and cooldown readout in debug mode', () => {
      const turret = makeTurret();
      turret.isPlayerInRange = true;
      renderer.setDebugEnabled(true);
      renderer.reset();
      turret.draw();

      // Range ring and aim line annotate the turret rather than being part of
      // it, so they go to the sharp overlay; the turret's own body does not.
      expect(renderer.callsTo('drawLine')).toHaveLength(0);
      expect(overlay.shapes.map(s => s.method)).toEqual(['drawArc', 'drawLine']);
      expect(overlay.labels[0].text).toMatch(/^fire:/);
      expectBalancedStacks(renderer);
    });

    it('keeps the turret body itself in the world pass', () => {
      const turret = makeTurret();
      renderer.setDebugEnabled(true);
      renderer.reset();
      turret.draw();

      // base, outer ring, centre dot — the actor's actual appearance, which
      // should blur with the world like any other sprite would.
      expect(renderer.callsTo('drawArc')).toHaveLength(3);
      expect(renderer.callsTo('drawRect')).toHaveLength(2);
    });

    it('draws a damage flash while recently hit', () => {
      const turret = makeTurret();
      renderer.setDebugEnabled(false);

      renderer.reset();
      turret.draw();
      const base = renderer.callsTo('drawArc').length;

      turret.damageFlashTime = 0.1;
      renderer.reset();
      turret.draw();

      expect(renderer.callsTo('drawArc').length).toBe(base + 1);
    });
  });
});
