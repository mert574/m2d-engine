import { describe, it, expect, beforeEach } from 'vitest';
import Matter from 'matter-js';

import { Entity } from '../src/core/entity.js';
import { Projectile } from '../src/core/projectile.js';
import { SpriteSheet } from '../src/core/spriteSheet.js';
import { Health } from '../src/constraints/health.js';
import { Debug } from '../src/constraints/debug.js';
import { Rocket } from '../src/actors/rocket.js';
import { Turret } from '../src/actors/turret.js';
import { Trigger } from '../src/actors/trigger.js';
import { UIRectangle } from '../src/core/ui/Rectangle.js';
import { PerformanceStats } from '../src/core/ui/performanceStats.js';
import { makeTestGame, makeBody, expectBalancedStacks } from './helpers/testGame.js';

/**
 * Verifies that engine and actor code emits the correct *abstract* draw calls.
 *
 * These tests are backend-independent: they assert on the renderer API
 * contract rather than on pixels, so they pin down caller behaviour that pixel
 * tests cannot distinguish (correct options, balanced transform stacks, debug
 * gating). Together with the conformance suite they cover both sides of the
 * abstraction: callers emit the right calls, backends honour them.
 */
describe('engine draw calls', () => {
  let game;
  let renderer;
  let overlay;

  beforeEach(() => {
    game = makeTestGame();
    renderer = game.renderer;
    overlay = game.worldOverlay;
  });

  describe('Entity', () => {
    it('draws a placeholder rectangle when no sprite is present', () => {
      const entity = new Entity(makeBody(100, 50, 40, 20), null, game);
      entity.draw();

      const rects = renderer.optionsFor('drawRect');
      expect(rects).toHaveLength(1);
      expect(rects[0]).toMatchObject({ width: 40, height: 20, fillStyle: '#ff0000' });
      expect(rects[0].x).toBeCloseTo(80, 5);
      expect(rects[0].y).toBeCloseTo(40, 5);
    });

    it('tiles the sprite across the body bounds', () => {
      const sprite = new SpriteSheet({ width: 16, height: 16 }, 16, 16, game, 16, 16);
      const entity = new Entity(makeBody(100, 100, 32, 32), sprite, game);
      entity.draw();

      // A 32x32 body with 16px tiles needs a 2x2 grid.
      expect(renderer.callsTo('drawSprite')).toHaveLength(4);
    });

    it('passes the body angle through as sprite rotation', () => {
      const sprite = new SpriteSheet({ width: 16, height: 16 }, 16, 16, game, 16, 16);
      const body = makeBody(100, 100, 16, 16);
      Matter.Body.setAngle(body, 0.75);

      new Entity(body, sprite, game).draw();

      expect(renderer.optionsFor('drawSprite')[0].rotation).toBeCloseTo(0.75, 5);
    });

    it('draws nothing once dead', () => {
      const entity = new Entity(makeBody(100, 50, 40, 20), null, game);
      entity.dead = true;
      entity.draw();

      expect(renderer.calls).toHaveLength(0);
    });

    it('draws its constraints after the sprite', () => {
      const sprite = new SpriteSheet({ width: 16, height: 16 }, 16, 16, game, 16, 16);
      const entity = new Entity(makeBody(100, 100, 16, 16), sprite, game);
      entity.addConstraint('health', new Health(entity, { maxHealth: 100 }));
      entity.draw();

      expect(renderer.sequence()).toEqual(['drawSprite', 'drawRect', 'drawRect']);
    });

    // Documents current behaviour, which is probably not intended: the
    // placeholder branch returns early, so a sprite-less entity never renders
    // its health bar or debug overlay. Locked in so a fix is a deliberate,
    // visible change rather than an accident.
    it('skips constraints on the sprite-less placeholder path', () => {
      const entity = new Entity(makeBody(100, 50, 40, 20), null, game);
      entity.addConstraint('health', new Health(entity, { maxHealth: 100 }));
      entity.draw();

      expect(renderer.sequence()).toEqual(['drawRect']);
    });
  });

  describe('SpriteSheet', () => {
    it('resolves a named animation to the correct tile', () => {
      const sprite = new SpriteSheet({ width: 64, height: 64 }, 16, 16, game);
      sprite.define('walk', 2, 3);
      sprite.currentFrame = 1;
      sprite.draw('walk', 50, 60);

      expect(renderer.optionsFor('drawSprite')[0]).toMatchObject({
        x: 50, y: 60, tileX: 3, tileY: 3, tileWidth: 16, tileHeight: 16
      });
    });

    it('falls back to row zero when no animation is given', () => {
      const sprite = new SpriteSheet({ width: 64, height: 64 }, 16, 16, game);
      sprite.currentFrame = 2;
      sprite.draw(null, 10, 20);

      expect(renderer.optionsFor('drawSprite')[0]).toMatchObject({ tileX: 2, tileY: 0 });
    });

    it('forwards transform options to the renderer', () => {
      const sprite = new SpriteSheet({ width: 64, height: 64 }, 16, 16, game);
      sprite.define('idle', 0, 0);
      sprite.draw('idle', 10, 20, { rotation: 1.2, flipX: true });

      expect(renderer.optionsFor('drawSprite')[0]).toMatchObject({ rotation: 1.2, flipX: true });
    });

    it('draws nothing for an unknown animation', () => {
      const sprite = new SpriteSheet({ width: 64, height: 64 }, 16, 16, game);
      sprite.draw('missing', 10, 20);

      expect(renderer.callsTo('drawSprite')).toHaveLength(0);
    });
  });

  describe('Health constraint', () => {
    it('draws a background bar and a proportional fill bar', () => {
      const entity = new Entity(makeBody(100, 100, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100 });
      health.currentHealth = 50;

      renderer.reset();
      health.draw();

      const [background, fill] = renderer.optionsFor('drawRect');
      expect(background.width).toBe(40);
      expect(fill.width).toBe(20);
      expect(background.fillStyle).toBe('#333');
    });

    it('turns the bar red below the low-health threshold', () => {
      const entity = new Entity(makeBody(100, 100, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100 });

      health.currentHealth = 80;
      renderer.reset();
      health.draw();
      expect(renderer.optionsFor('drawRect')[1].fillStyle).toBe('#2ecc71');

      health.currentHealth = 10;
      renderer.reset();
      health.draw();
      expect(renderer.optionsFor('drawRect')[1].fillStyle).toBe('#e74c3c');
    });

    it('positions the bar above the entity', () => {
      const entity = new Entity(makeBody(100, 100, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100 });

      renderer.reset();
      health.draw();

      const [background] = renderer.optionsFor('drawRect');
      expect(background.y).toBeCloseTo(80, 5); // 100 - 20/2 - 6 - barHeight(4)
      expect(background.x).toBeCloseTo(80, 5);
    });

    it('thickens the bar so it survives a low world render resolution', () => {
      const entity = new Entity(makeBody(100, 100, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100 });

      // At a quarter resolution a 4-world-unit bar is a single surface pixel;
      // the bar grows in world units to stay ~2 pixels on the surface.
      renderer.viewport = { ...renderer.viewport, worldScale: 0.25 };
      renderer.reset();
      health.draw();

      const [background] = renderer.optionsFor('drawRect');
      expect(background.height).toBe(8); // 2 / 0.25
      // Grown upward, away from the entity, not into it.
      expect(background.y).toBeCloseTo(100 - 10 - 6 - 8, 5);
    });

    it('can be switched off for entities whose health lives in a HUD', () => {
      const entity = new Entity(makeBody(100, 100, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100, showBar: false });

      renderer.reset();
      health.draw();

      expect(renderer.calls).toHaveLength(0);
    });
  });

  describe('Debug constraint', () => {
    function makeDebugEntity() {
      const entity = new Entity(makeBody(100, 100, 40, 20), null, game);
      entity.addConstraint('debug', new Debug(entity));
      return entity;
    }

    it('emits nothing while debug rendering is disabled', () => {
      const entity = makeDebugEntity();
      renderer.setDebugEnabled(false);
      renderer.reset();

      entity.getConstraint('debug').draw();
      expect(renderer.calls).toHaveLength(0);
      expect(overlay.shapes).toHaveLength(0);
      expect(overlay.labels).toHaveLength(0);
    });

    it('sends every annotation to the overlay, nothing to the world pass', () => {
      const entity = makeDebugEntity();
      renderer.setDebugEnabled(true);
      renderer.reset();

      entity.getConstraint('debug').draw();

      // Bounds box and centre dot are annotations on top of the game, not
      // world content, so they are rasterized at display resolution too — a
      // 2-unit centre dot would not survive a low render resolution.
      expect(renderer.calls).toHaveLength(0);
      expect(overlay.shapes.map(s => s.method)).toEqual(['drawRect', 'drawArc']);
      expect(overlay.labels[0].text).toMatch(/^vel:/);
    });

    it('includes a health readout when the entity has health', () => {
      const entity = makeDebugEntity();
      entity.addConstraint('health', new Health(entity, { maxHealth: 70 }));
      renderer.setDebugEnabled(true);
      renderer.reset();

      entity.getConstraint('debug').draw();

      const texts = overlay.labels.map(label => label.text);
      expect(texts.some(t => t === 'hp: 70/70')).toBe(true);
    });

    it('stacks the readouts upward from a shared anchor', () => {
      const entity = makeDebugEntity();
      entity.addConstraint('health', new Health(entity, { maxHealth: 70 }));
      renderer.setDebugEnabled(true);

      entity.getConstraint('debug').draw();

      const [velocity, health] = overlay.labels;
      // Same world anchor (the bounds' top-left), separated in UI units so the
      // lines keep their spacing at any world resolution.
      expect(health.x).toBe(velocity.x);
      expect(health.y).toBe(velocity.y);
      expect(velocity.offsetY).toBe(-50);
      expect(health.offsetY).toBe(-65);
    });
  });

  describe('UIRectangle', () => {
    it('stretches over the whole UI space when fill is set', () => {
      const rect = new UIRectangle(640, 480, 1280, 960, '#298ccc', { fill: true });
      rect.setGame(game);
      rect.draw();

      // The recording game's UI space is 800x600: a fill rect reads the live
      // size instead of its own, so menu backgrounds cover any aspect ratio.
      expect(renderer.optionsFor('drawRect')[0]).toMatchObject({
        x: 0, y: 0, width: 800, height: 600, fillStyle: '#298ccc', isScreenSpace: true
      });
    });

    it('draws centred at a fixed size without fill', () => {
      const rect = new UIRectangle(100, 100, 40, 20, '#fff');
      rect.setGame(game);
      rect.draw();

      expect(renderer.optionsFor('drawRect')[0]).toMatchObject({
        x: 80, y: 90, width: 40, height: 20
      });
    });
  });

  describe('PerformanceStats', () => {
    it('resolves its anchor against the live UI size', () => {
      const stats = new PerformanceStats(game, 20, -34, { anchor: 'bottom-left', show: true });
      stats.draw();

      // The recording game's UI space is 800x600: bottom-left plus the offset
      // puts the readout at the real bottom edge at any aspect ratio.
      expect(renderer.optionsFor('drawText')[0]).toMatchObject({ x: 20, y: 566 });
    });

    it('draws nothing unless shown', () => {
      const stats = new PerformanceStats(game, 20, -34, { anchor: 'bottom-left' });
      stats.draw();

      expect(renderer.callsTo('drawText')).toHaveLength(0);
    });
  });

  describe('Projectile', () => {
    it('draws a rotated body inside a balanced transform', () => {
      const projectile = new Projectile(makeBody(50, 50, 16, 4), null, game, {
        direction: { x: 0, y: 1 }
      });
      renderer.reset();
      projectile.draw();

      expect(renderer.sequence()).toEqual(['pushTransform', 'drawRect', 'popTransform']);
      expect(renderer.optionsFor('pushTransform')[0]).toMatchObject({ x: 50, y: 50 });
      expect(renderer.optionsFor('pushTransform')[0].rotation).toBeCloseTo(Math.PI / 2, 5);
      expectBalancedStacks(renderer);
    });

    it('draws nothing once dead', () => {
      const projectile = new Projectile(makeBody(50, 50, 16, 4), null, game, {});
      projectile.dead = true;
      renderer.reset();
      projectile.draw();

      expect(renderer.calls).toHaveLength(0);
    });
  });

  describe('Rocket', () => {
    it('draws its body and fins within one balanced transform', () => {
      const rocket = new Rocket(makeBody(80, 40, 24, 8), null, game, {
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
      const rocket = new Rocket(makeBody(80, 40, 24, 8), null, game, {
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
      const rocket = new Rocket(makeBody(80, 40, 24, 8), null, game, {
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
      return new Turret(makeBody(120, 90, 32, 32, { isStatic: true }), null, game, {});
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

  describe('Trigger', () => {
    it('draws nothing while invisible', () => {
      const trigger = new Trigger(makeBody(60, 60, 40, 40), null, game, { visible: false });
      renderer.reset();
      trigger.draw();

      expect(renderer.calls).toHaveLength(0);
      expect(overlay.shapes).toHaveLength(0);
      expect(overlay.labels).toHaveLength(0);
    });

    it('draws its area and its name as one sharp annotation', () => {
      const trigger = new Trigger(makeBody(60, 60, 40, 40), null, game, {
        visible: true,
        triggers: 'levelComplete'
      });
      renderer.reset();
      trigger.draw();

      // Patch and label travel together, so neither is sharper than the other.
      expect(renderer.calls).toHaveLength(0);
      const [{ options: rect }] = overlay.shapes;
      expect(rect).toMatchObject({ width: 40, height: 40, fillStyle: '#e7693166' });

      const [text] = overlay.labels;
      expect(text.text).toBe('levelComplete');
      expect(text.textAlign).toBe('center');
      expect(text).toMatchObject({ x: 60, y: 60 });
    });

    it('stringifies a non-string trigger label', () => {
      const trigger = new Trigger(makeBody(60, 60, 40, 40), null, game, {
        visible: true,
        triggers: ['a', 'b']
      });
      renderer.reset();
      trigger.draw();

      expect(typeof overlay.labels[0].text).toBe('string');
    });
  });
});
