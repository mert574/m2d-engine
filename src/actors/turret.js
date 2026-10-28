import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import { ContactDamage } from '../constraints/contactDamage.js';
import { Rocket } from './rocket.js';
import { CollisionCategories } from '../core/constants.js';
import { Vec2 } from '../core/math.js';
import { Debug } from '../constraints/debug.js';

export class Turret extends Entity {
  name = 'Turret';

  constructor(body, sprite, game, options = {}) {
    body.setCollisionFilter({ category: CollisionCategories.enemy });
    body.isStatic = true;
    super(body, sprite, game);

    this.detectionRange = options.detectionRange || 350;
    this.fireRate = options.fireRate || 2; // seconds between shots
    this.rocketSpeed = options.rocketSpeed || 360; // px/s
    this.rocketDamage = options.rocketDamage || 25;

    this.fireCooldown = 0;
    this.aimDirection = { x: 1, y: 0 };
    this.isPlayerInRange = false;
    this.hasLineOfSight = false;
    this.damageFlashTime = 0;
    this.damageFlashDuration = 0.167;

    const health = new Health(this, {
      maxHealth: options.health || 80
    });
    health.invulnerableDuration = 0.3;
    health.onDeath = () => {
      this.game.entities.delete(this);
      this.game.physics.remove(this.body);
    };
    health.onDamage = () => {
      this.damageFlashTime = this.damageFlashDuration;
      this.game.soundManager.playSound('damage');
    };
    this.addConstraint('health', health);

    this.addConstraint('debug', new Debug(this, {
      boundsColor: '#9C27B0',
      boundsFillColor: 'rgba(156, 39, 176, 0.1)',
      centerColor: '#9C27B0',
      textColor: '#CE93D8',
      healthyColor: '#CE93D8',
      lowHealthColor: '#E91E63',
      lowHealthThreshold: 25
    }));

    this.addConstraint('contactDamage', new ContactDamage(this, {
      damage: 25,
      knockbackStrength: 360
    }));
  }

  update(deltaTime) {
    if (this.dead) return;
    super.update(deltaTime);

    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= deltaTime;
    }

    if (this.fireCooldown > 0) {
      this.fireCooldown -= deltaTime;
    }

    if (!this.game.player || this.game.player.dead) {
      this.isPlayerInRange = false;
      return;
    }

    const playerPos = this.game.player.position;
    const distance = Vec2.distance(this.position, playerPos);

    const inRange = distance < this.detectionRange;

    if (inRange) {
      // Update aim direction toward player
      this.aimDirection = Vec2.normalize(Vec2.direction(this.position, playerPos));

      // Check line of sight before firing
      this.hasLineOfSight = this.checkLineOfSight(playerPos);
      this.isPlayerInRange = this.hasLineOfSight;

      // Fire rocket if cooldown is ready and have line of sight
      if (this.fireCooldown <= 0 && this.hasLineOfSight) {
        this.fireRocket();
        this.fireCooldown = this.fireRate;
      }
    } else {
      this.isPlayerInRange = false;
      this.hasLineOfSight = false;
    }
  }

  checkLineOfSight(targetPos) {
    const start = this.position;
    // Only static walls block sight; the turret cannot occlude itself.
    const blockers = this.game.physics.raycast(start, targetPos, (body) =>
      body.isStatic &&
      body !== this.body &&
      body.entity?.name === 'Platform'
    );

    return blockers.length === 0;
  }

  fireRocket() {
    const spawnOffset = 20;
    const spawnPos = {
      x: this.position.x + this.aimDirection.x * spawnOffset,
      y: this.position.y + this.aimDirection.y * spawnOffset
    };

    const rocketBody = this.game.physics.createBox({
      x: spawnPos.x,
      y: spawnPos.y,
      width: 24,
      height: 8,
      friction: 0,
      frictionAir: 0,
      frictionStatic: 0,
      restitution: 0,
      density: 0.001
    });

    const rocket = new Rocket(rocketBody, null, this.game, {
      speed: this.rocketSpeed,
      damage: this.rocketDamage,
      direction: { ...this.aimDirection },
      maxLifetime: 6
    });

    this.game.entities.add(rocket);
    this.game.physics.add(rocketBody);
  }

  draw() {
    if (this.dead) return;

    const pos = this.renderPosition;
    const renderer = this.game.renderer;

    // Draw base
    renderer.drawArc({ x: pos.x, y: pos.y, radius: 16, fillStyle: '#4A148C' });

    // Draw outer ring
    renderer.drawArc({ x: pos.x, y: pos.y, radius: 14, strokeStyle: '#7B1FA2', lineWidth: 3 });

    // Draw cannon barrel
    const barrelLength = 20;
    const barrelWidth = 6;
    const angle = Math.atan2(this.aimDirection.y, this.aimDirection.x);

    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: angle });

    // Barrel
    renderer.drawRect({
      x: 0,
      y: -barrelWidth / 2,
      width: barrelLength,
      height: barrelWidth,
      fillStyle: '#6A1B9A'
    });

    // Barrel tip
    renderer.drawRect({
      x: barrelLength - 4,
      y: -barrelWidth / 2 - 2,
      width: 6,
      height: barrelWidth + 4,
      fillStyle: '#8E24AA'
    });

    renderer.popTransform();

    // Draw center dot
    renderer.drawArc({
      x: pos.x,
      y: pos.y,
      radius: 5,
      fillStyle: this.isPlayerInRange ? '#E91E63' : '#9C27B0'
    });

    // Damage flash
    if (this.damageFlashTime > 0) {
      renderer.drawArc({ x: pos.x, y: pos.y, radius: 18, fillStyle: 'rgba(255, 0, 0, 0.5)' });
    }

    // Cooldown indicator
    if (this.isPlayerInRange && this.fireCooldown > 0) {
      const cooldownPercent = this.fireCooldown / this.fireRate;
      renderer.drawArc({
        x: pos.x,
        y: pos.y,
        radius: 20,
        startAngle: -Math.PI / 2,
        endAngle: -Math.PI / 2 + (1 - cooldownPercent) * Math.PI * 2,
        strokeStyle: 'rgba(255, 255, 0, 0.6)',
        lineWidth: 2
      });
    }

    if (this.game.renderer.isDebugEnabled()) {
      // Range and aim are annotations on top of the game, not part of the
      // turret, so they go to the world overlay: world coordinates and world
      // sizes, rasterized at display resolution. A hairline ring drawn into
      // a quarter-resolution world surface would break up into steps.
      const overlay = this.game.worldOverlay;

      // Draw detection range
      overlay.drawArc({
        x: pos.x,
        y: pos.y,
        radius: this.detectionRange,
        startAngle: 0,
        endAngle: Math.PI * 2,
        strokeStyle: 'rgba(156, 39, 176, 0.3)',
        lineWidth: 1
      });

      // Draw aim line
      if (this.isPlayerInRange) {
        overlay.drawLine({
          x1: pos.x,
          y1: pos.y,
          x2: pos.x + this.aimDirection.x * this.detectionRange,
          y2: pos.y + this.aimDirection.y * this.detectionRange,
          strokeStyle: 'rgba(233, 30, 99, 0.5)',
          lineWidth: 1
        });
      }

      overlay.drawText({
        text: `fire: ${this.fireCooldown.toFixed(1)}s`,
        x: this.renderBounds.min.x,
        y: this.renderBounds.max.y,
        offsetY: 5,
        fillStyle: '#CE93D8',
        fontSize: '12px',
        fontFamily: 'monospace',
        textAlign: 'left',
        textBaseline: 'top'
      });
    }
  }

  setAnimation() {
    // No-op, turret draws itself
  }
}
