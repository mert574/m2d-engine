import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// A spy on the console is undone however the test ends, so a failure cannot mute the rest of the file.
afterEach(() => vi.restoreAllMocks());

import { Entity } from '../src/core/entity.js';
import { Projectile } from '../src/core/projectile.js';
import { SpriteSheet } from '../src/core/spriteSheet.js';
import { Health } from '../src/constraints/health.js';
import { Debug } from '../src/constraints/debug.js';
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
      const entity = new Entity(makeBody(game, 100, 50, 40, 20), null, game);
      entity.draw();

      const rects = renderer.optionsFor('drawRect');
      expect(rects).toHaveLength(1);
      expect(rects[0]).toMatchObject({ width: 40, height: 20, fillStyle: '#ff0000' });
      expect(rects[0].x).toBeCloseTo(80, 5);
      expect(rects[0].y).toBeCloseTo(40, 5);
    });

    it('tiles the sprite across the body bounds', () => {
      const sprite = new SpriteSheet({ width: 16, height: 16 }, 16, 16, game, 16, 16);
      const entity = new Entity(makeBody(game, 100, 100, 32, 32), sprite, game);
      entity.draw();

      // A 32x32 body with 16px tiles needs a 2x2 grid.
      expect(renderer.callsTo('drawSprite')).toHaveLength(4);
    });

    it('passes the body angle through as sprite rotation', () => {
      const sprite = new SpriteSheet({ width: 16, height: 16 }, 16, 16, game, 16, 16);
      const body = makeBody(game, 100, 100, 16, 16);
      body.setAngle(0.75);

      new Entity(body, sprite, game).draw();

      expect(renderer.optionsFor('drawSprite')[0].rotation).toBeCloseTo(0.75, 5);
    });

    it('draws nothing once dead', () => {
      const entity = new Entity(makeBody(game, 100, 50, 40, 20), null, game);
      entity.dead = true;
      entity.draw();

      expect(renderer.calls).toHaveLength(0);
    });

    it('draws its constraints after the sprite', () => {
      const sprite = new SpriteSheet({ width: 16, height: 16 }, 16, 16, game, 16, 16);
      const entity = new Entity(makeBody(game, 100, 100, 16, 16), sprite, game);
      const health = new Health(entity, { maxHealth: 100 });
      health.currentHealth = 50; // the bar only draws while health is missing
      entity.addConstraint('health', health);
      entity.draw();

      expect(renderer.sequence()).toEqual(['drawSprite', 'drawRect', 'drawRect']);
    });

    // Documents current behaviour, which is probably not intended: the
    // placeholder branch returns early, so a sprite-less entity never renders
    // its health bar or debug overlay. Locked in so a fix is a deliberate,
    // visible change rather than an accident.
    it('skips constraints on the sprite-less placeholder path', () => {
      const entity = new Entity(makeBody(game, 100, 50, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100 });
      health.currentHealth = 50;
      entity.addConstraint('health', health);
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
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      sprite.draw('missing', 10, 20);

      expect(renderer.callsTo('drawSprite')).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
    });
  });

  describe('Health constraint', () => {
    it('draws a background bar and a proportional fill bar', () => {
      const entity = new Entity(makeBody(game, 100, 100, 40, 20), null, game);
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
      const entity = new Entity(makeBody(game, 100, 100, 40, 20), null, game);
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

    it('hides the bar at full health', () => {
      const entity = new Entity(makeBody(game, 100, 100, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100 });

      renderer.reset();
      health.draw();

      expect(renderer.callsTo('drawRect')).toHaveLength(0);
    });

    it('positions the bar above the entity', () => {
      const entity = new Entity(makeBody(game, 100, 100, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100 });
      health.currentHealth = 50;

      renderer.reset();
      health.draw();

      const [background] = renderer.optionsFor('drawRect');
      expect(background.y).toBeCloseTo(80, 5); // 100 - 20/2 - 6 - barHeight(4)
      expect(background.x).toBeCloseTo(80, 5);
    });

    it('thickens the bar so it survives a low world render resolution', () => {
      const entity = new Entity(makeBody(game, 100, 100, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100 });
      health.currentHealth = 50;

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
      const entity = new Entity(makeBody(game, 100, 100, 40, 20), null, game);
      const health = new Health(entity, { maxHealth: 100, showBar: false });

      renderer.reset();
      health.draw();

      expect(renderer.calls).toHaveLength(0);
    });
  });

  describe('Debug constraint', () => {
    function makeDebugEntity() {
      const entity = new Entity(makeBody(game, 100, 100, 40, 20), null, game);
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
      const rect = new UIRectangle({
        x: 640, y: 480, width: 1280, height: 960, color: '#298ccc', fill: true
      });
      rect.setGame(game);
      rect.draw();

      // The recording game's UI space is 800x600: a fill rect reads the live
      // size instead of its own, so menu backgrounds cover any aspect ratio.
      expect(renderer.optionsFor('drawRect')[0]).toMatchObject({
        x: 0, y: 0, width: 800, height: 600, fillStyle: '#298ccc', isScreenSpace: true
      });
    });

    it('draws centred at a fixed size without fill', () => {
      const rect = new UIRectangle({ x: 100, y: 100, width: 40, height: 20, color: '#fff' });
      rect.setGame(game);
      rect.draw();

      expect(renderer.optionsFor('drawRect')[0]).toMatchObject({
        x: 80, y: 90, width: 40, height: 20
      });
    });
  });

  describe('PerformanceStats', () => {
    it('resolves its anchor against the live UI size', () => {
      const stats = new PerformanceStats({ x: 20, y: -34, anchor: 'bottom-left' });
      stats.setGame(game);
      stats.draw();

      // The recording game's UI space is 800x600: bottom-left plus the offset
      // puts the readout at the real bottom edge at any aspect ratio. The
      // pill is 24 units tall, so its top edge is 34 up from the bottom.
      expect(renderer.optionsFor('drawRect')[0]).toMatchObject({ x: 20, y: 566 });
    });

    it('draws nothing while hidden', () => {
      const stats = new PerformanceStats({ x: 20, y: -34, anchor: 'bottom-left', visible: false });
      stats.setGame(game);
      stats.draw();

      expect(renderer.calls).toHaveLength(0);
    });
  });

  describe('Projectile', () => {
    it('draws a rotated body inside a balanced transform', () => {
      const projectile = new Projectile(makeBody(game, 50, 50, 16, 4), null, game, {
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
      const projectile = new Projectile(makeBody(game, 50, 50, 16, 4), null, game, {});
      projectile.dead = true;
      renderer.reset();
      projectile.draw();

      expect(renderer.calls).toHaveLength(0);
    });
  });


  describe('Trigger', () => {
    it('draws nothing while invisible', () => {
      const trigger = new Trigger(makeBody(game, 60, 60, 40, 40), null, game, { visible: false });
      renderer.reset();
      trigger.draw();

      expect(renderer.calls).toHaveLength(0);
      expect(overlay.shapes).toHaveLength(0);
      expect(overlay.labels).toHaveLength(0);
    });

    it('draws its box and its label as one sharp annotation while visible', () => {
      const trigger = new Trigger(makeBody(game, 60, 60, 40, 40), null, game, {
        visible: true,
        triggers: 'levelComplete'
      });
      renderer.reset();
      trigger.draw();

      // Box and label travel together on the overlay, so neither is sharper than the other.
      expect(renderer.calls).toHaveLength(0);
      const [{ method, options: box }] = overlay.shapes;
      expect(method).toBe('drawPath');
      expect(box.points.map(({ x, y }) => [x, y])).toEqual([[40, 40], [80, 40], [80, 80], [40, 80]]);
      expect(box.fillStyle).toBe('rgba(255, 138, 28, 0.3)');

      const [text] = overlay.labels;
      expect(text.text).toBe('trigger levelComplete');
      expect(text).toMatchObject({ x: 40, y: 40 });
    });

    it('labels a list of tags, and takes its box colour from debugColor', () => {
      const trigger = new Trigger(makeBody(game, 60, 60, 40, 40), null, game, {
        visible: true,
        triggers: ['a', 'b'],
        debugColor: '#00ff00'
      });
      renderer.reset();
      trigger.draw();

      expect(overlay.labels[0].text).toBe('trigger a, b');
      expect(overlay.shapes[0].options.fillStyle).toBe('rgba(0, 255, 0, 0.3)');
    });
  });
});
