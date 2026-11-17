import { Constraint } from 'm2d-engine/core/constraint.js';
import { s } from 'm2d-engine/core/schema.js';

/**
 * Combat visuals, kept out of the engine on purpose.
 *
 * The engine's `Attack` and `DamageFlash` know the rules — reach, damage,
 * invulnerability — but what a swing or a hit *looks like* is a question
 * for the game and its perspective: a side-scroller's slash is not a
 * top-down sweep is not a first-person flash. So these are ordinary
 * constraints a game attaches next to the mechanical ones and tunes to its
 * own palette, in a scene's `constraints` or from an actor's constructor.
 */

interface Point { x: number; y: number }

/** What the two constraints read of an entity; the engine's Entity has all of it. */
interface EffectEntity {
  constraints: Map<string, unknown>;
  renderPosition: Point;
  size: Point;
  game: {
    renderer: {
      supports(capability: string): boolean;
      drawPath(options: Record<string, unknown>): void;
      drawArc(options: Record<string, unknown>): void;
    };
    projection?: { screenAngle(angle: number): number } | null;
    registerConstraint(name: string, klass: unknown, options?: { origin?: 'game' | 'kit' }): void;
  };
}

/** The slice of the engine's `Attack` the swing follows. */
interface AttackLike {
  onStart?: ((step?: number) => void) | null;
  direction: number;
  angle?: number;
  range: number;
}

export interface AttackSwingOptions {
  /** Arc colour, or one per combo step. */
  color?: string | string[];
  /** Seconds the swing is visible. */
  duration?: number;
  /** Outer radius; the attack's range when unset. */
  reach?: number | null;
  /** Which Attack slot to follow. */
  attack?: string;
}

/**
 * A crescent that sweeps across the facing half when an attack starts and
 * fades as it goes. Wraps the `Attack` constraint's `onStart`, so the two
 * stay in step without the engine knowing about the look.
 */
export class AttackSwing extends Constraint {
  static override description = 'An arc that sweeps where an Attack struck, for a frame or two';
  static override params = {
    color: s.string({ editor: 'color', initial: '#ffffff', description: 'Arc colour' }),
    duration: s.number({ positive: true, initial: 0.3, unit: 's' }),
    reach: s.number({ positive: true, description: "Outer radius; the attack's range when unset" }),
    attack: s.string({ initial: 'attack', description: 'The Attack slot to follow' })
  };

  declare entity: EffectEntity;
  color: string | string[];
  duration: number;
  reach: number | null;
  time: number;
  direction: number;
  angle: number;
  attack: AttackLike;
  stepColor: string | undefined;

  constructor(entity: EffectEntity, options: AttackSwingOptions = {}) {
    super(entity);
    this.color = options.color ?? '#ffffff';
    this.duration = options.duration ?? 0.3;
    this.reach = options.reach ?? null;
    this.time = Infinity;
    this.direction = 1;
    this.angle = 0;
    this.stepColor = undefined;

    const attack = entity.constraints.get(options.attack ?? 'attack') as AttackLike;
    this.attack = attack;
    const onStart = attack.onStart;
    attack.onStart = (step = 0) => {
      onStart?.(step);
      this.time = 0;
      this.stepColor = Array.isArray(this.color) ? this.color[step % this.color.length] : this.color;
      this.direction = attack.direction;
      // The swing's centre as seen: the attack's ground angle, through the
      // scene's projection when there is one.
      const projection = entity.game.projection;
      this.angle = projection ? projection.screenAngle(attack.angle ?? 0) : (attack.angle ?? (attack.direction > 0 ? 0 : Math.PI));
    };
  }

  override update(deltaTime: number): void {
    this.time += deltaTime;
  }

  override draw(): void {
    const t = this.time / this.duration;
    if (t >= 1) return;

    const renderer = this.entity.game.renderer;
    const pos = this.entity.renderPosition;
    const range = this.reach ?? this.attack.range;
    const facing = this.angle;
    // Eases out: fast at the start of the swing, settling at the end.
    const sweep = 1 - (1 - t) * (1 - t);
    const centre = facing + (sweep - 0.5) * Math.PI * 0.9 * this.direction;
    const halfWidth = Math.PI * 0.22 * (1 - t * 0.5);
    const fade = 1 - t;
    const blend = renderer.supports('blendModes') ? 'additive' : undefined;

    const inner = range * 0.45;
    const outer = range * (0.85 + 0.15 * sweep);
    const points: Point[] = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const a = centre - halfWidth + (i / steps) * halfWidth * 2;
      points.push({ x: pos.x + Math.cos(a) * outer, y: pos.y + Math.sin(a) * outer });
    }
    for (let i = steps; i >= 0; i--) {
      const a = centre - halfWidth + (i / steps) * halfWidth * 2;
      points.push({ x: pos.x + Math.cos(a) * inner, y: pos.y + Math.sin(a) * inner });
    }
    const color = this.stepColor ?? (Array.isArray(this.color) ? this.color[0] : this.color);
    renderer.drawPath({ points, closed: true, fillStyle: color, globalAlpha: 0.45 * fade, blend });
    // The leading edge, brighter and thinner.
    renderer.drawPath({
      points: points.slice(0, steps + 1),
      strokeStyle: color, lineWidth: 2, globalAlpha: 0.9 * fade, blend
    });
  }
}

export interface HitBurstOptions {
  /** Flash and ring colour. */
  color?: string;
  /** Seconds the burst is visible. */
  duration?: number;
  /** Ring reach; the entity's size when unset. */
  radius?: number | null;
}

/**
 * A burst where an entity was hit: a flash over it that fades fast, and a
 * ring that leaves it.
 *
 * It bursts by itself, on the `damage` world event `Health` raises, so a
 * hit the server simulated bursts on every client watching it. `flash()`
 * is there for a game that wants one for a reason of its own.
 */
export class HitBurst extends Constraint {
  static override description = 'A flash and an expanding ring when the entity is hit';
  static override params = {
    color: s.string({ editor: 'color', initial: '#fff3e6', description: 'Flash and ring colour' }),
    duration: s.number({ positive: true, initial: 0.3, unit: 's' }),
    radius: s.number({ positive: true, description: "Ring reach; the entity's size when unset" })
  };

  declare entity: EffectEntity;
  color: string;
  duration: number;
  radius: number | null;
  timeLeft: number;

  constructor(entity: EffectEntity, options: HitBurstOptions = {}) {
    super(entity);
    this.color = options.color ?? '#fff3e6';
    this.duration = options.duration ?? 0.3;
    this.radius = options.radius ?? null;
    this.timeLeft = 0;
  }

  flash(): void {
    this.timeLeft = this.duration;
  }

  /** A hit, wherever it was simulated. See the engine's core/events.js. */
  override onWorldEvent(name: string): void {
    if (name === 'damage') this.flash();
  }

  override update(deltaTime: number): void {
    if (this.timeLeft > 0) this.timeLeft -= deltaTime;
  }

  override draw(): void {
    if (this.timeLeft <= 0) return;
    const { entity } = this;
    const renderer = entity.game.renderer;
    const pos = entity.renderPosition;
    const t = 1 - this.timeLeft / this.duration;
    const reach = this.radius ?? Math.max(entity.size.x, entity.size.y);
    const blend = renderer.supports('blendModes') ? 'additive' : undefined;

    renderer.drawArc({
      x: pos.x, y: pos.y, radius: reach * 0.7,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: reach * 0.7,
        stops: [{ offset: 0, color: this.color }, { offset: 1, color: 'rgba(255, 255, 255, 0)' }]
      },
      globalAlpha: (1 - t) * (1 - t) * 0.85,
      blend
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: reach * (0.5 + t * 0.9),
      strokeStyle: this.color,
      lineWidth: 3 * (1 - t) + 0.5,
      globalAlpha: (1 - t) * 0.8,
      blend
    });
  }
}

/** Register both under the names scenes use, marked as the kit's for the editor's catalog. */
export function registerEffects(game: EffectEntity['game']): void {
  game.registerConstraint('AttackSwing', AttackSwing, { origin: 'kit' });
  game.registerConstraint('HitBurst', HitBurst, { origin: 'kit' });
}
