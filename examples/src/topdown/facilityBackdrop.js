import { makeRng, range } from '../shared/rng.js';
import { tileTexture } from '../shared/textures.js';

/**
 * The level as the place the menu's motion tracker was scanning.
 *
 * The menu promises an instrument: a violet sweep over a dark plot, ghosts
 * as contacts. The level keeps the promise from the other side of the
 * screen — the player walks the dark facility itself. The floor is the
 * menu's grid made concrete, the player carries the instrument (a sonar
 * ring that echoes out every few seconds), and everything that glows in
 * the dark glows in the menu's violet, except what wants to kill you,
 * which glows red.
 *
 * Three passes, wired to the scene hooks:
 *
 *   drawBackground   floor: grid, panels, stains, vents — before entities
 *   drawForeground   the sonar echo and the frame's lights — after them
 *   atmosphere       ambient light and the post pass, set on enter
 */

/** Sonar: seconds between echoes, and how far one reaches. */
const PING_PERIOD = 3.2;
const PING_RANGE = 460;

const GRID = 'rgba(42, 50, 66, 0.1)';

export class FacilityBackdrop {
  /**
   * @param {import('m2d-engine/core/m2d.js').M2D} game
   * @param {Object} floorSheet - The scene's `floor` sheet: poured concrete
   * @param {number} [seed=21] - Same default as the menu: the same place
   */
  constructor(game, floorSheet, seed = 21) {
    this.game = game;
    this.floor = floorSheet?.image ?? null;
    this.renderer = game.renderer;
    this.bounds = {
      width: game.options.worldWidth,
      height: game.options.worldHeight
    };
    this.time = 0;
    this.ping = { at: 0, x: 0, y: 0 };

    const renderer = game.renderer;
    this.features = {
      blendModes: renderer.supports('blendModes'),
      lights: renderer.supports('lights')
    };

    const rng = makeRng(seed);

    // Floor panels: large patches a shade off the base, so the ground has
    // rooms in it instead of being one poured slab.
    this.panels = Array.from({ length: 90 }, () => ({
      x: Math.floor(rng() * this.bounds.width / 96) * 96,
      y: Math.floor(rng() * this.bounds.height / 96) * 96,
      width: (1 + Math.floor(rng() * 3)) * 96,
      height: (1 + Math.floor(rng() * 3)) * 96,
      tone: rng() < 0.5
        ? 'rgba(255, 255, 255, 0.2)'
        : 'rgba(30, 38, 54, 0.06)'
    }));

    // Stains and scorch marks: the facility has a history.
    this.stains = Array.from({ length: 70 }, () => ({
      x: range(rng, 0, this.bounds.width),
      y: range(rng, 0, this.bounds.height),
      radius: range(rng, 14, 60),
      alpha: range(rng, 0.08, 0.2)
    }));

    // Vents and drains on a loose grid, each a small etched detail.
    this.vents = Array.from({ length: 60 }, () => ({
      x: Math.floor(range(rng, 2, this.bounds.width / 96 - 2)) * 96 + 48,
      y: Math.floor(range(rng, 2, this.bounds.height / 96 - 2)) * 96 + 48,
      drain: rng() < 0.4
    }));

    // Ceiling fixtures on a loose service grid. Most still burn; the dead
    // ones keep their housings, which is what makes the live ones a relief.
    // These — not a wash — are what light the facility.
    this.lamps = [];
    for (let y = 280; y < this.bounds.height - 200; y += 480) {
      for (let x = 280; x < this.bounds.width - 200; x += 520) {
        this.lamps.push({
          x: x + range(rng, -140, 140),
          y: y + range(rng, -120, 120),
          live: rng() < 0.72,
          flickery: rng() < 0.18,
          phase: range(rng, 0, Math.PI * 2)
        });
      }
    }
  }

  /** A lamp's brightness this frame: steady, or guttering. */
  #lampLevel(lamp) {
    if (!lamp.live) return 0;
    if (!lamp.flickery) return 1;
    const gutter = Math.sin(this.time * 13 + lamp.phase) + Math.sin(this.time * 31 + lamp.phase * 2);
    return gutter > -0.4 ? 0.85 : 0.2;
  }

  applyAtmosphere() {
    // The ambient (dark enough that the lamps and the player's own light
    // matter) is the scene's `world.lighting.ambient`; only the post pass,
    // which moves with the signal damage, is set here.
    this.glitchShown = -1;
    this.#applyPost(0.7);
  }

  /**
   * The post stack, with the signal damage dialled by `tear` (0 to 1). The
   * instrument the menu showed is what the player is seeing through: a
   * scanned image with faint lines in it. The feed tears once as it
   * acquires at the start of the level, and again when the player takes a
   * hit; otherwise it holds steady.
   */
  #applyPost(tear) {
    this.renderer.setPostEffects({
      bloom: { threshold: 0.7, strength: 0.6, blur: 28 },
      vignette: { strength: 0.2, start: 0.55 },
      grade: { shadows: '#8b93a4', highlights: '#ffffff', amount: 0.4, saturation: 0.9, contrast: 1.04 },
      scanlines: { strength: 0.045, density: 1.7 },
      chromatic: { strength: 0.002 + tear * 0.012 },
      distortion: { strength: 0.04 },
      grain: { strength: 0.03 + tear * 0.05 },
      glitch: { strength: tear * 0.55 },
      flash: { color: '#ff3b2f', strength: tear * tear * 0.22 }
    });
  }

  clearAtmosphere() {
    this.renderer.setPostEffects(null);
  }

  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;

    // The feed tears while it acquires in the first moment of the level,
    // and when the player is hit; it is clean the rest of the time. The
    // stack is only re-sent while the tear is changing.
    const boot = Math.max(0, 1 - this.time / 0.8);
    const tear = Math.min(1, Math.max(boot * 0.7, this.game.player?.hurt ?? 0));
    if (tear !== this.glitchShown) {
      this.glitchShown = tear;
      this.#applyPost(tear);
    }

    // The echo leaves from wherever the player was when it fired, like a
    // real ping: it does not follow the sender.
    const player = this.game.player;
    if (player && !player.dead && this.time - this.ping.at >= PING_PERIOD) {
      const pos = player.position;
      this.ping = { at: this.time, x: pos.x, y: pos.y };
    }
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

  #inView(view, x, y, margin) {
    return x > view.left - margin && x < view.left + view.width + margin
      && y > view.top - margin && y < view.top + view.height + margin;
  }

  /** The floor. Before the entities. */
  drawBackground() {
    const renderer = this.renderer;
    const view = this.#view();

    // Poured concrete, then a cold wash over it: the texture gives the
    // floor its grain, the wash gives the room its hour.
    tileTexture(renderer, this.floor, {
      x: view.left - 4, y: view.top - 4, width: view.width + 8, height: view.height + 8
    }, 256);
    renderer.drawRect({
      x: view.left - 4, y: view.top - 4,
      width: view.width + 8, height: view.height + 8,
      fillStyle: 'rgba(22, 26, 38, 0.12)'
    });

    for (const panel of this.panels) {
      if (!this.#inView(view, panel.x + panel.width / 2, panel.y + panel.height / 2,
        Math.max(panel.width, panel.height))) continue;
      renderer.drawRect({
        x: panel.x, y: panel.y, width: panel.width, height: panel.height,
        fillStyle: panel.tone
      });
    }

    // The menu's grid, walked on. World-anchored, so it measures the place.
    const tile = 96;
    for (let x = Math.floor(view.left / tile) * tile; x <= view.left + view.width; x += tile) {
      renderer.drawLine({
        x1: x, y1: view.top, x2: x, y2: view.top + view.height,
        strokeStyle: GRID, lineWidth: 1
      });
    }
    for (let y = Math.floor(view.top / tile) * tile; y <= view.top + view.height; y += tile) {
      renderer.drawLine({
        x1: view.left, y1: y, x2: view.left + view.width, y2: y,
        strokeStyle: GRID, lineWidth: 1
      });
    }

    for (const stain of this.stains) {
      if (!this.#inView(view, stain.x, stain.y, stain.radius)) continue;
      renderer.drawArc({
        x: stain.x, y: stain.y, radius: stain.radius,
        fillStyle: {
          type: 'radial', x: stain.x, y: stain.y, r0: 0, r1: stain.radius,
          stops: [
            { offset: 0, color: 'rgba(0, 0, 0, 0.55)' },
            { offset: 1, color: 'rgba(0, 0, 0, 0)' }
          ]
        },
        globalAlpha: stain.alpha
      });
    }

    // The lamps' pools, painted into the floor so they exist on every
    // backend; the light map deepens them where it is available.
    for (const lamp of this.lamps) {
      if (!this.#inView(view, lamp.x, lamp.y, 220)) continue;
      const level = this.#lampLevel(lamp);
      if (level <= 0) continue;
      renderer.drawArc({
        x: lamp.x, y: lamp.y, radius: 200,
        fillStyle: {
          type: 'radial', x: lamp.x, y: lamp.y, r0: 0, r1: 200,
          stops: [
            { offset: 0, color: 'rgba(255, 255, 255, 0.14)' },
            { offset: 0.5, color: 'rgba(255, 255, 255, 0.06)' },
            { offset: 1, color: 'rgba(226, 232, 240, 0)' }
          ]
        },
        globalAlpha: level
      });
    }

    for (const vent of this.vents) {
      if (!this.#inView(view, vent.x, vent.y, 20)) continue;
      if (vent.drain) {
        renderer.drawArc({
          x: vent.x, y: vent.y, radius: 7,
          strokeStyle: 'rgba(60, 70, 90, 0.3)', lineWidth: 2
        });
        renderer.drawArc({
          x: vent.x, y: vent.y, radius: 2.5,
          fillStyle: 'rgba(0, 0, 0, 0.5)'
        });
      } else {
        for (let i = -1; i <= 1; i++) {
          renderer.drawRect({
            x: vent.x - 8, y: vent.y + i * 4 - 1, width: 16, height: 2,
            fillStyle: 'rgba(60, 70, 90, 0.3)',
            cornerRadius: 1
          });
        }
      }
    }
  }

  /** Fixtures, the sonar echo and the frame's lights. After the entities. */
  drawForeground() {
    const renderer = this.renderer;
    const view = this.#view();
    const blend = this.features.blendModes ? 'additive' : undefined;

    // The fixtures themselves, over everything: they hang from the ceiling,
    // which from above means nearest to the eye.
    for (const lamp of this.lamps) {
      if (!this.#inView(view, lamp.x, lamp.y, 20)) continue;
      const level = this.#lampLevel(lamp);
      renderer.drawRect({
        x: lamp.x - 9, y: lamp.y - 9, width: 18, height: 18,
        fillStyle: '#0c0d12',
        strokeStyle: 'rgba(160, 170, 190, 0.35)',
        lineWidth: 1.5,
        cornerRadius: 3
      });
      renderer.drawArc({
        x: lamp.x, y: lamp.y, radius: 4,
        fillStyle: level > 0 ? '#f4f6ff' : '#2a2d36',
        globalAlpha: level > 0 ? 0.5 + 0.5 * level : 1
      });
    }

    // Two rings per echo, the second a beat behind, like the menu's sweep
    // leaving a trail.
    const age = this.time - this.ping.at;
    for (const lag of [0, 0.35]) {
      const t = (age - lag) / 1.6;
      if (t <= 0 || t >= 1) continue;
      renderer.drawArc({
        x: this.ping.x, y: this.ping.y,
        radius: 24 + t * PING_RANGE,
        strokeStyle: 'rgba(50, 110, 170, 0.7)',
        lineWidth: 2 - t,
        globalAlpha: (1 - t) * (lag === 0 ? 0.5 : 0.25),
        blend
      });
    }

    if (this.features.lights) this.#drawLights(view);
  }

  #drawLights(view) {
    const renderer = this.renderer;

    // A low fill so nothing is pure black; the lamps do the real lighting.
    renderer.drawLight({
      x: view.left + view.width / 2, y: view.top + view.height / 2,
      radius: view.width,
      color: '#9aa3b8',
      intensity: 0.32
    });

    for (const lamp of this.lamps) {
      if (!this.#inView(view, lamp.x, lamp.y, 320)) continue;
      const level = this.#lampLevel(lamp);
      if (level <= 0) continue;
      renderer.drawLight({
        x: lamp.x, y: lamp.y,
        radius: 330,
        color: '#dde4f2',
        intensity: 0.62 * level
      });
    }

    const player = this.game.player;
    if (player && !player.dead) {
      const pos = player.renderPosition;
      renderer.drawLight({
        x: pos.x, y: pos.y,
        radius: 430,
        color: '#fff0d8',
        intensity: 0.75
      });
    }
  }
}
