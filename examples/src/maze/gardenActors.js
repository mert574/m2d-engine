import { Entity } from 'm2d-engine/core/entity.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { s } from 'm2d-engine/core/schema.js';
import { tileTexture } from '../shared/textures.js';

/**
 * The garden's cast: the hedges, the gardener who walks them, the
 * fountain at the far end and the flower beds at the dead ends.
 *
 * The courts themselves are scene files (`scenes/court*.json`, laid out
 * once by `scripts/buildCourtScenes.mjs`), so what is here is behaviour
 * and drawing only. What each actor is worth — how fast the gardener
 * walks, what a bed is seeded with — is a declared property or a
 * constraint param the scene sets.
 */

/** Daisies bloom this far apart along the walked path, in px. */
const TRAIL_SPACING = 22;
/** And this many at most, oldest mown first. */
const TRAIL_LIMIT = 600;

/**
 * A hedge, in texture, in the sun. The moss tiles at its own scale (see
 * `tileTexture`); the sun comes from the top of the screen, so the top edge
 * catches light, the bottom edge sits in its own leaves, and a soft shadow
 * falls onto the lawn below.
 */
export class HedgeWall extends Platform {
  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const w = this.size.x;
    const h = this.size.y;
    const left = pos.x - w / 2;
    const top = pos.y - h / 2;

    // A soft cast shadow: two offset layers read as one blurred edge.
    renderer.drawRect({
      x: left + 5, y: top + 7, width: w, height: h,
      fillStyle: 'rgba(30, 48, 26, 0.18)'
    });
    renderer.drawRect({
      x: left + 3, y: top + 4, width: w, height: h,
      fillStyle: 'rgba(30, 48, 26, 0.22)'
    });
    tileTexture(renderer, this.sprite?.image, { x: left, y: top, width: w, height: h }, 128);
    // Gradient edges, not flat strips: the sun falls off the top of the
    // hedge and its underside sinks into its own leaves, which is what
    // makes a flat texture read as a clipped block with a rounded crown.
    renderer.drawRect({
      x: left + 1, y: top + 0.5, width: w - 2, height: 7,
      fillStyle: {
        type: 'linear', x0: 0, y0: top, x1: 0, y1: top + 7.5,
        stops: [{ offset: 0, color: 'rgba(255, 248, 205, 0.3)' }, { offset: 1, color: 'rgba(255, 248, 205, 0)' }]
      }
    });
    renderer.drawRect({
      x: left + 1, y: top + h - 9, width: w - 2, height: 9,
      fillStyle: {
        type: 'linear', x0: 0, y0: top + h - 9, x1: 0, y1: top + h,
        stops: [{ offset: 0, color: 'rgba(12, 28, 10, 0)' }, { offset: 1, color: 'rgba(12, 28, 10, 0.5)' }]
      }
    });
    renderer.drawRect({
      x: left, y: top + 1, width: 4, height: h - 2,
      fillStyle: {
        type: 'linear', x0: left, y0: 0, x1: left + 4, y1: 0,
        stops: [{ offset: 0, color: 'rgba(20, 40, 18, 0.35)' }, { offset: 1, color: 'rgba(20, 40, 18, 0)' }]
      }
    });
    renderer.drawRect({
      x: left + w - 4, y: top + 1, width: 4, height: h - 2,
      fillStyle: {
        type: 'linear', x0: left + w - 4, y0: 0, x1: left + w, y1: 0,
        stops: [{ offset: 0, color: 'rgba(20, 40, 18, 0)' }, { offset: 1, color: 'rgba(20, 40, 18, 0.35)' }]
      }
    });
  }
}

/**
 * The gardener: a straw hat seen from above, leaving daisies in the lawn
 * behind it. How they walk — one press and they keep going, turns
 * buffered at the junctions — is the engine's `GlideControl`, which the
 * court's player prefab attaches and tunes; the trail is the maze aid —
 * the courts you have walked are the courts in bloom.
 */
export class Gardener extends Entity {
  name = 'Player';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.clock = 0;
    /** @type {Array<{x: number, y: number, t: number, k: number}>} */
    this.trail = [];
  }

  resetTrail() {
    this.trail = [];
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;

    const pos = this.position;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > TRAIL_SPACING) {
      this.trail.push({ x: pos.x, y: pos.y, t: this.clock, k: this.trail.length });
      if (this.trail.length > TRAIL_LIMIT) this.trail.shift();
    }
  }

  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;

    // The daisies: five white petals round a gold eye, blooming in over a
    // moment, swaying a little once grown.
    for (const daisy of this.trail) {
      const age = this.clock - daisy.t;
      const grown = Math.min(1, age / 0.7);
      const sway = Math.sin(this.clock * 1.3 + daisy.k * 2.1) * 0.6;
      const radius = 2.1 * grown;
      for (let petal = 0; petal < 5; petal++) {
        const angle = daisy.k * 1.7 + petal * (Math.PI * 2 / 5);
        renderer.drawArc({
          x: daisy.x + sway + Math.cos(angle) * 2.6 * grown,
          y: daisy.y + Math.sin(angle) * 2.6 * grown,
          radius,
          fillStyle: '#fdf8ee',
          globalAlpha: 0.85 * grown
        });
      }
      renderer.drawArc({
        x: daisy.x + sway, y: daisy.y, radius: 1.5 * grown,
        fillStyle: '#edb63e', globalAlpha: grown
      });
    }

    // The gardener: a shadow, shoulders in denim, and the hat — brim, band
    // and crown — bobbing with the walk.
    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.y);
    const bob = speed > 10 ? Math.sin(this.clock * 11) * 1.2 : 0;
    renderer.drawArc({ x: pos.x + 3, y: pos.y + 4, radius: 12, fillStyle: 'rgba(28, 46, 24, 0.35)' });
    renderer.drawArc({ x: pos.x, y: pos.y, radius: 10, fillStyle: '#4e6e95' });
    renderer.drawArc({
      x: pos.x, y: pos.y + bob, radius: 11.5,
      fillStyle: {
        type: 'radial', x: pos.x - 3, y: pos.y + bob - 3, r0: 0, r1: 12,
        stops: [{ offset: 0, color: '#f0d890' }, { offset: 1, color: '#d4b05e' }]
      }
    });
    renderer.drawArc({
      x: pos.x, y: pos.y + bob, radius: 11.5,
      strokeStyle: 'rgba(130, 96, 36, 0.55)', lineWidth: 1.2, fill: false
    });
    renderer.drawArc({ x: pos.x, y: pos.y + bob, radius: 5.5, fillStyle: '#e3c274' });
    renderer.drawArc({
      x: pos.x, y: pos.y + bob, radius: 5.8,
      strokeStyle: '#a0543c', lineWidth: 2, fill: false
    });

    for (const constraint of this.constraints.values()) {
      constraint.draw();
    }
  }
}

/**
 * The fountain at the far end of a map. Touching it finishes the map,
 * which the court's rules answer with the send-off and the glide to the
 * next court — or, after the last map, back out to the garden plan.
 */
export class Fountain extends Entity {
  name = 'Fountain';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.clock = 0;
    this.triggered = false;
  }

  /** Asked when drawing: a headless game has no renderer to ask at construction. */
  get lit() { return this.game.renderer.supports('lights'); }

  /**
   * The map is walked. The simulation only says so; the court's notify
   * rule holds the send-off, the chime and the way to the next court,
   * because which court follows this one is the scene's to know.
   */
  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (this.triggered || other.entity?.name !== 'Player') return;
    this.triggered = true;
    this.game.players.local?.notify('fountain');
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
  }

  draw() {
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const image = this.sprite?.image;

    // The basin is baked travertine (see textures/fountain.png); the engine
    // only animates its water: a shifting sheen, ripples on their way out,
    // and the jet's sparkle turning over the surface.
    renderer.drawArc({ x: pos.x + 3, y: pos.y + 4, radius: 38, fillStyle: 'rgba(30, 48, 26, 0.35)' });
    if (image && image.width) {
      renderer.drawSprite({
        image, x: pos.x, y: pos.y,
        tileWidth: image.width, tileHeight: image.height,
        width: 80, height: 80
      });
    }
    const sheen = Math.sin(this.clock * 0.9);
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 26,
      fillStyle: {
        type: 'radial', x: pos.x + sheen * 5, y: pos.y - 4, r0: 0, r1: 26,
        stops: [{ offset: 0, color: 'rgba(190, 230, 242, 0.55)' }, { offset: 1, color: 'rgba(95, 163, 196, 0.25)' }]
      }
    });
    for (let i = 0; i < 2; i++) {
      const phase = (this.clock * 0.45 + i * 0.5) % 1;
      renderer.drawArc({
        x: pos.x, y: pos.y, radius: 4 + phase * 17,
        strokeStyle: '#e8f6fc', lineWidth: 1.5, fill: false,
        globalAlpha: (1 - phase) * 0.6
      });
    }
    for (let i = 0; i < 3; i++) {
      const angle = this.clock * 1.4 + i * (Math.PI * 2 / 3);
      renderer.drawArc({
        x: pos.x + Math.cos(angle) * 12,
        y: pos.y + Math.sin(angle) * 12,
        radius: 1.8,
        fillStyle: '#ffffff',
        globalAlpha: 0.8
      });
    }
    const spout = 0.85 + 0.15 * Math.sin(this.clock * 6);
    renderer.drawArc({ x: pos.x, y: pos.y, radius: 3.4 * spout, fillStyle: '#f3fbff' });

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y, radius: 130, color: '#dff2ff', intensity: 0.4 * spout
      });
    }
  }
}
/**
 * A flower bed at a dead end. Untended it is leaves and closed buds —
 * clearly a thing to visit, not a thing lying loose. Walking through it
 * tends it: the buds open, keep swaying, and count on the HUD. Tending
 * every bed on a map is the maze's optional errand.
 */
const BLOSSOMS = ['#fef6ef', '#f08a68', '#b48fd9', '#f6d44d'];

export class FlowerBed extends Entity {
  static properties = {
    seed: s.integer({ min: 0, initial: 0, description: 'Which cluster of blossoms this bed grows' })
  };

  name = 'FlowerBed';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    // Ground detail: always under the gardener's feet.
    this.depth = -Infinity;
    this.tended = false;
    this.tendedAt = 0;
    this.clock = (options.seed ?? 0) % 7;

    // The cluster, grown from the bed's own seed.
    let state = ((options.seed ?? 1) + 1) >>> 0;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const count = 4 + Math.floor(rand() * 3);
    this.blossoms = Array.from({ length: count }, () => ({
      dx: -10 + rand() * 20,
      dy: -9 + rand() * 18,
      radius: 2.6 + rand() * 1.8,
      color: BLOSSOMS[Math.floor(rand() * BLOSSOMS.length)],
      sway: rand() * Math.PI * 2
    }));
  }

  /** Walked through: the buds open, and the court counts it. */
  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (this.tended || other.entity?.name !== 'Player') return;
    this.tended = true;
    this.tendedAt = this.clock;
    this.game.events.emit('tended', { bed: this.sceneId });
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
  }

  draw() {
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;

    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 15,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: 15,
        stops: [{ offset: 0, color: 'rgba(72, 104, 42, 0.6)' }, { offset: 1, color: 'rgba(72, 104, 42, 0)' }]
      }
    });
    // Leaves either way; what sits on them depends on the tending.
    for (let i = 0; i < 4; i++) {
      const angle = i * (Math.PI / 2) + 0.4 + Math.sin(this.clock * 0.9 + i) * 0.06;
      renderer.pushTransform({ x: pos.x, y: pos.y, rotation: angle });
      renderer.drawPath({
        points: [{ x: 4, y: 0 }, { x: 13, y: -2.5 }, { x: 13, y: 2.5 }],
        fillStyle: '#3f5c28'
      });
      renderer.popTransform();
    }

    if (!this.tended) {
      // Closed buds: quiet, green-sheathed, nothing to pick up.
      for (const blossom of this.blossoms) {
        renderer.drawArc({
          x: pos.x + blossom.dx * 0.7, y: pos.y + blossom.dy * 0.7,
          radius: 2, fillStyle: '#55702f'
        });
        renderer.drawArc({
          x: pos.x + blossom.dx * 0.7, y: pos.y + blossom.dy * 0.7 - 1.2,
          radius: 1, fillStyle: '#7e9950'
        });
      }
      return;
    }

    // The burst of the moment it was tended.
    const since = this.clock - this.tendedAt;
    if (since < 0.7) {
      const t = since / 0.7;
      for (let i = 0; i < 7; i++) {
        const angle = i * (Math.PI * 2 / 7);
        renderer.drawArc({
          x: pos.x + Math.cos(angle) * 22 * t,
          y: pos.y + Math.sin(angle) * 22 * t,
          radius: 2.2 * (1 - t),
          fillStyle: '#fdf4d8'
        });
      }
    }
    const grown = Math.min(1, since / 0.5);
    for (const blossom of this.blossoms) {
      const sway = Math.sin(this.clock * 1.1 + blossom.sway) * 0.8;
      const bx = pos.x + blossom.dx + sway;
      const by = pos.y + blossom.dy;
      renderer.drawArc({ x: bx, y: by, radius: blossom.radius * grown, fillStyle: blossom.color });
      renderer.drawArc({ x: bx, y: by, radius: blossom.radius * 0.38 * grown, fillStyle: 'rgba(90, 70, 20, 0.55)' });
    }
  }
}