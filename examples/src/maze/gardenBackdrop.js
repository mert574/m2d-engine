import { makeRng, range } from '../shared/rng.js';
import { tileTexture } from '../shared/textures.js';

/**
 * The garden the courts stand in: a mown lawn in full morning sun.
 *
 * The menu shows the head gardener's plan of this place; the level is the
 * place itself. The backdrop lays the lawn, mows it in stripes, scatters
 * clover, sets flower beds at the maze's dead ends and stepping stones
 * through the gates, and sends cloud shadows and butterflies across the
 * whole thing. The hedges shade themselves (see `HedgeWall`).
 *
 * Two passes wired to the scene hooks, plus persistent atmosphere:
 *
 *   drawBackground   lawn, stripes, clover, beds, stones — before entities
 *   drawForeground   cloud shadows, butterflies, sun — after them
 *
 * Everything here is presentation: it reads the clock and the camera and
 * writes nothing the simulation sees.
 */

/** A bed's blossoms: white daisies, coral tulips, lavender. */
const BLOSSOMS = ['#fef6ef', '#f08a68', '#b48fd9', '#f6d44d'];

const BUTTERFLIES = ['#fef6ef', '#f3d35a', '#eb9a54'];

export class GardenBackdrop {
  /**
   * @param {import('m2d-engine/core/m2d.js').M2D} game
   * @param {Object} lawnSheet - The scene's `lawn` sheet
   * @param {Object} map - The built map (see courtyards.js)
   */
  constructor(game, lawnSheet, map) {
    this.game = game;
    this.renderer = game.renderer;
    this.lawn = lawnSheet?.image ?? null;
    this.map = map;
    this.time = 0;

    this.features = {
      lights: game.renderer.supports('lights'),
      blendModes: game.renderer.supports('blendModes')
    };

    const rng = makeRng(0xb100);
    this.clover = Array.from({ length: Math.round(map.width * map.height / 36000) }, () => ({
      x: range(rng, 0, map.width),
      y: range(rng, 0, map.height),
      radius: range(rng, 12, 30),
      alpha: range(rng, 0.08, 0.18)
    }));

    // Each flower bed blooms a cluster from its own little seed.
    this.beds = map.flowerBeds.map(bed => {
      const bedRng = makeRng(bed.seed + 1);
      const count = 3 + Math.floor(range(bedRng, 0, 4));
      return {
        x: bed.x,
        y: bed.y,
        blossoms: Array.from({ length: count }, () => ({
          dx: range(bedRng, -10, 10),
          dy: range(bedRng, -9, 9),
          radius: range(bedRng, 2.4, 4.2),
          color: BLOSSOMS[Math.floor(range(bedRng, 0, BLOSSOMS.length)) % BLOSSOMS.length],
          sway: range(bedRng, 0, Math.PI * 2)
        }))
      };
    });

    // A few butterflies, each tied loosely to a bed and wandering around it
    // on its own pair of slow sine curves.
    const picks = this.beds.length ? this.beds : [{ x: map.width / 2, y: map.height / 2 }];
    this.butterflies = Array.from({ length: Math.min(6, 2 + Math.floor(picks.length / 4)) }, (_, i) => {
      const bed = picks[(i * 7) % picks.length];
      return {
        anchor: bed,
        color: BUTTERFLIES[i % BUTTERFLIES.length],
        fx: 0.21 + 0.04 * (i % 3),
        fy: 0.17 + 0.05 * ((i + 1) % 3),
        phase: i * 1.7,
        reach: 70 + 22 * (i % 4)
      };
    });

    // Two clouds crossing the garden, large and soft and slow.
    this.clouds = [
      { x: map.width * 0.2, y: map.height * 0.3, vx: 14, vy: 4, radius: 330 },
      { x: map.width * 0.75, y: map.height * 0.7, vx: 10, vy: -3, radius: 430 }
    ];
  }

  applyAtmosphere() {
    // Morning. The sun does the work; the grade keeps it warm and the
    // bloom only catches the water and the brightest petals.
    this.renderer.setAmbientLight('#fffdf2');
    this.renderer.setPostEffects({
      bloom: { threshold: 0.82, strength: 0.32, blur: 18 },
      vignette: { strength: 0.13, start: 0.64 },
      grade: { shadows: '#8aa381', highlights: '#fff8e2', amount: 0.32, saturation: 1.08, contrast: 1.02 },
      grain: { strength: 0.03 }
    });
  }

  clearAtmosphere() {
    this.renderer.setAmbientLight(null);
    this.renderer.setPostEffects(null);
  }

  update(deltaTime) {
    this.time += deltaTime;
  }

  #view() {
    const camera = this.game.camera;
    return {
      left: camera.x - camera.width / 2,
      top: camera.y - camera.height / 2,
      width: camera.width,
      height: camera.height
    };
  }

  /** The lawn and everything planted in it. Before the entities. */
  drawBackground() {
    const renderer = this.renderer;
    const view = this.#view();
    const rect = { x: view.left - 4, y: view.top - 4, width: view.width + 8, height: view.height + 8 };
    const onScreen = (x, y, margin) =>
      x > view.left - margin && x < view.left + view.width + margin &&
      y > view.top - margin && y < view.top + view.height + margin;

    tileTexture(renderer, this.lawn, rect, 192);

    // Mowing stripes: alternating 96px bands, barely there, which is all a
    // tended lawn needs to read as tended.
    const firstBand = Math.floor(rect.y / 192) * 192;
    for (let y = firstBand; y < rect.y + rect.height; y += 192) {
      renderer.drawRect({
        x: rect.x, y, width: rect.width, height: 96,
        fillStyle: 'rgba(255, 252, 220, 0.045)'
      });
    }

    // Flat fills: a gradient per patch was the single heaviest thing the
    // garden drew, and at this alpha the eye cannot tell.
    for (const clover of this.clover) {
      if (!onScreen(clover.x, clover.y, 40)) continue;
      renderer.drawArc({
        x: clover.x, y: clover.y, radius: clover.radius,
        fillStyle: 'rgb(120, 160, 70)',
        globalAlpha: clover.alpha * 0.6
      });
    }

    // Stepping stones through each gate, so a way out of a court is visible
    // from across it.
    for (const gate of this.map.gates) {
      if (!onScreen(gate.x, gate.y, 80)) continue;
      for (const t of [-0.6, 0.6]) {
        const sx = gate.x + (gate.dir === 'ew' ? t * 24 : (t > 0 ? 3 : -4));
        const sy = gate.y + (gate.dir === 'ns' ? t * 24 : (t > 0 ? 4 : -3));
        renderer.drawArc({ x: sx + 1.5, y: sy + 2, radius: 9, fillStyle: 'rgba(40, 58, 36, 0.4)' });
        renderer.drawArc({
          x: sx, y: sy, radius: 9,
          fillStyle: {
            type: 'radial', x: sx - 2, y: sy - 3, r0: 0, r1: 10,
            stops: [{ offset: 0, color: '#cfc9b4' }, { offset: 1, color: '#a8a28c' }]
          }
        });
      }
    }

    // The flower beds at the dead ends: the maze's wrong turns are where
    // the garden is prettiest, which is the cosiest thing a maze can do.
    for (const bed of this.beds) {
      if (!onScreen(bed.x, bed.y, 48)) continue;
      renderer.drawArc({
        x: bed.x, y: bed.y, radius: 15,
        fillStyle: {
          type: 'radial', x: bed.x, y: bed.y, r0: 0, r1: 15,
          stops: [{ offset: 0, color: 'rgba(96, 134, 58, 0.55)' }, { offset: 1, color: 'rgba(96, 134, 58, 0)' }]
        }
      });
      for (const blossom of bed.blossoms) {
        const sway = Math.sin(this.time * 1.1 + blossom.sway) * 0.8;
        const bx = bed.x + blossom.dx + sway;
        const by = bed.y + blossom.dy;
        renderer.drawArc({ x: bx, y: by, radius: blossom.radius, fillStyle: blossom.color });
        renderer.drawArc({ x: bx, y: by, radius: blossom.radius * 0.38, fillStyle: 'rgba(90, 70, 20, 0.55)' });
      }
    }

    // The fountain's plaza: a stone circle the hedges were cleared for.
    const goal = this.map.goal;
    if (onScreen(goal.x, goal.y, 120)) {
      renderer.drawArc({
        x: goal.x, y: goal.y, radius: 44,
        fillStyle: {
          type: 'radial', x: goal.x, y: goal.y, r0: 18, r1: 44,
          stops: [{ offset: 0, color: '#b9b29a' }, { offset: 1, color: '#9a957e' }]
        }
      });
      renderer.drawArc({ x: goal.x, y: goal.y, radius: 44, strokeStyle: 'rgba(60, 72, 48, 0.5)', lineWidth: 2, fill: false });
    }
  }

  /** What the sky does to the garden. After the entities. */
  drawForeground() {
    const renderer = this.renderer;
    const view = this.#view();

    // Cloud shadows: the one thing that moves on the whole lawn, and the
    // thing that makes the sun read as sun. They loop around the map with a
    // margin so a loop never pops on screen.
    for (const cloud of this.clouds) {
      const marginW = this.map.width + 1600;
      const marginH = this.map.height + 1600;
      const cx = ((cloud.x + cloud.vx * this.time) % marginW + marginW) % marginW - 800;
      const cy = ((cloud.y + cloud.vy * this.time) % marginH + marginH) % marginH - 800;
      if (cx < view.left - cloud.radius || cx > view.left + view.width + cloud.radius) continue;
      if (cy < view.top - cloud.radius || cy > view.top + view.height + cloud.radius) continue;
      renderer.drawArc({
        x: cx, y: cy, radius: cloud.radius,
        fillStyle: {
          type: 'radial', x: cx, y: cy, r0: cloud.radius * 0.3, r1: cloud.radius,
          stops: [{ offset: 0, color: 'rgba(36, 56, 40, 0.1)' }, { offset: 1, color: 'rgba(36, 56, 40, 0)' }]
        }
      });
    }

    // Butterflies over everything, wings flicking as two dots that trade
    // widths.
    for (const b of this.butterflies) {
      const t = this.time + b.phase;
      const x = b.anchor.x + Math.sin(t * b.fx * Math.PI * 2) * b.reach;
      const y = b.anchor.y + Math.sin(t * b.fy * Math.PI * 2 + 1.3) * b.reach * 0.8;
      if (x < view.left - 20 || x > view.left + view.width + 20) continue;
      if (y < view.top - 20 || y > view.top + view.height + 20) continue;
      const flap = Math.sin(t * 26);
      renderer.drawArc({ x: x + 2, y: y + 3, radius: 2.6, fillStyle: 'rgba(30, 48, 30, 0.25)' });
      renderer.drawArc({ x: x - 1.6 * (0.4 + 0.6 * Math.abs(flap)), y, radius: 2.2, fillStyle: b.color });
      renderer.drawArc({ x: x + 1.6 * (0.4 + 0.6 * Math.abs(-flap)), y, radius: 2.2, fillStyle: b.color });
    }

    if (!this.features.lights) return;

    // The sun: one broad warm light over the view. Morning, not noon — the
    // grade above does the colour, this adds the glow.
    renderer.drawLight({
      x: view.left + view.width / 2, y: view.top + view.height / 2,
      radius: view.width * 0.9,
      color: '#fff3d0',
      intensity: 0.5
    });
  }
}
