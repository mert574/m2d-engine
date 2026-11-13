import { Entity } from 'm2d-engine/core/entity.js';
import { Interactive } from 'm2d-engine/constraints/interactive.js';
import { s } from 'm2d-engine/core/schema.js';
import { makeRng } from '../shared/rng.js';

/**
 * The playground's parts, drawn as the machine the menu promises.
 *
 * The menu's Galton board is brass pegs and warm balls; here the funnel,
 * splitter and peg field are the same hardware at full size. Each static
 * part is its own actor, so the scene says which it is by the prefab it
 * places (`housing`, `girder`, `peg`) rather than the drawing guessing
 * from the size it was given.
 *
 * Bodies rotate — the girders are mounted at angles, and a flung crate
 * spins — so each draw happens inside a pushTransform at the body's render
 * angle, in local coordinates centred on the body.
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

/**
 * A mounted part of the machine: drawn in its own local frame, at the
 * angle the scene mounted it. What that frame holds is each part's own.
 */
class MachinePart extends Entity {
  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;

    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: this.renderAngle });
    this.drawPart(renderer, this.size.x, this.size.y, pos);
    renderer.popTransform();

    for (const constraint of this.constraints.values()) {
      constraint.draw();
    }
  }
}

export class Peg extends MachinePart {
  name = 'Peg';

  drawPart(renderer, w, h) {
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
  }
}

export class Girder extends MachinePart {
  name = 'Girder';

  drawPart(renderer, w, h) {
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
  }
}

export class Housing extends MachinePart {
  name = 'Housing';

  drawPart(renderer, w, h, pos) {
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

/**
 * What drops new stock into the funnel.
 *
 * The playground is the engine's pointer demo as much as its physics one,
 * so a click on empty space has to mean something. The spout is the piece
 * of the machine that empty space belongs to: a sensor the size of the
 * room, sitting under everything else in the hit test, so a click that
 * misses every ball and crate lands here and a ball appears where the
 * pointer asked. Its `drop` action does the same from the keyboard,
 * dropping into the funnel's mouth.
 *
 * Both queue the spawn for the next tick rather than reaching into the
 * world from the pointer handler, because a body appearing is simulation
 * and belongs on a tick like everything else.
 */
export class Spout extends Entity {
  static properties = {
    dropAction: s.string({ initial: 'drop', description: 'The named action that drops one into the funnel' }),
    spawnSound: s.string({ editor: 'sound', initial: 'spawn', description: 'Played when one drops: a key in assets.sounds' }),
    ballSize: s.number({ positive: true, initial: 32, unit: 'px' }),
    boxSize: s.number({ positive: true, initial: 64, unit: 'px' }),
    inlet: s.object({
      left: s.number({ initial: 120, unit: 'px' }),
      right: s.number({ initial: 840, unit: 'px' }),
      y: s.number({ initial: 40, unit: 'px' })
    }, { description: 'Where a keyboard drop lands: anywhere across the funnel\'s mouth' })
  };

  name = 'Spout';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    // The room's empty space, not part of it: nothing collides with this.
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.visible = false;

    this.dropAction = options.dropAction ?? 'drop';
    this.spawnSound = options.spawnSound ?? 'spawn';
    this.ballSize = options.ballSize ?? 32;
    this.boxSize = options.boxSize ?? 64;
    this.inlet = { left: 120, right: 840, y: 40, ...options.inlet };

    /** Where the pointer has asked for stock since the last tick. */
    this.asked = [];

    this.addConstraint('catch', new Interactive(this, {
      // An explicit area, so this never involves the physics query: the
      // body is a sensor nothing can be over.
      hitArea: { width: this.size.x, height: this.size.y },
      // Under everything: a ball or crate under the pointer wins, and only
      // a click on bare room reaches the spout.
      priority: -100,
      cursor: 'copy',
      // Bound to the entity, like every constraint's callbacks.
      onClick(event) {
        this.asked.push({ x: event.world.x, y: event.world.y });
      }
    }));
  }

  fixedUpdate() {
    if (this.game.actions?.pressed(this.dropAction, this.input)) {
      this.asked.push({
        x: this.game.rng.range(this.inlet.left, this.inlet.right),
        y: this.inlet.y
      });
    }
    for (const at of this.asked.splice(0)) this.#drop(at);
  }

  /** One more ball or crate, as the scene's own prefab describes it. */
  #drop({ x, y }) {
    const scene = this.game.sceneManager.getCurrentScene();
    if (!scene) return;
    const box = this.game.rng.chance(0.5);
    const size = box ? this.boxSize : this.ballSize;
    if (!scene.spawnPrefab(box ? 'box' : 'ball', { x, y, width: size, height: size })) return;
    if (this.spawnSound) this.game.soundManager.playSound(this.spawnSound);
  }

  draw() {}
}
