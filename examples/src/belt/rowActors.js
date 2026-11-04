import { Entity } from 'm2d-engine/core/entity.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { ObliquePlayer } from 'm2d-engine/actors/obliquePlayer.js';
import { Ghost } from 'm2d-engine/actors/ghost.js';
import { Footsteps } from 'm2d-engine/constraints/footsteps.js';
import { Attack } from 'm2d-engine/constraints/attack.js';
import { CollisionCategories } from 'm2d-engine/core/constants.js';
import { drawGroundShadow, shadowForLift } from 'm2d-engine/core/renderers/shadows.js';
import { AttackSwing, HitBurst } from '../shared/effects.js';
import { makeRng, range } from '../shared/rng.js';

/**
 * Ash Row's cast. Everything stands on the ground plane: x along the
 * street, y the depth, drawn through the scene's `belt` projection so the
 * depth lane is compressed and a jump (`elevation`) rises freely. Ground
 * shadows come from the engine and shrink with the lift.
 */

/** An invisible kerb. */
export class Bound extends Platform {
  draw() {}
}

/** A street lamp on the back kerb, unlit under the midday sun. */
export class Lamp extends Entity {
  name = 'Lamp';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.lit = game.renderer.supports('lights');
    this.blend = game.renderer.supports('blendModes') ? 'additive' : undefined;
    const rng = makeRng(Math.round(body.position.x));
    this.flicker = range(rng, 0, Math.PI * 2);
    this.time = 0;
  }

  draw() {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const a = this.renderAnchor;
    const top = a.y - 190;
    // The sun's shadow falls down-right of the post.
    drawGroundShadow(renderer, a.x + 26, a.y + 2, 40, { fade: 0.5, ratio: 0.22 });
    renderer.drawLine({ x1: a.x, y1: a.y, x2: a.x, y2: top + 14, strokeStyle: '#2e3238', lineWidth: 6 });
    renderer.drawLine({ x1: a.x + 2, y1: a.y, x2: a.x + 2, y2: top + 16, strokeStyle: 'rgba(255, 250, 235, 0.35)', lineWidth: 2 });
    renderer.drawLine({ x1: a.x, y1: top + 14, x2: a.x + 22, y2: top, strokeStyle: '#2e3238', lineWidth: 4 });
    renderer.drawRect({ x: a.x + 14, y: top - 6, width: 18, height: 22, fillStyle: '#3a3e46', cornerRadius: 3 });
    renderer.drawRect({ x: a.x + 17, y: top - 2, width: 12, height: 14, fillStyle: 'rgba(214, 228, 238, 0.85)', cornerRadius: 2 });
  }
}

/**
 * A thug. A `Ghost` (chase, contact damage, health) from a Flare sheet,
 * popped into the air when hit and faded out when it dies.
 */
export class Thug extends Ghost {
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.spriteFit = true;
    this.spriteSize = { x: 190, y: 190 };
    this.renderOffset.y = -54;
    this.heading = Math.PI;
    this.lift = 0;
    const chase = this.constraints.get('chase');
    chase.speed = 95;
    chase.idleSpeed = 40;
    chase.detectionRange = 1600;
    chase.wanderRadius = 60;
    // Brushing past a thug does nothing; the hurt comes from a telegraphed
    // swing, or there is no reading the fight.
    this.constraints.delete('contactDamage');
    this.addConstraint('strike', new Attack(this, {
      damage: 14, range: 95, arc: Math.PI * 0.9, cooldown: 100, knockback: 3000,
      targetCategory: CollisionCategories.player
    }));
    /** The windup: seconds of raised arms before the strike lands. */
    this.windup = 0;
    this.strikeHold = 0;
    this.strikeWait = 1 + game.rng.next();
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#ffd0a0', radius: 40, hook: true }));
    const health = this.constraints.get('health');
    const onDamage = health.onDamage;
    health.onDamage = (amount) => {
      onDamage?.(amount);
      this.lift = 260;
    };
    this.onDeath = null;
    const onDeath = health.onDeath;
    health.onDeath = () => { onDeath?.(); this.onDeath?.(this); };
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    if (this.dead) return;
    // The swing: wind up in reach, strike at the end of the windup.
    const player = this.game.player;
    this.strikeWait = Math.max(0, this.strikeWait - dt);
    this.strikeHold = Math.max(0, this.strikeHold - dt);
    if (this.windup > 0) {
      this.windup -= dt;
      this.body.setVelocity({ x: 0, y: 0 });
      if (this.windup <= 0 && player && !player.dead) {
        const dx = player.position.x - this.position.x;
        const dy = player.position.y - this.position.y;
        this.heading = Math.atan2(dy, dx);
        this.getConstraint('strike').startAttack(this.heading);
        this.game.soundManager.playSound('attack');
        this.strikeHold = 0.45;
        this.strikeWait = 1.4 + this.game.rng.next() * 0.8;
        this.strikeFlash = 0.3;
      }
    } else if (player && !player.dead && this.strikeWait <= 0 && this.elevation === 0) {
      const dist = Math.hypot(player.position.x - this.position.x, player.position.y - this.position.y);
      if (dist < 90) {
        this.windup = 0.45;
        this.animTime = 0;
      }
    }
    if (this.elevation > 0 || this.lift > 0) {
      this.lift -= 1400 * dt;
      this.elevation = Math.max(0, this.elevation + this.lift * dt);
      if (this.elevation === 0) this.lift = 0;
    }
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.strikeFlash = Math.max(0, (this.strikeFlash ?? 0) - deltaTime);
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.y);
    // Hysteresis on both the gait and the facing: flipping animation on
    // every wobble around a threshold is a flicker, not a walk.
    if (speed > 30) this.moving = true;
    else if (speed < 10) this.moving = false;
    if (speed > 25) {
      const angle = Math.atan2(v.y, v.x);
      let turn = angle - this.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      if (Math.abs(turn) > 0.45) this.heading = angle;
    }
    const hurt = (this.constraints.get('damageFlash')?.timeLeft ?? 0) > 0;
    const airborne = this.elevation > 0;
    if (this.windup > 0 || this.strikeHold > 0) {
      // The raised-arms pose, held through the windup and the blow.
      this.setDirectionalAnimation('swing', this.heading);
    } else {
      this.setDirectionalAnimation(airborne ? 'die' : hurt ? 'hit' : this.moving ? 'run' : 'idle', this.heading);
    }
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const a = this.renderAnchor;
    drawGroundShadow(renderer, a.x, a.y, 46, { ...shadowForLift(this.renderElevation), ratio: 0.3 });
    // The tell: a ring tightening at the feet through the windup, and a
    // flash along the blow when it lands.
    if (this.windup > 0) {
      const k = this.windup / 0.45;
      renderer.pushTransform({ x: a.x, y: a.y, scaleX: 1, scaleY: 0.4 });
      renderer.drawArc({ x: 0, y: 0, radius: 30 + 50 * k, strokeStyle: `rgba(255, 120, 80, ${0.9 - 0.5 * k})`, lineWidth: 3 });
      renderer.popTransform();
    }
    if ((this.strikeFlash ?? 0) > 0) {
      const k = this.strikeFlash / 0.3;
      const pos = this.renderPosition;
      const hx = pos.x + Math.cos(this.heading) * 55;
      renderer.drawArc({ x: hx, y: pos.y + 10, radius: 34 * (1.3 - k), strokeStyle: `rgba(255, 200, 150, ${0.8 * k})`, lineWidth: 4 * k + 1 });
    }
    super.draw(deltaTime);
  }
}

/**
 * The rogue: the oblique player with a jump and the genre's moves.
 *
 *   X          A three-hit chain: jab, cross, and a finisher that launches
 *              whoever it lands on. Mash within the window to keep it going.
 *   X, airborne  A drop kick: one heavier hit on the way down.
 *   C          A sweep kick: shorter reach but all the way around, and it
 *              throws the crowd back. Its own cooldown.
 *
 * The chain and the launcher are the engine's `Attack` combo; the sweep is
 * a second `Attack` under its own name, with its own swing effect.
 */
export class Rogue extends ObliquePlayer {
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, { ...options, attackRange: 80, attackArc: Math.PI * 0.9, jumpSpeed: 520, gravity: 1700 });
    // The thugs' strikes target the player category; without this the
    // rogue sits in the default one and their blows pass through.
    body.setCollisionFilter({ category: CollisionCategories.player });
    this.lit = game.renderer.supports('lights');
    this.blend = game.renderer.supports('blendModes') ? 'additive' : undefined;
    this.heading = 0;
    const control = this.getConstraint('control');
    control.maxSpeed = 230;

    const attack = this.getConstraint('attack');
    attack.cooldown = 0.28;
    attack.combo = [
      { damage: 12, knockback: 2500 },
      { damage: 14, knockback: 3500 },
      { damage: 26, knockback: 9000 }
    ];
    attack.onHit = (other, step) => {
      // The finisher launches; the drop kick pops a little too.
      if (step === 2 && 'lift' in other) other.lift = 330;
      else if (this.isAirborne && 'lift' in other) other.lift = 200;
    };
    const baseCombo = attack.combo;
    control.onAttack = () => {
      // Airborne, the chain gives way to one heavy drop kick.
      attack.combo = this.isAirborne ? [{ damage: 30, knockback: 7000 }] : baseCombo;
      attack.startAttack(this.heading);
    };

    this.addConstraint('kick', new Attack(this, {
      damage: 10, range: 66, arc: Math.PI * 2, cooldown: 72, knockback: 8000,
      onStart: () => {
        this.game.soundManager.playSound('attack');
        this.setDirectionalAnimation('cast', this.heading, { restart: true });
        this.kickHold = 0.4;
      },
      onHit: (other) => { if ('lift' in other) other.lift = 160; }
    }));
    this.kickHold = 0;

    this.addConstraint('swing', new AttackSwing(this, { color: ['#ffe3b0', '#ffd27a', '#ff9a4a'], reach: 80 }));
    this.addConstraint('sweep', new AttackSwing(this, { color: '#bfeaff', reach: 66, attack: 'kick', duration: 0.4 }));
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#ffb47a', radius: 34, hook: true }));
    this.addConstraint('footsteps', new Footsteps(this, { sounds: ['step1', 'step2', 'step3', 'step4'], stride: 36 }));
    this.onJump = () => this.game.soundManager.playSound('jump');
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    if (this.dead) return;
    this.kickHold = Math.max(0, this.kickHold - dt);
    const input = this.game.input.snapshot;
    if (input.justPressed('KeyC')) this.getConstraint('kick').startAttack(this.heading);
  }

  update(deltaTime) {
    if (this.kickHold > 0) {
      // Hold the kick's pose: tick the cycle, not the facing.
      Entity.prototype.update.call(this, deltaTime);
      return;
    }
    super.update(deltaTime);
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const a = this.renderAnchor;
    drawGroundShadow(this.game.renderer, a.x, a.y, 50, { ...shadowForLift(this.renderElevation), ratio: 0.3 });
    super.draw(deltaTime);

  }
}
