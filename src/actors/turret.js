import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import { ContactDamage } from '../constraints/contactDamage.js';
import { Rocket } from './rocket.js';
import Matter from 'matter-js';
import { CollisionCategories } from '../core/constants.js';
import { Vec2 } from '../core/math.js';
import { Debug } from '../constraints/debug.js';

export class Turret extends Entity {
  name = 'Turret';

  constructor(body, sprite, game, options = {}) {
    body.collisionFilter.category = CollisionCategories.enemy;
    body.isStatic = true;
    super(body, sprite, game);

    this.detectionRange = options.detectionRange || 350;
    this.fireRate = options.fireRate || 2; // seconds between shots
    this.rocketSpeed = options.rocketSpeed || 3;
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
      Matter.Composite.remove(this.game.engine.world, this.body);
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
      knockbackStrength: 6
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
    const bodies = Matter.Composite.allBodies(this.game.engine.world);

    // Filter to only static bodies (walls) excluding self
    const walls = bodies.filter(body =>
      body.isStatic &&
      body !== this.body &&
      body.entity?.name === 'Platform'
    );

    // Use Matter.Query.ray to check for intersections
    const collisions = Matter.Query.ray(walls, start, targetPos);

    return collisions.length === 0;
  }

  fireRocket() {
    const spawnOffset = 20;
    const spawnPos = {
      x: this.position.x + this.aimDirection.x * spawnOffset,
      y: this.position.y + this.aimDirection.y * spawnOffset
    };

    const rocketBody = Matter.Bodies.rectangle(
      spawnPos.x,
      spawnPos.y,
      24,
      8,
      {
        friction: 0,
        frictionAir: 0,
        frictionStatic: 0,
        restitution: 0,
        density: 0.001
      }
    );

    const rocket = new Rocket(rocketBody, null, this.game, {
      speed: this.rocketSpeed,
      damage: this.rocketDamage,
      direction: { ...this.aimDirection },
      maxLifetime: 6
    });

    this.game.entities.add(rocket);
    Matter.Composite.add(this.game.engine.world, rocketBody);
  }

  draw() {
    if (this.dead) return;

    const pos = this.position;
    const ctx = this.game.renderer.worldContext;

    // Draw base
    ctx.fillStyle = '#4A148C';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
    ctx.fill();

    // Draw outer ring
    ctx.strokeStyle = '#7B1FA2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Draw cannon barrel
    const barrelLength = 20;
    const barrelWidth = 6;
    const angle = Math.atan2(this.aimDirection.y, this.aimDirection.x);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    // Barrel
    ctx.fillStyle = '#6A1B9A';
    ctx.fillRect(0, -barrelWidth / 2, barrelLength, barrelWidth);

    // Barrel tip
    ctx.fillStyle = '#8E24AA';
    ctx.fillRect(barrelLength - 4, -barrelWidth / 2 - 2, 6, barrelWidth + 4);

    ctx.restore();

    // Draw center dot
    ctx.fillStyle = this.isPlayerInRange ? '#E91E63' : '#9C27B0';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Damage flash
    if (this.damageFlashTime > 0) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cooldown indicator
    if (this.isPlayerInRange && this.fireCooldown > 0) {
      const cooldownPercent = this.fireCooldown / this.fireRate;
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, -Math.PI / 2, -Math.PI / 2 + (1 - cooldownPercent) * Math.PI * 2);
      ctx.stroke();
    }

    if (this.game.renderer.isDebugEnabled()) {
      // Draw detection range
      this.game.renderer.drawArc({
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
        this.game.renderer.drawLine({
          x1: pos.x,
          y1: pos.y,
          x2: pos.x + this.aimDirection.x * this.detectionRange,
          y2: pos.y + this.aimDirection.y * this.detectionRange,
          strokeStyle: 'rgba(233, 30, 99, 0.5)',
          lineWidth: 1
        });
      }

      // Draw cooldown text
      this.game.renderer.drawText({
        text: `fire: ${this.fireCooldown.toFixed(1)}s`,
        x: this.body.bounds.min.x,
        y: this.body.bounds.max.y + 5,
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
