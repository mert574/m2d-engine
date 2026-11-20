import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';
import { s } from '../core/schema.ts';

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
  static override description = 'Hit points, invulnerability after a hit, a bar; raises damage and death events';
  static override params = {
    maxHealth: s.number({ initial: 100, positive: true }),
    invulnerableDuration: s.number({ initial: 1, min: 0, unit: 's' }),
    showBar: s.boolean({ initial: true }),
    whenDead: s.enumOf(['keep', 'remove'], { initial: 'keep', label: 'When dead', description: 'remove takes the entity out of the world at zero health, so a mob needs no code; keep leaves it for the actor (a player that respawns, a door that breaks open)' })
  };

  static override replicated: string[] = ['currentHealth', 'maxHealth'] satisfies (keyof Health)[];

  maxHealth: number;
  currentHealth: number;
  invulnerableTime: number;
  invulnerableDuration: number;
  onDeath: (() => void) | null;
  whenDead: 'keep' | 'remove';
  onDamage: ((amount: number) => void) | null;
  showBar: boolean;

  constructor(entity: Entity, options: {
    maxHealth?: number;
    invulnerableDuration?: number;
    onDeath?: (() => void) | null;
    whenDead?: 'keep' | 'remove';
    onDamage?: ((amount: number) => void) | null;
    showBar?: boolean;
  } = {}) {
    super(entity);
    this.maxHealth = options.maxHealth || 100;
    this.currentHealth = this.maxHealth;
    this.invulnerableTime = 0;
    // Seconds of invulnerability after a hit. `0` means none, so a game
    // that wants every hit to land can say so.
    this.invulnerableDuration = options.invulnerableDuration ?? 1;
    this.onDeath = options.onDeath || null;
    this.whenDead = options.whenDead ?? 'keep';
    this.onDamage = options.onDamage || null;
    /** Whether to draw the bar above the entity. Off for entities whose health is shown elsewhere (a HUD). */
    this.showBar = options.showBar ?? true;
  }

  override fixedUpdate(dt: number): void {
    if (this.invulnerableTime > 0) {
      this.invulnerableTime -= dt;
    }
  }

  isInvulnerable(): boolean {
    return this.invulnerableTime > 0;
  }

  takeDamage(amount: number): void {
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
      // After onDeath, so a hook sees the entity still in the world; the
      // death rules key on `dead` and on absence alike.
      if (this.whenDead === 'remove') this.entity.game.removeEntity(this.entity);
    }
  }

  heal(amount: number): void {
    const before = this.currentHealth;
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    if (this.currentHealth > before) this.#raise('heal', { amount: this.currentHealth - before });
  }

  /** Tell presentation, here and on every client that can see this entity. */
  #raise(name: string, data: Record<string, unknown>): void {
    const entity = this.entity;
    const events = entity.game?.events;
    if (!events) return;
    const { x, y } = entity.position;
    events.emit(name, { ...data, id: entity.netId, at: { x: Math.round(x), y: Math.round(y) } });
  }

  override draw(): void {
    if (this.entity.dead || !this.showBar) return;
    // A full bar is noise over every entity on screen; the bar appears when
    // it carries information, which is the moment health is missing.
    if (this.currentHealth >= this.maxHealth) return;

    const pos = this.entity.renderPosition;
    const body = this.entity.body;

    // As wide as the thing that carries the health. For most entities the
    // drawn frame is the body, so this is what it always was; for a
    // character whose sprite stands on a small footprint, a bar the width
    // of the sheet's cell would be several times the figure.
    const barWidth = Math.max(24, body.size.x);
    // The bar is world-space geometry (its width is the entity's), but its
    // thickness is clamped so it cannot thin out below ~2 world-surface
    // pixels: at a low render resolution a fixed 4-unit bar rounds to nothing.
    const worldScale = this.entity.game.viewport?.worldScale || 1;
    const barHeight = Math.max(4, 2 / worldScale);
    // Over the figure's head, not over the top of its frame; see Entity.overhead.
    const barY = this.entity.overhead - 6 - barHeight;
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

  get healthPercentage(): number {
    return this.currentHealth / this.maxHealth;
  }

  get isAlive(): boolean {
    return this.currentHealth > 0;
  }
} 