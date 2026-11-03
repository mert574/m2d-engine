import { Constraint } from 'm2d-engine/core/constraint.js';

/**
 * Combat visuals the demos share, kept out of the engine on purpose.
 *
 * The engine's `Attack` and `DamageFlash` know the rules — reach, damage,
 * invulnerability — but what a swing or a hit *looks like* is a question
 * for the game and its perspective: a side-scroller's slash is not a
 * top-down sweep is not a first-person flash. So these are ordinary
 * constraints that a game adds next to the mechanical ones, and each demo
 * tunes their colour and reach to its own palette.
 */

/**
 * A crescent that sweeps across the facing half when an attack starts and
 * fades as it goes. Wraps the `Attack` constraint's `onStart`, so the two
 * stay in step without the engine knowing about the look.
 *
 * @param {import('m2d-engine/core/entity.js').Entity} entity
 * @param {Object} [options]
 * @param {string} [options.color='#ffffff'] - Arc colour
 * @param {number} [options.duration=0.3] - Seconds the swing is visible
 * @param {number} [options.reach] - Outer radius; defaults to the attack's range
 */
export class AttackSwing extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.color = options.color ?? '#ffffff';
    this.duration = options.duration ?? 0.3;
    this.reach = options.reach ?? null;
    this.time = Infinity;
    this.direction = 1;

    const attack = entity.constraints.get('attack');
    this.attack = attack;
    const onStart = attack.onStart;
    attack.onStart = () => {
      onStart?.();
      this.time = 0;
      this.direction = attack.direction;
    };
  }

  update(deltaTime) {
    this.time += deltaTime;
  }

  draw() {
    const t = this.time / this.duration;
    if (t >= 1) return;

    const renderer = this.entity.game.renderer;
    const pos = this.entity.renderPosition;
    const range = this.reach ?? this.attack.range;
    const facing = this.direction > 0 ? 0 : Math.PI;
    // Eases out: fast at the start of the swing, settling at the end.
    const sweep = 1 - (1 - t) * (1 - t);
    const centre = facing + (sweep - 0.5) * Math.PI * 0.9 * this.direction;
    const halfWidth = Math.PI * 0.22 * (1 - t * 0.5);
    const fade = 1 - t;
    const blend = renderer.supports('blendModes') ? 'additive' : undefined;

    const inner = range * 0.45;
    const outer = range * (0.85 + 0.15 * sweep);
    const points = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const a = centre - halfWidth + (i / steps) * halfWidth * 2;
      points.push({ x: pos.x + Math.cos(a) * outer, y: pos.y + Math.sin(a) * outer });
    }
    for (let i = steps; i >= 0; i--) {
      const a = centre - halfWidth + (i / steps) * halfWidth * 2;
      points.push({ x: pos.x + Math.cos(a) * inner, y: pos.y + Math.sin(a) * inner });
    }
    renderer.drawPath({ points, closed: true, fillStyle: this.color, globalAlpha: 0.45 * fade, blend });
    // The leading edge, brighter and thinner.
    renderer.drawPath({
      points: points.slice(0, steps + 1),
      strokeStyle: this.color, lineWidth: 2, globalAlpha: 0.9 * fade, blend
    });
  }
}

/**
 * A burst where an entity was hit: a flash over it that fades fast, and a
 * ring that leaves it. Call `flash()` from a `Health` `onDamage` handler,
 * or pass `hook: true` to wrap the entity's existing handler.
 *
 * @param {import('m2d-engine/core/entity.js').Entity} entity
 * @param {Object} [options]
 * @param {string} [options.color='#fff3e6'] - Flash and ring colour
 * @param {number} [options.duration=0.3] - Seconds the burst is visible
 * @param {number} [options.radius] - Ring reach; defaults to the entity's size
 * @param {boolean} [options.hook=false] - Wrap the Health constraint's `onDamage`
 */
export class HitBurst extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.color = options.color ?? '#fff3e6';
    this.duration = options.duration ?? 0.3;
    this.radius = options.radius ?? null;
    this.timeLeft = 0;

    if (options.hook) {
      const health = entity.constraints.get('health');
      const onDamage = health.onDamage;
      health.onDamage = (amount) => {
        onDamage?.(amount);
        this.flash();
      };
    }
  }

  flash() {
    this.timeLeft = this.duration;
  }

  update(deltaTime) {
    if (this.timeLeft > 0) this.timeLeft -= deltaTime;
  }

  draw() {
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
