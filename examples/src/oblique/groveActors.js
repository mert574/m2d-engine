import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { ObliquePlayer } from 'm2d-engine/actors/obliquePlayer.js';
import { Ghost } from 'm2d-engine/actors/ghost.js';
import { Coin } from 'm2d-engine/actors/coin.js';
import { Trigger } from 'm2d-engine/actors/trigger.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';
import { makeRng, range } from '../shared/rng.js';
import { drawGroundShadow } from 'm2d-engine/core/renderers/shadows.js';
import { Footsteps } from 'm2d-engine/constraints/footsteps.js';
import { groveAbilities, tickWard, drawWardUnder, drawFlashes, tickFlashes } from './skills.js';

/**
 * Hollow Grove's cast.
 *
 * The grove is seen from three-quarters above: the ground is a plane, a
 * thing's collider is its feet, and everything stands up out of its own
 * footprint. The trees, logs and stumps are free paintings (Wenrexa's
 * nature sprites, CC0) and the ground is a photographed texture
 * (ambientCG, CC0); what this file draws in code is the living things —
 * the walker, the two who live here, the wisps — and the ground's detail:
 * the path, the grass and the flowers that move in the wind.
 *
 * Light comes from the upper left, as the dusk does, so every shadow falls
 * down and to the right.
 */

/** A seed that is stable for an entity across reloads: where it stands. */
function seedFrom(position) {
  return (Math.round(position.x) * 92821 + Math.round(position.y) * 31337) % 2147483647;
}

/** The soft ellipse everything stands in. `spread` widens it, `fade` thins it. */
export function groundShadow(renderer, x, y, width, spread = 1, fade = 1) {
  drawGroundShadow(renderer, x, y, width, { spread, fade, ratio: 0.36, color: '8, 14, 10' });
}

const AMBER = '#ffb45e';
const WISP = '#bfeaff';

/**
 * A tree: a painted sprite standing on a trunk-sized footprint, swaying a
 * little, going translucent while the walker is behind it.
 */
export class Tree extends Platform {
  static properties = {
    seed: s.number({ description: 'Fixes the sway; the position decides when unset' })
  };

  /** Presentation: read from the renderer when drawing, never in simulation (a headless game has none). */
  get lit() { return this.game.renderer.supports('lights'); }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    const rng = makeRng(options.seed ?? seedFrom(body.position));
    this.phase = range(rng, 0, Math.PI * 2);
    this.rate = range(rng, 0.5, 0.8);
    this.time = 0;
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    this.time += deltaTime;
    const renderer = this.game.renderer;
    const feet = this.body.renderPosition;
    const top = this.renderPosition;
    const w = this.size.x;
    const h = this.size.y;
    const base = feet.y + this.body.size.y / 2;
    const sway = Math.sin(this.time * this.rate + this.phase) * 0.012;

    groundShadow(renderer, feet.x + 12, base - 4, w * 0.75, 1, 0.8);

    // Is the walker behind this tree? Behind means drawn earlier (a
    // smaller depth) and within the canopy's spread.
    const player = this.game.player;
    let alpha = 1;
    if (player && !player.dead && player.depth < this.depth) {
      const p = player.renderPosition;
      if (Math.abs(p.x - top.x) < w * 0.5 && Math.abs(p.y - (top.y - h * 0.1)) < h * 0.55) alpha = 0.55;
    }

    // The sprite pivots at its feet, so the sway reads as the top moving.
    renderer.pushTransform({ x: feet.x, y: base, rotation: sway });
    this.sprite.draw('default', 0, -h / 2, { width: w, height: h, globalAlpha: alpha });
    renderer.popTransform();

    if (this.lit) {
      renderer.drawShadowCaster({ x: feet.x, y: base - 16, width: this.body.size.x, height: 32 });
    }
    for (const constraint of this.constraints.values()) constraint.draw(deltaTime);
  }
}

/** A log or a stump: a painted sprite on a low footprint, with a shadow. */
export class Decor extends Platform {
  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const feet = this.body.renderPosition;
    const pos = this.renderPosition;
    groundShadow(renderer, feet.x + 8, feet.y + this.body.size.y / 2 - 6, this.size.x * 0.8, 1, 0.6);
    this.sprite.draw('default', pos.x, pos.y, { width: this.size.x, height: this.size.y });
    for (const constraint of this.constraints.values()) constraint.draw(deltaTime);
  }
}

/** An invisible wall. */
export class Bound extends Platform {
  draw() {}
}

/** A still pond: dark water, a rim of reeds, the dusk on its surface. */
export class Pond extends Platform {
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.depth = -Infinity;
    this.zIndex = -1;
    const rng = makeRng(seedFrom(body.position));
    const r = this.size.x / 2;
    this.reeds = Array.from({ length: 46 }, () => {
      const a = range(rng, 0, Math.PI * 2);
      return { a, d: range(rng, 0.9, 1.08), h: range(rng, 14, 30), lean: range(rng, -0.3, 0.3), phase: range(rng, 0, 6) };
    });
    this.lilies = Array.from({ length: 7 }, () => ({ x: range(rng, -0.6, 0.6) * r, y: range(rng, -0.4, 0.4) * r * 0.6, r: range(rng, 7, 12) }));
    this.time = 0;
  }

  draw() {
    this.time += this.game.time.unscaledDelta ?? 1 / 60;
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const r = this.size.x / 2;
    const ry = r * 0.62;
    renderer.pushTransform({ x: pos.x, y: pos.y, scaleX: 1, scaleY: ry / r });
    // Bank, then water.
    renderer.drawArc({ x: 0, y: 0, radius: r * 1.1, fillStyle: 'rgba(60, 54, 34, 0.55)' });
    renderer.drawArc({
      x: 0, y: 0, radius: r,
      fillStyle: {
        type: 'radial', x: -r * 0.3, y: -r * 0.4, r0: 0, r1: r * 1.2,
        stops: [{ offset: 0, color: '#3a5a6a' }, { offset: 0.6, color: '#1c3240' }, { offset: 1, color: '#0e1c26' }]
      }
    });
    // Ripples: three faint rings breathing out of phase.
    for (let i = 0; i < 3; i++) {
      const t = ((this.time * 0.25 + i / 3) % 1);
      renderer.drawArc({ x: r * 0.15, y: r * 0.1, radius: r * (0.15 + t * 0.7), strokeStyle: `rgba(170, 210, 230, ${0.18 * (1 - t)})`, lineWidth: 1.5 });
    }
    for (const lily of this.lilies) {
      renderer.drawArc({ x: lily.x, y: lily.y, radius: lily.r, fillStyle: '#3f7a3a' });
      renderer.drawArc({ x: lily.x + lily.r * 0.3, y: lily.y - lily.r * 0.2, radius: lily.r * 0.35, fillStyle: '#f2d9e8' });
    }
    renderer.popTransform();
    // Reeds stand up from the rim and lean with the wind.
    for (const reed of this.reeds) {
      const x = pos.x + Math.cos(reed.a) * r * reed.d;
      const y = pos.y + Math.sin(reed.a) * ry * reed.d;
      const wind = Math.sin(this.time * 1.4 + reed.phase) * 0.18;
      const lean = reed.lean + wind;
      renderer.drawLine({ x1: x, y1: y, x2: x + Math.sin(lean) * reed.h, y2: y - Math.cos(lean) * reed.h, strokeStyle: '#2f4a22', lineWidth: 2 });
      renderer.drawArc({ x: x + Math.sin(lean) * reed.h, y: y - Math.cos(lean) * reed.h, radius: 2.5, fillStyle: '#5a3b1e' });
    }
  }
}

/**
 * The walker. The sprite is Flare's hero with a staff; what this class adds
 * is the ground shadow that shrinks as they hop, the hand lantern's glow
 * and light, footsteps, and the three abilities with their effects.
 */
export class Wanderer extends ObliquePlayer {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    /** Effects the abilities leave behind, and the ward's remaining time. */
    this.effects = { flashes: [], wardLeft: 0 };
    this.addConstraint('swing', new AttackSwing(this, { color: '#ffe3b0', reach: 60 }));
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#ffb47a', radius: 30 }));
    this.addConstraint('abilities', groveAbilities(this, this.effects));
    this.addConstraint('footsteps', new Footsteps(this, { sounds: ['step1', 'step2', 'step3', 'step4'], stride: 34 }));
    this.onJump = () => this.game.soundManager.playSound('jump');
    /** Talking freezes the walker in place. */
    this.frozen = false;
  }

  fixedUpdate(dt) {
    if (this.frozen) {
      this.body.setVelocity({ x: 0, y: 0 });
      // Cooldowns and the ward keep running; movement and attacks do not.
      Entity.prototype.fixedUpdate.call(this, dt);
      this.getConstraint('abilities').fixedUpdate(dt);
      this.getConstraint('health').fixedUpdate(dt);
      tickWard(this, this.effects, dt);
      return;
    }
    super.fixedUpdate(dt);
    tickWard(this, this.effects, dt);
  }

  update(deltaTime) {
    super.update(deltaTime);
    tickFlashes(this.effects, deltaTime);
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const feet = this.body.renderPosition;
    const lift = this.renderElevation;
    const height01 = Math.min(1, lift / 90);

    groundShadow(renderer, feet.x, feet.y + this.body.size.y / 2 - 3, 48, 1 - height01 * 0.35, 1 - height01 * 0.45);
    drawWardUnder(this, this.effects);

    // The figure, then the lantern's glow where the staff's head is.
    super.draw(deltaTime);
    const pos = this.renderPosition;
    const lx = pos.x + Math.cos(this.heading) * 14;
    const ly = pos.y - 8;
    renderer.drawArc({
      x: lx, y: ly, radius: 60,
      fillStyle: { type: 'radial', x: lx, y: ly, r0: 0, r1: 60, stops: [{ offset: 0, color: 'rgba(255, 190, 110, 0.3)' }, { offset: 1, color: 'rgba(255, 190, 110, 0)' }] },
      blend: this.blend
    });
    if (this.lit) {
      renderer.drawLight({ x: lx, y: ly, radius: 320, color: AMBER, intensity: 0.9, shadows: true, z: 24 });
    }
    drawFlashes(this, this.effects);
  }
}

/** A wisp: a cold light that drifts and hunts. */
export class Wisp extends Ghost {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    const rng = makeRng(seedFrom(body.position));
    this.phase = range(rng, 0, Math.PI * 2);
    this.time = 0;
    this.trail = [];
    const chase = this.constraints.get('chase');
    chase.speed = 110;
    chase.idleSpeed = 40;
    chase.detectionRange = 420;
    chase.wanderRadius = 160;
    this.elevation = 28;
    /** Seconds left of the walker's ward pushing this one away. */
    this.repelled = 0;
  }

  fixedUpdate(dt) {
    if (this.dead) return;
    if (this.repelled > 0) {
      this.repelled -= dt;
      const player = this.game.player;
      if (player) {
        const dx = this.position.x - player.position.x;
        const dy = this.position.y - player.position.y;
        const d = Math.hypot(dx, dy) || 1;
        this.body.setVelocity({ x: (dx / d) * 260, y: (dy / d) * 260 });
      }
      Entity.prototype.fixedUpdate.call(this, dt);
      // Health and flash still tick; the chase does not.
      for (const [name, c] of this.constraints) if (name !== 'chase') c.fixedUpdate(dt);
      return;
    }
    super.fixedUpdate(dt);
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.time += deltaTime;
    this.renderOffset.y = Math.sin(this.time * 2.2 + this.phase) * 5;
    const pos = this.renderPosition;
    this.trail.unshift({ x: pos.x, y: pos.y });
    if (this.trail.length > 9) this.trail.pop();
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const feet = this.body.renderPosition;
    const pos = this.renderPosition;
    const r = this.size.x * 0.32;
    const hurt = (this.constraints.get('damageFlash')?.timeLeft ?? 0) > 0;

    groundShadow(renderer, feet.x, feet.y + this.body.size.y / 2, this.size.x * 0.9, 0.8, 0.45);
    this.trail.forEach((p, i) => {
      const t = 1 - i / this.trail.length;
      renderer.drawArc({ x: p.x, y: p.y, radius: r * (0.3 + t * 0.5), fillStyle: WISP, globalAlpha: 0.08 * t, blend: this.blend });
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: r * 2.6,
      fillStyle: { type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: r * 2.6, stops: [{ offset: 0, color: 'rgba(191, 234, 255, 0.35)' }, { offset: 1, color: 'rgba(191, 234, 255, 0)' }] },
      blend: this.blend
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: r,
      fillStyle: {
        type: 'radial', x: pos.x - r * 0.3, y: pos.y - r * 0.3, r0: 0, r1: r,
        stops: [{ offset: 0, color: '#ffffff' }, { offset: 0.5, color: hurt ? '#ffd3d3' : WISP }, { offset: 1, color: hurt ? 'rgba(255, 120, 120, 0.6)' : 'rgba(120, 190, 230, 0.6)' }]
      }
    });
    if (this.lit) renderer.drawLight({ x: pos.x, y: pos.y, radius: 150, color: WISP, intensity: 0.7, z: 30 });
    for (const constraint of this.constraints.values()) constraint.draw(deltaTime);
  }
}

/** A lantern on a post: the pickup. It lights the ground until it is taken. */
export class Lantern extends Coin {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    const rng = makeRng(seedFrom(body.position));
    const hover = this.constraints.get('hover');
    hover.amplitude = 0;
    hover.spin = 0;
    this.flicker = range(rng, 0, Math.PI * 2);
    this.time = 0;
  }

  onCollisionStart(other) {
    const wasAlive = !this.dead && this.game.entities.has(this);
    super.onCollisionStart(other);
    if (wasAlive && !this.game.entities.has(this)) this.onTaken?.(this);
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    this.time += deltaTime;
    const renderer = this.game.renderer;
    const feet = this.body.renderPosition;
    const pos = this.renderPosition;
    const h = this.size.y;
    const base = feet.y + this.body.size.y / 2;
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 9 + this.flicker) * Math.sin(this.time * 3.1);

    groundShadow(renderer, feet.x + 6, base - 2, 30, 1, 0.6);
    renderer.drawLine({ x1: feet.x, y1: base, x2: feet.x, y2: pos.y - h * 0.2, strokeStyle: '#2a1a12', lineWidth: 4 });
    renderer.drawLine({ x1: feet.x, y1: pos.y - h * 0.2, x2: feet.x + 10, y2: pos.y - h * 0.3, strokeStyle: '#2a1a12', lineWidth: 3 });
    const lx = feet.x + 10;
    const ly = pos.y - h * 0.3 + 12;
    renderer.drawRect({ x: lx - 6, y: ly - 10, width: 12, height: 18, fillStyle: '#1d120c', cornerRadius: 3 });
    renderer.drawRect({ x: lx - 4, y: ly - 7, width: 8, height: 12, fillStyle: `rgba(255, 220, 150, ${0.8 * flicker})`, cornerRadius: 2 });
    renderer.drawArc({
      x: lx, y: ly, radius: 54,
      fillStyle: { type: 'radial', x: lx, y: ly, r0: 0, r1: 54, stops: [{ offset: 0, color: `rgba(255, 180, 94, ${0.4 * flicker})` }, { offset: 1, color: 'rgba(255, 180, 94, 0)' }] },
      blend: this.blend
    });
    if (this.lit) renderer.drawLight({ x: lx, y: ly, radius: 260 * flicker, color: AMBER, intensity: 0.8, shadows: true, z: 40 });
    for (const constraint of this.constraints.values()) constraint.draw(deltaTime);
  }
}

/**
 * The clearing: a ring of standing stones around a patch of pale light,
 * sealed by a ward until the quest opens it.
 */
export class Clearing extends Trigger {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    const rng = makeRng(seedFrom(body.position));
    this.stones = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + range(rng, -0.2, 0.2);
      return { a, r: range(rng, 8, 14), h: range(rng, 22, 40), out: range(rng, 0.9, 1.05) };
    });
    this.sealed = true;
    this.time = 0;
  }

  draw(deltaTime) {
    if (!this.visible) return;
    this.time += deltaTime;
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const rx = this.size.x * 0.5;
    const ry = this.size.y * 0.5;
    const breathe = 0.85 + 0.15 * Math.sin(this.time * 1.2);
    const colour = this.sealed ? '190, 150, 255' : '220, 240, 200';

    renderer.pushTransform({ x: pos.x, y: pos.y, scaleX: 1, scaleY: ry / rx });
    renderer.drawArc({
      x: 0, y: 0, radius: rx * breathe,
      fillStyle: { type: 'radial', x: 0, y: 0, r0: 0, r1: rx * breathe, stops: [{ offset: 0, color: `rgba(${colour}, 0.26)` }, { offset: 1, color: `rgba(${colour}, 0)` }] },
      blend: this.blend
    });
    if (this.sealed) {
      // The ward: runes turning on the ground.
      for (let i = 0; i < 12; i++) {
        const a = this.time * 0.4 + (i / 12) * Math.PI * 2;
        const b = a + 0.25;
        renderer.drawPath({
          points: [{ x: Math.cos(a) * rx * 0.85, y: Math.sin(a) * rx * 0.85 }, { x: Math.cos(b) * rx * 0.85, y: Math.sin(b) * rx * 0.85 }],
          strokeStyle: `rgba(${colour}, 0.7)`, lineWidth: 3
        });
      }
    }
    renderer.popTransform();
    // Standing stones, tallest at the back so they sort visually.
    for (const stone of this.stones) {
      const x = pos.x + Math.cos(stone.a) * rx * stone.out;
      const y = pos.y + Math.sin(stone.a) * ry * stone.out;
      groundShadow(renderer, x + 6, y, stone.r * 3, 1, 0.5);
      renderer.drawPath({
        points: [{ x: x - stone.r, y }, { x: x - stone.r * 0.7, y: y - stone.h }, { x: x + stone.r * 0.6, y: y - stone.h * 1.05 }, { x: x + stone.r, y }],
        closed: true,
        fillStyle: { type: 'linear', x0: x - stone.r, y0: 0, x1: x + stone.r, y1: 0, stops: [{ offset: 0, color: '#8d9088' }, { offset: 1, color: '#3f433e' }] }
      });
      if (this.sealed) renderer.drawArc({ x, y: y - stone.h * 0.6, radius: 3, fillStyle: `rgba(${colour}, ${0.6 + 0.4 * Math.sin(this.time * 3 + stone.a)})` });
    }
    if (this.lit) renderer.drawLight({ x: pos.x, y: pos.y, radius: 240, color: this.sealed ? '#b996ff' : '#dff5d0', intensity: 0.55 * breathe, z: 10 });
  }
}

/**
 * The ground's detail: the path in a photographed dirt texture, grass that
 * moves in the wind, flowers, and the pond's surround. It is an entity at
 * the floor's zIndex rather than a scene hook because the background hook
 * runs under the tile layers, and a path painted under the grass is a path
 * nobody sees. Its body is a sensor nothing collides with.
 */
export class GroundDetail extends Entity {
  name = 'GroundDetail';

  static properties = {
    path: s.array(s.object({ x: s.number({ required: true }), y: s.number({ required: true }) }),
      { label: 'Path', description: 'The worn track, smoothed into segments' }),
    pathWidth: s.number({ initial: 64, positive: true, unit: 'px', label: 'Path width' }),
    seed: s.number({ initial: 11, description: 'Fixes the scatter of grass and flowers' })
  };

  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }
  get tint() { return this.game.renderer.supports('tint') ? '#c9b48e' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.zIndex = -1;
    this.depth = -Infinity;
    const rng = makeRng(options.seed ?? 11);
    const w = game.options.worldWidth;
    const h = game.options.worldHeight;
    this.time = 0;

    // The path, resampled into short segments so the texture follows the
    // curve rather than cutting corners.
    this.pathWidth = options.pathWidth ?? 64;
    this.segments = [];
    const points = this.#smooth(options.path ?? []);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      this.segments.push({
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        length: Math.hypot(b.x - a.x, b.y - a.y) + this.pathWidth * 0.6,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        u: i % 2 // alternate the texture's half so a seam never repeats
      });
    }
    const nearPath = (x, y, d) => this.segments.some(s => Math.hypot(s.x - x, s.y - y) < d);

    // Grass tufts: clumps of blades, denser away from the path.
    this.tufts = [];
    for (let i = 0; i < 3200; i++) {
      const x = range(rng, 80, w - 80), y = range(rng, 100, h - 80);
      if (nearPath(x, y, this.pathWidth * 0.9)) continue;
      this.tufts.push({
        x, y, blades: 3 + Math.floor(rng() * 3), h: range(rng, 10, 20), phase: range(rng, 0, 6.28),
        tone: rng() < 0.5 ? '#6f9f45' : rng() < 0.5 ? '#5a8a3a' : '#8ab850'
      });
    }
    this.flowers = [];
    for (let i = 0; i < 260; i++) {
      const x = range(rng, 90, w - 90), y = range(rng, 110, h - 90);
      if (nearPath(x, y, this.pathWidth * 0.7)) continue;
      this.flowers.push({ x, y, r: range(rng, 2.5, 4.5), phase: range(rng, 0, 6.28), color: rng() < 0.4 ? '#e9d8ff' : rng() < 0.5 ? '#fff1b8' : '#ffd0d8' });
    }
    this.patches = Array.from({ length: 50 }, () => ({ x: range(rng, 90, w - 90), y: range(rng, 110, h - 90), r: range(rng, 80, 180), dark: rng() < 0.5 }));
    this.ground = null; // set by the scene: the dirt sheet
  }

  /** Chaikin smoothing, two passes: hand-placed corners become bends. */
  #smooth(points) {
    let out = points;
    for (let pass = 0; pass < 2; pass++) {
      const next = [out[0]];
      for (let i = 0; i < out.length - 1; i++) {
        const a = out[i], b = out[i + 1];
        next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      next.push(out[out.length - 1]);
      out = next;
    }
    return out;
  }

  draw() {
    this.time += this.game.time.unscaledDelta ?? 1 / 60;
    const renderer = this.game.renderer;
    const area = this.game.camera.getVisibleArea();
    const inView = (x, y, r) => x + r > area.left && x - r < area.right && y + r > area.top && y - r < area.bottom;
    const wind = this.time * 1.3;

    for (const patch of this.patches) {
      if (!inView(patch.x, patch.y, patch.r)) continue;
      renderer.drawArc({
        x: patch.x, y: patch.y, radius: patch.r,
        fillStyle: { type: 'radial', x: patch.x, y: patch.y, r0: 0, r1: patch.r, stops: [{ offset: 0, color: patch.dark ? 'rgba(10, 30, 14, 0.3)' : 'rgba(150, 180, 80, 0.16)' }, { offset: 1, color: 'rgba(0, 0, 0, 0)' }] }
      });
    }

    // The path: a soft dark edge, then the dirt texture laid along it.
    const pw = this.pathWidth;
    for (const s of this.segments) {
      if (!inView(s.x, s.y, s.length)) continue;
      renderer.pushTransform({ x: s.x, y: s.y, rotation: s.angle });
      renderer.drawRect({ x: -s.length / 2, y: -pw * 0.62, width: s.length, height: pw * 1.24, fillStyle: 'rgba(40, 32, 18, 0.28)', cornerRadius: pw * 0.5 });
      renderer.popTransform();
    }
    for (const s of this.segments) {
      if (!inView(s.x, s.y, s.length)) continue;
      if (this.ground) {
        renderer.drawSprite({
          image: this.ground, x: s.x, y: s.y, rotation: s.angle,
          tileX: s.u, tileY: 0, tileWidth: 256, tileHeight: 512,
          width: s.length, height: pw, globalAlpha: 0.9, tint: this.tint
        });
      } else {
        renderer.pushTransform({ x: s.x, y: s.y, rotation: s.angle });
        renderer.drawRect({ x: -s.length / 2, y: -pw / 2, width: s.length, height: pw, fillStyle: '#6b5a3a' });
        renderer.popTransform();
      }
    }

    for (const s of this.segments) {
      if (!inView(s.x, s.y, s.length)) continue;
      renderer.pushTransform({ x: s.x, y: s.y, rotation: s.angle });
      renderer.drawRect({ x: -s.length / 2, y: -pw / 2, width: s.length, height: pw * 0.16, fillStyle: 'rgba(70, 110, 50, 0.35)' });
      renderer.drawRect({ x: -s.length / 2, y: pw / 2 - pw * 0.16, width: s.length, height: pw * 0.16, fillStyle: 'rgba(40, 70, 30, 0.4)' });
      renderer.popTransform();
    }

    // Grass: each tuft a few blades leaning with the wind, the lean a
    // travelling wave so gusts cross the field.
    for (const tuft of this.tufts) {
      if (!inView(tuft.x, tuft.y, 24)) continue;
      const lean = Math.sin(wind + tuft.x * 0.006 + tuft.y * 0.004 + tuft.phase) * 0.35 + 0.1;
      for (let b = 0; b < tuft.blades; b++) {
        const bx = tuft.x + (b - (tuft.blades - 1) / 2) * 3.2;
        const bh = tuft.h * (0.75 + 0.25 * Math.sin(tuft.phase + b * 1.7));
        const tip = lean + (b - (tuft.blades - 1) / 2) * 0.18;
        renderer.drawPath({
          points: [{ x: bx - 1.6, y: tuft.y }, { x: bx + Math.sin(tip) * bh, y: tuft.y - Math.cos(tip) * bh }, { x: bx + 1.6, y: tuft.y }],
          closed: true, fillStyle: tuft.tone
        });
      }
    }
    for (const flower of this.flowers) {
      if (!inView(flower.x, flower.y, 8)) continue;
      const sway = Math.sin(wind + flower.phase) * 1.5;
      renderer.drawLine({ x1: flower.x, y1: flower.y, x2: flower.x + sway, y2: flower.y - 7, strokeStyle: '#3f6a2a', lineWidth: 1.2 });
      renderer.drawArc({ x: flower.x + sway, y: flower.y - 8, radius: flower.r, fillStyle: flower.color, globalAlpha: 0.9 });
    }
  }
}
