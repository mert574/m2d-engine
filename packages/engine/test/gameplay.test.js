import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestGame, makeBody } from './helpers/testGame.js';
import { Entity } from '../src/core/entity.js';
import { SpriteSheet } from '../src/core/spriteSheet.js';
import { SceneLoader } from '../src/core/sceneLoader.js';
import { SoundManager } from '../src/core/soundManager.js';
import { Quest } from '../src/core/quest.js';
import { Angle, DIRECTIONS_8 } from '../src/core/math.js';
import { Attack } from '../src/constraints/attack.js';
import { Health } from '../src/constraints/health.js';
import { Abilities } from '../src/constraints/abilities.js';
import { Footsteps } from '../src/constraints/footsteps.js';
import { CollisionCategories } from '../src/core/constants.js';
import { UIDialogue } from '../src/core/ui/dialogue.js';

/**
 * The gameplay layer a 3/4 game stands on: animation playback, eight-way
 * facings, a swing that reaches in any direction, abilities on keys,
 * footsteps by stride, a quest line and per-clip volume.
 */

describe('Angle helpers', () => {
  it('names eight sectors clockwise from right', () => {
    expect(Angle.direction8(0)).toBe('right');
    expect(Angle.direction8(Math.PI / 2)).toBe('down');
    expect(Angle.direction8(-Math.PI / 2)).toBe('up');
    expect(Angle.direction8(Math.PI)).toBe('left');
    expect(Angle.direction8(Math.PI / 4)).toBe('down_right');
    expect(Angle.direction8(-3 * Math.PI / 4)).toBe('up_left');
    expect(DIRECTIONS_8).toHaveLength(8);
  });

  it('tests an arc across the seam', () => {
    expect(Angle.inArc(Math.PI - 0.1, Math.PI, Math.PI / 2)).toBe(true);
    expect(Angle.inArc(-Math.PI + 0.1, Math.PI, Math.PI / 2)).toBe(true);
    expect(Angle.inArc(0, Math.PI, Math.PI / 2)).toBe(false);
    expect(Angle.inArc(1.2, 0, Math.PI * 2)).toBe(true);
  });
});

describe('SpriteSheet animations', () => {
  it('plays frames at a rate and loops or holds', () => {
    const sheet = new SpriteSheet({ width: 64, height: 16 }, 16, 16, null);
    sheet.defineAnimation('run', [[0, 0], [1, 0], [2, 0], [3, 0]], { fps: 10 });
    sheet.defineAnimation('die', [[0, 1], [1, 1]], { fps: 10, loop: false });
    expect(sheet.frameAt('run', 0)).toBe(0);
    expect(sheet.frameAt('run', 0.25)).toBe(2);
    expect(sheet.frameAt('run', 0.45)).toBe(0);
    expect(sheet.frameAt('die', 5)).toBe(1);
    expect(sheet.frameCount('run')).toBe(4);
  });

  it('keeps define() adding frames and the legacy currentFrame offset', () => {
    const game = makeTestGame();
    const sheet = new SpriteSheet({ width: 64, height: 16 }, 16, 16, game);
    sheet.define('idle', 2, 0);
    sheet.currentFrame = 1;
    sheet.draw('idle', 0, 0);
    expect(game.renderer.optionsFor('drawSprite')[0]).toMatchObject({ tileX: 3, tileY: 0 });
    sheet.define('idle', 5, 0);
    expect(sheet.frameCount('idle')).toBe(2);
    sheet.draw('idle', 0, 0, { frame: 1 });
    expect(game.renderer.optionsFor('drawSprite')[1]).toMatchObject({ tileX: 5 });
    expect(game.renderer.optionsFor('drawSprite')[1].frame).toBeUndefined();
  });
});

describe('Entity animation', () => {
  let game;
  beforeEach(() => { game = makeTestGame(); });

  function sheet() {
    const s = new SpriteSheet({ width: 128, height: 128 }, 16, 16, game);
    s.defineAnimation('run', [[0, 0], [1, 0]], { fps: 4 });
    s.defineAnimation('run_down', [[0, 1], [1, 1]], { fps: 4 });
    s.defineAnimation('run_right', [[0, 2], [1, 2]], { fps: 4 });
    return s;
  }

  it('advances animTime in update and restarts on a new animation', () => {
    const entity = new Entity(makeBody(game, 0, 0, 16, 16), sheet(), game);
    entity.setAnimation('run');
    entity.update(0.3);
    expect(entity.animFrame).toBe(1);
    entity.setAnimation('run');
    expect(entity.animTime).toBeCloseTo(0.3);
    entity.setAnimation('run', { restart: true });
    expect(entity.animTime).toBe(0);
  });

  it('picks the facing variant and falls back', () => {
    const entity = new Entity(makeBody(game, 0, 0, 16, 16), sheet(), game);
    entity.setDirectionalAnimation('run', Math.PI / 2);
    expect(entity.currentAnim).toBe('run_down');
    // A diagonal with no variant of its own prefers the vertical cardinal.
    entity.setDirectionalAnimation('run', Math.PI / 4);
    expect(entity.currentAnim).toBe('run_down');
    entity.setDirectionalAnimation('run', Math.PI);
    expect(entity.currentAnim).toBe('run');
  });

  it('draws one stretched frame when spriteFit is set', () => {
    const entity = new Entity(makeBody(game, 100, 100, 64, 64), sheet(), game);
    entity.setAnimation('run');
    entity.spriteFit = true;
    entity.draw();
    const sprites = game.renderer.optionsFor('drawSprite');
    expect(sprites).toHaveLength(1);
    expect(sprites[0]).toMatchObject({ width: 64, height: 64 });
  });
});

describe('scene loader animation rates', () => {
  const loader = new SceneLoader(null);
  const scene = (anim) => ({
    version: 2, type: 'level', name: 't',
    assets: { spritesheets: { s: { url: 's.png', frameWidth: 16, frameHeight: 16, animations: { run: anim } } } }
  });

  it('accepts fps and loop and rejects bad values', () => {
    expect(() => loader.load(scene({ frames: [[0, 0]], fps: 8, loop: false }))).not.toThrow();
    expect(() => loader.load(scene({ frames: [[0, 0]], fps: -1 }))).toThrow(/fps/);
    expect(() => loader.load(scene({ frames: [[0, 0]], loop: 'yes' }))).toThrow(/loop/);
  });
});

describe('Attack in any direction', () => {
  let game;
  beforeEach(() => { game = makeTestGame(); });

  function enemyAt(x, y) {
    const body = makeBody(game, x, y, 20, 20, { bodyType: 'dynamic' });
    body.setCollisionFilter({ category: CollisionCategories.enemy });
    const enemy = new Entity(body, null, game);
    enemy.addConstraint('health', new Health(enemy, { maxHealth: 100 }));
    game.physics.add(body);
    return enemy;
  }

  it('hits above and below when swung at an angle', () => {
    const player = new Entity(makeBody(game, 100, 100, 20, 20, { bodyType: 'static' }), null, game);
    game.physics.add(player.body);
    const attack = new Attack(player, { range: 60, arc: Math.PI, knockback: 0 });
    player.addConstraint('attack', attack);
    const above = enemyAt(100, 60);
    const below = enemyAt(100, 140);
    game.physics.step(1 / 60);

    attack.startAttack(-Math.PI / 2); // up
    attack.fixedUpdate(1 / 60);
    expect(above.getConstraint('health').currentHealth).toBe(90);
    expect(below.getConstraint('health').currentHealth).toBe(100);
  });

  it('keeps the side-view contract for ±1', () => {
    const player = new Entity(makeBody(game, 100, 100, 20, 20, { bodyType: 'static' }), null, game);
    game.physics.add(player.body);
    const attack = new Attack(player, { range: 60 });
    const right = enemyAt(150, 100);
    const left = enemyAt(50, 100);
    game.physics.step(1 / 60);
    attack.startAttack(1);
    attack.fixedUpdate(1 / 60);
    expect(right.getConstraint('health').currentHealth).toBe(90);
    expect(left.getConstraint('health').currentHealth).toBe(100);
    expect(attack.direction).toBe(1);
  });
});

describe('Abilities', () => {
  it('casts on a key edge, honours cooldown and locks', () => {
    const game = makeTestGame();
    const entity = new Entity(makeBody(game, 0, 0, 16, 16), null, game);
    const cast = vi.fn();
    const onCast = vi.fn();
    const abilities = new Abilities(entity, {
      abilities: [{ id: 'a', key: 'Digit1', cooldown: 2, cast }, { id: 'b', key: 'Digit2', cooldown: 1, cast, locked: true }],
      onCast
    });
    game.input.snapshot.pressed.add('Digit1');
    game.input.snapshot.pressed.add('Digit2');
    abilities.fixedUpdate(1 / 60);
    expect(cast).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), false);
    abilities.fixedUpdate(1 / 60);
    expect(cast).toHaveBeenCalledTimes(1); // cooling
    abilities.unlock('b');
    expect(abilities.cast('b')).toBe(true);
    expect(abilities.get('a').remaining).toBeGreaterThan(1.9);
  });
});

describe('Footsteps', () => {
  it('steps every stride while moving on the ground', () => {
    const game = makeTestGame();
    const played = [];
    game.soundManager = { playSound: (k) => played.push(k) };
    const entity = new Entity(makeBody(game, 0, 0, 16, 16, { bodyType: 'static' }), null, game);
    entity.isAirborne = false;
    Object.defineProperty(entity, 'velocity', { value: { x: 100, y: 0 } });
    const steps = new Footsteps(entity, { sounds: ['l', 'r'], stride: 50 });
    for (let i = 0; i < 61; i++) steps.fixedUpdate(1 / 60); // just past 100 units
    expect(played).toEqual(['l', 'r']);
    entity.isAirborne = true;
    for (let i = 0; i < 60; i++) steps.fixedUpdate(1 / 60);
    expect(played).toHaveLength(2);
    entity.isAirborne = false;
    steps.fixedUpdate(1 / 60); // landing
    expect(played).toHaveLength(3);
  });
});

describe('Quest', () => {
  it('walks its stages and reports them', () => {
    const seen = [];
    const quest = new Quest([{ id: 'a', objective: 'A' }, { id: 'b', objective: 'B' }, { id: 'c' }], {
      onStage: (stage, previous) => seen.push([stage.id, previous.id])
    });
    expect(quest.objective).toBe('A');
    expect(quest.complete('b')).toBe(false);
    expect(quest.complete('a')).toBe(true);
    expect(quest.is('b')).toBe(true);
    expect(quest.passed('a')).toBe(true);
    quest.advance();
    expect(quest.done).toBe(true);
    expect(quest.advance()).toBe(false);
    expect(seen).toEqual([['b', 'a'], ['c', 'b']]);
    expect(() => quest.goTo('zzz')).toThrow();
  });
});

describe('UIDialogue on a game clock', () => {
  it('types and debounces on the clock it is given, and ignores frames', () => {
    let now = 0;
    const dialogue = new UIDialogue({ charsPerSecond: 10, clock: () => now });
    let closed = 0;
    dialogue.start('Oswin', ['Hello there', 'Bye'], () => { closed++; });

    // Frames do not type.
    dialogue.update(5);
    expect(dialogue.shown).toBe(0);
    now = 0.5;
    expect(dialogue.shown).toBeCloseTo(5, 9);

    // Mid-line, a press finishes the line; the next moves on and types afresh.
    dialogue.advance();
    expect(dialogue.shown).toBe(Infinity);
    dialogue.advance();
    expect(dialogue.index).toBe(1);
    expect(dialogue.shown).toBe(0);
    now = 1;
    dialogue.advance();
    expect(closed).toBe(1);
    expect(dialogue.canOpen).toBe(false);
    now = 1.6;
    expect(dialogue.canOpen).toBe(true);
  });

  it('counts frames without a clock', () => {
    const dialogue = new UIDialogue({ charsPerSecond: 10 });
    dialogue.start('Oswin', ['Hello'], null);
    dialogue.update(0.2);
    expect(dialogue.shown).toBeCloseTo(2, 9);
  });
});

describe('SoundManager per-clip volume', () => {
  it('scales a clip by its own volume under the global one', () => {
    const played = [];
    class FakeAudio {
      constructor(src) { this.src = src; this.volume = 1; }
      cloneNode() { const c = new FakeAudio(this.src); c.baseVolume = this.baseVolume; played.push(c); return c; }
      play() { return Promise.resolve(); }
      pause() {}
    }
    vi.stubGlobal('Audio', FakeAudio);
    const manager = new SoundManager();
    manager.setSoundVolume(0.5);
    manager.loadSound('step', { src: 'step.wav', volume: 0.7 });
    manager.loadSound('hit', 'hit.wav');
    manager.playSound('step');
    manager.playSound('hit');
    expect(played[0].volume).toBeCloseTo(0.35);
    expect(played[1].volume).toBeCloseTo(0.5);
    manager.loadMusic('theme', { src: 't.mp3', volume: 0.5 });
    manager.setMusicVolume(0.4);
    manager.isInitialized = true;
    manager.playMusic('theme');
    expect(manager.currentMusic.volume).toBeCloseTo(0.2);
    manager.destroy();
    vi.unstubAllGlobals();
  });
});

describe('Attack combos', () => {
  it('chains within the window, resets outside it, and reports hits', () => {
    const game = makeTestGame();
    const player = new Entity(makeBody(game, 100, 100, 20, 20, { bodyType: 'static' }), null, game);
    game.physics.add(player.body);
    const hits = [];
    const attack = new Attack(player, {
      range: 60, cooldown: 1, comboWindow: 0.5, knockback: 0,
      combo: [{ damage: 10 }, { damage: 10 }, { damage: 30 }],
      onHit: (entity, step) => hits.push(step)
    });
    player.addConstraint('attack', attack);
    const body = makeBody(game, 140, 100, 20, 20, { bodyType: 'dynamic' });
    body.setCollisionFilter({ category: CollisionCategories.enemy });
    const enemy = new Entity(body, null, game);
    enemy.addConstraint('health', new Health(enemy, { maxHealth: 200, invulnerableDuration: 0.001 }));
    game.physics.add(body);
    game.physics.step(1 / 60);

    // Tick the enemy too: its invulnerability window has to expire.
    const swing = () => { attack.startAttack(0); for (let i = 0; i < 20; i++) { attack.fixedUpdate(1 / 60); enemy.getConstraint('health').fixedUpdate(1 / 60); } };
    swing(); // step 0
    swing(); // chains to 1 (0.33s after the last ended)
    swing(); // chains to 2, the finisher
    expect(hits).toEqual([0, 1, 2]);
    expect(enemy.getConstraint('health').currentHealth).toBe(150);
    for (let i = 0; i < 60; i++) attack.fixedUpdate(1 / 60); // let the window lapse
    swing();
    expect(hits).toEqual([0, 1, 2, 0]);
  });
});
