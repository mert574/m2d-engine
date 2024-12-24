import { Constraint } from '../core/constraint.js';

export class Health extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.maxHealth = options.maxHealth || 100;
    this.currentHealth = this.maxHealth;
    this.invulnerableTime = 0;
    this.invulnerableDuration = options.invulnerableDuration || 60; // frames of invulnerability after taking damage
    this.onDeath = options.onDeath || null;
    this.onDamage = options.onDamage || null;
  }

  update() {
    if (this.invulnerableTime > 0) {
      this.invulnerableTime--;
    }
  }

  isInvulnerable() {
    return this.invulnerableTime > 0;
  }

  takeDamage(amount) {
    if (this.isInvulnerable()) return;

    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.invulnerableTime = this.invulnerableDuration;

    if (this.onDamage) {
      this.onDamage(amount);
    }

    if (this.currentHealth === 0) {
      this.entity.dead = true;
      if (this.onDeath) {
        this.onDeath();
      }
    }
  }

  heal(amount) {
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
  }

  draw() {
    if (this.entity.dead) return;

    const pos = this.entity.position;
    const size = this.entity.size;
    const ctx = this.entity.context;

    const barWidth = size.x;
    const barHeight = 4;
    const barY = pos.y - size.y / 2 - 10; // Position above entity
    const barX = pos.x - barWidth / 2;

    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = this.currentHealth > 30 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(
      barX,
      barY,
      barWidth * this.healthPercentage,
      barHeight
    );
  }

  get healthPercentage() {
    return this.currentHealth / this.maxHealth;
  }

  get isAlive() {
    return this.currentHealth > 0;
  }
} 