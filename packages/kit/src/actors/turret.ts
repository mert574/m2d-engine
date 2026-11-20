import { Entity, Vec2, type M2D } from 'm2d-engine';
import { Health, ContactDamage } from 'm2d-engine/constraints';
import { Rocket } from './rocket.ts';
import { s } from 'm2d-engine/schema';
import type { ActorBody, ActorSprite, Vec2 as Point } from '../engineTypes.ts';

export interface TurretOptions {
  /** How far it sees, px. */
  detectionRange?: number;
  /** Seconds between shots. */
  fireRate?: number;
  rocketSpeed?: number;
  rocketDamage?: number;
  /** Its own health. */
  health?: number;
}


export class Turret extends Entity {
  static override description = 'A fixed gun that tracks and fires at the player';
  override name = 'Turret';

  static override properties = {
    detectionRange: s.number({ initial: 350, positive: true, unit: 'px', label: 'Detection range' }),
    fireRate: s.number({ initial: 2, positive: true, unit: 's', label: 'Fire rate', description: 'Seconds between shots' }),
    rocketSpeed: s.number({ initial: 360, positive: true, unit: 'px/s', label: 'Rocket speed' }),
    rocketDamage: s.number({ initial: 25, min: 0, label: 'Rocket damage' }),
    health: s.number({ initial: 80, positive: true })
  };

  detectionRange: number;
  /** Seconds between shots. */
  fireRate: number;
  rocketSpeed: number;
  rocketDamage: number;
  /** Seconds until it may fire again. */
  fireCooldown: number;
  /** Where the barrel points, a unit vector. */
  aimDirection: Point;
  isPlayerInRange: boolean;
  hasLineOfSight: boolean;
  /** Seconds of the hit flash left. */
  damageFlashTime: number;
  damageFlashDuration: number;

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: TurretOptions = {}) {
    body.bodyType = 'static';
    super(body, sprite, game);
    // The rockets it fires are spawned by name, on a server and on its clients alike.
    if (game.actors && !game.actors.has('Rocket')) game.registerActor('Rocket', Rocket);

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
    health.onDeath = () => this.game.removeEntity(this);
    health.onDamage = () => {
      this.damageFlashTime = this.damageFlashDuration;
      this.game.soundManager?.playSound('damage');
    };
    this.addConstraint('health', health);

    this.addConstraint('contactDamage', new ContactDamage(this, {
      damage: 25,
      knockbackStrength: 360
    }));
  }

  override update(deltaTime: number): void {
    if (this.dead) return;
    super.update(deltaTime);

    // Drawn, never decided on: presentation, so it runs per frame.
    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= deltaTime;
    }
  }

  override fixedUpdate(dt: number): void {
    if (this.dead) return;
    super.fixedUpdate(dt);

    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }

    // The nearest living player: `game.player` alone, any avatar on a server.
    const target = this.game.players.nearestAvatar(this.position);
    if (!target) {
      this.isPlayerInRange = false;
      this.hasLineOfSight = false;
      return;
    }

    const playerPos = target.position;
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

  checkLineOfSight(targetPos: Point): boolean {
    const start = this.position;
    // Only scenery blocks sight — never another dynamic actor, and never
    // the turret itself.
    // The union's raycast signatures disagree on the body until the engine's
    // phase 10; the receiver is cast, never the method — detached, it loses `this`.
    const physics = this.game.physics as unknown as {
      raycast(from: Point, to: Point, keep: (body: { bodyType: string; entity?: { name?: string } | null }) => boolean): unknown[];
    };
    const blockers = physics.raycast(start, targetPos, (body) =>
      body.bodyType !== 'dynamic' &&
      body !== this.body &&
      body.entity?.name === 'Platform'
    );

    return blockers.length === 0;
  }

  /**
   * What a round this turret fires may hit: everything but the layer the
   * turret itself is on, so it cannot shoot itself, or the other turrets
   * and mobs that share its layer. On the unset first layer (bit 1)
   * nothing is excluded — that layer is also the walls'.
   *
   * A game that fires a round of its own (the facility's phantom bolt)
   * puts this on the body it builds, or the round dies against the gun
   * that fired it on its first tick.
   */
  get rocketMask(): number {
    const own = this.body.collisionFilter.category;
    return (own & ~1) ? 0xFFFF & ~own : 0xFFFF;
  }

  fireRocket(): void {
    const spawnOffset = 20;
    const spawnPos = {
      x: this.position.x + this.aimDirection.x * spawnOffset,
      y: this.position.y + this.aimDirection.y * spawnOffset
    };

    // Through `spawn`, so a server can tell its clients to make the same rocket.
    this.game.spawn({
      type: 'Rocket', x: spawnPos.x, y: spawnPos.y, width: 24, height: 8,
      physics: { friction: 0, frictionAir: 0, restitution: 0, density: 0.001 },
      options: {
        speed: this.rocketSpeed,
        damage: this.rocketDamage,
        direction: { ...this.aimDirection },
        maxLifetime: 6,
        // In options: `spawn`'s spec has no collisionMask of its own, and a
        // top-level one was silently dropped — the rocket flew with the
        // default mask and could strike the turret's own layer.
        collisionMask: this.rocketMask
      }
    });
  }

  override draw(): void {
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

  override setAnimation(): void {
    // No-op, turret draws itself
  }
}
