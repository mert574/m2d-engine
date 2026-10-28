import { Constraint } from '../core/constraint.js';

export class Health extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.maxHealth = options.maxHealth || 100;
    this.currentHealth = this.maxHealth;
    this.invulnerableTime = 0;
    this.invulnerableDuration = options.invulnerableDuration || 1; // seconds of invulnerability after taking damage
    this.onDeath = options.onDeath || null;
    this.onDamage = options.onDamage || null;
    /** Whether to draw the bar above the entity. Off for entities whose health is shown elsewhere (a HUD). */
    this.showBar = options.showBar ?? true;
  }

  update(deltaTime) {
    if (this.invulnerableTime > 0) {
      this.invulnerableTime -= deltaTime;
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
    if (this.entity.dead || !this.showBar) return;

    const pos = this.entity.renderPosition;
    const size = this.entity.size;

    const barWidth = size.x;
    // The bar is world-space geometry (its width is the entity's), but its
    // thickness is clamped so it cannot thin out below ~2 world-surface
    // pixels: at a low render resolution a fixed 4-unit bar rounds to nothing.
    const worldScale = this.entity.game.viewport?.worldScale || 1;
    const barHeight = Math.max(4, 2 / worldScale);
    const barY = pos.y - size.y / 2 - 6 - barHeight; // Position above entity
    const barX = pos.x - barWidth / 2;

    const renderer = this.entity.game.renderer;

    renderer.drawRect({
      x: barX,
      y: barY,
      width: barWidth,
      height: barHeight,
      fillStyle: '#333'
    });

    renderer.drawRect({
      x: barX,
      y: barY,
      width: barWidth * this.healthPercentage,
      height: barHeight,
      fillStyle: this.currentHealth > 30 ? '#2ecc71' : '#e74c3c'
    });
  }

  get healthPercentage() {
    return this.currentHealth / this.maxHealth;
  }

  get isAlive() {
    return this.currentHealth > 0;
  }
} 