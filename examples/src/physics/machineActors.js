import { Entity } from 'm2d-engine/core/entity.js';
import { makeRng } from '../shared/rng.js';

/**
 * The playground's parts, drawn as the machine the menu promises.
 *
 * The menu's Galton board is brass pegs and warm balls; here the funnel,
 * splitter and peg field are the same hardware at full size. The static
 * parts tell each other apart by their shape: the room-sized rectangles are
 * the housing, the 32px squares are pegs, everything else is a girder.
 *
 * Bodies rotate — the ramps are mounted at angles, and a flung crate spins —
 * so each draw happens inside a pushTransform at the body's render angle,
 * in local coordinates centred on the body.
 */

/** A seed that is stable for an entity across reloads: where it stands. */
function seedFrom(position) {
  return (Math.round(position.x) * 92821 + Math.round(position.y) * 31337) % 2147483647;
}

/**
 * Everything in the room hangs under one lamp, so every shadow leans away
 * from it: straight down beneath the lamp, splayed outward at the walls.
 * One consistent shadow direction is most of what "lit by that lamp" means.
 */
function lampShadow(entity, strength = 0.38) {
  const pos = entity.renderPosition;
  const lampX = entity.game.options.worldWidth / 2;
  return {
    color: `rgba(0, 0, 0, ${strength})`,
    blur: 10,
    offsetX: (pos.x - lampX) * 0.035,
    offsetY: 8 + pos.y * 0.006
  };
}

/** Shared halo for whatever the pointer is holding. */
function drawGrabHalo(renderer, entity, radius, blend) {
  const grab = entity.constraints?.get('grab');
  if (!grab?.isDragging) return;
  const pos = entity.renderPosition;
  renderer.drawArc({
    x: pos.x, y: pos.y, radius,
    fillStyle: {
      type: 'radial', x: pos.x, y: pos.y, r0: radius * 0.5, r1: radius,
      stops: [
        { offset: 0, color: 'rgba(255, 220, 160, 0)' },
        { offset: 0.7, color: 'rgba(255, 220, 160, 0.25)' },
        { offset: 1, color: 'rgba(255, 220, 160, 0)' }
      ]
    },
    blend
  });
}

export class MachineRamp extends Entity {
  name = 'Ramp';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    const w = this.size.x;
    const h = this.size.y;
    this.kind = (w >= 600 || h >= 600) ? 'housing' : (w <= 40 && h <= 40) ? 'peg' : 'girder';
  }

  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const w = this.size.x;
    const h = this.size.y;

    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: this.renderAngle });

    if (this.kind === 'peg') {
      // A brass boss. The body is a rotated square; drawn soft-cornered so
      // the diamond reads as machined, not as a tile on its corner.
      renderer.drawRect({
        x: -w / 2, y: -h / 2, width: w, height: h,
        fillStyle: {
          type: 'linear', x0: 0, y0: -h / 2, x1: 0, y1: h / 2,
          stops: [
            { offset: 0, color: '#c98f52' },
            { offset: 0.5, color: '#8a5a2a' },
            { offset: 1, color: '#4e3014' }
          ]
        },
        cornerRadius: 5,
        shadow: lampShadow(this, 0.32)
      });
      renderer.drawRect({
        x: -w / 2 + 1, y: -h / 2 + 1, width: w - 2, height: h - 2,
        strokeStyle: 'rgba(255, 217, 168, 0.4)', lineWidth: 1.2,
        cornerRadius: 4
      });
      renderer.drawArc({
        x: 0, y: 0, radius: 4.5,
        fillStyle: {
          type: 'radial', x: -1, y: -1, r0: 0, r1: 5,
          stops: [
            { offset: 0, color: '#ffd9a8' },
            { offset: 1, color: '#6e4521' }
          ]
        }
      });
    } else if (this.kind === 'girder') {
      // A mounted rail: a dark web between two brass flanges, riveted.
      renderer.drawRect({
        x: -w / 2, y: -h / 2, width: w, height: h,
        fillStyle: {
          type: 'linear', x0: 0, y0: -h / 2, x1: 0, y1: h / 2,
          stops: [
            { offset: 0, color: '#3a3542' },
            { offset: 1, color: '#211d2a' }
          ]
        },
        cornerRadius: 3,
        shadow: lampShadow(this, 0.3)
      });
      renderer.drawRect({
        x: -w / 2, y: -h / 2, width: w, height: 4,
        fillStyle: {
          type: 'linear', x0: 0, y0: -h / 2, x1: 0, y1: -h / 2 + 4,
          stops: [
            { offset: 0, color: '#e8b876' },
            { offset: 1, color: '#9a6a36' }
          ]
        },
        cornerRadius: 2
      });
      renderer.drawRect({
        x: -w / 2, y: h / 2 - 3, width: w, height: 3,
        fillStyle: '#120f18',
        cornerRadius: 1.5
      });
      const rivets = Math.max(2, Math.round(w / 72));
      for (let i = 0; i < rivets; i++) {
        const x = -w / 2 + (i + 0.5) * (w / rivets);
        renderer.drawArc({
          x, y: 1, radius: 2.2,
          fillStyle: '#55492f'
        });
        renderer.drawArc({
          x: x - 0.6, y: 0.4, radius: 1,
          fillStyle: '#d8b682'
        });
      }
    } else {
      // The housing: walls and floor of the rig, lit along the inner edge.
      const vertical = h > w;
      const innerSign = vertical ? (pos.x < this.game.options.worldWidth / 2 ? 1 : -1) : -1;
      renderer.drawRect({
        x: -w / 2, y: -h / 2, width: w, height: h,
        fillStyle: {
          type: 'linear',
          x0: vertical ? innerSign * w / 2 : 0,
          y0: vertical ? 0 : innerSign * h / 2,
          x1: vertical ? -innerSign * w / 2 : 0,
          y1: vertical ? 0 : -innerSign * h / 2,
          stops: [
            { offset: 0, color: '#78705f' },
            { offset: 1, color: '#453f33' }
          ]
        }
      });
      // The inner lip, catching the lamp.
      renderer.drawRect({
        x: vertical ? innerSign * (w / 2) - (innerSign > 0 ? 2.5 : 0) : -w / 2,
        y: vertical ? -h / 2 : innerSign * (h / 2) - (innerSign > 0 ? 2.5 : 0),
        width: vertical ? 2.5 : w,
        height: vertical ? h : 2.5,
        fillStyle: 'rgba(255, 220, 170, 0.5)'
      });
    }

    renderer.popTransform();

    for (const constraint of this.constraints.values()) {
      constraint.draw();
    }
  }
}

export class AmberBall extends Entity {
  name = 'Ball';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.blend = game.renderer.supports('blendModes') ? 'additive' : undefined;
  }

  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const r = this.size.x / 2;

    drawGrabHalo(renderer, this, r * 2.6, this.blend);

    renderer.drawArc({
      x: pos.x, y: pos.y, radius: r,
      fillStyle: {
        type: 'radial',
        x: pos.x - r * 0.35, y: pos.y - r * 0.4, r0: 0, r1: r * 1.5,
        stops: [
          { offset: 0, color: '#ffe8c2' },
          { offset: 0.45, color: '#e8a854' },
          { offset: 1, color: '#6e3f14' }
        ]
      },
      shadow: lampShadow(this)
    });
    // A seam dot riding the rim is what makes the spin visible on a sphere.
    const angle = this.renderAngle;
    renderer.drawArc({
      x: pos.x + Math.cos(angle) * r * 0.62,
      y: pos.y + Math.sin(angle) * r * 0.62,
      radius: r * 0.16,
      fillStyle: 'rgba(80, 44, 10, 0.55)'
    });
    renderer.drawArc({
      x: pos.x - r * 0.3, y: pos.y - r * 0.35, radius: r * 0.22,
      fillStyle: 'rgba(255, 248, 230, 0.85)'
    });

    for (const constraint of this.constraints.values()) {
      constraint.draw();
    }
  }
}

export class WoodCrate extends Entity {
  name = 'Box';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.blend = game.renderer.supports('blendModes') ? 'additive' : undefined;
    this.grain = makeRng(seedFrom(body.position))();
  }

  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const w = this.size.x;
    const h = this.size.y;

    drawGrabHalo(renderer, this, Math.max(w, h) * 1.3, this.blend);

    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: this.renderAngle });

    renderer.drawRect({
      x: -w / 2, y: -h / 2, width: w, height: h,
      fillStyle: {
        type: 'linear', x0: -w / 2, y0: -h / 2, x1: w / 2, y1: h / 2,
        stops: [
          { offset: 0, color: '#9a6836' },
          { offset: 0.5, color: '#7c5126' },
          { offset: 1, color: '#55351a' }
        ]
      },
      cornerRadius: 3,
      shadow: lampShadow(this)
    });
    // Planks.
    for (let i = 1; i < 3; i++) {
      renderer.drawLine({
        x1: -w / 2 + 4, y1: -h / 2 + (h * i) / 3,
        x2: w / 2 - 4, y2: -h / 2 + (h * i) / 3,
        strokeStyle: 'rgba(40, 22, 8, 0.5)', lineWidth: 1.5
      });
    }
    // The frame and its corner brackets.
    renderer.drawRect({
      x: -w / 2 + 2, y: -h / 2 + 2, width: w - 4, height: h - 4,
      strokeStyle: 'rgba(52, 30, 12, 0.8)', lineWidth: 3,
      cornerRadius: 2
    });
    renderer.drawRect({
      x: -w / 2 + 2, y: -h / 2 + 2, width: w - 4, height: 2,
      fillStyle: 'rgba(255, 210, 150, 0.25)'
    });
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      renderer.drawArc({
        x: sx * (w / 2 - 7), y: sy * (h / 2 - 7), radius: 2,
        fillStyle: '#c9a36a'
      });
    }

    renderer.popTransform();

    for (const constraint of this.constraints.values()) {
      constraint.draw();
    }
  }
}
