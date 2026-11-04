import { Abilities } from 'm2d-engine/constraints/abilities.js';

/**
 * The knight's three abilities, on the engine's `Abilities` constraint.
 *
 *   1  Cleave        A full turn of the sword: every enemy within reach
 *                    takes damage and is thrown back. 5 s cooldown.
 *   2  Dash          A burst of speed along the heading for a third of a
 *                    second, through the dead. 4 s cooldown.
 *   3  Ember Shield  Embers circle the knight for 6 s: no damage taken,
 *                    and whatever touches them burns. 15 s cooldown.
 */
const CLEAVE_RADIUS = 120;
const CLEAVE_DAMAGE = 45;
const DASH_SPEED = 560;
const DASH_TIME = 0.32;
const SHIELD_TIME = 6;
const SHIELD_RADIUS = 70;
const SHIELD_DAMAGE = 12;

const distance = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);

export function knightAbilities(knight, effects) {
  return new Abilities(knight, {
    canCast: () => !knight.dead,
    abilities: [
      {
        id: 'cleave', key: 'Digit1', label: 'Cleave', cooldown: 5, color: '#ffd27a',
        cast(entity) {
          const game = entity.game;
          for (const other of game.entities) {
            if (other.name !== 'Ghost' || other.dead) continue;
            const d = distance(entity, other);
            if (d > CLEAVE_RADIUS) continue;
            other.getConstraint('health')?.takeDamage(CLEAVE_DAMAGE);
            const nx = (other.position.x - entity.position.x) / (d || 1);
            const ny = (other.position.y - entity.position.y) / (d || 1);
            other.body.setVelocity({ x: nx * 420, y: ny * 420 });
          }
          effects.flashes.push({ kind: 'cleave', t: 0, duration: 0.45 });
          entity.setDirectionalAnimation('swing', entity.heading);
          entity.animTime = 0;
          entity.swingHold = 0.3;
          game.soundManager.playSound('attack');
        }
      },
      {
        id: 'dash', key: 'Digit2', label: 'Dash', cooldown: 4, color: '#bfeaff',
        cast(entity) {
          effects.dashLeft = DASH_TIME;
          effects.flashes.push({ kind: 'dash', t: 0, duration: 0.4 });
          entity.getConstraint('walk')?.stop();
          entity.game.soundManager.playSound('dash');
        }
      },
      {
        id: 'emberShield', key: 'Digit3', label: 'Ember Shield', cooldown: 15, color: '#ff9a4a',
        cast(entity) {
          effects.shieldLeft = SHIELD_TIME;
          entity.setDirectionalAnimation('cast', entity.heading);
          entity.animTime = 0;
          entity.swingHold = 0.4;
          entity.game.soundManager.playSound('shield');
        }
      }
    ]
  });
}

/** The abilities' effect on the world each tick. */
export function tickAbilities(knight, effects, dt) {
  if (effects.dashLeft > 0) {
    effects.dashLeft -= dt;
    const scale = knight.game.projection?.groundSpeedScale(Math.cos(knight.heading), Math.sin(knight.heading)) ?? 1;
    knight.body.setVelocity({ x: Math.cos(knight.heading) * DASH_SPEED * scale, y: Math.sin(knight.heading) * DASH_SPEED * scale });
    const health = knight.getConstraint('health');
    if (health) health.invulnerableTime = Math.max(health.invulnerableTime, dt * 2);
  }
  if (effects.shieldLeft > 0) {
    effects.shieldLeft -= dt;
    const health = knight.getConstraint('health');
    if (health) health.invulnerableTime = Math.max(health.invulnerableTime, dt * 2);
    effects.shieldTick = (effects.shieldTick ?? 0) - dt;
    if (effects.shieldTick <= 0) {
      effects.shieldTick = 0.4;
      for (const other of knight.game.entities) {
        if (other.name !== 'Ghost' || other.dead) continue;
        if (distance(knight, other) < SHIELD_RADIUS + other.size.x / 2) {
          other.getConstraint('health')?.takeDamage(SHIELD_DAMAGE);
          const d = distance(knight, other) || 1;
          other.body.setVelocity({ x: ((other.position.x - knight.position.x) / d) * 300, y: ((other.position.y - knight.position.y) / d) * 300 });
        }
      }
    }
  }
}

export function tickFlashes(effects, deltaTime) {
  for (const f of effects.flashes) f.t += deltaTime;
  effects.flashes = effects.flashes.filter(f => f.t < f.duration);
}

/** Drawn on the floor under the knight: the shield's ring and the cleave's sweep. */
export function drawUnder(knight, effects) {
  const renderer = knight.game.renderer;
  const projection = knight.game.projection;
  const a = knight.renderAnchor;
  const blend = knight.blend;
  const t = knight.game.time.elapsed;
  if (effects.shieldLeft > 0) {
    const fade = Math.min(1, effects.shieldLeft / 0.6);
    renderer.pushTransform({ x: a.x, y: a.y, scaleX: 1, scaleY: 0.5 });
    renderer.drawArc({ x: 0, y: 0, radius: SHIELD_RADIUS, strokeStyle: `rgba(255, 160, 80, ${0.6 * fade})`, lineWidth: 2 });
    renderer.popTransform();
  }
  for (const f of effects.flashes) {
    const k = f.t / f.duration;
    if (f.kind === 'cleave') {
      const r = CLEAVE_RADIUS * (0.4 + 0.6 * Math.sqrt(k));
      renderer.pushTransform({ x: a.x, y: a.y, scaleX: 1, scaleY: 0.5 });
      renderer.drawArc({ x: 0, y: 0, radius: r, strokeStyle: `rgba(255, 230, 180, ${0.9 * (1 - k)})`, lineWidth: 6 * (1 - k) + 1 });
      renderer.drawArc({
        x: 0, y: 0, radius: r,
        fillStyle: { type: 'radial', x: 0, y: 0, r0: r * 0.5, r1: r, stops: [{ offset: 0, color: 'rgba(255, 200, 120, 0)' }, { offset: 1, color: `rgba(255, 200, 120, ${0.35 * (1 - k)})` }] },
        blend
      });
      renderer.popTransform();
    } else if (f.kind === 'dash') {
      const back = projection ? projection.screenAngle(knight.heading + Math.PI) : knight.heading + Math.PI;
      for (let i = 1; i <= 4; i++) {
        const d = i * 22 * (1 - k * 0.5);
        renderer.drawArc({ x: a.x + Math.cos(back) * d, y: a.y - 40 + Math.sin(back) * d, radius: 16 - i * 2.5, fillStyle: `rgba(191, 234, 255, ${0.35 * (1 - k) / i})`, blend });
      }
    }
  }
}

/** Drawn over the knight: the circling embers. */
export function drawOver(knight, effects) {
  if (effects.shieldLeft <= 0) return;
  const renderer = knight.game.renderer;
  const a = knight.renderAnchor;
  const t = knight.game.time.elapsed;
  const fade = Math.min(1, effects.shieldLeft / 0.6);
  for (let i = 0; i < 5; i++) {
    const ang = t * 3 + (i / 5) * Math.PI * 2;
    const x = a.x + Math.cos(ang) * SHIELD_RADIUS;
    const y = a.y - 44 + Math.sin(ang) * SHIELD_RADIUS * 0.5;
    renderer.drawArc({ x, y, radius: 14, fillStyle: { type: 'radial', x, y, r0: 0, r1: 14, stops: [{ offset: 0, color: `rgba(255, 170, 90, ${0.5 * fade})` }, { offset: 1, color: 'rgba(255, 170, 90, 0)' }] }, blend: knight.blend });
    renderer.drawArc({ x, y, radius: 4, fillStyle: `rgba(255, 240, 200, ${fade})` });
    if (knight.lit) renderer.drawLight({ x, y, radius: 90, color: '#ff9a4a', intensity: 0.5 * fade, z: 30 });
  }
}
