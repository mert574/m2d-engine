import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestGame, makeBody } from './helpers/testGame.js';
import { Projection } from '../src/core/projection.js';
import { Entity } from '../src/core/entity.js';
import { SpriteSheet } from '../src/core/spriteSheet.js';
import { SceneLoader, SCENE_VERSION } from '../src/core/sceneLoader.js';
import { LayerManager } from '../src/core/layerManager.js';
import { KeyboardControl } from '../src/constraints/keyboardControl.js';
import { PointerMove } from '../src/constraints/pointerMove.js';
import { InputSnapshot } from '../src/core/input/inputManager.js';

/**
 * The isometric perspective: a projection applied to positions only. The
 * simulation stays on the flat ground plane; what moves is where things
 * are drawn, where the camera looks and where a click lands.
 */

describe('Projection', () => {
  const iso = Projection.isometric();

  it('maps a ground square to a 2:1 diamond', () => {
    expect(iso.toScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(iso.toScreen(64, 0)).toEqual({ x: 64, y: 32 });
    expect(iso.toScreen(0, 64)).toEqual({ x: -64, y: 32 });
    expect(iso.toScreen(64, 64)).toEqual({ x: 0, y: 64 });
    const b = iso.boundsOf(0, 0, 64, 64);
    expect(b).toEqual({ left: -64, top: 0, right: 64, bottom: 64 });
  });

  it('inverts exactly', () => {
    const p = iso.toScreen(123.5, -77);
    const back = iso.toWorld(p.x, p.y);
    expect(back.x).toBeCloseTo(123.5, 9);
    expect(back.y).toBeCloseTo(-77, 9);
  });

  it('turns a screen direction into a unit ground direction', () => {
    const up = iso.directionToWorld(0, -1);
    expect(up.x).toBeCloseTo(-Math.SQRT1_2);
    expect(up.y).toBeCloseTo(-Math.SQRT1_2);
    const right = iso.directionToWorld(1, 0);
    expect(right.x).toBeCloseTo(Math.SQRT1_2);
    expect(right.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('builds from scene config', () => {
    expect(Projection.fromConfig(null)).toBeNull();
    expect(Projection.fromConfig('isometric').type).toBe('isometric');
    expect(Projection.fromConfig({ type: 'isometric', ratio: 0.6 }).toScreen(10, 0).y).toBeCloseTo(6);
    expect(() => Projection.fromConfig('cabinet')).toThrow();
  });
});

describe('entities under a projection', () => {
  let game;
  beforeEach(() => {
    game = makeTestGame();
    game.projection = Projection.isometric();
  });

  it('draws at the projected position and keeps its ground position', () => {
    const entity = new Entity(makeBody(game, 100, 100, 20, 20, { bodyType: 'static' }), null, game);
    expect(entity.position).toEqual({ x: 100, y: 100 });
    expect(entity.renderAnchor).toEqual({ x: 0, y: 100 });
    expect(entity.renderPosition).toEqual({ x: 0, y: 100 });
    entity.elevation = 10;
    entity.fixedUpdate(1 / 60);
    expect(entity.renderPosition.y).toBeCloseTo(90);
  });

  it('sorts by the projected feet', () => {
    const north = new Entity(makeBody(game, 100, 40, 20, 20, { bodyType: 'static' }), null, game);
    const south = new Entity(makeBody(game, 100, 160, 20, 20, { bodyType: 'static' }), null, game);
    const east = new Entity(makeBody(game, 180, 100, 20, 20, { bodyType: 'static' }), null, game);
    expect(north.depth).toBeLessThan(south.depth);
    expect(east.depth).toBeGreaterThan(north.depth);
  });

  it('draws spriteSize instead of the ground size when set', () => {
    const sheet = new SpriteSheet({ width: 64, height: 64 }, 64, 64, game);
    sheet.define('default', 0, 0);
    const block = new Entity(makeBody(game, 64, 64, 64, 64, { bodyType: 'static' }), sheet, game);
    block.setAnimation('default');
    block.spriteFit = true;
    block.spriteSize = { x: 128, y: 128 };
    block.draw();
    expect(game.renderer.optionsFor('drawSprite')[0]).toMatchObject({ width: 128, height: 128, x: 0, y: 64 });
  });
});

describe('projected tile layers', () => {
  it('draws diamonds at projected centres and culls to the view', () => {
    const game = makeTestGame();
    game.projection = Projection.isometric();
    const layers = new LayerManager();
    layers.setGame(game);
    const sheet = new SpriteSheet({ width: 64, height: 32 }, 64, 32, game);
    sheet.define('floor', 0, 0);
    // 40 x 40 ground tiles of 64: far more than an 800 x 600 view shows.
    const layer = layers.constructLayer(sheet, 40, 40, 64, { anim: 'floor' });
    layers.addLayer('floor', layer, { scale: 2 });
    game.camera.x = 0;
    game.camera.y = 600;
    layers.drawOne(layer);
    const drawn = game.renderer.optionsFor('drawSprite');
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(40 * 40 / 3);
    expect(drawn[0]).toMatchObject({ width: 128, height: 64 });
    // Every centre is a projected tile centre: x - y of a ground centre.
    for (const d of drawn) {
      const g = game.projection.toWorld(d.x, d.y);
      expect(((g.x - 32) % 64 + 64) % 64).toBeCloseTo(0, 6);
      expect(((g.y - 32) % 64 + 64) % 64).toBeCloseTo(0, 6);
    }
  });
});

describe('input under a projection', () => {
  it('reports pointer and event positions on the ground plane', () => {
    const game = makeTestGame();
    game.projection = Projection.isometric();
    // The view centre is render (400, 300); on the ground that is a point
    // whose projection is (400, 300).
    const ground = game.input.toWorld({ x: 400, y: 300 });
    const back = game.projection.toScreen(ground.x, ground.y);
    expect(back.x).toBeCloseTo(400);
    expect(back.y).toBeCloseTo(300);
    expect(game.worldToUI(ground.x, ground.y).x).toBeCloseTo(400);
  });

  it('moves along the screen axes with inputSpace screen', () => {
    const game = makeTestGame();
    game.projection = Projection.isometric();
    const entity = new Entity(makeBody(game, 100, 100, 20, 20, { bodyType: 'character' }), null, game);
    game.physics.add(entity.body);
    const control = new KeyboardControl(entity, { inputSpace: 'screen', continuous: false, maxSpeed: 100 });
    game.input.snapshot.down.add('ArrowUp');
    control.fixedUpdate(1 / 60);
    const up = entity.body.velocity;
    // Up on screen is the ground diagonal (-1, -1); the pace is scaled so
    // the walk covers 100 px/s on screen, which is 141 on the ground.
    expect(up.x).toBeCloseTo(-100, 3);
    expect(up.y).toBeCloseTo(-100, 3);
    const upOnScreen = game.projection.toScreen(up.x, up.y);
    expect(Math.hypot(upOnScreen.x, upOnScreen.y)).toBeCloseTo(100, 3);

    game.input.snapshot.down.clear();
    game.input.snapshot.down.add('ArrowRight');
    control.fixedUpdate(1 / 60);
    const right = entity.body.velocity;
    const rightOnScreen = game.projection.toScreen(right.x, right.y);
    expect(Math.hypot(rightOnScreen.x, rightOnScreen.y)).toBeCloseTo(100, 3);
  });

  it('caps a top-down diagonal at the same speed as a cardinal', () => {
    const game = makeTestGame();
    const entity = new Entity(makeBody(game, 100, 100, 20, 20, { bodyType: 'character' }), null, game);
    game.physics.add(entity.body);
    const control = new KeyboardControl(entity, { acceleration: 100000, maxSpeed: 100 });
    game.input.snapshot.down.add('ArrowRight');
    game.input.snapshot.down.add('ArrowDown');
    control.fixedUpdate(1 / 60);
    const v = entity.body.velocity;
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(100, 3);
  });

  it('turns a ground heading into the facing the viewer sees', () => {
    const game = makeTestGame();
    game.projection = Projection.isometric();
    const sheet = new SpriteSheet({ width: 128, height: 128 }, 16, 16, game);
    for (const d of ['right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right']) sheet.defineAnimation(`idle_${d}`, [[0, 0]], {});
    const entity = new Entity(makeBody(game, 0, 0, 16, 16), sheet, game);
    entity.setDirectionalAnimation('idle', 0);            // ground east
    expect(entity.currentAnim).toBe('idle_down_right');
    entity.setDirectionalAnimation('idle', -Math.PI * 0.75); // ground north-west
    expect(entity.currentAnim).toBe('idle_up');
  });

  it('walks to a pressed pointer position', () => {
    const game = makeTestGame();
    const entity = new Entity(makeBody(game, 0, 0, 20, 20, { bodyType: 'kinematic' }), null, game);
    game.physics.add(entity.body);
    const move = new PointerMove(entity, { speed: 100, arrive: 5 });
    game.input.snapshot = new InputSnapshot({
      down: new Set(), pressed: new Set(), released: new Set(),
      pointer: { ui: { x: 0, y: 0 }, world: { x: 300, y: 0 }, isDown: false, pressed: true, pressedButtons: 1, buttons: 0, type: 'mouse' }
    });
    move.fixedUpdate(1 / 60);
    expect(move.destination).toEqual({ x: 300, y: 0 });
    expect(entity.body.velocity.x).toBeCloseTo(100);
    game.input.snapshot = InputSnapshot.empty();
    entity.body.setPosition({ x: 298, y: 0 });
    move.fixedUpdate(1 / 60);
    expect(move.moving).toBe(false);
    expect(entity.body.velocity.x).toBe(0);
  });

  it('marks the tick a pointer button went down', () => {
    const game = makeTestGame();
    game.input.pointerPressed = 1;
    const snap = game.input.sample();
    expect(snap.pointer.pressed).toBe(true);
    expect(snap.pointer.pressedButtons).toBe(1);
    game.input.edgesSampled = false;
    expect(game.input.sample().pointer.pressed).toBe(false);
  });
});

describe('scene loader projection', () => {
  const loader = new SceneLoader(null);
  const base = { version: SCENE_VERSION, type: 'level', name: 't' };
  it('validates world.projection and tile layer sizing', () => {
    expect(() => loader.load({ ...base, world: { projection: 'isometric' } })).not.toThrow();
    expect(() => loader.load({ ...base, world: { projection: { type: 'isometric', ratio: 0.5 } } })).not.toThrow();
    expect(() => loader.load({ ...base, world: { projection: 'oblique' } })).toThrow(/projection/);
    expect(() => loader.load({ ...base, world: { projection: { type: 'isometric', ratio: 0 } } })).toThrow(/ratio/);
    const sheets = { assets: { spritesheets: { f: { url: 'f.png', frameWidth: 64, frameHeight: 32 } } } };
    expect(() => loader.load({ ...base, ...sheets, tileLayers: [{ name: 'a', spritesheet: 'f', scale: 2, tileSize: 64 }] })).not.toThrow();
    expect(() => loader.load({ ...base, ...sheets, tileLayers: [{ name: 'a', spritesheet: 'f', scale: 0 }] })).toThrow(/scale/);
  });
});
