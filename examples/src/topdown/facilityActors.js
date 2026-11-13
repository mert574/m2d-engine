import { Platform } from 'm2d-engine/actors/platform.js';
import { TopDownPlayer } from 'm2d-engine/actors/topDownPlayer.js';
import { Ghost } from 'm2d-engine/actors/ghost.js';
import { Turret } from 'm2d-engine/actors/turret.js';
import { Rocket } from 'm2d-engine/actors/rocket.js';
import { Coin } from 'm2d-engine/actors/coin.js';
import { Trigger } from 'm2d-engine/actors/trigger.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';
import { Sonar } from './sonar.js';
import { makeRng, range } from '../shared/rng.js';
import { tileTexture } from '../shared/textures.js';
import { s } from 'm2d-engine/core/schema.js';

/**
 * The facility's cast, drawn instead of tiled.
 *
 * Every behaviour is inherited — the chase, the line-of-sight check, the
 * pickups, the trigger — and only `draw` changes. The palette is the
 * menu's: the dark reserves violet for the instrument and the infrastructure,
 * white-violet for the ghosts it tracks, and red for the things that shoot.
 *
 * Decoration is deterministic from each body's position, and every optional
 * renderer capability is asked for once in the constructor.
 */

/** A seed that is stable for an entity across reloads: where it stands. */
function seedFrom(position) {
  return (Math.round(position.x) * 92821 + Math.round(position.y) * 31337) % 2147483647;
}

export class FacilityWall extends Platform {
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);

    const rng = makeRng(seedFrom(body.position));
    const w = this.size.x;
    const h = this.size.y;

    // Conduit studs along the long axis, one per ~96 world units.
    this.studs = [];
    const along = Math.max(w, h);
    const count = Math.max(1, Math.round(along / 96) - 1);
    for (let i = 1; i <= count; i++) {
      this.studs.push({
        t: i / (count + 1) + range(rng, -0.04, 0.04),
        lit: rng() < 0.3
      });
    }
    this.pulse = range(rng, 0, Math.PI * 2);
    this.sway = 0;
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    this.sway += deltaTime;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const w = this.size.x;
    const h = this.size.y;
    const left = pos.x - w / 2;
    const top = pos.y - h / 2;

    // The wall's shadow on the floor first: the one cue that says these
    // blocks stand in the room rather than being painted on it.
    renderer.drawRect({
      x: left + 7, y: top + 9, width: w, height: h,
      fillStyle: 'rgba(0, 0, 0, 0.45)',
      cornerRadius: 5
    });

    // Steel plate, tiled at its own scale and darkened; a lit seam along
    // the top-left edge and a hard shadow line along the bottom-right say
    // which way is up under the ceiling grid.
    tileTexture(renderer, this.sprite?.image, { x: left, y: top, width: w, height: h }, 128);
    renderer.drawRect({
      x: left, y: top, width: w, height: h,
      fillStyle: {
        type: 'linear',
        x0: left, y0: top, x1: left + (w > h ? 0 : w), y1: top + (w > h ? h : 0),
        stops: [
          { offset: 0, color: 'rgba(235, 240, 250, 0.22)' },
          { offset: 1, color: 'rgba(30, 38, 56, 0.4)' }
        ]
      },
      cornerRadius: 3
    });
    renderer.drawRect({
      x: left + 1, y: top + 1, width: w - 2, height: h - 2,
      strokeStyle: 'rgba(20, 26, 38, 0.3)',
      lineWidth: 1.5,
      cornerRadius: 3
    });
    renderer.drawRect({
      x: left + 1.5, y: top + 1.5, width: w - 3, height: 1.2,
      fillStyle: 'rgba(255, 255, 255, 0.35)'
    });

    for (const stud of this.studs) {
      const x = w > h ? left + stud.t * w : pos.x;
      const y = w > h ? pos.y : top + stud.t * h;
      renderer.drawArc({
        x, y, radius: 2.5,
        fillStyle: stud.lit ? '#ffd27a' : '#0d0e14',
        globalAlpha: stud.lit
          ? 0.5 + 0.5 * Math.sin(this.sway * 1.8 + this.pulse + stud.t * 7)
          : 1
      });
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
}

export class SpecterGhost extends Ghost {
  /** Presentation: read from the renderer when drawing, never in simulation (a headless game has none). */
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.drift = makeRng(seedFrom(body.position))() * Math.PI * 2;
    this.wisp = 0;
    this.constraints.delete('damageFlash');
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#e8f0ff', radius: 34 }));
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    this.wisp += deltaTime;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const r = this.size.x / 2 + 4;
    const breathe = 1 + 0.08 * Math.sin(this.wisp * 2.1 + this.drift);
    const flicker = 0.82 + 0.18 * Math.sin(this.wisp * 9 + this.drift * 3);

    // On a lit floor an apparition still darkens the ground beneath it —
    // the shadow is what makes it occupy the room instead of floating as a
    // sticker over it.
    renderer.drawArc({
      x: pos.x + 3, y: pos.y + 6, radius: r * 1.05,
      fillStyle: {
        type: 'radial', x: pos.x + 3, y: pos.y + 6, r0: 0, r1: r * 1.05,
        stops: [
          { offset: 0, color: 'rgba(20, 26, 40, 0.3)' },
          { offset: 1, color: 'rgba(20, 26, 40, 0)' }
        ]
      }
    });

    // Trailing wisps against the direction of travel.
    const vel = this.velocity;
    const speed = Math.hypot(vel.x, vel.y);
    const back = speed > 1
      ? { x: -vel.x / speed, y: -vel.y / speed }
      : { x: Math.cos(this.drift), y: Math.sin(this.drift) };
    for (let i = 1; i <= 3; i++) {
      const wave = Math.sin(this.wisp * 3.2 + i * 1.8 + this.drift) * 4;
      renderer.drawArc({
        x: pos.x + back.x * r * 0.55 * i + back.y * wave,
        y: pos.y + back.y * r * 0.55 * i - back.x * wave,
        radius: r * (0.65 - i * 0.16) * breathe,
        fillStyle: 'rgba(214, 224, 240, 0.5)',
        globalAlpha: (0.3 - i * 0.08) * flicker,
        blend: this.blend
      });
    }

    // The apparition: a cold gradient with no hard edge anywhere.
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: r * 1.7 * breathe,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: r * 1.7 * breathe,
        stops: [
          { offset: 0, color: 'rgba(228, 236, 248, 0.55)' },
          { offset: 0.45, color: 'rgba(196, 210, 236, 0.22)' },
          { offset: 1, color: 'rgba(180, 196, 230, 0)' }
        ]
      },
      globalAlpha: flicker,
      blend: this.blend
    });
    renderer.drawArc({
      x: pos.x, y: pos.y - 1, radius: r * 0.62 * breathe,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y - 2, r0: 0, r1: r * 0.62 * breathe,
        stops: [
          { offset: 0, color: 'rgba(248, 250, 255, 0.95)' },
          { offset: 1, color: 'rgba(210, 222, 242, 0.1)' }
        ]
      },
      globalAlpha: flicker
    });

    // Two dark sockets, the one solid thing about it.
    renderer.drawArc({
      x: pos.x - 4, y: pos.y - 3, radius: 2.2,
      fillStyle: 'rgba(24, 12, 48, 0.85)'
    });
    renderer.drawArc({
      x: pos.x + 4, y: pos.y - 3, radius: 2.2,
      fillStyle: 'rgba(24, 12, 48, 0.85)'
    });

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y,
        radius: 150,
        color: '#d8e4ff',
        intensity: 0.5 * flicker
      });
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
}

/** The turret's bolt as an energy round rather than a cartoon missile. */
class PhantomBolt extends Rocket {
  draw() {
    if (this.dead) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const dir = this.direction;
    const blend = renderer.supports('blendModes') ? 'additive' : undefined;

    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 14,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: 14,
        stops: [
          { offset: 0, color: 'rgba(255, 110, 92, 0.6)' },
          { offset: 1, color: 'rgba(255, 110, 92, 0)' }
        ]
      },
      blend
    });
    // The streak: core ahead, tail fading behind.
    for (let i = 0; i < 4; i++) {
      renderer.drawArc({
        x: pos.x - dir.x * i * 7,
        y: pos.y - dir.y * i * 7,
        radius: 4.5 - i,
        fillStyle: i === 0 ? '#ffe6da' : '#ff7a5e',
        globalAlpha: 1 - i * 0.22,
        blend: i === 0 ? undefined : blend
      });
    }

    if (renderer.supports('lights')) {
      renderer.drawLight({
        x: pos.x, y: pos.y, radius: 120, color: '#ff7a5e', intensity: 0.6
      });
    }
  }
}

export class SentryTurret extends Turret {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  static properties = {
    boltLifetime: s.number({ initial: 6, positive: true, unit: 's', label: 'Bolt lifetime' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.boltLifetime = options.boltLifetime ?? 6;
    this.idleScan = makeRng(seedFrom(body.position))() * Math.PI * 2;
    this.clock = 0;
  }

  /** Same firing solution as the stock turret, different round. */
  fireRocket() {
    const spawnOffset = 20;
    const rocketBody = this.game.physics.createBox({
      x: this.position.x + this.aimDirection.x * spawnOffset,
      y: this.position.y + this.aimDirection.y * spawnOffset,
      width: 24,
      height: 8,
      friction: 0,
      frictionAir: 0,
      restitution: 0,
      density: 0.001
    });
    const bolt = new PhantomBolt(rocketBody, null, this.game, {
      speed: this.rocketSpeed,
      damage: this.rocketDamage,
      direction: { ...this.aimDirection },
      maxLifetime: this.boltLifetime
    });
    this.game.entities.add(bolt);
    this.game.physics.add(rocketBody);
  }

  draw(deltaTime) {
    if (this.dead) return;
    this.clock += deltaTime;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const locked = this.hasLineOfSight;
    const aim = locked
      ? Math.atan2(this.aimDirection.y, this.aimDirection.x)
      : this.idleScan + this.clock * 0.6;

    // The scan cone, under the hardware. Violet while patrolling, red and
    // narrow the moment it has the player — the mechanic, made visible.
    const spread = locked ? 0.16 : 0.5;
    const reach = locked ? this.detectionRange : this.detectionRange * 0.65;
    const tone = locked ? '235, 60, 40' : '52, 64, 92';
    renderer.drawPath({
      points: [
        { x: pos.x, y: pos.y },
        { x: pos.x + Math.cos(aim - spread) * reach, y: pos.y + Math.sin(aim - spread) * reach },
        { x: pos.x + Math.cos(aim) * reach * 1.06, y: pos.y + Math.sin(aim) * reach * 1.06 },
        { x: pos.x + Math.cos(aim + spread) * reach, y: pos.y + Math.sin(aim + spread) * reach }
      ],
      closed: true,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 10, r1: reach,
        stops: [
          { offset: 0, color: `rgba(${tone}, 0.3)` },
          { offset: 1, color: `rgba(${tone}, 0)` }
        ]
      },
      globalAlpha: locked ? 0.85 : 0.4
    });

    // Hardware: shadow, plinth, ring, housing, barrel.
    const flash = this.damageFlashTime > 0;
    renderer.drawArc({
      x: pos.x + 4, y: pos.y + 6, radius: 17,
      fillStyle: 'rgba(0, 0, 0, 0.4)'
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 17,
      fillStyle: flash ? '#6a3550' : '#1c1530'
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 17,
      strokeStyle: 'rgba(200, 210, 230, 0.35)', lineWidth: 1.5
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 11,
      fillStyle: {
        type: 'radial', x: pos.x - 3, y: pos.y - 3, r0: 0, r1: 14,
        stops: [
          { offset: 0, color: flash ? '#8a4a66' : '#453a66' },
          { offset: 1, color: '#201a36' }
        ]
      }
    });
    // drawRect has no rotation, so the barrel is a pair of thick lines.
    renderer.drawLine({
      x1: pos.x + Math.cos(aim) * 6, y1: pos.y + Math.sin(aim) * 6,
      x2: pos.x + Math.cos(aim) * 20, y2: pos.y + Math.sin(aim) * 20,
      strokeStyle: '#0e0a1c', lineWidth: 7
    });
    renderer.drawLine({
      x1: pos.x + Math.cos(aim) * 6, y1: pos.y + Math.sin(aim) * 6,
      x2: pos.x + Math.cos(aim) * 19, y2: pos.y + Math.sin(aim) * 19,
      strokeStyle: locked ? '#b0484a' : '#3f3560', lineWidth: 3.5
    });

    // The eye: charging toward white as the next shot comes due.
    const charge = locked ? 1 - Math.min(1, this.fireCooldown / this.fireRate) : 0;
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 3.4,
      fillStyle: locked ? (charge > 0.8 ? '#ffe2d6' : '#ff5a46') : '#c8d4ec',
      globalAlpha: locked ? 0.7 + 0.3 * charge : 0.5 + 0.3 * Math.sin(this.clock * 2.4)
    });

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y,
        radius: 120,
        color: locked ? '#ff6a50' : '#aab6d0',
        intensity: locked ? 0.55 : 0.3
      });
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
}

export class DataCore extends Coin {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);

    const rng = makeRng(seedFrom(body.position));
    const hover = this.constraints.get('hover');
    hover.phase = rng() * Math.PI * 2;
    hover.angle = rng() * Math.PI * 2;
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const r = this.size.x / 2;
    const spin = this.renderAngleOffset;

    renderer.drawArc({
      x: pos.x, y: pos.y, radius: r * 2,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: r * 2,
        stops: [
          { offset: 0, color: 'rgba(255, 196, 110, 0.35)' },
          { offset: 1, color: 'rgba(255, 196, 110, 0)' }
        ]
      },
      blend: this.blend
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: r * 0.55,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: r * 0.55,
        stops: [
          { offset: 0, color: '#fff6e0' },
          { offset: 1, color: '#f0a63c' }
        ]
      }
    });

    // Two sparks on a tilted orbit, reading as a gyroscope.
    for (const offset of [0, Math.PI]) {
      renderer.drawArc({
        x: pos.x + Math.cos(spin * 2 + offset) * r * 1.1,
        y: pos.y + Math.sin(spin * 2 + offset) * r * 0.45,
        radius: 1.6,
        fillStyle: '#ffe8bc',
        globalAlpha: 0.9,
        blend: this.blend
      });
    }

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y, radius: 80, color: '#ffc46e', intensity: 0.45
      });
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
}

/** The exit as an extraction pad: a beacon, not a debug rectangle. */
export class ExtractionPad extends Trigger {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.beacon = 0;
  }

  draw(deltaTime) {
    if (!this.visible) return;
    this.beacon += deltaTime;

    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const r = Math.max(this.size.x, this.size.y) * 0.7;
    const breathe = 0.75 + 0.25 * Math.sin(this.beacon * 1.6);

    renderer.drawArc({
      x: pos.x, y: pos.y, radius: r * breathe,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: r * breathe,
        stops: [
          { offset: 0, color: 'rgba(125, 255, 196, 0.2)' },
          { offset: 0.7, color: 'rgba(125, 255, 196, 0.08)' },
          { offset: 1, color: 'rgba(125, 255, 196, 0)' }
        ]
      },
      blend: this.blend
    });

    // A rotating dashed ring: machinery waiting, not an area-of-effect.
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const a = this.beacon * 0.7 + (i / segments) * Math.PI * 2;
      const b = a + (Math.PI * 2 / segments) * 0.55;
      renderer.drawPath({
        points: [
          { x: pos.x + Math.cos(a) * r * 0.8, y: pos.y + Math.sin(a) * r * 0.8 },
          { x: pos.x + Math.cos(b) * r * 0.8, y: pos.y + Math.sin(b) * r * 0.8 }
        ],
        strokeStyle: '#7dffc4',
        lineWidth: 2.5,
        globalAlpha: 0.5 + 0.3 * Math.sin(this.beacon * 1.6 + i)
      });
    }
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 4,
      fillStyle: '#d9ffe9',
      globalAlpha: breathe
    });

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y, radius: 180, color: '#7dffc4', intensity: 0.5 * breathe
      });
    }
  }
}

export class ScannerAgent extends TopDownPlayer {
  static properties = {
    lampReach: s.number({ initial: 240, positive: true, unit: 'px', label: 'Hand lamp reach' }),
    lampSpread: s.number({ initial: 0.42, positive: true, unit: 'rad', label: 'Hand lamp spread', description: 'Half the cone\'s width' })
  };

  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.lampReach = options.lampReach ?? 240;
    this.lampSpread = options.lampSpread ?? 0.42;
    /** Smoothed heading, so the lamp does not snap on a tap of a key. */
    this.heading = -Math.PI / 2;
    /** 1 on a hit, decaying to 0: what tears the feed (see `tear`). */
    this.hurt = 0;
    /** Seconds since the agent appeared, on frame time: the feed acquiring. */
    this.age = 0;
    this.addConstraint('sonar', new Sonar(this, { period: 3.2, range: 460 }));
    this.addConstraint('swing', new AttackSwing(this, { color: '#ffe6c4' }));
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#ffd9a0', radius: 34 }));
    const health = this.constraints.get('health');
    const onDamage = health.onDamage;
    health.onDamage = (amount) => {
      onDamage?.(amount);
      this.hurt = 1;
    };
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.hurt = Math.max(0, this.hurt - deltaTime * 1.4);
    this.age += deltaTime;
  }

  /**
   * How torn the feed the player watches is, 0..1: it tears once as it
   * acquires in the first moment of the level and again on a hit, clean
   * otherwise. The scene's `world.postBind` reads this (and `tearFlash`,
   * which comes on harder) to tear the post pass.
   */
  get tear() {
    const boot = Math.max(0, 1 - this.age / 0.8);
    return Math.min(1, Math.max(boot * 0.7, this.hurt));
  }

  get tearFlash() {
    return this.tear * this.tear;
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const vel = this.velocity;
    const speed = Math.hypot(vel.x, vel.y);
    if (speed > 10) {
      const target = Math.atan2(vel.y, vel.x);
      let delta = target - this.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.heading += delta * Math.min(1, deltaTime * 12);
    }
    const heading = this.heading;

    // The hand lamp: a cone of attention ahead of the agent.
    const reach = this.lampReach;
    const spread = this.lampSpread;
    renderer.drawPath({
      points: [
        { x: pos.x, y: pos.y },
        { x: pos.x + Math.cos(heading - spread) * reach, y: pos.y + Math.sin(heading - spread) * reach },
        { x: pos.x + Math.cos(heading) * reach * 1.08, y: pos.y + Math.sin(heading) * reach * 1.08 },
        { x: pos.x + Math.cos(heading + spread) * reach, y: pos.y + Math.sin(heading + spread) * reach }
      ],
      closed: true,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 8, r1: reach,
        stops: [
          { offset: 0, color: 'rgba(255, 240, 214, 0.2)' },
          { offset: 1, color: 'rgba(255, 240, 214, 0)' }
        ]
      },
      blend: this.blend
    });

    // The agent from above: shadow, shoulders, pack, head, visor.
    const cos = Math.cos(heading), sin = Math.sin(heading);
    renderer.drawArc({
      x: pos.x + 3, y: pos.y + 4, radius: 9,
      fillStyle: 'rgba(0, 0, 0, 0.4)'
    });
    renderer.drawArc({
      x: pos.x - cos * 5, y: pos.y - sin * 5, radius: 6,
      fillStyle: '#121419'
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 9,
      fillStyle: {
        type: 'radial', x: pos.x - 2, y: pos.y - 2, r0: 0, r1: 11,
        stops: [
          { offset: 0, color: '#4a4f5c' },
          { offset: 1, color: '#1c1f28' }
        ]
      }
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 9,
      strokeStyle: 'rgba(220, 228, 240, 0.4)', lineWidth: 1.2
    });
    renderer.drawArc({
      x: pos.x + cos * 2.5, y: pos.y + sin * 2.5, radius: 5,
      fillStyle: '#2a2e3a'
    });
    // The visor, the one bright thing it wears.
    renderer.drawLine({
      x1: pos.x + cos * 4.5 - sin * 3, y1: pos.y + sin * 4.5 + cos * 3,
      x2: pos.x + cos * 4.5 + sin * 3, y2: pos.y + sin * 4.5 - cos * 3,
      strokeStyle: '#ffd9a0',
      lineWidth: 2.2
    });

    if (this.lit) {
      renderer.drawLight({
        x: pos.x + cos * reach * 0.45, y: pos.y + sin * reach * 0.45,
        radius: reach * 0.85,
        color: '#ffe6c4',
        intensity: 0.45
      });
      // A low fill around the agent, as wide as the view, so nothing it
      // can see is pure black; the ceiling lamps do the real lighting.
      renderer.drawLight({ x: pos.x, y: pos.y, radius: this.game.camera.width, color: '#9aa3b8', intensity: 0.32 });
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
}
