import { Abilities } from 'm2d-engine/constraints/abilities.js';

/**
 * The walker's three abilities, on the number keys, built on the engine's
 * `Abilities` constraint: it owns the keys, cooldowns and locks, and this
 * file owns what each one does and what it looks like.
 *
 *   1  Flare   A burst of lantern light: every wisp nearby takes damage and
 *              is thrown back. 6 s cooldown.
 *   2  Blink   A short step through the dark, forward along the heading,
 *              stopped short of anything solid. 4 s cooldown.
 *   3  Ward    A ring that pushes wisps away and keeps the walker safe for
 *              5 s. 14 s cooldown. Oswin teaches it.
 */
const FLARE_RADIUS = 200;
const FLARE_DAMAGE = 50;
const BLINK_DISTANCE = 190;
export const WARD_RADIUS = 210;
const WARD_DURATION = 5;

const distance = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);

export function groveAbilities(entity, effects) {
  return new Abilities(entity, {
    canCast: () => !entity.frozen,
    abilities: [
      {
        id: 'flare', key: 'Digit1', label: 'Flare', cooldown: 6, color: '#ffd27a',
        cast(walker) {
          const game = walker.game;
          const origin = walker.position;
          for (const other of game.entities) {
            if (other.name !== 'Ghost' || other.dead) continue;
            const d = distance(walker, other);
            if (d > FLARE_RADIUS) continue;
            other.getConstraint('health')?.takeDamage(FLARE_DAMAGE);
            const nx = (other.position.x - origin.x) / (d || 1);
            const ny = (other.position.y - origin.y) / (d || 1);
            other.body.setVelocity({ x: nx * 520, y: ny * 520 });
            other.repelled = Math.max(other.repelled ?? 0, 0.6);
          }
          effects.flashes.push({ kind: 'flare', x: origin.x, y: origin.y, t: 0, duration: 0.5 });
          game.soundManager.playSound('flare');
        }
      },
      {
        id: 'blink', key: 'Digit2', label: 'Blink', cooldown: 4, color: '#bfeaff',
        cast(walker) {
          const game = walker.game;
          const body = walker.body;
          const from = body.position;
          const dir = { x: Math.cos(walker.heading), y: Math.sin(walker.heading) };
          const to = { x: from.x + dir.x * BLINK_DISTANCE, y: from.y + dir.y * BLINK_DISTANCE };
          const hits = game.physics.raycast(from, to, (other) => other !== body && !other.isSensor && other.entity?.name !== 'Ghost');
          let reach = BLINK_DISTANCE;
          if (hits.length) reach = Math.max(0, hits[0].distance - body.size.x);
          const landing = { x: from.x + dir.x * reach, y: from.y + dir.y * reach };
          effects.flashes.push({ kind: 'blink', x: from.x, y: from.y, x2: landing.x, y2: landing.y, t: 0, duration: 0.35 });
          body.setPosition(landing);
          game.soundManager.playSound('blink');
        }
      },
      {
        id: 'ward', key: 'Digit3', label: 'Ward', cooldown: 14, color: '#c9ffb8', locked: true,
        cast(walker) {
          effects.wardLeft = WARD_DURATION;
          walker.game.soundManager.playSound('ward');
        }
      }
    ]
  });
}

/** The ward's effect on the world each tick: repel wisps, keep the walker safe. */
export function tickWard(walker, effects, dt) {
  if (effects.wardLeft <= 0) return;
  effects.wardLeft -= dt;
  const health = walker.getConstraint('health');
  if (health) health.invulnerableTime = Math.max(health.invulnerableTime, dt * 2);
  for (const other of walker.game.entities) {
    if (other.name !== 'Ghost' || other.dead) continue;
    if (distance(walker, other) < WARD_RADIUS) other.repelled = Math.max(other.repelled ?? 0, 0.4);
  }
}

/** Effects on the ground, drawn before the walker. */
export function drawWardUnder(walker, effects) {
  if (effects.wardLeft <= 0) return;
  const renderer = walker.game.renderer;
  const blend = walker.blend;
  const pos = walker.body.renderPosition;
  const fade = Math.min(1, effects.wardLeft / 0.6);
  const t = walker.game.time.elapsed;
  renderer.pushTransform({ x: pos.x, y: pos.y + walker.body.size.y / 2, scaleX: 1, scaleY: 0.45 });
  renderer.drawArc({ x: 0, y: 0, radius: WARD_RADIUS, strokeStyle: `rgba(201, 255, 184, ${0.7 * fade})`, lineWidth: 3 });
  renderer.drawArc({
    x: 0, y: 0, radius: WARD_RADIUS,
    fillStyle: { type: 'radial', x: 0, y: 0, r0: WARD_RADIUS * 0.6, r1: WARD_RADIUS, stops: [{ offset: 0, color: 'rgba(201, 255, 184, 0)' }, { offset: 1, color: `rgba(201, 255, 184, ${0.22 * fade})` }] },
    blend
  });
  for (let i = 0; i < 8; i++) {
    const a = t * 1.2 + (i / 8) * Math.PI * 2;
    renderer.drawArc({ x: Math.cos(a) * WARD_RADIUS, y: Math.sin(a) * WARD_RADIUS, radius: 5, fillStyle: `rgba(230, 255, 220, ${fade})`, blend });
  }
  renderer.popTransform();
}

/** Flashes left by casts, drawn over the walker. */
export function drawFlashes(walker, effects) {
  const renderer = walker.game.renderer;
  const blend = walker.blend;
  for (const flash of effects.flashes) {
    const k = flash.t / flash.duration;
    if (flash.kind === 'flare') {
      const r = FLARE_RADIUS * (0.3 + 0.7 * Math.sqrt(k));
      renderer.drawArc({
        x: flash.x, y: flash.y, radius: r,
        fillStyle: { type: 'radial', x: flash.x, y: flash.y, r0: 0, r1: r, stops: [{ offset: 0, color: `rgba(255, 230, 170, ${0.5 * (1 - k)})` }, { offset: 0.7, color: `rgba(255, 190, 110, ${0.3 * (1 - k)})` }, { offset: 1, color: 'rgba(255, 190, 110, 0)' }] },
        blend
      });
      renderer.drawArc({ x: flash.x, y: flash.y, radius: r, strokeStyle: `rgba(255, 240, 200, ${0.8 * (1 - k)})`, lineWidth: 4 * (1 - k) + 1 });
      if (walker.lit) renderer.drawLight({ x: flash.x, y: flash.y, radius: r * 2, color: '#ffd27a', intensity: 1.6 * (1 - k), z: 30 });
    } else {
      renderer.drawLine({ x1: flash.x, y1: flash.y, x2: flash.x2, y2: flash.y2, strokeStyle: `rgba(191, 234, 255, ${0.7 * (1 - k)})`, lineWidth: 10 * (1 - k) + 1, blend });
      renderer.drawArc({ x: flash.x, y: flash.y, radius: 26 * (1 - k) + 4, fillStyle: `rgba(191, 234, 255, ${0.5 * (1 - k)})`, blend });
    }
  }
}

export function tickFlashes(effects, deltaTime) {
  for (const flash of effects.flashes) flash.t += deltaTime;
  effects.flashes = effects.flashes.filter(f => f.t < f.duration);
}
