import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
import { tileTexture } from '../shared/textures.js';
import { makeRng, range } from '../shared/rng.js';
/** The street's ambientCG textures, by the property that names each: images the scene loads. */
const TEXTURES = ['bricks', 'plaster', 'road', 'roofing', 'facadeA', 'facadeB', 'facadeC'];

/**
 * Ash Row's street, in depth.
 *
 * Five planes, each sliding at its own fraction of the camera's travel, so
 * the walk down the row has distance behind it and a kerb in front:
 *
 *   0.12  far skyline      towers in the haze, ambientCG facade textures
 *                          faded toward the sky
 *   0.45  mid blocks       the taller buildings behind the row, with roofs
 *   1.00  the frontage     shopfronts along the back of the pavement:
 *                          brick and plaster bays, doors, awnings, upper
 *                          windows, drainpipes, air-con units, and the
 *                          props at the kerb (bins, benches, a dumpster)
 *   1.00  the road         below the gutter, with its markings and drains
 *   1.25  foreground       bollards in front of the pavement, drawn last
 *
 * `Street` is one entity at zIndex 0 with a depth of -Infinity, so it draws
 * after the paving layer (which it paints the wall and the road over) and
 * under every actor. `Foreground` is a second entity at zIndex 5. Both are
 * deterministic from the seed and every bay is laid out once, then culled
 * against the view each frame.
 */

const BAY = 320;
const TILE = 256;

/** A parallax plane's world shift: where its point q lands, given the camera. */
function shift(camera, parallax) {
  return { x: camera.x * (1 - parallax), y: camera.y * (1 - parallax) };
}

export class Street extends Entity {
  static properties = {
    lane: s.object({
      top: s.number({ required: true, unit: 'px' }),
      bottom: s.number({ required: true, unit: 'px' })
    }, { label: 'Lane', description: 'The walkable band the street is drawn around' }),
    length: s.number({ positive: true, unit: 'px', description: 'How far the row runs' }),
    seed: s.number({ initial: 3, description: 'Fixes the windows, signs and litter' }),
    ...Object.fromEntries(TEXTURES.map((name) => [name, s.ref('image', { description: 'An image in assets.images' })]))
  };

  name = 'Street';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.zIndex = 0;
    this.depth = -Infinity;
    this.lane = options.lane;
    this.length = options.length;
    this.images = Object.fromEntries(TEXTURES.map((name) => [name, options[name] ?? null]));
    const rng = makeRng(options.seed ?? 3);

    // Far skyline: towers of random height and width, repeating every 3600.
    this.skylinePeriod = 3600;
    this.skyline = [];
    for (let x = 0; x < this.skylinePeriod;) {
      const w = range(rng, 120, 320);
      this.skyline.push({ x, w, h: range(rng, 150, 400), facade: Math.floor(range(rng, 0, 3)), cap: rng() < 0.4, tone: range(rng, 0, 1) });
      x += w + range(rng, 10, 70);
    }
    // Mid blocks: the buildings behind the row, repeating every 2400.
    this.midPeriod = 2400;
    this.mid = [];
    for (let x = 0; x < this.midPeriod;) {
      const w = range(rng, 260, 480);
      this.mid.push({ x, w, h: range(rng, 60, 160), facade: Math.floor(range(rng, 0, 3)), roof: rng() < 0.6 });
      x += w + range(rng, 20, 60);
    }
    // Frontage bays, one per BAY along the whole row.
    this.bays = [];
    for (let i = 0; i * BAY < this.length; i++) {
      const kind = rng() < 0.3 ? 'plaster' : 'brick';
      this.bays.push({
        x: i * BAY, kind,
        awning: rng() < 0.55 ? ['#b8402e', '#2e5a8a', '#3a7a4a', '#c89a2e'][Math.floor(range(rng, 0, 4))] : null,
        door: rng() < 0.7, doorAt: range(rng, 40, 180),
        ac: rng() < 0.35, pipe: rng() < 0.45,
        sign: rng() < 0.4 ? ['#1d1a24', '#5a1e1e', '#1e3a5a'][Math.floor(range(rng, 0, 3))] : null,
        prop: rng() < 0.45 ? ['bin', 'bench', 'dumpster', 'crates'][Math.floor(range(rng, 0, 4))] : null,
        propAt: range(rng, 60, 240)
      });
    }
    // Drains and patches on the pavement and road.
    this.drains = Array.from({ length: Math.floor(this.length / 900) }, (_, i) => ({ x: 450 + i * 900 + range(rng, -200, 200) }));
    this.patches = Array.from({ length: Math.floor(this.length / 260) }, () => ({ x: range(rng, 0, this.length), y: range(rng, 0.1, 0.9), r: range(rng, 40, 110) }));
  }

  /** The textures, as the scene loaded them (null headless, where nothing draws). */
  get textures() {
    return this.images;
  }

  draw() {
    const game = this.game;
    const renderer = game.renderer;
    const camera = game.camera;
    const area = camera.getVisibleArea();
    const proj = game.projection;
    const kerbY = proj.toScreen(0, this.lane.top).y;
    const gutterY = proj.toScreen(0, this.lane.bottom).y;
    const t = this.textures;
    const roofY = kerbY - 270;

    this.#sky(renderer, area, roofY);
    this.#skyline(renderer, camera, area, roofY);
    this.#midBlocks(renderer, camera, area, roofY);
    this.#frontage(renderer, area, roofY, kerbY);
    this.#road(renderer, area, gutterY);
    this.#pavement(renderer, area, kerbY, gutterY);
  }

  #sky(renderer, area, roofY) {
    renderer.drawRect({
      x: area.left, y: area.top, width: area.right - area.left, height: Math.max(0, roofY + 60 - area.top),
      fillStyle: { type: 'linear', x0: 0, y0: area.top, x1: 0, y1: roofY + 60, stops: [{ offset: 0, color: '#5fa6e4' }, { offset: 0.7, color: '#b9dcf2' }, { offset: 1, color: '#e6eef2' }] }
    });
    const drift = this.game.time.elapsed * 9;
    for (let cx = Math.floor((area.left - drift) / 900) * 900; cx < area.right - drift + 500; cx += 900) {
      const x = cx + drift;
      const y = area.top + 60 + ((cx / 900) % 3) * 50;
      renderer.pushTransform({ x, y, scaleX: 1, scaleY: 0.4 });
      for (const [dx, r, a] of [[0, 110, 0.9], [90, 75, 0.8], [-95, 70, 0.75], [40, 60, 0.6]]) {
        renderer.drawArc({ x: dx, y: 0, radius: r, fillStyle: `rgba(255, 255, 255, ${a})` });
      }
      renderer.popTransform();
    }
  }

  #skyline(renderer, camera, area, roofY) {
    const s = shift(camera, 0.12);
    const base = roofY + 40;
    const period = this.skylinePeriod;
    const first = Math.floor((area.left - s.x) / period) - 1;
    const last = Math.floor((area.right - s.x) / period) + 1;
    for (let p = first; p <= last; p++) {
      for (const tower of this.skyline) {
        const x = tower.x + p * period + s.x;
        if (x + tower.w < area.left || x > area.right) continue;
        const top = base - tower.h;
        // A solid silhouette first — a tower whose fill matches the sky
        // reads as windows floating in air — then the facade pinned to the
        // tower's own corner, so it moves with the tower and not the world.
        const fill = tower.tone < 0.5 ? '#7e95ad' : '#8aa3bd';
        renderer.drawRect({ x, y: top, width: tower.w, height: tower.h + 60, fillStyle: fill });
        const facade = [t => t.facadeA, t => t.facadeB, t => t.facadeC][tower.facade](this.textures);
        tileTexture(renderer, facade, { x, y: top, width: tower.w, height: tower.h + 60 }, 180, { globalAlpha: 0.45, origin: 'rect' });
        renderer.drawRect({ x, y: top, width: tower.w, height: tower.h + 60, fillStyle: 'rgba(158, 186, 210, 0.45)' });
        if (tower.cap) renderer.drawRect({ x: x + tower.w * 0.3, y: top - 26, width: tower.w * 0.4, height: 26, fillStyle: fill });
      }
    }
    // Distance: a band of haze over the whole skyline.
    renderer.drawRect({ x: area.left, y: roofY - 600, width: area.right - area.left, height: 660, fillStyle: { type: 'linear', x0: 0, y0: roofY - 600, x1: 0, y1: roofY + 60, stops: [{ offset: 0, color: 'rgba(185, 220, 242, 0)' }, { offset: 1, color: 'rgba(200, 225, 240, 0.6)' }] } });
  }

  #midBlocks(renderer, camera, area, roofY) {
    const s = shift(camera, 0.45);
    const base = roofY + 40;
    const period = this.midPeriod;
    const first = Math.floor((area.left - s.x) / period) - 1;
    const last = Math.floor((area.right - s.x) / period) + 1;
    for (let p = first; p <= last; p++) {
      for (const b of this.mid) {
        const x = b.x + p * period + s.x;
        if (x + b.w < area.left || x > area.right) continue;
        const top = base - b.h;
        const facade = [t => t.facadeA, t => t.facadeB, t => t.facadeC][b.facade](this.textures);
        tileTexture(renderer, facade, { x, y: top, width: b.w, height: b.h }, 256, { origin: 'rect' });
        // Sun from the left, shade to the right, a little atmosphere on the whole.
        renderer.drawRect({ x, y: top, width: b.w, height: b.h, fillStyle: { type: 'linear', x0: x, y0: 0, x1: x + b.w, y1: 0, stops: [{ offset: 0, color: 'rgba(255, 245, 225, 0.12)' }, { offset: 1, color: 'rgba(30, 40, 60, 0.22)' }] } });
        renderer.drawRect({ x, y: top, width: b.w, height: b.h, fillStyle: 'rgba(170, 200, 225, 0.18)' });
        if (b.roof) {
          tileTexture(renderer, this.textures.roofing, { x: x - 8, y: top - 36, width: b.w + 16, height: 40 }, 96, { origin: 'rect' });
          renderer.drawRect({ x: x - 8, y: top - 36, width: b.w + 16, height: 40, fillStyle: 'rgba(120, 150, 180, 0.25)' });
        } else {
          renderer.drawRect({ x: x - 6, y: top - 10, width: b.w + 12, height: 12, fillStyle: '#6e6a66' });
        }
      }
    }
  }

  #frontage(renderer, area, roofY, kerbY) {
    const t = this.textures;
    const first = Math.max(0, Math.floor(area.left / BAY) - 1);
    const last = Math.min(this.bays.length - 1, Math.floor(area.right / BAY) + 1);
    const h = kerbY - roofY;
    for (let i = first; i <= last; i++) {
      const bay = this.bays[i];
      const x = bay.x;
      const wall = { x, y: roofY, width: BAY, height: h };
      if (bay.kind === 'plaster') {
        tileTexture(renderer, t.plaster, wall, 256);
        renderer.drawRect({ ...wall, fillStyle: 'rgba(230, 200, 160, 0.22)' });
      } else {
        tileTexture(renderer, t.bricks, wall, 256);
      }
      // Sunlight high, shade low; a shadow line under the roof.
      renderer.drawRect({ ...wall, fillStyle: { type: 'linear', x0: 0, y0: roofY, x1: 0, y1: kerbY, stops: [{ offset: 0, color: 'rgba(255, 240, 200, 0.28)' }, { offset: 0.55, color: 'rgba(255, 240, 200, 0.02)' }, { offset: 1, color: 'rgba(40, 30, 40, 0.2)' }] } });
      renderer.drawRect({ x, y: roofY - 14, width: BAY, height: 16, fillStyle: '#5a4a44' });
      renderer.drawRect({ x, y: roofY + 2, width: BAY, height: 10, fillStyle: 'rgba(20, 14, 20, 0.35)' });
      // A pilaster at each bay edge.
      renderer.drawRect({ x: x - 4, y: roofY, width: 10, height: h, fillStyle: 'rgba(240, 232, 220, 0.55)' });

      // Upper windows: two, with sills and the sky in the glass.
      for (let k = 0; k < 2; k++) {
        const wx = x + 48 + k * 150;
        const wy = roofY + 46;
        renderer.drawRect({ x: wx - 5, y: wy - 5, width: 70, height: 100, fillStyle: '#e8e2d4', cornerRadius: 2 });
        renderer.drawRect({ x: wx, y: wy, width: 60, height: 90, fillStyle: { type: 'linear', x0: wx, y0: wy, x1: wx + 60, y1: wy + 90, stops: [{ offset: 0, color: '#aacde8' }, { offset: 0.5, color: '#6f98ba' }, { offset: 1, color: '#4a6a8a' }] } });
        renderer.drawRect({ x: wx + 28, y: wy, width: 4, height: 90, fillStyle: '#f0ece2' });
        renderer.drawRect({ x: wx, y: wy + 44, width: 60, height: 4, fillStyle: '#f0ece2' });
        renderer.drawRect({ x: wx - 8, y: wy + 92, width: 76, height: 8, fillStyle: '#d8d0c0' });
        renderer.drawRect({ x: wx - 8, y: wy + 100, width: 76, height: 6, fillStyle: 'rgba(20, 14, 20, 0.3)' });
      }
      // Ground floor: a shop window, a door, an awning over them.
      const gy = kerbY - 124;
      renderer.drawRect({ x: x + 36, y: gy - 6, width: 150, height: 116, fillStyle: '#2a2420', cornerRadius: 2 });
      renderer.drawRect({ x: x + 42, y: gy, width: 138, height: 104, fillStyle: { type: 'linear', x0: x + 42, y0: gy, x1: x + 180, y1: gy + 104, stops: [{ offset: 0, color: '#8fb7d6' }, { offset: 0.5, color: '#4e6f8e' }, { offset: 1, color: '#2e4660' }] } });
      renderer.drawRect({ x: x + 50, y: gy + 10, width: 40, height: 80, fillStyle: 'rgba(255, 255, 255, 0.12)' });
      if (bay.door) {
        const dx = x + 200 + bay.doorAt * 0.3;
        renderer.drawRect({ x: dx - 4, y: gy - 10, width: 66, height: 124, fillStyle: '#2a2420', cornerRadius: 3 });
        renderer.drawRect({ x: dx, y: gy - 6, width: 58, height: 120, fillStyle: { type: 'linear', x0: dx, y0: 0, x1: dx + 58, y1: 0, stops: [{ offset: 0, color: '#6a4a2e' }, { offset: 1, color: '#3e2a1a' }] } });
        renderer.drawRect({ x: dx + 8, y: gy + 6, width: 42, height: 46, fillStyle: 'rgba(160, 200, 230, 0.55)' });
        renderer.drawArc({ x: dx + 48, y: gy + 70, radius: 3, fillStyle: '#d8b86a' });
      }
      if (bay.sign) {
        renderer.drawRect({ x: x + 30, y: gy - 44, width: 164, height: 30, fillStyle: bay.sign, cornerRadius: 3 });
        for (let s = 0; s < 5; s++) renderer.drawRect({ x: x + 44 + s * 28, y: gy - 36, width: 16, height: 14, fillStyle: 'rgba(240, 230, 200, 0.75)', cornerRadius: 2 });
      }
      if (bay.awning) {
        const ay = gy - 56;
        for (let s = 0; s < 10; s++) {
          renderer.drawRect({ x: x + 24 + s * 18, y: ay, width: 18, height: 36, fillStyle: s % 2 ? bay.awning : '#f2ece0' });
        }
        renderer.drawPath({ points: [{ x: x + 24, y: ay + 36 }, { x: x + 204, y: ay + 36 }, { x: x + 212, y: ay + 48 }, { x: x + 16, y: ay + 48 }], closed: true, fillStyle: 'rgba(20, 14, 20, 0.5)' });
        renderer.drawRect({ x: x + 24, y: ay + 36, width: 180, height: 6, fillStyle: bay.awning });
        renderer.drawRect({ x: x + 24, y: ay + 42, width: 180, height: 22, fillStyle: 'rgba(30, 20, 20, 0.22)' });
      }
      if (bay.pipe) {
        renderer.drawRect({ x: x + BAY - 22, y: roofY - 8, width: 8, height: h + 8, fillStyle: '#4a4a52' });
        renderer.drawRect({ x: x + BAY - 24, y: roofY + 60, width: 12, height: 8, fillStyle: '#5e5e66' });
      }
      if (bay.ac) {
        renderer.drawRect({ x: x + 250, y: roofY + 60, width: 44, height: 34, fillStyle: '#9a9a9e', cornerRadius: 3 });
        renderer.drawArc({ x: x + 272, y: roofY + 77, radius: 11, strokeStyle: '#5a5a60', lineWidth: 3 });
        renderer.drawRect({ x: x + 250, y: roofY + 94, width: 44, height: 6, fillStyle: 'rgba(20, 14, 20, 0.4)' });
      }
      this.#prop(renderer, bay, kerbY);
    }
  }

  #prop(renderer, bay, kerbY) {
    if (!bay.prop) return;
    const x = bay.x + bay.propAt;
    const y = kerbY + 4;
    const shadow = (w) => renderer.drawRect({ x: x - w * 0.1, y: y - 2, width: w * 1.3, height: 10, fillStyle: 'rgba(20, 16, 20, 0.28)', cornerRadius: 5 });
    switch (bay.prop) {
      case 'bin':
        shadow(26);
        renderer.drawRect({ x, y: y - 42, width: 26, height: 42, fillStyle: { type: 'linear', x0: x, y0: 0, x1: x + 26, y1: 0, stops: [{ offset: 0, color: '#4e7a52' }, { offset: 1, color: '#2c4a30' }] }, cornerRadius: 3 });
        renderer.drawRect({ x: x - 2, y: y - 48, width: 30, height: 8, fillStyle: '#243a26', cornerRadius: 3 });
        break;
      case 'bench':
        shadow(90);
        renderer.drawRect({ x, y: y - 28, width: 90, height: 8, fillStyle: '#7a5a3a' });
        renderer.drawRect({ x, y: y - 48, width: 90, height: 7, fillStyle: '#7a5a3a' });
        renderer.drawRect({ x: x + 4, y: y - 24, width: 5, height: 24, fillStyle: '#2e2e34' });
        renderer.drawRect({ x: x + 81, y: y - 24, width: 5, height: 24, fillStyle: '#2e2e34' });
        break;
      case 'dumpster':
        shadow(80);
        renderer.drawRect({ x, y: y - 56, width: 80, height: 56, fillStyle: { type: 'linear', x0: x, y0: 0, x1: x + 80, y1: 0, stops: [{ offset: 0, color: '#2e5a8a' }, { offset: 1, color: '#1a3652' }] }, cornerRadius: 4 });
        renderer.drawRect({ x: x - 3, y: y - 64, width: 86, height: 12, fillStyle: '#15283a', cornerRadius: 4 });
        renderer.drawRect({ x: x + 6, y: y - 6, width: 10, height: 6, fillStyle: '#111' });
        renderer.drawRect({ x: x + 64, y: y - 6, width: 10, height: 6, fillStyle: '#111' });
        break;
      case 'crates':
        shadow(60);
        tileTexture(renderer, this.textures.roofing, { x, y: y - 34, width: 34, height: 34 }, 34, { globalAlpha: 0.9 });
        tileTexture(renderer, this.textures.roofing, { x: x + 36, y: y - 30, width: 30, height: 30 }, 30, { globalAlpha: 0.9 });
        tileTexture(renderer, this.textures.roofing, { x: x + 12, y: y - 64, width: 30, height: 30 }, 30, { globalAlpha: 0.9 });
        for (const [bx, by, bw] of [[x, y - 34, 34], [x + 36, y - 30, 30], [x + 12, y - 64, 30]]) renderer.drawRect({ x: bx, y: by, width: bw, height: bw, strokeStyle: 'rgba(40, 24, 10, 0.7)', lineWidth: 2 });
        break;
    }
  }

  #road(renderer, area, gutterY) {
    const t = this.textures;
    const road = { x: area.left, y: gutterY, width: area.right - area.left, height: Math.max(0, area.bottom - gutterY) };
    tileTexture(renderer, t.road, road, 320);
    renderer.drawRect({ ...road, fillStyle: 'rgba(255, 240, 210, 0.08)' });
    // The kerb stone and its shadow on the road.
    renderer.drawRect({ x: area.left, y: gutterY - 6, width: road.width, height: 10, fillStyle: '#b9b2a4' });
    renderer.drawRect({ x: area.left, y: gutterY + 4, width: road.width, height: 14, fillStyle: 'rgba(20, 16, 20, 0.35)' });
    for (const d of this.drains) {
      if (d.x < area.left - 40 || d.x > area.right + 40) continue;
      renderer.drawRect({ x: d.x, y: gutterY + 6, width: 46, height: 12, fillStyle: '#2a2a2e', cornerRadius: 2 });
      for (let k = 0; k < 5; k++) renderer.drawRect({ x: d.x + 5 + k * 8, y: gutterY + 8, width: 3, height: 8, fillStyle: '#0e0e10' });
    }
  }

  #pavement(renderer, area, kerbY, gutterY) {
    // Wear on the paving: darker patches, and the kerb's edge at the back.
    for (const p of this.patches) {
      const y = kerbY + (gutterY - kerbY) * p.y;
      if (p.x + p.r < area.left || p.x - p.r > area.right) continue;
      renderer.pushTransform({ x: p.x, y, scaleX: 1, scaleY: 0.45 });
      renderer.drawArc({ x: 0, y: 0, radius: p.r, fillStyle: { type: 'radial', x: 0, y: 0, r0: 0, r1: p.r, stops: [{ offset: 0, color: 'rgba(40, 36, 30, 0.2)' }, { offset: 1, color: 'rgba(40, 36, 30, 0)' }] } });
      renderer.popTransform();
    }
    renderer.drawRect({ x: area.left, y: kerbY - 6, width: area.right - area.left, height: 10, fillStyle: '#c9c2b4' });
    renderer.drawRect({ x: area.left, y: kerbY + 4, width: area.right - area.left, height: 8, fillStyle: 'rgba(20, 16, 20, 0.22)' });
  }
}

/** Bollards along the kerb, in front of the pavement, a little nearer than it. */
export class Foreground extends Entity {
  static properties = {
    lane: s.object({
      top: s.number({ required: true, unit: 'px' }),
      bottom: s.number({ required: true, unit: 'px' })
    }, { label: 'Lane', description: 'The walkable band the bollards stand in front of' })
  };

  name = 'Foreground';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.zIndex = 5;
    this.depth = Infinity;
    this.lane = options.lane;
    this.spacing = 420;
  }

  draw() {
    const game = this.game;
    const renderer = game.renderer;
    const camera = game.camera;
    const area = camera.getVisibleArea();
    const s = shift(camera, 1.25);
    const gutterY = game.projection.toScreen(0, this.lane.bottom).y;
    const y = gutterY + 2 + s.y * 0;
    const first = Math.floor((area.left - s.x) / this.spacing) - 1;
    const last = Math.floor((area.right - s.x) / this.spacing) + 1;
    for (let i = first; i <= last; i++) {
      const x = i * this.spacing + s.x;
      renderer.drawRect({ x: x - 8, y: y - 4, width: 36, height: 8, fillStyle: 'rgba(20, 16, 20, 0.3)', cornerRadius: 4 });
      renderer.drawRect({ x, y: y - 74, width: 18, height: 74, fillStyle: { type: 'linear', x0: x, y0: 0, x1: x + 18, y1: 0, stops: [{ offset: 0, color: '#4a4e58' }, { offset: 0.5, color: '#2a2e36' }, { offset: 1, color: '#1a1c22' }] }, cornerRadius: 3 });
      renderer.drawRect({ x: x - 2, y: y - 80, width: 22, height: 10, fillStyle: '#2e323a', cornerRadius: 4 });
      renderer.drawRect({ x: x + 3, y: y - 60, width: 12, height: 5, fillStyle: 'rgba(240, 230, 200, 0.6)' });
    }
  }
}
