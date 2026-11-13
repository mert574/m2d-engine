import { Constraint } from 'm2d-engine/core/constraint.js';
import { s } from 'm2d-engine/core/schema.js';

/**
 * The scanner's echo: every `period` seconds a ring leaves from wherever
 * the entity stands and spreads to `range`, with a fainter ring a beat
 * behind it, the way the menu's sweep leaves a trail. The ring does not
 * follow its sender, like a real ping.
 *
 * Presentation: timed on frame time and drawn with the entity, never in
 * the tick, so it costs the simulation nothing and runs nowhere headless.
 */
export class Sonar extends Constraint {
  static description = 'A ring echoing out from the entity every few seconds';
  static params = {
    period: s.number({ initial: 3.2, positive: true, unit: 's', description: 'Seconds between echoes' }),
    range: s.number({ initial: 460, positive: true, unit: 'px', description: 'How far an echo reaches' }),
    color: s.string({ editor: 'color', initial: 'rgba(50, 110, 170, 0.7)' }),
    seconds: s.number({ initial: 1.6, positive: true, unit: 's', description: 'How long a ring takes to reach its range' })
  };

  constructor(entity, options = {}) {
    super(entity);
    this.period = options.period ?? 3.2;
    this.range = options.range ?? 460;
    this.color = options.color ?? 'rgba(50, 110, 170, 0.7)';
    this.seconds = options.seconds ?? 1.6;
    this.time = 0;
    this.ping = { at: 0, x: 0, y: 0 };
  }

  update(deltaTime) {
    this.time += deltaTime;
    const entity = this.entity;
    if (entity.dead || this.time - this.ping.at < this.period) return;
    const { x, y } = entity.position;
    this.ping = { at: this.time, x, y };
  }

  draw() {
    const renderer = this.entity.game.renderer;
    const blend = renderer.supports('blendModes') ? 'additive' : undefined;
    const age = this.time - this.ping.at;
    for (const lag of [0, 0.35]) {
      const t = (age - lag) / this.seconds;
      if (t <= 0 || t >= 1) continue;
      renderer.drawArc({
        x: this.ping.x, y: this.ping.y,
        radius: 24 + t * this.range,
        strokeStyle: this.color,
        lineWidth: 2 - t,
        globalAlpha: (1 - t) * (lag === 0 ? 0.5 : 0.25),
        blend
      });
    }
  }
}
