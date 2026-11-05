import { Constraint } from '../core/constraint.js';
import { s } from '../core/schema.js';

/**
 * Hit points, and the two things that happen at them: taking damage and
 * running out.
 *
 * `onDamage` and `onDeath` are simulation hooks — they run where
 * `takeDamage` was called, which on a server is the server. What a hit
 * *looks* like is a world event (`damage`, and `death` when the last of it
 * goes), raised here and delivered to this entity's constraints after the
 * tick, on every client that can see it. That is why `DamageFlash` reacts
 * to the event rather than to `onDamage`: the same flash then happens
 * alone and online, without the game writing it twice.
 */
export class Health extends Constraint {
  static params = {
    maxHealth: s.number({ initial: 100, positive: true }),
    invulnerableDuration: s.number({ initial: 1, min: 0, unit: 's' }),
    showBar: s.boolean({ initial: true })
  };

  static replicated = ['currentHealth', 'maxHealth'];

  constructor(entity, options = {}) {
    super(entity);
    this.maxHealth = options.maxHealth || 100;
    this.currentHealth = this.maxHealth;
    this.invulnerableTime = 0;
    // Seconds of invulnerability after a hit. `0` means none, so a game
    // that wants every hit to land can say so.
    this.invulnerableDuration = options.invulnerableDuration ?? 1;
    this.onDeath = options.onDeath || null;
    this.onDamage = options.onDamage || null;
    /** Whether to draw the bar above the entity. Off for entities whose health is shown elsewhere (a HUD). */
    this.showBar = options.showBar ?? true;
  }

  fixedUpdate(dt) {
    if (this.invulnerableTime > 0) {
      this.invulnerableTime -= dt;
    }
  }

  isInvulnerable() {
    return this.invulnerableTime > 0;
  }

  takeDamage(amount) {
    if (this.isInvulnerable()) return;

    const taken = Math.min(amount, this.currentHealth);
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.invulnerableTime = this.invulnerableDuration;
    this.#raise('damage', { amount: taken });

    if (this.onDamage) {
      this.onDamage(amount);
    }

    if (this.currentHealth === 0) {
      this.entity.dead = true;
      this.#raise('death', {});
      if (this.onDeath) {
        this.onDeath();
      }
    }
  }

  heal(amount) {
    const before = this.currentHealth;
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    if (this.currentHealth > before) this.#raise('heal', { amount: this.currentHealth - before });
  }

  /** Tell presentation, here and on every client that can see this entity. */
  #raise(name, data) {
    const entity = this.entity;
    const events = entity.game?.events;
    if (!events) return;
    const { x, y } = entity.position;
    events.emit(name, { ...data, id: entity.netId, at: { x: Math.round(x), y: Math.round(y) } });
  }

  draw() {
    if (this.entity.dead || !this.showBar) return;
    // A full bar is noise over every entity on screen; the bar appears when
    // it carries information, which is the moment health is missing.
    if (this.currentHealth >= this.maxHealth) return;

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