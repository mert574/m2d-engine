import { describe, it, expect } from 'vitest';
import { AttackSwing, HitBurst, registerEffects } from '../src/effects.ts';
import { range, makeRng } from '../src/random.ts';
import { tileTexture } from '../src/textures.ts';
import { audioOption } from '../src/audio.ts';

/** A stand-in for the entity the effects read, recording what they draw. */
function entity(attack) {
  const calls = [];
  const constraints = new Map();
  if (attack) constraints.set('attack', attack);
  return {
    calls,
    constraints,
    renderPosition: { x: 10, y: 20 },
    size: { x: 16, y: 24 },
    game: {
      renderer: {
        supports: () => true,
        drawPath: (o) => { calls.push(['drawPath', o]); },
        drawArc: (o) => { calls.push(['drawArc', o]); }
      },
      projection: null,
      registered: [],
      registerConstraint(name, klass, options) { this.registered.push([name, klass, options]); }
    }
  };
}

describe('AttackSwing', () => {
  it('starts with the attack, keeps the attack\'s own onStart, and draws a fading arc', () => {
    let started = 0;
    const attack = { onStart: () => { started++; }, direction: -1, range: 40 };
    const e = entity(attack);
    const swing = new AttackSwing(e, { duration: 0.5 });
    swing.draw();
    expect(e.calls).toHaveLength(0);
    attack.onStart();
    expect(started).toBe(1);
    expect(swing.angle).toBeCloseTo(Math.PI); // facing left, no projection
    swing.update(0.1);
    swing.draw();
    expect(e.calls.map(([name]) => name)).toEqual(['drawPath', 'drawPath']);
    swing.update(0.5);
    e.calls.length = 0;
    swing.draw();
    expect(e.calls).toHaveLength(0);
  });
});

describe('HitBurst', () => {
  it('bursts on the damage world event and fades out', () => {
    const e = entity();
    const burst = new HitBurst(e, { duration: 0.2 });
    burst.draw();
    expect(e.calls).toHaveLength(0);
    burst.onWorldEvent('heal');
    expect(burst.timeLeft).toBe(0);
    burst.onWorldEvent('damage');
    burst.update(0.05);
    burst.draw();
    expect(e.calls.map(([name]) => name)).toEqual(['drawArc', 'drawArc']);
    burst.update(0.5);
    e.calls.length = 0;
    burst.draw();
    expect(e.calls).toHaveLength(0);
  });

  it('registers both as the kit\'s', () => {
    const e = entity();
    registerEffects(e.game);
    expect(e.game.registered).toEqual([
      ['AttackSwing', AttackSwing, { origin: 'kit' }],
      ['HitBurst', HitBurst, { origin: 'kit' }]
    ]);
  });
});

describe('the helpers', () => {
  it('range maps a generator into [min, max) and the same seed gives the same run', () => {
    const a = makeRng(7); const b = makeRng(7);
    const values = Array.from({ length: 5 }, () => range(a, 10, 20));
    expect(values.every((v) => v >= 10 && v < 20)).toBe(true);
    expect(Array.from({ length: 5 }, () => range(b, 10, 20))).toEqual(values);
  });

  it('tileTexture clips to the rectangle and aligns tiles to the world grid or the rectangle', () => {
    const calls = [];
    const renderer = {
      pushClip: (r) => { calls.push(['pushClip', r]); },
      popClip: () => { calls.push(['popClip', null]); },
      drawSprite: (o) => { calls.push(['drawSprite', [o.x, o.y]]); }
    };
    const image = { width: 64, height: 64 };
    tileTexture(renderer, image, { x: 100, y: 0, width: 100, height: 50 }, 64);
    const world = calls.filter(([n]) => n === 'drawSprite').map(([, xy]) => xy);
    expect(calls[0]).toEqual(['pushClip', { x: 100, y: 0, width: 100, height: 50 }]);
    expect(calls.at(-1)[0]).toBe('popClip');
    expect(world[0]).toEqual([96, 32]); // the grid tile that starts at 64 covers the rect's left edge
    calls.length = 0;
    tileTexture(renderer, image, { x: 100, y: 0, width: 100, height: 50 }, 64, { origin: 'rect' });
    expect(calls.filter(([n]) => n === 'drawSprite')[0][1]).toEqual([132, 32]);
    calls.length = 0;
    tileTexture(renderer, null, { x: 0, y: 0, width: 10, height: 10 });
    expect(calls).toHaveLength(0);
  });

  it('audioOption reads and toggles the engine\'s mute', () => {
    const sound = { isMuted: false, toggleMute() { this.isMuted = !this.isMuted; } };
    const option = audioOption({ soundManager: sound });
    expect(option.value()).toBe('On');
    option.step();
    expect(option.value()).toBe('Off');
    expect(option.choices()).toEqual({ index: 0, count: 2 });
  });
});
