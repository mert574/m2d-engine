import { Entity } from 'm2d-engine/core/entity.js';
import { Projectile } from 'm2d-engine/core/projectile.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { Trigger } from 'm2d-engine/actors/trigger.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { Hover } from 'm2d-engine/constraints/hover.js';
import { ThrustControl } from 'm2d-engine/constraints/thrustControl.js';
import { CollisionCategories } from 'm2d-engine/core/constants.js';
import { HitBurst } from '../shared/effects.js';

/**
 * Salvage Run's cast. Every sprite is Kenney's Space Shooter Redux art,
 * which points up the page, while a body's angle of zero points along +x;
 * `SPRITE_UP` is the quarter turn between the two. The camera turns with
 * the ship, so everything here draws in world space and lets the view
 * rotate around it.
 */
const SPRITE_UP = Math.PI / 2;
const HULL = 100;

/** Where a sprite from the scene's sheets can be found at runtime. */
const sheet = (game, name) => game.sceneManager.getCurrentScene()?.spriteSheets.get(name) ?? null;

/** A laser bolt. Owned by whoever fired it and blind to them. */
export class Laser extends Projectile {
  name = 'Laser';

  /** Presentation: read from the renderer when drawing, never in simulation (a headless game has none). */
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }
  get lit() { return this.game.renderer.supports('lights'); }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, { speed: 900, damage: 12, maxLifetime: 1.6, destroyOnWallHit: true, ...options });
    this.tint = options.tint ?? '#7fd4ff';
  }

  onHitTarget(entity) {
    super.onHitTarget(entity);
    entity.onLaserHit?.(this);
  }

  draw() {
    if (this.dead) return;
    const pos = this.renderPosition;
    const renderer = this.game.renderer;
    if (this.sprite) this.sprite.draw('default', pos.x, pos.y, { width: 9, height: 54, rotation: this.rotation + SPRITE_UP });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 22,
      fillStyle: { type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: 22, stops: [{ offset: 0, color: `${this.tint}66` }, { offset: 1, color: `${this.tint}00` }] },
      blend: this.blend
    });
    if (this.lit) renderer.drawLight({ x: pos.x, y: pos.y, radius: 90, color: this.tint, intensity: 0.5, z: 10 });
  }
}

/** Spawn a laser from `owner` along `angle`, with its own sprite and targets. */
export function fireLaser(owner, angle, { sheetName, tint, targetNames, damage, speed = 900, offset = 40 }) {
  const game = owner.game;
  const x = owner.position.x + Math.cos(angle) * offset;
  const y = owner.position.y + Math.sin(angle) * offset;
  const body = game.physics.createBox({ x, y, width: 8, height: 30, angle: angle + SPRITE_UP, friction: 0, frictionAir: 0, restitution: 0, isSensor: true });
  const laser = new Laser(body, sheet(game, sheetName), game, {
    direction: { x: Math.cos(angle), y: Math.sin(angle) }, owner, targetNames, tint, damage, speed,
    collisionMask: CollisionCategories.default | CollisionCategories.player | CollisionCategories.enemy | CollisionCategories.platform
  });
  laser.spriteFit = true;
  game.entities.add(laser);
  game.physics.add(body);
  return laser;
}

/** An invisible wall at the field's edge. */
export class Bound extends Platform {
  draw() {}
}

/**
 * The ship. Thrust and turn through `ThrustControl`; the camera keeps the
 * nose up. Lasers on X, a boost on C. The hull shows its damage: Kenney's
 * damage overlays appear as health falls.
 */
export class Ship extends Entity {
  name = 'Player';

  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: CollisionCategories.player });
    body.setMass(1.2);
    this.spriteFit = true;
    this.spriteSize = { x: 84, y: 56 };
    this.renderAngleOffset = SPRITE_UP;
    this.heading = body.angle;
    this.fireWait = 0;
    this.shieldFlash = 0;
    this.damageSheets = [1, 2, 3].map(n => sheet(game, `playerDamage${n}`));
    this.flame = sheet(game, 'flame');
    this.flameBoost = sheet(game, 'flameBoost');
    this.shieldSprite = sheet(game, 'shield');

    this.addConstraint('health', new Health(this, {
      maxHealth: HULL, invulnerableDuration: 0.6,
      onDamage: () => { this.shieldFlash = 0.35; this.game.soundManager.playSound('hit'); },
      onDeath: () => { this.game.soundManager.playSound('lose'); this.game.gameOver(); }
    }));
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#9fe0ff', radius: 50 }));
    // The HUD carries the hull; a bar beside a sprite turns into a stick
    // under a rotating camera.
    this.getConstraint('health').draw = () => {};
    this.addConstraint('control', new ThrustControl(this, {
      thrust: 560, reverse: 300, maxSpeed: 440, turn: 2.3, drag: 0.4,
      boostThrust: 2.4, boostSpeed: 1.7, boostDuration: 1.1, boostCooldown: 5,
      onFire: () => this.fire(),
      onBoost: () => this.game.soundManager.playSound('boost')
    }));
  }

  fire() {
    if (this.fireWait > 0) return;
    this.fireWait = 0.17;
    const angle = this.body.angle;
    // Two guns, one each side of the nose.
    for (const side of [-1, 1]) {
      const px = Math.cos(angle + SPRITE_UP) * 14 * side;
      const py = Math.sin(angle + SPRITE_UP) * 14 * side;
      const laser = fireLaser(this, angle, { sheetName: 'laserBlue', tint: '#7fd4ff', targetNames: ['Meteor', 'Drone'], damage: 12 });
      laser.body.setPosition({ x: laser.position.x + px, y: laser.position.y + py });
    }
    this.game.soundManager.playSound('laser');
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    if (this.dead) return;
    this.fireWait = Math.max(0, this.fireWait - dt);
    this.heading = this.body.angle;
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.shieldFlash = Math.max(0, this.shieldFlash - deltaTime);
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    // Ramming a meteor costs hull in proportion to how hard.
    if (other.entity?.name === 'Meteor') {
      const v = this.velocity;
      const u = other.velocity;
      const closing = Math.hypot(v.x - u.x, v.y - u.y);
      const damage = Math.round(Math.min(40, Math.max(0, closing - 120) * 0.12));
      if (damage > 0) this.getConstraint('health').takeDamage(damage);
    }
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const angle = this.renderAngle;
    const control = this.getConstraint('control');
    const throttle = control.throttle;

    // Engine flame behind the nose, longer with the throttle, stronger on a boost.
    if (throttle > 0.05) {
      const sprite = control.boosting ? this.flameBoost : this.flame;
      const length = 36 + throttle * 30 + (control.boosting ? 24 : 0);
      const back = angle - this.renderAngleOffset + Math.PI;
      const fx = pos.x + Math.cos(back) * (28 + length / 2);
      const fy = pos.y + Math.sin(back) * (28 + length / 2);
      sprite?.draw('default', fx, fy, { width: 18, height: length, rotation: angle + Math.PI, globalAlpha: 0.9 });
      renderer.drawArc({
        x: fx, y: fy, radius: 40 + throttle * 16,
        fillStyle: { type: 'radial', x: fx, y: fy, r0: 0, r1: 40 + throttle * 16, stops: [{ offset: 0, color: control.boosting ? 'rgba(255, 170, 90, 0.45)' : 'rgba(120, 190, 255, 0.4)' }, { offset: 1, color: 'rgba(120, 190, 255, 0)' }] },
        blend: this.blend
      });
      if (this.lit) renderer.drawLight({ x: fx, y: fy, radius: 220 + throttle * 80, color: control.boosting ? '#ffb070' : '#7fb8ff', intensity: 0.8, z: 20 });
    }

    super.draw(deltaTime);
    // Damage overlays, Kenney's, as the hull falls.
    const health = this.getConstraint('health');
    const k = 1 - health.currentHealth / health.maxHealth;
    const stage = k > 0.7 ? 2 : k > 0.4 ? 1 : k > 0.15 ? 0 : -1;
    if (stage >= 0) this.damageSheets[stage]?.draw('default', pos.x, pos.y, { width: this.spriteSize.x, height: this.spriteSize.y, rotation: angle });
    if (this.shieldFlash > 0) {
      const a = this.shieldFlash / 0.35;
      this.shieldSprite?.draw('default', pos.x, pos.y, { width: 110, height: 90, rotation: angle, globalAlpha: 0.8 * a });
    }
    // Cockpit running light.
    if (this.lit) renderer.drawLight({ x: pos.x, y: pos.y, radius: 160, color: '#bfe3ff', intensity: 0.35, z: 30 });
  }
}

/**
 * A meteor: a tumbling rock that splits in two when shot down to nothing,
 * big to medium to small, and that costs the ship hull when it is rammed.
 */
export class Meteor extends Entity {
  name = 'Meteor';

  static SIZES = { big: { next: 'med', health: 60, sheets: ['brownMed1', 'greyMed2'], size: 70 }, med: { next: 'small', health: 30, sheets: ['brownSmall1', 'greySmall2'], size: 43 }, small: { next: null, health: 14 } };

  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.spriteFit = true;
    this.sizeClass = options.sizeClass ?? (this.size.x > 120 ? 'big' : this.size.x > 60 ? 'med' : 'small');
    const spec = Meteor.SIZES[this.sizeClass];
    body.setAngularVelocity(options.spin ?? 0.3);
    if (options.drift) body.setVelocity({ x: options.drift[0], y: options.drift[1] });
    this.addConstraint('health', new Health(this, {
      maxHealth: spec.health, invulnerableDuration: 0.05,
      onDamage: () => { this.flash = 0.12; },
      onDeath: () => this.shatter()
    }));
    this.getConstraint('health').draw = () => {};
    this.flash = 0;
    this.onShatter = null;
  }

  shatter() {
    const game = this.game;
    const spec = Meteor.SIZES[this.sizeClass];
    game.soundManager.playSound('zap');
    this.onShatter?.(this);
    if (spec.next) {
      const rng = game.rng;
      for (let i = 0; i < 2; i++) {
        const name = spec.sheets[i % spec.sheets.length];
        const a = rng.next() * Math.PI * 2;
        const d = Meteor.SIZES[spec.next].size;
        const chunk = game.createEntity({
          type: 'Meteor',
          x: this.position.x + Math.cos(a) * d * 0.6,
          y: this.position.y + Math.sin(a) * d * 0.6,
          width: d, height: d,
          spritesheet: sheet(game, name),
          options: { sizeClass: spec.next, spin: (rng.next() - 0.5) * 2.4, drift: [this.velocity.x + Math.cos(a) * 90, this.velocity.y + Math.sin(a) * 90] },
          physics: { bodyType: 'dynamic', shape: 'circle', friction: 0.2, frictionAir: 0, restitution: 0.7 }
        });
        chunk.onShatter = this.onShatter;
        game.entities.add(chunk);
        game.physics.add(chunk.body);
      }
    }
    game.entities.delete(this);
    game.physics.remove(this.body);
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.flash = Math.max(0, this.flash - deltaTime);
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    super.draw(deltaTime);
    if (this.flash > 0) {
      const pos = this.renderPosition;
      this.game.renderer.drawArc({ x: pos.x, y: pos.y, radius: this.size.x * 0.55, fillStyle: `rgba(255, 240, 220, ${0.5 * this.flash / 0.12})`, blend: this.blend });
    }
  }
}

/** A drone: hunts the ship, turns to face it, fires red bolts in range. */
export class Drone extends Entity {
  name = 'Drone';

  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: CollisionCategories.enemy });
    this.spriteFit = true;
    this.renderAngleOffset = SPRITE_UP;
    this.facing = -Math.PI / 2;
    this.fireWait = 1 + game.rng.next();
    this.hurt = 0;
    this.addConstraint('chase', new Chase(this, { speed: 170, idleSpeed: 60, detectionRange: 1100, wanderRadius: 220, wanderInterval: 2.5 }));
    this.addConstraint('health', new Health(this, {
      maxHealth: 40, invulnerableDuration: 0.05,
      onDamage: () => { this.hurt = 0.15; },
      onDeath: () => { this.game.soundManager.playSound('zap'); this.onDestroyed?.(this); this.game.entities.delete(this); this.game.physics.remove(this.body); }
    }));
    this.addConstraint('hitBurst', new HitBurst(this, { color: '#ff9a7a', radius: 44 }));
    this.getConstraint('health').draw = () => {};
    this.onDestroyed = null;
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    if (this.dead) return;
    const player = this.game.player;
    if (!player || player.dead) return;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const dist = Math.hypot(dx, dy);
    this.facing = Math.atan2(dy, dx);
    this.body.setAngle(this.facing);
    this.fireWait -= dt;
    if (dist < 700 && this.fireWait <= 0) {
      this.fireWait = 1.4 + this.game.rng.next() * 0.6;
      fireLaser(this, this.facing, { sheetName: 'laserRed', tint: '#ff8a6a', targetNames: ['Player'], damage: 9, speed: 620, offset: 50 });
      this.game.soundManager.playSound('droneLaser');
    }
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.hurt = Math.max(0, this.hurt - deltaTime);
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const pos = this.renderPosition;
    const renderer = this.game.renderer;
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 46,
      fillStyle: { type: 'radial', x: pos.x, y: pos.y, r0: 10, r1: 46, stops: [{ offset: 0, color: 'rgba(255, 90, 70, 0.25)' }, { offset: 1, color: 'rgba(255, 90, 70, 0)' }] },
      blend: this.blend
    });
    super.draw(deltaTime);
    if (this.hurt > 0) renderer.drawArc({ x: pos.x, y: pos.y, radius: this.size.x * 0.6, fillStyle: `rgba(255, 220, 200, ${0.6 * this.hurt / 0.15})`, blend: this.blend });
    if (this.lit) renderer.drawLight({ x: pos.x, y: pos.y, radius: 140, color: '#ff6a5a', intensity: 0.45, z: 20 });
  }
}

/** A salvage pod: spins, glows, and counts toward the gate. */
export class Salvage extends Entity {
  name = 'Salvage';

  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.spriteFit = true;
    this.spriteSize = { x: 26, y: 40 };
    const hover = new Hover(this, { amplitude: 0, spin: 1.4 });
    hover.angle = game.rng.next() * Math.PI * 2;
    this.addConstraint('spin', hover);
    this.onTaken = null;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity === this.game.player && this.game.entities.has(this)) {
      this.game.soundManager.playSound('salvage');
      this.game.entities.delete(this);
      this.game.physics.remove(this.body);
      this.onTaken?.(this);
    }
  }

  draw(deltaTime) {
    if (this.dead || !this.visible) return;
    const pos = this.renderPosition;
    const pulse = 0.8 + 0.2 * Math.sin(this.game.time.elapsed * 3 + pos.x);
    this.game.renderer.drawArc({
      x: pos.x, y: pos.y, radius: 48 * pulse,
      fillStyle: { type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: 48 * pulse, stops: [{ offset: 0, color: 'rgba(255, 214, 110, 0.45)' }, { offset: 1, color: 'rgba(255, 214, 110, 0)' }] },
      blend: this.blend
    });
    super.draw(deltaTime);
    if (this.lit) this.game.renderer.drawLight({ x: pos.x, y: pos.y, radius: 160 * pulse, color: '#ffd66e', intensity: 0.6, z: 20 });
  }
}

/** The jump gate: a ring of light that opens when every pod is aboard. */
export class Gate extends Trigger {
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.sealed = true;
    this.time = 0;
    this.beacon = sprite;
  }

  draw(deltaTime) {
    if (!this.visible) return;
    this.time += deltaTime;
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const r = this.size.x / 2;
    const colour = this.sealed ? '150, 110, 255' : '120, 220, 255';
    const breathe = 0.9 + 0.1 * Math.sin(this.time * 1.5);
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: r * 1.4 * breathe,
      fillStyle: { type: 'radial', x: pos.x, y: pos.y, r0: r * 0.5, r1: r * 1.4 * breathe, stops: [{ offset: 0, color: `rgba(${colour}, 0.3)` }, { offset: 1, color: `rgba(${colour}, 0)` }] },
      blend: this.blend
    });
    renderer.drawArc({ x: pos.x, y: pos.y, radius: r, strokeStyle: `rgba(${colour}, 0.9)`, lineWidth: 5 });
    renderer.drawArc({ x: pos.x, y: pos.y, radius: r * 0.78, strokeStyle: `rgba(${colour}, 0.45)`, lineWidth: 2 });
    // Four beacons orbiting the rim, Kenney's star pickups.
    for (let i = 0; i < 4; i++) {
      const a = this.time * (this.sealed ? 0.4 : 1.2) + (i / 4) * Math.PI * 2;
      this.beacon?.draw('default', pos.x + Math.cos(a) * r, pos.y + Math.sin(a) * r, { width: 34, height: 33, rotation: a });
    }
    if (this.lit) renderer.drawLight({ x: pos.x, y: pos.y, radius: r * 3, color: this.sealed ? '#9a70ff' : '#78dcff', intensity: 0.7 * breathe, z: 10 });
  }
}

/**
 * The sky between the far star tile and the field: nebula glows at a
 * third of the camera's travel and a scatter of Kenney's star sprites at
 * half of it, twinkling. An entity at zIndex -2 rather than a scene hook,
 * because the background hook runs under the tile layers.
 */
export class Sky extends Entity {
  name = 'Sky';

  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.zIndex = -2;
    this.depth = -Infinity;
    const seed = options.seed ?? 5;
    let s = seed * 7919 + 13;
    const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const w = game.options.worldWidth;
    const h = game.options.worldHeight;
    this.nebulae = [
      { x: 900, y: 1400, r: 1100, colour: '80, 110, 230' }, { x: 3200, y: 4600, r: 1400, colour: '160, 90, 210' },
      { x: 5400, y: 1200, r: 1200, colour: '70, 170, 210' }, { x: 2200, y: 2600, r: 800, colour: '210, 120, 170' },
      { x: 5800, y: 5400, r: 1300, colour: '90, 130, 220' }
    ];
    this.stars = Array.from({ length: 900 }, () => ({
      x: rand() * w * 1.4 - w * 0.2, y: rand() * h * 1.4 - h * 0.2,
      size: 6 + rand() * 12, sheet: ['star1', 'star2', 'star3'][Math.floor(rand() * 3)], phase: rand() * 6.28, rate: 0.6 + rand() * 1.6
    }));
    this.sheets = null;
  }

  draw() {
    const game = this.game;
    this.sheets ??= { star1: sheet(game, 'star1'), star2: sheet(game, 'star2'), star3: sheet(game, 'star3') };
    const renderer = game.renderer;
    const camera = game.camera;
    const area = camera.getVisibleArea();
    const t = game.time.elapsed;
    for (const n of this.nebulae) {
      const x = n.x + camera.x * 0.7;
      const y = n.y + camera.y * 0.7;
      if (x + n.r < area.left || x - n.r > area.right || y + n.r < area.top || y - n.r > area.bottom) continue;
      renderer.drawArc({ x, y, radius: n.r, fillStyle: { type: 'radial', x, y, r0: 0, r1: n.r, stops: [{ offset: 0, color: `rgba(${n.colour}, 0.34)` }, { offset: 0.55, color: `rgba(${n.colour}, 0.12)` }, { offset: 1, color: `rgba(${n.colour}, 0)` }] }, blend: this.blend });
    }
    const sx = camera.x * 0.5;
    const sy = camera.y * 0.5;
    for (const star of this.stars) {
      const x = star.x + sx;
      const y = star.y + sy;
      if (x < area.left - 20 || x > area.right + 20 || y < area.top - 20 || y > area.bottom + 20) continue;
      const twinkle = 0.55 + 0.45 * Math.sin(t * star.rate + star.phase);
      this.sheets[star.sheet]?.draw('default', x, y, { width: star.size, height: star.size, globalAlpha: twinkle });
    }
  }
}
