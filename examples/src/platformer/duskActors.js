import { Player } from 'm2d-engine/actors/player.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { MovingPlatform } from 'm2d-engine/actors/movingPlatform.js';
import { Coin } from 'm2d-engine/actors/coin.js';
import { Bee } from 'm2d-engine/actors/bee.js';
import { Trigger } from 'm2d-engine/actors/trigger.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';
import { makeRng, range } from '../shared/rng.js';

/**
 * The level's cast, drawn instead of tiled.
 *
 * The stock actors paint their 32px sheet across the body, which reads as a
 * grid of stickers. These subclasses keep every behaviour — the bodies, the
 * paths, the pickups, the trigger — and replace only `draw`, building each
 * entity's look out of renderer primitives sized to its actual body: a
 * platform is a floating island with a sunlit grass lip, a coin is a disc
 * of gold with a halo the bloom can catch, the goal is a pillar of cool
 * light against the warm sky.
 *
 * All decoration is deterministic, seeded from the body's position, so a
 * reload grows the same tufts in the same places. Sway and shimmer run on a
 * per-entity clock accumulated in `draw`, and anything that needs a render
 * position uses `renderPosition`, so moving platforms carry their gardens
 * smoothly.
 */

/** A seed that is stable for an entity across reloads: where it stands. */
function seedFrom(position) {
  return (Math.round(position.x) * 92821 + Math.round(position.y) * 31337) % 2147483647;
}

/** Warm rim the low sun paints along upward-facing edges. */
const RIM = 'rgba(255, 190, 110, 0.6)';

/**
 * The player: an ember spirit carried in a tumbling lantern.
 *
 * The engine's platformer movement *is* rolling — ground friction turns the
 * dynamic box, and its angle tumbles with it — so the character is a thing
 * that tumbles well: a brass-framed lantern, drawn at exactly the body's
 * size and angle so what you see is what collides. Its corners catch and
 * its panes flash as they turn. The spirit
 * inside hangs level like a compass gimbal, leans into its own speed, and
 * is the warmest light in the valley, which the level's lighting treats as
 * a real source.
 */
export class EmberPlayer extends Player {
  /** Presentation: read from the renderer when drawing, never in simulation (a headless game has none). */
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.clock = 0;

    // The swing is the ember's own light thrown forward; a hit on the
    // lantern bursts the same colour.
    this.addConstraint('swing', new AttackSwing(this, { color: '#ffc98a' }));
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#ffd9a0', radius: 40 }));
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    this.clock += deltaTime;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const vel = this.velocity;
    const w = this.size.x;
    const h = this.size.y;
    const angle = this.renderAngle;
    const speed = Math.hypot(vel.x, vel.y);

    // Sparks shed off the frame when it is really moving.
    if (speed > 80 && this.blend) {
      const bx = -vel.x / speed;
      const by = -vel.y / speed;
      for (let i = 0; i < 3; i++) {
        const wiggle = Math.sin(this.clock * 17 + i * 2.4) * (2 + i);
        renderer.drawArc({
          x: pos.x + bx * (h / 2 + 4 + i * 8) - by * wiggle,
          y: pos.y + by * (h / 2 + 4 + i * 8) + bx * wiggle,
          radius: 1.8 - i * 0.4,
          fillStyle: '#ffc37c',
          globalAlpha: Math.min(1, speed / 260) * (0.7 - i * 0.2),
          blend: this.blend
        });
      }
    }

    // The lantern glow, breathing slowly.
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: h * 1.1,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: h * 0.25, r1: h * 1.1,
        stops: [
          { offset: 0, color: 'rgba(255, 183, 100, 0.35)' },
          { offset: 1, color: 'rgba(255, 183, 100, 0)' }
        ]
      },
      globalAlpha: 0.8 + 0.2 * Math.sin(this.clock * 3),
      blend: this.blend
    });

    // The panes, at the body's angle: the same box the physics has.
    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: angle });
    renderer.drawRect({
      x: -w / 2, y: -h / 2, width: w, height: h,
      fillStyle: {
        type: 'radial', x: 0, y: 1, r0: 0, r1: h * 0.62,
        stops: [
          { offset: 0, color: 'rgba(255, 170, 90, 0.42)' },
          { offset: 0.6, color: 'rgba(74, 50, 96, 0.72)' },
          { offset: 1, color: 'rgba(26, 17, 42, 0.95)' }
        ]
      },
      cornerRadius: 5
    });
    // A pane catches the sky as it swings past the top: the one highlight
    // that moves with the tumble.
    const up = -Math.PI / 2;
    let catchAngle = ((angle - up) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (catchAngle > Math.PI) catchAngle = Math.PI * 2 - catchAngle;
    renderer.drawRect({
      x: -w / 2 + 3, y: -h / 2 + 3, width: w - 6, height: h * 0.3,
      fillStyle: 'rgba(235, 240, 255, 0.4)',
      globalAlpha: Math.max(0, 1 - catchAngle / 0.9),
      cornerRadius: 3
    });
    renderer.popTransform();

    // The spirit, hanging level inside, leaning into its own motion.
    const lean = Math.max(-1, Math.min(1, vel.x / 260)) * 2.8;
    const flicker = 1.5 + Math.sin(this.clock * 11) * 1.1 + Math.sin(this.clock * 23) * 0.5;
    const core = w * 0.3;
    renderer.drawPath({
      points: [
        { x: pos.x + lean * 0.5 - 3.4, y: pos.y - 1 },
        { x: pos.x + lean * 1.5, y: pos.y - core * 1.9 - flicker },
        { x: pos.x + lean * 0.5 + 3.4, y: pos.y - 1 }
      ],
      closed: true,
      fillStyle: '#ffcf86',
      globalAlpha: 0.9
    });
    renderer.drawArc({
      x: pos.x + lean * 0.5, y: pos.y + 2, radius: core,
      fillStyle: {
        type: 'radial', x: pos.x + lean * 0.5 - 1, y: pos.y + 0.5, r0: 0, r1: core * 1.15,
        stops: [
          { offset: 0, color: '#fff6da' },
          { offset: 0.55, color: '#ffc06a' },
          { offset: 1, color: '#e8853a' }
        ]
      }
    });
    const blink = (this.clock % 3.7) < 0.12;
    for (const side of [-1, 1]) {
      const ex = pos.x + lean * 0.8 + side * 2.3;
      if (blink) {
        renderer.drawRect({
          x: ex - 1.1, y: pos.y + 1, width: 2.2, height: 1,
          fillStyle: '#46200a', cornerRadius: 0.5
        });
      } else {
        renderer.drawArc({ x: ex, y: pos.y + 1.2, radius: 1.15, fillStyle: '#46200a' });
      }
    }

    // The frame over the spirit, so it sits *inside*: muntins, rails,
    // corner caps and the foot.
    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: angle });
    renderer.drawLine({
      x1: 0, y1: -h / 2 + 2, x2: 0, y2: h / 2 - 2,
      strokeStyle: 'rgba(60, 36, 20, 0.55)', lineWidth: 1.5
    });
    renderer.drawLine({
      x1: -w / 2 + 2, y1: -h * 0.12, x2: w / 2 - 2, y2: -h * 0.12,
      strokeStyle: 'rgba(60, 36, 20, 0.55)', lineWidth: 1.5
    });
    renderer.drawRect({
      x: -w / 2 + 1, y: -h / 2 + 1, width: w - 2, height: h - 2,
      strokeStyle: '#c99a5c', lineWidth: 2.2, cornerRadius: 4.5
    });
    renderer.drawRect({
      x: -w / 2 + 1, y: -h / 2 + 1, width: w - 2, height: h - 2,
      strokeStyle: 'rgba(255, 220, 170, 0.35)', lineWidth: 0.8, cornerRadius: 4.5
    });
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      renderer.drawArc({
        x: sx * (w / 2 - 3.5), y: sy * (h / 2 - 3.5), radius: 2.2,
        fillStyle: '#e8c38a'
      });
    }
    renderer.drawRect({
      x: -w / 2 + 2, y: h / 2 - 4, width: w - 4, height: 3,
      fillStyle: '#4a2c16', cornerRadius: 1.5
    });
    renderer.popTransform();

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
}

export class DuskPlatform extends Platform {
  get lit() { return this.game.renderer.supports('lights'); }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.sway = 0;

    const w = this.size.x;
    const h = this.size.y;
    this.isWall = h > w;

    const rng = makeRng(seedFrom(body.position));

    if (this.isWall) {
      // The valley's sides: a cliff face, striated by ledges.
      this.facing = body.position.x < game.options.worldWidth / 2 ? 1 : -1;
      this.ledges = [];
      for (let y = -h / 2 + range(rng, 30, 80); y < h / 2 - 20; y += range(rng, 54, 110)) {
        this.ledges.push({
          y,
          length: range(rng, 8, 20),
          mossy: rng() < 0.45
        });
      }
      return;
    }

    // A floating island: flat walked top, a belly of rock sagging below the
    // body. The sag is visual only — the physics box stays the JSON's.
    const sag = Math.min(30, 10 + w * 0.05);
    const bellySteps = Math.max(4, Math.round(w / 56));
    this.belly = [];
    for (let i = 0; i <= bellySteps; i++) {
      const t = i / bellySteps;
      const dip = Math.sin(t * Math.PI) * sag * range(rng, 0.75, 1.15);
      this.belly.push({ x: -w / 2 + t * w, y: h / 2 + dip });
    }

    this.tufts = [];
    for (let x = -w / 2 + range(rng, 6, 16); x < w / 2 - 4; x += range(rng, 16, 30)) {
      this.tufts.push({
        x,
        height: range(rng, 6, 14),
        lean: range(rng, -3, 3),
        phase: range(rng, 0, Math.PI * 2),
        shade: rng(),
        seedhead: rng() < 0.22
      });
    }

    this.moss = [];
    const strands = Math.max(2, Math.round(w / 90));
    for (let i = 0; i < strands; i++) {
      const t = range(rng, 0.12, 0.88);
      const bellyY = h / 2 + Math.sin(t * Math.PI) * sag * 0.8;
      this.moss.push({
        x: -w / 2 + t * w,
        y: bellyY - 2,
        length: range(rng, 8, 22),
        phase: range(rng, 0, Math.PI * 2)
      });
    }

    this.cracks = [];
    for (let i = 0; i < Math.max(1, Math.round(w / 180)); i++) {
      const x = range(rng, -w * 0.35, w * 0.35);
      this.cracks.push([
        { x, y: -h * 0.2 },
        { x: x + range(rng, -8, 8), y: h * 0.25 },
        { x: x + range(rng, -14, 14), y: h * 0.5 + range(rng, 2, sag * 0.6) }
      ]);
    }
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    this.sway += deltaTime;

    const pos = this.renderPosition;
    if (this.isWall) {
      this.#drawCliff(pos);
    } else {
      this.#drawIsland(pos);
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }

  #drawIsland(pos) {
    const renderer = this.game.renderer;
    const w = this.size.x;
    const h = this.size.y;
    const left = pos.x - w / 2;
    const top = pos.y - h / 2;

    // The rock, top edge straight, belly sagging under it. The gradient is
    // angled off the low sun — warm high on the right, cold under the belly
    // — which is what models the island instead of merely filling it.
    const points = [{ x: left, y: top }, { x: left + w, y: top }];
    for (let i = this.belly.length - 1; i >= 0; i--) {
      points.push({ x: pos.x + this.belly[i].x, y: pos.y + this.belly[i].y });
    }
    renderer.drawPath({
      points,
      closed: true,
      fillStyle: {
        type: 'linear',
        x0: left + w, y0: top, x1: left + w * 0.3, y1: top + h + 34,
        stops: [
          { offset: 0, color: '#a18aae' },
          { offset: 0.35, color: '#6e5a88' },
          { offset: 0.7, color: '#49395e' },
          { offset: 1, color: '#241a34' }
        ]
      }
    });

    // Cool skylight bounced back onto the underside, so the belly reads as
    // a surface in the same world as the mist below it.
    renderer.drawPath({
      points: this.belly.map((p) => ({ x: pos.x + p.x, y: pos.y + p.y })),
      strokeStyle: 'rgba(150, 170, 215, 0.3)',
      lineWidth: 1.5
    });

    for (const crack of this.cracks) {
      renderer.drawPath({
        points: crack.map((p) => ({ x: pos.x + p.x, y: pos.y + p.y })),
        strokeStyle: 'rgba(0, 0, 0, 0.3)',
        lineWidth: 1.5
      });
    }

    // Soil in the turf's shadow, then the turf overhanging the rock a touch.
    renderer.drawRect({
      x: left, y: top, width: w, height: 7,
      fillStyle: {
        type: 'linear', x0: 0, y0: top, x1: 0, y1: top + 7,
        stops: [
          { offset: 0, color: '#3a2e4c' },
          { offset: 1, color: '#584868' }
        ]
      }
    });
    renderer.drawRect({
      x: left - 2, y: top - 3, width: w + 4, height: 8,
      fillStyle: {
        type: 'linear', x0: 0, y0: top - 3, x1: 0, y1: top + 5,
        stops: [
          { offset: 0, color: '#6fa468' },
          { offset: 1, color: '#44703f' }
        ]
      },
      cornerRadius: 3
    });

    // The sun grazes every top edge; this line is what makes the islands
    // belong to the sky behind them.
    renderer.drawRect({
      x: left - 2, y: top - 4, width: w + 4, height: 1.5,
      fillStyle: RIM
    });
    renderer.drawRect({
      x: left + w - 2, y: top, width: 2, height: h * 0.6,
      fillStyle: 'rgba(255, 170, 96, 0.22)'
    });

    for (const tuft of this.tufts) {
      const baseX = pos.x + tuft.x;
      const baseY = top - 1;
      const wave = Math.sin(this.sway * 1.3 + tuft.phase) * 2;
      const shade = tuft.shade < 0.5 ? '#4a7a4e' : '#5f9460';
      for (let b = -1; b <= 1; b++) {
        const tipX = baseX + tuft.lean + b * 2.4 + wave;
        const tipY = baseY - tuft.height * (1 - Math.abs(b) * 0.3);
        renderer.drawPath({
          points: [
            { x: baseX + b * 1.4, y: baseY },
            { x: baseX + (tipX - baseX) * 0.5 + b, y: baseY - tuft.height * 0.6 },
            { x: tipX, y: tipY }
          ],
          strokeStyle: shade,
          lineWidth: 1.4
        });
      }
      if (tuft.seedhead) {
        renderer.drawArc({
          x: baseX + tuft.lean + wave, y: baseY - tuft.height - 1,
          radius: 1.5,
          fillStyle: '#e0a35c'
        });
      }
    }

    for (const strand of this.moss) {
      const sway = Math.sin(this.sway * 0.8 + strand.phase) * 1.5;
      renderer.drawPath({
        points: [
          { x: pos.x + strand.x, y: pos.y + strand.y },
          { x: pos.x + strand.x + sway * 0.5, y: pos.y + strand.y + strand.length * 0.6 },
          { x: pos.x + strand.x + sway, y: pos.y + strand.y + strand.length }
        ],
        strokeStyle: 'rgba(74, 110, 70, 0.85)',
        lineWidth: 1.3
      });
    }
  }

  #drawCliff(pos) {
    const renderer = this.game.renderer;
    const w = this.size.x;
    const h = this.size.y;
    const left = pos.x - w / 2;
    const top = pos.y - h / 2;
    const innerX = this.facing > 0 ? left + w : left;

    renderer.drawRect({
      x: left, y: top, width: w, height: h,
      fillStyle: {
        type: 'linear',
        x0: innerX, y0: 0, x1: innerX - this.facing * w, y1: 0,
        stops: [
          { offset: 0, color: '#6c5c88' },
          { offset: 1, color: '#352a4e' }
        ]
      }
    });

    // The edge the level sees, caught by what light is left.
    renderer.drawRect({
      x: innerX - (this.facing > 0 ? 1.5 : 0), y: top,
      width: 1.5, height: h,
      fillStyle: 'rgba(255, 170, 110, 0.14)'
    });

    for (const ledge of this.ledges) {
      const y = pos.y + ledge.y;
      const x = this.facing > 0 ? innerX - ledge.length : innerX;
      renderer.drawRect({
        x, y, width: ledge.length, height: 2,
        fillStyle: 'rgba(120, 100, 140, 0.35)'
      });
      if (ledge.mossy) {
        renderer.drawRect({
          x, y: y - 2, width: ledge.length * 0.7, height: 2,
          fillStyle: 'rgba(52, 80, 56, 0.6)'
        });
      }
    }
  }
}

export class DuskMovingPlatform extends MovingPlatform {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
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
    const pulse = 0.7 + 0.3 * Math.sin(this.sway * 2.4);

    // Cut stone, not grown rock: something made carries the player.
    renderer.drawRect({
      x: left, y: top, width: w, height: h,
      fillStyle: {
        type: 'linear', x0: 0, y0: top, x1: 0, y1: top + h,
        stops: [
          { offset: 0, color: '#8a90ae' },
          { offset: 0.5, color: '#626890' },
          { offset: 1, color: '#3a4060' }
        ]
      },
      cornerRadius: 4
    });
    renderer.drawRect({
      x: left, y: top, width: w, height: 1.5,
      fillStyle: 'rgba(255, 190, 110, 0.4)'
    });

    // A warm seam keeps it aloft; the glow underneath is its wake. The wake
    // needs additive blending to read as light — composited normally it is a
    // grey fog blob, so without blend modes the seam carries the idea alone.
    renderer.drawRect({
      x: left + 8, y: pos.y - 1.5, width: w - 16, height: 3,
      fillStyle: '#f5a850',
      globalAlpha: 0.3 + 0.4 * pulse,
      blend: this.blend,
      cornerRadius: 1.5
    });
    for (let i = 0; i < 3; i++) {
      const x = left + w * (0.25 + i * 0.25);
      renderer.drawRect({
        x: x - 2, y: pos.y - 4, width: 4, height: 8,
        fillStyle: '#f8b968',
        globalAlpha: (0.25 + 0.45 * pulse) * (i === 1 ? 1 : 0.7),
        blend: this.blend,
        cornerRadius: 2
      });
    }
    if (this.blend) {
      renderer.drawArc({
        x: pos.x, y: top + h + 6, radius: w * 0.26,
        fillStyle: {
          type: 'radial', x: pos.x, y: top + h + 6, r0: 0, r1: w * 0.26,
          stops: [
            { offset: 0, color: 'rgba(255, 190, 120, 0.22)' },
            { offset: 1, color: 'rgba(255, 190, 120, 0)' }
          ]
        },
        globalAlpha: pulse,
        blend: this.blend
      });
    }

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y + h,
        radius: 130,
        color: '#ffc277',
        intensity: 0.4 * pulse
      });
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
}

export class GlowCoin extends Coin {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);

    // Stagger the inherited bob and spin, or every coin on screen flips in
    // lockstep like a slot machine.
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

    // A prefab that declares a sprite sheet wins over the drawn disc: the
    // scene's own animation spins the coin (E8), and only the dusk glow
    // stays code's. Drawn without the Hover's angle — the frames carry the
    // turn, and the body's spin would wheel them.
    if (this.sprite?.width) {
      renderer.drawArc({
        x: pos.x, y: pos.y, radius: r * 1.7,
        fillStyle: {
          type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: r * 1.7,
          stops: [
            { offset: 0, color: 'rgba(255, 206, 110, 0.3)' },
            { offset: 1, color: 'rgba(255, 206, 110, 0)' }
          ]
        },
        blend: this.blend
      });
      this.sprite.draw(this.currentAnim, pos.x, pos.y, { width: this.size.x, height: this.size.y, frame: this.animFrame });
      if (this.lit) {
        renderer.drawLight({ x: pos.x, y: pos.y, radius: 70, color: '#ffce6e', intensity: 0.4 });
      }
      for (const constraint of this.constraints.values()) constraint.draw(deltaTime);
      return;
    }
    // The Hover constraint's spin becomes a flip: the disc foreshortens
    // through its turn instead of rotating in the plane like a wheel.
    const face = Math.abs(Math.cos(this.renderAngleOffset));
    const rw = Math.max(r * 0.16, r * face);

    renderer.drawArc({
      x: pos.x, y: pos.y, radius: r * 1.7,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: r * 1.7,
        stops: [
          { offset: 0, color: 'rgba(255, 206, 110, 0.3)' },
          { offset: 1, color: 'rgba(255, 206, 110, 0)' }
        ]
      },
      blend: this.blend
    });

    renderer.drawRect({
      x: pos.x - rw, y: pos.y - r, width: rw * 2, height: r * 2,
      fillStyle: {
        type: 'linear', x0: 0, y0: pos.y - r, x1: 0, y1: pos.y + r,
        stops: [
          { offset: 0, color: '#fff0c4' },
          { offset: 0.45, color: '#f5b33f' },
          { offset: 1, color: '#b06e1d' }
        ]
      },
      cornerRadius: Math.min(rw, r)
    });

    // Edge-on the coin is a bright sliver; face-on it carries a sun glint.
    if (face > 0.35) {
      renderer.drawArc({
        x: pos.x - rw * 0.3, y: pos.y - r * 0.35, radius: r * 0.28 * face,
        fillStyle: '#fff7dd',
        globalAlpha: 0.9
      });
    } else {
      renderer.drawRect({
        x: pos.x - rw, y: pos.y - r, width: rw * 2, height: r * 2,
        fillStyle: '#fff2cd',
        globalAlpha: 0.45,
        cornerRadius: rw
      });
    }

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y,
        radius: 70,
        color: '#ffce6e',
        intensity: 0.4
      });
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
}

export class DuskBee extends Bee {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.menace = makeRng(seedFrom(body.position))() * Math.PI * 2;
    // The stock actor's flat red tint is a readable default, not a look;
    // the burst below replaces it and the sprite flashes pale instead.
    this.flash = this.constraints.get('damageFlash');
    this.constraints.delete('damageFlash');
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#ffd2a8', radius: 30 }));
  }

  update(deltaTime) {
    super.update(deltaTime);
    // Detached from the constraint map, so it is ticked here.
    this.flash?.update(deltaTime);
  }

  /** A hornet, drawn: banded body, a hot eye, wings that blur as they beat. */
  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    this.menace += deltaTime;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const vel = this.velocity;
    const facing = vel.x < -5 ? -1 : vel.x > 5 ? 1 : (this.game.player && this.game.player.position.x < pos.x ? -1 : 1);
    const throb = 0.6 + 0.4 * Math.sin(this.menace * 5);
    const bob = Math.sin(this.menace * 6) * 1.5;
    const flash = (this.flash?.timeLeft ?? 0) > 0 ? 1 : 0;

    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 20,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: 20,
        stops: [
          { offset: 0, color: 'rgba(255, 96, 70, 0.3)' },
          { offset: 1, color: 'rgba(255, 96, 70, 0)' }
        ]
      },
      globalAlpha: throb,
      blend: this.blend
    });

    renderer.pushTransform({ x: pos.x, y: pos.y + bob, scaleX: facing });
    // Far wing, a beat behind the near one.
    const beat = Math.sin(this.menace * 40);
    renderer.drawArc({
      x: 2, y: -7 - beat * 2, radius: 6,
      fillStyle: 'rgba(215, 230, 250, 0.35)'
    });
    // Abdomen, thorax, bands, sting.
    renderer.drawArc({
      x: 3, y: 1, radius: 9,
      fillStyle: {
        type: 'linear', x0: -8, y0: 0, x1: 12, y1: 0,
        stops: [{ offset: 0, color: flash ? '#fff0e0' : '#f2b24a' }, { offset: 1, color: flash ? '#ffd0c0' : '#7a4210' }]
      }
    });
    for (const bx of [-1, 3, 7]) {
      renderer.drawRect({
        x: bx - 1.3, y: -7.5 + Math.abs(bx - 3) * 0.5, width: 2.6, height: 15 - Math.abs(bx - 3),
        fillStyle: '#2e1a08', cornerRadius: 1.3
      });
    }
    renderer.drawPath({
      points: [{ x: 11.5, y: -0.5 }, { x: 16, y: 1.5 }, { x: 11.5, y: 3 }],
      closed: true, fillStyle: '#2a180a'
    });
    // Head and the eye that gives it away.
    renderer.drawArc({ x: -8, y: 0, radius: 4.5, fillStyle: '#2a1a0c' });
    renderer.drawArc({ x: -9.5, y: -1, radius: 1.7, fillStyle: '#ff5a3c', globalAlpha: 0.7 + 0.3 * throb });
    // Near wing.
    renderer.drawArc({
      x: -1, y: -8 + beat * 2, radius: 6.5,
      fillStyle: 'rgba(230, 240, 255, 0.55)',
      strokeStyle: 'rgba(255, 255, 255, 0.5)', lineWidth: 0.8
    });
    renderer.popTransform();

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y, radius: 90, color: '#ff7a5e', intensity: 0.35 * throb
      });
    }

    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
}

/**
 * The level-complete trigger as a place: a pillar of cool light standing on
 * the summit platform. Cool against a warm sky — the one colour that could
 * only mean "this is the way out".
 */
export class ValleyGate extends Trigger {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.shimmer = 0;
  }

  draw(deltaTime) {
    if (!this.visible) return;
    this.shimmer += deltaTime;

    const renderer = this.game.renderer;
    const bounds = this.body.renderBounds;
    const width = bounds.max.x - bounds.min.x;
    const cx = (bounds.min.x + bounds.max.x) / 2;
    const base = bounds.max.y;
    const height = 220;
    const breathe = 0.8 + 0.2 * Math.sin(this.shimmer * 1.1);

    renderer.drawRect({
      x: cx - width * 0.4, y: base - height,
      width: width * 0.8, height,
      fillStyle: {
        type: 'linear', x0: 0, y0: base - height, x1: 0, y1: base,
        stops: [
          { offset: 0, color: 'rgba(150, 225, 255, 0)' },
          { offset: 0.75, color: 'rgba(150, 225, 255, 0.16)' },
          { offset: 1, color: 'rgba(190, 240, 255, 0.34)' }
        ]
      },
      globalAlpha: breathe,
      blend: this.blend
    });

    // Rising sparks, each on its own loop up the column.
    for (let i = 0; i < 7; i++) {
      const cycle = (this.shimmer * (0.12 + i * 0.023) + i * 0.37) % 1;
      const y = base - cycle * height;
      const x = cx + Math.sin(this.shimmer * 1.3 + i * 2.1) * width * 0.3 * (1 - cycle * 0.5);
      renderer.drawArc({
        x, y, radius: 1.8,
        fillStyle: '#d9f4ff',
        globalAlpha: (1 - cycle) * 0.9,
        blend: this.blend
      });
    }

    renderer.drawRect({
      x: cx - width / 2, y: base - 2.5, width, height: 2.5,
      fillStyle: '#cdeeff',
      globalAlpha: 0.5 + 0.3 * Math.sin(this.shimmer * 2.2),
      cornerRadius: 1.25
    });

    if (this.lit) {
      renderer.drawLight({
        x: cx, y: base - 40,
        radius: 220,
        color: '#9fdcff',
        intensity: 0.55 * breathe
      });
    }
  }
}
