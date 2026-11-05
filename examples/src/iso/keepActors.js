import { Platform } from 'm2d-engine/actors/platform.js';
import { ObliquePlayer } from 'm2d-engine/actors/obliquePlayer.js';
import { Ghost } from 'm2d-engine/actors/ghost.js';
import { Coin } from 'm2d-engine/actors/coin.js';
import { Trigger } from 'm2d-engine/actors/trigger.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { Footsteps } from 'm2d-engine/constraints/footsteps.js';
import { PointerMove } from 'm2d-engine/constraints/pointerMove.js';
import { Angle } from 'm2d-engine/core/math.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';
import { makeRng, range } from '../shared/rng.js';
import { drawGroundShadow } from 'm2d-engine/core/renderers/shadows.js';
import { knightAbilities, tickAbilities, tickFlashes, drawUnder, drawOver } from './abilities.js';
import { ProximityPrompt } from 'm2d-engine/constraints/proximityPrompt.js';
import { creditEmber, newStock } from './keepIntents.js';

/**
 * Cinder Keep's cast.
 *
 * Everything here stands on the ground plane and is drawn through the
 * scene's isometric projection: an actor's `position` is a flat ground
 * coordinate, its `renderAnchor` is where those feet land on screen, and
 * the sprites are isometric art (Stone Soup blocks, Flare figures) that
 * needs no rotation. Ground shadows are ellipses at the anchor, as in the
 * grove; the walls throw real shadows from the torches on WebGL, cast by
 * their projected footprint.
 */

const TILE = 64;
const EMBER = '#ff9a4a';

function groundShadow(renderer, x, y, width, spread = 1, fade = 1) {
  drawGroundShadow(renderer, x, y, width, { spread, fade, ratio: 0.5, color: '0, 0, 0' });
}

/** The projected diamond of a ground tile centred on `x, y`, for shadow casting. */
function diamond(projection, x, y, size) {
  const h = size / 2;
  return [projection.toScreen(x - h, y - h), projection.toScreen(x + h, y - h), projection.toScreen(x + h, y + h), projection.toScreen(x - h, y + h)];
}

/**
 * A wall block: one 64x64 frame of a block sheet, drawn at twice its size
 * so its bottom corner meets the bottom corner of the floor diamond.
 */
export class Wall extends Platform {
  /** Asked when drawing: a headless game has no renderer to ask at construction. */
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.spriteFit = true;
    this.spriteSize = { x: TILE * 2, y: TILE * 2 };
    // The block's base sits on the tile; the frame is a block of height
    // one tile above it, so the frame's centre is half a diamond up.
    this.renderOffset.y = -TILE / 2;
    this.frame = options.frame ?? 0;
    // Headless there is no sheet to pick a block from.
    this.sprite?.define(`block${this.frame}`, this.frame, 0);
    this.setAnimation(`block${this.frame}`);
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    // Fade the block when the knight stands behind it, so they can be seen
    // in a corridor that runs up the screen.
    const player = this.game.player;
    let alpha = 1;
    if (player && !player.dead) {
      const p = player.renderAnchor;
      const a = this.renderAnchor;
      if (player.depth < this.depth && Math.abs(p.x - a.x) < TILE * 1.1 && a.y - p.y < TILE * 1.6 && a.y - p.y > -TILE * 0.2) alpha = 0.45;
    }
    const pos = this.renderPosition;
    this.sprite.draw(this.currentAnim, pos.x, pos.y, { width: this.spriteSize.x, height: this.spriteSize.y, globalAlpha: alpha });
    if (this.lit) {
      const g = this.position;
      this.game.renderer.drawShadowCaster({ points: diamond(this.game.projection, g.x, g.y, TILE * 0.9) });
    }
  }
}

/** A wall torch: an animated flame on a block's lit face, and a light. */
export class Torch extends Entity {
  /** Asked when drawing: a headless game has no renderer to ask at construction. */
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  name = 'Torch';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.spriteFit = true;
    this.spriteSize = { x: 64, y: 96 };
    // On the south face the flame hangs down-left of the block's centre; on
    // the east face down-right. Either way above the floor, on the wall.
    const side = options.face === 'south' ? -1 : 1;
    this.renderOffset.x = side * TILE * 0.5;
    this.renderOffset.y = -TILE * 0.55;
    this.depth = Infinity;
    this.zIndex = 1;
    const rng = makeRng(Math.round(body.position.x * 7 + body.position.y * 13));
    this.animTime = range(rng, 0, 2);
    this.flicker = range(rng, 0, Math.PI * 2);
    this.time = 0;
    this.setAnimation('burn');
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.time += deltaTime;
  }

  draw(deltaTime) {
    super.draw(deltaTime);
    const pos = this.renderPosition;
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 9 + this.flicker) * Math.sin(this.time * 3.1);
    const fx = pos.x;
    const fy = pos.y - 20;
    this.game.renderer.drawArc({
      x: fx, y: fy, radius: 70,
      fillStyle: { type: 'radial', x: fx, y: fy, r0: 0, r1: 70, stops: [{ offset: 0, color: `rgba(255, 170, 90, ${0.35 * flicker})` }, { offset: 1, color: 'rgba(255, 170, 90, 0)' }] },
      blend: this.blend
    });
    if (this.lit) this.game.renderer.drawLight({ x: fx, y: fy, radius: 380 * flicker, color: EMBER, intensity: 1.0, shadows: true, z: 60 });
  }
}

/** An ember: a hot coal to gather. */
export class Ember extends Coin {
  /** Asked when drawing: a headless game has no renderer to ask at construction. */
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    const hover = this.constraints.get('hover');
    hover.amplitude = 4;
    hover.frequency = 1.8;
    hover.spin = 0;
    this.elevation = 18;
    this.time = 0;
  }

  onCollisionStart(other) {
    const collector = other.entity;
    // Any knight gathers it, not only `game.player`: on a server every
    // player has one, and the ember goes to whoever touched it.
    if (!collector || collector.name !== 'Player' || !this.game.entities.has(this)) return;
    this.game.entities.delete(this);
    this.game.physics.remove(this.body);
    creditEmber(collector);
    this.onTaken?.(this, collector);
  }

  draw() {
    if (this.dead || !this.visible) return;
    this.time += this.game.time.unscaledDelta ?? 1 / 60;
    const renderer = this.game.renderer;
    const anchor = this.renderAnchor;
    const pos = this.renderPosition;
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 4);
    groundShadow(renderer, anchor.x, anchor.y, 22, 1, 0.5);
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 34 * pulse,
      fillStyle: { type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: 34 * pulse, stops: [{ offset: 0, color: 'rgba(255, 150, 70, 0.45)' }, { offset: 1, color: 'rgba(255, 150, 70, 0)' }] },
      blend: this.blend
    });
    renderer.drawArc({ x: pos.x, y: pos.y, radius: 7, fillStyle: { type: 'radial', x: pos.x - 2, y: pos.y - 2, r0: 0, r1: 7, stops: [{ offset: 0, color: '#fff1c8' }, { offset: 0.5, color: EMBER }, { offset: 1, color: '#9a3a1a' }] } });
    if (this.lit) renderer.drawLight({ x: pos.x, y: pos.y, radius: 140 * pulse, color: EMBER, intensity: 0.6, z: 20 });
  }
}

/** The stair down: a glowing descent, sealed until every ember is gathered. */
export class Stair extends Trigger {
  static replicated = ['sealed'];
  /** Asked when drawing: a headless game has no renderer to ask at construction. */
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.sealed = true;
    this.time = 0;
  }

  draw(deltaTime) {
    if (!this.visible) return;
    this.time += deltaTime;
    const renderer = this.game.renderer;
    const g = this.position;
    const points = diamond(this.game.projection, g.x, g.y, this.size.x);
    const colour = this.sealed ? '150, 110, 255' : '255, 200, 120';
    const breathe = 0.8 + 0.2 * Math.sin(this.time * 1.5);
    renderer.drawPath({ points, closed: true, fillStyle: `rgba(${colour}, ${0.18 * breathe})`, strokeStyle: `rgba(${colour}, 0.8)`, lineWidth: 2, blend: this.blend });
    // Steps: three shrinking diamonds going down.
    for (let s = 1; s <= 3; s++) {
      const inner = diamond(this.game.projection, g.x, g.y, this.size.x * (1 - s * 0.25));
      renderer.drawPath({ points: inner.map(p => ({ x: p.x, y: p.y + s * 6 })), closed: true, fillStyle: `rgba(10, 8, 14, ${0.35 + s * 0.15})`, strokeStyle: `rgba(${colour}, ${0.5 - s * 0.1})`, lineWidth: 1 });
    }
    const a = this.renderAnchor;
    if (this.lit) renderer.drawLight({ x: a.x, y: a.y, radius: 220, color: this.sealed ? '#9a70ff' : '#ffc878', intensity: 0.5 * breathe, z: 10 });
  }
}

/**
 * The keep's dead. A `Ghost` (chase, contact damage, health) drawn from a
 * Flare creature sheet with its facing following its movement.
 */
export class Creature extends Ghost {
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.spriteFit = true;
    this.spriteSize = { x: 190, y: 190 };
    this.renderOffset.y = -54;
    this.heading = Math.PI / 2;
    const chase = this.constraints.get('chase');
    chase.speed = 85;
    chase.idleSpeed = 30;
    chase.detectionRange = 360;
    chase.wanderRadius = 90;
    this.contact = this.constraints.get('contactDamage');
    this.contact.damage = 18;
    this.contact.knockbackStrength = 260;
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#ffd0a0', radius: 36 }));
  }

  update(deltaTime) {
    super.update(deltaTime);
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.y);
    // Hysteresis on the gait and a deadband on the facing, or the sprite
    // flickers between states at the threshold.
    if (speed > 30) this.moving = true;
    else if (speed < 10) this.moving = false;
    if (speed > 25) {
      const angle = Math.atan2(v.y, v.x);
      let turn = angle - this.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      if (Math.abs(turn) > 0.45) this.heading = angle;
    }
    this.setDirectionalAnimation(this.moving ? 'run' : 'idle', this.heading);
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const a = this.renderAnchor;
    groundShadow(this.game.renderer, a.x, a.y, 44, 1, 0.8);
    super.draw(deltaTime);
  }
}

/**
 * The knight: the oblique player on a round ground body, moved by the
 * arrows along the screen's axes or by a click on the floor, swinging at
 * whatever direction they last faced.
 */
export class Knight extends ObliquePlayer {
  /** Its ability effects and pose hold, for a client to draw. */
  static replicated = ['effects', 'swingHold'];
  /** Clicking to walk is movement too, so a client runs it early as well. */
  static predictedConstraints = ['walk'];
  /** Asked when drawing: a headless game has no renderer to ask at construction. */
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, { ...options, attackRange: 70, attackArc: Math.PI * 1.4, jumpSpeed: 0 });
    this.getConstraint('control').inputSpace = 'screen';
    this.addConstraint('walk', new PointerMove(this, {
      speed: 230, arrive: 10,
      onMove: (dx, dy) => { this.heading = Math.atan2(dy, dx); }
    }));
    this.addConstraint('swing', new AttackSwing(this, { color: '#ffe3b0', reach: 70 }));
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#ffb47a', radius: 34 }));
    this.addConstraint('footsteps', new Footsteps(this, { sounds: ['step1', 'step2', 'step3', 'step4'], stride: 36 }));
    /** Effects the abilities leave behind, and their remaining times. */
    this.effects = { flashes: [], dashLeft: 0, shieldLeft: 0 };
    this.addConstraint('abilities', knightAbilities(this, this.effects));
    /** Seconds an ability's animation is held before movement takes over. */
    this.swingHold = 0;
    // A sealed stair means there is nowhere to jump to; keep the hop off.
    this.jump = () => {};
  }

  fixedUpdate(dt) {
    // A key press takes over from a click: stop walking to the old spot.
    const input = this.input;
    const keys = this.getConstraint('control').keys;
    if (input.isDown(keys.left) || input.isDown(keys.right) || input.isDown(keys.up) || input.isDown(keys.down)) {
      this.getConstraint('walk').stop();
    }
    super.fixedUpdate(dt);
    tickAbilities(this, this.effects, dt);
    // Flashes are pushed by the simulation, so they age with it: on a
    // server, where nothing draws, they would otherwise pile up forever.
    tickFlashes(this.effects, dt);
    this.swingHold = Math.max(0, this.swingHold - dt);
  }

  update(deltaTime) {
    if (this.swingHold > 0) {
      // Hold the ability's pose: tick constraints and the cycle, not the facing.
      Entity.prototype.update.call(this, deltaTime);
    } else {
      super.update(deltaTime);
    }
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const a = this.renderAnchor;
    groundShadow(renderer, a.x, a.y, 50, 1, 0.9);
    drawUnder(this, this.effects);
    const walk = this.getConstraint('walk');
    if (walk.destination) {
      // The marker where the click landed, on the floor.
      const d = this.game.projection.toScreen(walk.destination.x, walk.destination.y);
      renderer.pushTransform({ x: d.x, y: d.y, scaleX: 1, scaleY: 0.5 });
      renderer.drawArc({ x: 0, y: 0, radius: 14, strokeStyle: 'rgba(255, 220, 160, 0.8)', lineWidth: 2 });
      renderer.popTransform();
    }
    super.draw(deltaTime);
    drawOver(this, this.effects);
    if (this.lit) renderer.drawLight({ x: a.x, y: a.y - 40, radius: 320, color: '#ffd9a8', intensity: 0.8, z: 40 });
  }
}

/**
 * The quartermaster: a hooded trader by a crate, who buys and sells for
 * embers. Trading goes through intents (see keepIntents.js); this actor is
 * the body the distance rule measures to and the prompt that says so.
 */
export class Quartermaster extends Entity {
  name = 'Quartermaster';
  static replicated = ['stock'];

  get lit() { return this.game.renderer.supports('lights'); }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.addConstraint('prompt', new ProximityPrompt(this, { radius: 120, text: 'E · Trade', color: '#ffe3b0' }));
    /** What is left of each ware. Simulation state: the `buy` intent spends it. */
    this.stock = newStock();
    const rng = makeRng(Math.round(body.position.x * 3 + body.position.y * 5));
    this.sway = range(rng, 0, Math.PI * 2);
    this.time = 0;
  }

  get playerNear() {
    return this.getConstraint('prompt').isNear;
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.time += deltaTime;
  }

  draw() {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const a = this.renderAnchor;
    const bob = Math.sin(this.time * 1.4 + this.sway) * 1.5;
    groundShadow(renderer, a.x, a.y, 70, 1.2, 0.8);

    // The crate, to the right, with a brass band and a lantern on top.
    renderer.pushTransform({ x: a.x + 34, y: a.y - 4 });
    renderer.drawRect({ x: -22, y: -34, width: 44, height: 34, fillStyle: '#5a3a22', strokeStyle: '#2a1a10', lineWidth: 2, cornerRadius: 3 });
    renderer.drawRect({ x: -22, y: -20, width: 44, height: 5, fillStyle: '#8a6a30' });
    renderer.drawRect({ x: -5, y: -52, width: 10, height: 16, fillStyle: '#1d120c', cornerRadius: 2 });
    renderer.drawRect({ x: -3, y: -49, width: 6, height: 10, fillStyle: 'rgba(255, 220, 150, 0.9)', cornerRadius: 1 });
    renderer.popTransform();

    // The trader: cloak, hood, a lit face, hands over the crate.
    renderer.pushTransform({ x: a.x - 6, y: a.y + bob });
    renderer.drawPath({ points: [{ x: -24, y: 0 }, { x: -16, y: -70 }, { x: 0, y: -84 }, { x: 16, y: -70 }, { x: 24, y: 0 }], closed: true, fillStyle: '#3a2a4a', strokeStyle: '#1a1222', lineWidth: 2 });
    renderer.drawArc({ x: 0, y: -74, radius: 15, fillStyle: '#2c2038' });
    renderer.drawArc({ x: 0, y: -70, radius: 9, fillStyle: '#e8c49a' });
    renderer.drawArc({ x: -3, y: -72, radius: 1.5, fillStyle: '#2a1a10' });
    renderer.drawArc({ x: 3, y: -72, radius: 1.5, fillStyle: '#2a1a10' });
    renderer.drawArc({ x: 14, y: -34, radius: 6, fillStyle: '#e8c49a' });
    renderer.drawArc({ x: 22, y: -36, radius: 6, fillStyle: '#e8c49a' });
    renderer.popTransform();

    if (this.lit) renderer.drawLight({ x: a.x + 34, y: a.y - 50, radius: 160, color: '#ffc06a', intensity: 0.6, z: 30 });
  }
}

/** The eight-way facing name for an angle, for the HUD. */
export const facingName = (angle) => Angle.direction8(angle);
