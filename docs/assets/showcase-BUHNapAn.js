var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _MoteField_instances, makeMote_fn, regroup_fn, drawGroup_fn, _Lighthouse_instances, projection_fn, _Lanterns_instances, flicker_fn, _Backdrop_instances, drawSky_fn, drawWater_fn, drawBank_fn;
import { U as UIElement, P as PARTICLE_STRIDE, O as OPTIONAL_CAPABILITIES, b as PerformanceStats, M as M2D, s as sameResolution, S as SettingsMenu } from "./settingsMenu-BRSbyVHp.js";
function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = state + 1831565813 >>> 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function range(rng, min, max) {
  return min + rng() * (max - min);
}
const WARM_TILES = [0, 1];
const COOL_TILES = [2, 3];
const MOTE_DRAWS = 11;
class MoteField {
  /**
   * @param {Object} options - Field options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {Object} options.sheet - Mote SpriteSheet
   * @param {{width: number, height: number}} options.bounds - World bounds motes wrap within
   * @param {number} options.waterline - World Y dividing bank from water
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=1337] - RNG seed
   */
  constructor({ renderer, sheet, bounds, waterline, features, seed = 1337 }) {
    __privateAdd(this, _MoteField_instances);
    this.renderer = renderer;
    this.sheet = sheet;
    this.bounds = bounds;
    this.waterline = waterline;
    this.features = features;
    this.seed = seed;
    this.motes = [];
    this.glowing = [];
    this.dim = [];
    this.count = 0;
    this.time = 0;
  }
  /**
   * Grow or shrink the field. Growing appends motes generated from the same
   * seeded stream, so a field of N is always the first N motes of the same
   * sequence regardless of how it got there.
   * @param {number} count - Desired mote count
   */
  setCount(count) {
    const target = Math.max(0, Math.floor(count));
    if (target < this.motes.length) {
      this.motes.length = target;
      this.count = target;
      __privateMethod(this, _MoteField_instances, regroup_fn).call(this);
      return;
    }
    const rng = makeRng(this.seed);
    for (let i = 0; i < this.motes.length * MOTE_DRAWS; i++) rng();
    while (this.motes.length < target) {
      this.motes.push(__privateMethod(this, _MoteField_instances, makeMote_fn).call(this, rng));
    }
    this.count = this.motes.length;
    __privateMethod(this, _MoteField_instances, regroup_fn).call(this);
  }
  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    const width = this.bounds.width;
    this.time += deltaTime;
    for (const mote of this.motes) {
      mote.x += mote.vx * deltaTime;
      mote.y += mote.vy * deltaTime;
      mote.spin += mote.spinRate * deltaTime;
      if (mote.x < 0) mote.x += width;
      else if (mote.x > width) mote.x -= width;
      const bandHeight = mote.bandBottom - mote.bandTop;
      if (mote.y < mote.bandTop) mote.y += bandHeight;
      else if (mote.y > mote.bandBottom) mote.y -= bandHeight;
    }
  }
  draw() {
    __privateMethod(this, _MoteField_instances, drawGroup_fn).call(this, this.dim, void 0);
    __privateMethod(this, _MoteField_instances, drawGroup_fn).call(this, this.glowing, this.features.blendModes ? "additive" : void 0);
  }
}
_MoteField_instances = new WeakSet();
/**
 * Build one mote from eleven draws. Every branch consumes the same draws so
 * that a field of N is always the first N motes of the same sequence.
 * @param {() => number} rng - Seeded generator
 * @returns {Object} Mote
 */
makeMote_fn = function(rng) {
  const x = range(rng, 0, this.bounds.width);
  const y = range(rng, 0, this.bounds.height);
  const drift = range(rng, -1, 1);
  const rise = rng();
  const sizePick = rng();
  const spin = range(rng, 0, Math.PI * 2);
  const spinRate = range(rng, -1.6, 1.6);
  const alphaPick = rng();
  const flickerPhase = range(rng, 0, Math.PI * 2);
  const flickerRate = range(rng, 1.5, 5);
  const tilePick = rng();
  const bankTop = this.waterline - 200;
  const bankBottom = this.waterline + 40;
  if (y >= bankTop && y <= bankBottom) {
    return {
      x,
      y,
      spin,
      spinRate,
      flickerPhase,
      flickerRate,
      vx: drift * 14,
      vy: -6 - rise * 10,
      size: 6 + sizePick * 9,
      alpha: 0.55 + alphaPick * 0.45,
      flickers: true,
      glows: true,
      tile: WARM_TILES[tilePick < 0.5 ? 0 : 1],
      bandTop: bankTop,
      bandBottom: bankBottom
    };
  }
  if (y > bankBottom) {
    return {
      x,
      y,
      spin,
      spinRate,
      flickerPhase,
      flickerRate,
      vx: drift * 26,
      vy: -4 - rise * 9,
      size: 4 + sizePick * 7,
      alpha: 0.1 + alphaPick * 0.18,
      flickers: false,
      glows: true,
      tile: COOL_TILES[tilePick < 0.5 ? 0 : 1],
      bandTop: bankBottom,
      bandBottom: this.bounds.height
    };
  }
  return {
    x,
    y,
    spin,
    spinRate,
    flickerPhase,
    flickerRate,
    vx: drift * 20,
    vy: (rise - 0.5) * 4,
    size: 12 + sizePick * 18,
    alpha: 0.035 + alphaPick * 0.075,
    flickers: false,
    glows: false,
    tile: COOL_TILES[tilePick < 0.5 ? 0 : 1],
    bandTop: 0,
    bandBottom: bankTop
  };
};
/**
 * Split the field by blend mode once, at build time. Doing it per frame
 * would cost more than the batching it protects.
 */
regroup_fn = function() {
  this.glowing = this.motes.filter((mote) => mote.glows);
  this.dim = this.motes.filter((mote) => !mote.glows);
};
/**
 * @param {Object[]} motes - One blend group
 * @param {string} [blend] - Blend mode for the whole group
 */
drawGroup_fn = function(motes, blend) {
  const image = this.sheet.image;
  const tileWidth = this.sheet.tileW;
  const tileHeight = this.sheet.tileH;
  const time = this.time;
  for (const mote of motes) {
    const pulse = mote.flickers ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * mote.flickerRate + mote.flickerPhase)) : 1;
    this.renderer.drawSprite({
      image,
      x: mote.x,
      y: mote.y,
      tileX: mote.tile,
      tileY: 0,
      tileWidth,
      tileHeight,
      width: mote.size,
      height: mote.size,
      rotation: mote.spin,
      globalAlpha: mote.alpha * pulse,
      blend
    });
  }
};
const DEPTH_TINTS = [
  "#ffffff",
  "#eef6ff",
  "#dceaff",
  "#c9dcf8",
  "#b4ccef",
  "#9fbce6",
  "#8aacdd",
  "#789dd4"
];
class ReedBed {
  /**
   * @param {Object} options - Bed options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {Object} options.sheet - Reed SpriteSheet
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} options.waterline - World Y the reeds stand on
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=4242] - RNG seed
   */
  constructor({ renderer, sheet, bounds, waterline, features, seed = 4242 }) {
    this.renderer = renderer;
    this.sheet = sheet;
    this.bounds = bounds;
    this.waterline = waterline;
    this.features = features;
    this.seed = seed;
    this.tileCount = Math.max(1, Math.floor(sheet.image.width / sheet.tileW));
    this.reeds = [];
    this.time = 0;
    this.count = 0;
  }
  /**
   * @param {number} count - Desired reed count
   */
  setCount(count) {
    const target = Math.max(0, Math.floor(count));
    const rng = makeRng(this.seed);
    this.reeds = [];
    for (let i = 0; i < target; i++) {
      const height = range(rng, 30, 96);
      const bankOffset = range(rng, -34, 96);
      const farness = (bankOffset + 34) / 130;
      this.reeds.push({
        x: range(rng, -40, this.bounds.width + 40),
        // Reeds further up the bank are drawn smaller and dimmer, which fakes
        // depth without needing a second sheet.
        baseY: this.waterline - bankOffset,
        height,
        width: height * 0.45,
        phase: range(rng, 0, Math.PI * 2),
        speed: range(rng, 0.6, 1.5),
        amplitude: range(rng, 0.05, 0.22),
        alpha: range(rng, 0.45, 1),
        tint: DEPTH_TINTS[Math.min(DEPTH_TINTS.length - 1, Math.floor(farness * DEPTH_TINTS.length))],
        tile: Math.floor(range(rng, 0, this.tileCount))
      });
    }
    this.reeds.sort((a, b) => a.baseY - b.baseY);
    this.count = this.reeds.length;
  }
  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;
  }
  draw() {
    const image = this.sheet.image;
    const tileWidth = this.sheet.tileW;
    const tileHeight = this.sheet.tileH;
    const tinted = this.features.tint;
    for (const reed of this.reeds) {
      const angle = Math.sin(this.time * reed.speed + reed.phase) * reed.amplitude;
      const half = reed.height / 2;
      this.renderer.drawSprite({
        image,
        x: reed.x + Math.sin(angle) * half,
        y: reed.baseY - Math.cos(angle) * half,
        tileX: reed.tile,
        tileY: 0,
        tileWidth,
        tileHeight,
        width: reed.width,
        height: reed.height,
        rotation: angle,
        globalAlpha: reed.alpha,
        tint: tinted ? reed.tint : void 0
      });
    }
  }
}
const VOCABULARY = [
  "12",
  "27",
  "41",
  "68",
  "94",
  "115",
  "203",
  "377",
  "CRIT!",
  "MISS",
  "BLOCK",
  "PARRY",
  "+5 HP",
  "COMBO x3"
];
const COLORS = ["#ffe082", "#ff8a65", "#80deea", "#c5e1a5", "#f48fb1", "#ffffff"];
class LabelStorm {
  /**
   * @param {Object} options - Storm options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} [options.seed=909] - RNG seed
   */
  constructor({ renderer, bounds, seed = 909 }) {
    this.renderer = renderer;
    this.bounds = bounds;
    this.seed = seed;
    this.labels = [];
    this.count = 0;
  }
  /**
   * @param {number} count - Desired label count
   */
  setCount(count) {
    const target = Math.max(0, Math.floor(count));
    const rng = makeRng(this.seed);
    this.labels = [];
    for (let i = 0; i < target; i++) {
      this.labels.push({
        x: range(rng, 0, this.bounds.width),
        y: range(rng, 0, this.bounds.height),
        rise: range(rng, 18, 54),
        life: range(rng, 0, 1),
        decay: range(rng, 0.18, 0.5),
        fontSize: Math.round(range(rng, 13, 24)),
        text: VOCABULARY[Math.floor(range(rng, 0, VOCABULARY.length))],
        color: COLORS[Math.floor(range(rng, 0, COLORS.length))]
      });
    }
    this.count = this.labels.length;
    this.rng = rng;
  }
  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    const rng = this.rng;
    if (!rng) return;
    for (const label of this.labels) {
      label.y -= label.rise * deltaTime;
      label.life -= label.decay * deltaTime;
      if (label.life <= 0) {
        label.life = 1;
        label.x = range(rng, 0, this.bounds.width);
        label.y = range(rng, 0, this.bounds.height);
        label.text = VOCABULARY[Math.floor(range(rng, 0, VOCABULARY.length))];
        label.color = COLORS[Math.floor(range(rng, 0, COLORS.length))];
      }
    }
  }
  draw() {
    for (const label of this.labels) {
      this.renderer.drawText({
        text: label.text,
        x: label.x,
        y: label.y,
        fillStyle: label.color,
        strokeStyle: "rgba(0, 0, 0, 0.85)",
        lineWidth: 3,
        fontSize: `${label.fontSize}px`,
        fontFamily: "monospace",
        fontWeight: "bold",
        textAlign: "center",
        textBaseline: "middle",
        globalAlpha: Math.min(1, label.life)
      });
    }
  }
}
class Minimap extends UIElement {
  /**
   * @param {Object} game - M2D instance
   * @param {Object} options - Chart options
   * @param {number} options.x - Panel centre X, offset from the anchor
   * @param {number} options.y - Panel centre Y, offset from the anchor
   * @param {string} [options.anchor] - Corner the offset is measured from
   * @param {number} options.size - Panel width and height
   * @param {{width: number, height: number}} options.bounds - World bounds to map
   * @param {import('./moteField.js').MoteField} options.field - Field to plot
   * @param {import('./lighthouse.js').Lighthouse} options.lighthouse - Beam source
   * @param {number} options.shoreY - World Y of the water/bank boundary
   */
  constructor(game2, { x, y, size, bounds, field, lighthouse, shoreY, anchor }) {
    super(x, y, size, size, { anchor });
    this.game = game2;
    this.size = size;
    this.bounds = bounds;
    this.field = field;
    this.lighthouse = lighthouse;
    this.shoreY = shoreY;
    this.visible = true;
    this.maxBlips = 200;
  }
  draw() {
    if (!this.visible) return;
    const renderer = this.game.uiRenderer;
    const size = this.size;
    const left = this.x - size / 2;
    const top = this.y - size / 2;
    const scaleX = size / this.bounds.width;
    const scaleY = size / this.bounds.height;
    renderer.drawRect({
      x: left,
      y: top,
      width: size,
      height: size,
      fillStyle: "rgba(6, 14, 22, 0.86)",
      strokeStyle: "rgba(120, 200, 255, 0.55)",
      lineWidth: 2,
      cornerRadius: 10
    });
    renderer.pushClip({ x: left, y: top, width: size, height: size, cornerRadius: 10 });
    renderer.drawRect({
      x: left,
      y: top,
      width: size,
      height: this.shoreY * scaleY,
      fillStyle: "rgba(24, 64, 104, 0.55)"
    });
    const step = Math.max(1, Math.ceil(this.field.motes.length / this.maxBlips));
    for (let i = 0; i < this.field.motes.length; i += step) {
      const mote = this.field.motes[i];
      renderer.drawRect({
        x: left + mote.x * scaleX,
        y: top + mote.y * scaleY,
        width: 2,
        height: 2,
        fillStyle: "rgba(130, 220, 255, 0.7)"
      });
    }
    const camera = this.game.camera;
    renderer.drawRect({
      x: left + (camera.x - camera.width / 2) * scaleX,
      y: top + (camera.y - camera.height / 2) * scaleY,
      width: camera.width * scaleX,
      height: camera.height * scaleY,
      strokeStyle: "#7CFFB2",
      lineWidth: 1.5,
      fill: false
    });
    const lampX = left + this.lighthouse.x * scaleX;
    const lampY = top + this.lighthouse.lampY * scaleY;
    const reach = this.lighthouse.reach * scaleX;
    renderer.pushTransform({ x: lampX, y: lampY, rotation: this.lighthouse.angle });
    renderer.pushClip({ x: 0, y: -reach * 0.16, width: reach, height: reach * 0.32 });
    renderer.drawArc({
      x: 0,
      y: 0,
      radius: reach,
      fillStyle: {
        type: "radial",
        x: 0,
        y: 0,
        r0: 0,
        r1: reach,
        stops: [
          { offset: 0, color: "rgba(255, 243, 180, 0.55)" },
          { offset: 1, color: "rgba(255, 243, 180, 0)" }
        ]
      }
    });
    renderer.popClip();
    renderer.popTransform();
    renderer.popClip();
    renderer.drawArc({
      x: lampX,
      y: lampY,
      radius: 3,
      fillStyle: "#FFF59D"
    });
    renderer.drawText({
      text: "HARBOUR",
      x: left + 8,
      y: top + 6,
      fillStyle: "rgba(160, 220, 255, 0.8)",
      fontSize: "11px",
      fontFamily: "monospace",
      textAlign: "left",
      textBaseline: "top"
    });
  }
}
function beamShafts(count, sigma, peak) {
  const shafts = [];
  for (let i = 0; i < count; i++) {
    const p = (i + 0.5) / count;
    shafts.push({
      spread: 2 * sigma * Math.sqrt(-2 * Math.log(p)),
      alpha: peak / count
    });
  }
  return shafts;
}
const SHAFTS = beamShafts(8, 78, 0.34);
const MAX_TILT = 0.3;
const HALO_RADIUS = 100;
class Lighthouse {
  /**
   * @param {Object} options - Lighthouse options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {Object} options.sheet - Lighthouse SpriteSheet
   * @param {number} options.x - World X of the tower's centre
   * @param {number} options.baseY - World Y the tower stands on
   * @param {number} options.reach - Beam length in world units
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.scale=1] - Sprite scale; the tower is a landmark,
   *   so it is drawn well above its native 64x160
   * @param {number} options.horizonY - World Y of the horizon, i.e. the
   *   viewer's eye level. A beam pointing straight away converges onto it at
   *   full reach, which is what fixes the viewpoint and makes the perspective
   *   read. The lamp may sit above or below it; the sign falls out of the
   *   subtraction either way.
   */
  constructor({ renderer, sheet, x, baseY, reach, features, horizonY, scale = 1 }) {
    __privateAdd(this, _Lighthouse_instances);
    this.renderer = renderer;
    this.features = features;
    this.sheet = sheet;
    this.x = x;
    this.baseY = baseY;
    this.reach = reach;
    this.height = sheet.tileH * scale;
    this.width = sheet.tileW * scale;
    this.angle = 0;
    this.speed = 0.45;
    this.lampY = baseY - this.height * 0.83;
    this.dropPerDepth = (horizonY - this.lampY) / reach;
    this.beamGradient = {
      type: "radial",
      x: 0,
      y: 0,
      r0: 0,
      r1: reach,
      stops: [
        { offset: 0, color: "rgba(255, 226, 150, 1)" },
        { offset: 0.4, color: "rgba(255, 214, 128, 0.45)" },
        { offset: 1, color: "rgba(255, 214, 128, 0)" }
      ]
    };
    this.haloGradient = {
      type: "radial",
      x: 0,
      y: 0,
      r0: 0,
      r1: HALO_RADIUS,
      stops: [
        { offset: 0, color: "rgba(255, 240, 180, 1)" },
        { offset: 0.35, color: "rgba(255, 220, 140, 0.33)" },
        { offset: 1, color: "rgba(255, 214, 128, 0)" }
      ]
    };
    this.flareGradient = {
      type: "radial",
      x: 0,
      y: 0,
      r0: 0,
      r1: HALO_RADIUS,
      stops: [
        { offset: 0, color: "rgba(255, 252, 232, 1)" },
        { offset: 0.18, color: "rgba(255, 238, 176, 0.62)" },
        { offset: 0.55, color: "rgba(255, 214, 128, 0.16)" },
        { offset: 1, color: "rgba(255, 206, 110, 0)" }
      ]
    };
  }
  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.angle = (this.angle + this.speed * deltaTime) % (Math.PI * 2);
  }
  /**
   * Depth component of the beam direction: +1 straight at the viewer, -1
   * straight away. Everything perspective-related derives from this.
   * @returns {number} Facing in [-1, 1]
   */
  facing() {
    return Math.sin(this.angle);
  }
  /**
   * Whether the beam currently points away from the viewer and so should be
   * drawn before the tower, which then occludes its root.
   * @returns {boolean} True when the beam is behind the tower
   */
  beamBehindTower() {
    return this.facing() < 0;
  }
  drawTower() {
    this.renderer.drawSprite({
      image: this.sheet.image,
      x: this.x,
      y: this.baseY - this.height / 2,
      tileX: 0,
      tileY: 0,
      tileWidth: this.sheet.tileW,
      tileHeight: this.sheet.tileH,
      width: this.width,
      height: this.height,
      rotation: 0
    });
  }
  /**
   * Draw the sweeping shaft of light, projected for the viewpoint.
   */
  drawBeam() {
    const renderer = this.renderer;
    const { heading, length, width, intensity, shaft } = __privateMethod(this, _Lighthouse_instances, projection_fn).call(this);
    if (shaft <= 1e-3) return;
    const blend = this.features.blendModes ? "additive" : void 0;
    const lightCompensation = this.features.lights ? 1.8 : 1;
    const alpha = intensity * shaft * lightCompensation;
    renderer.pushTransform({
      x: this.x,
      y: this.lampY,
      rotation: heading,
      scaleX: length,
      scaleY: width
    });
    for (const slab of SHAFTS) {
      renderer.pushClip({
        x: 0,
        y: -slab.spread / 2,
        width: this.reach,
        height: slab.spread
      });
      renderer.drawArc({
        x: 0,
        y: 0,
        radius: this.reach,
        blend,
        globalAlpha: slab.alpha * alpha,
        fillStyle: this.beamGradient
      });
      renderer.popClip();
    }
    renderer.popTransform();
  }
  /**
   * Lamp halo. Always in front of the tower, and it takes over from the shaft
   * as the beam turns head-on, so the light has somewhere to go.
   */
  drawHalo() {
    const renderer = this.renderer;
    const { flare } = __privateMethod(this, _Lighthouse_instances, projection_fn).call(this);
    const lightCompensation = this.features.lights ? 1.6 : 1;
    const scale = 0.55 + flare * 1;
    renderer.pushTransform({ x: this.x, y: this.lampY, scaleX: scale, scaleY: scale });
    renderer.drawArc({
      x: 0,
      y: 0,
      radius: HALO_RADIUS,
      blend: this.features.blendModes ? "additive" : void 0,
      globalAlpha: Math.min(0.82, (0.4 + flare * 0.34) * lightCompensation),
      fillStyle: flare > 1e-3 ? this.flareGradient : this.haloGradient
    });
    renderer.popTransform();
  }
}
_Lighthouse_instances = new WeakSet();
/**
 * Project the lamp's horizontal angle into screen terms.
 *
 * The naive version took `atan2(depthOffset, alongShore)` directly, which
 * breaks exactly where the user notices it: as the beam swings toward the
 * camera the along-shore component goes to zero while the depth offset does
 * not, so the heading snaps to vertical and the shaft appears to rotate
 * like a clock hand. Two things fix it. The tilt away from horizontal is
 * measured against the *absolute* along-shore component and clamped, so it
 * can never approach vertical; and the shaft fades out as it turns head-on,
 * because a shaft only reads as a shaft while it is broadside. The light
 * does not vanish — it moves into the lamp flare, which is what you
 * actually see when a lighthouse points at you.
 *
 * @returns {{heading: number, length: number, width: number,
 *   intensity: number, shaft: number, flare: number}}
 */
projection_fn = function() {
  const along = Math.cos(this.angle);
  const depth = this.facing();
  const screenY = depth < 0 ? -depth * this.dropPerDepth : -depth * this.dropPerDepth * 0.25;
  const horizontal = Math.abs(along);
  const tilt = Math.atan2(screenY, Math.max(horizontal, 1e-4));
  const clamped = Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt));
  const heading = along >= 0 ? clamped : Math.PI - clamped;
  const shaft = smoothstep(0.12, 0.52, horizontal);
  const flare = smoothstep(0.45, 0.98, depth);
  return {
    heading,
    length: Math.hypot(along, screenY),
    width: 1 + depth * 0.7,
    intensity: 0.55 + 0.45 * (depth + 1) / 2,
    shaft,
    flare
  };
};
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
const PARAM_STRIDE = 5;
const FALLBACK_CAP = 800;
class RainEmitter {
  /**
   * @param {Object} options - Emitter options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {Object} options.sheet - Rain streak SpriteSheet
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} options.waterline - World Y the rain falls to
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=777] - RNG seed
   */
  constructor({ renderer, sheet, bounds, waterline, features, seed = 777 }) {
    this.renderer = renderer;
    this.sheet = sheet;
    this.bounds = bounds;
    this.waterline = waterline;
    this.features = features;
    this.seed = seed;
    this.time = 0;
    this.wind = 0.18;
    this.slant = Math.atan(this.wind);
    this.data = new Float32Array(0);
    this.params = new Float32Array(0);
    this.count = 0;
    this.requested = 0;
  }
  /** @returns {boolean} Whether this backend had to cap the drop count */
  capped() {
    return this.count < this.requested;
  }
  /**
   * @param {number} count - Desired drop count
   */
  setCount(count) {
    this.requested = Math.max(0, Math.floor(count));
    const target = this.features.particles ? this.requested : Math.min(this.requested, FALLBACK_CAP);
    const rng = makeRng(this.seed);
    this.params = new Float32Array(target * PARAM_STRIDE);
    this.data = new Float32Array(target * PARTICLE_STRIDE);
    for (let i = 0; i < target; i++) {
      const p = i * PARAM_STRIDE;
      const nearness = rng();
      this.params[p] = range(rng, -this.bounds.width * 0.1, this.bounds.width * 1.1);
      this.params[p + 1] = 520 + nearness * 780;
      this.params[p + 2] = rng();
      this.params[p + 3] = 10 + nearness * 22;
      this.params[p + 4] = 0.16 + nearness * 0.34;
      const d = i * PARTICLE_STRIDE;
      this.data[d + 3] = this.slant;
      this.data[d + 4] = 0.78;
      this.data[d + 5] = 0.88;
      this.data[d + 6] = 1;
    }
    this.count = target;
  }
  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;
    const span = this.waterline + 40;
    const data = this.data;
    const params = this.params;
    const time = this.time;
    const wind = this.wind;
    for (let i = 0; i < this.count; i++) {
      const p = i * PARAM_STRIDE;
      const d = i * PARTICLE_STRIDE;
      const speed = params[p + 1];
      const fall = (time * speed + params[p + 2] * span) % span;
      data[d] = params[p] + fall * wind;
      data[d + 1] = fall - 20;
      data[d + 2] = params[p + 3];
      data[d + 7] = params[p + 4] * Math.min(1, fall / 80);
    }
  }
  draw() {
    if (this.count === 0) return;
    this.renderer.drawParticles({
      image: this.sheet.image,
      tileX: 0,
      tileY: 0,
      tileWidth: this.sheet.tileW,
      tileHeight: this.sheet.tileH,
      data: this.data,
      count: this.count,
      blend: this.features.blendModes ? "screen" : void 0
    });
  }
}
class Lanterns {
  /**
   * @param {Object} options - Lantern options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {Object} options.sheet - Lantern SpriteSheet
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} options.shoreY - World Y of the water/bank boundary
   * @param {import('./lighthouse.js').Lighthouse} options.lighthouse - Lamp to light
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=5150] - RNG seed
   */
  constructor({ renderer, sheet, bounds, shoreY, lighthouse, features, seed = 5150 }) {
    __privateAdd(this, _Lanterns_instances);
    this.renderer = renderer;
    this.sheet = sheet;
    this.bounds = bounds;
    this.shoreY = shoreY;
    this.lighthouse = lighthouse;
    this.features = features;
    this.time = 0;
    const rng = makeRng(seed);
    const spacing = bounds.width / 9;
    this.lanterns = [];
    for (let i = 0; i < 9; i++) {
      const footY = shoreY + range(rng, 26, 120);
      const postHeight = range(rng, 90, 150);
      this.lanterns.push({
        x: spacing * (i + 0.5) + range(rng, -40, 40),
        footY,
        postHeight,
        y: footY - postHeight,
        size: range(rng, 42, 58),
        radius: range(rng, 240, 400),
        phase: range(rng, 0, Math.PI * 2),
        rate: range(rng, 1.4, 3.6),
        tile: rng() < 0.5 ? 0 : 1,
        color: rng() < 0.3 ? "#ffd27f" : "#ffbe66"
      });
    }
    this.count = this.lanterns.length;
  }
  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;
  }
  drawSprites() {
    const image = this.sheet.image;
    const renderer = this.renderer;
    for (const lantern of this.lanterns) {
      renderer.drawRect({
        x: lantern.x - 3,
        y: lantern.y,
        width: 6,
        height: lantern.postHeight,
        fillStyle: "#2b2118"
      });
      renderer.drawRect({
        x: lantern.x - 9,
        y: lantern.footY - 7,
        width: 18,
        height: 7,
        fillStyle: "#1d160f",
        cornerRadius: 2
      });
    }
    for (const lantern of this.lanterns) {
      renderer.drawSprite({
        image,
        x: lantern.x,
        y: lantern.y,
        tileX: lantern.tile,
        tileY: 0,
        tileWidth: this.sheet.tileW,
        tileHeight: this.sheet.tileH,
        width: lantern.size,
        height: lantern.size,
        globalAlpha: 0.75 + __privateMethod(this, _Lanterns_instances, flicker_fn).call(this, lantern) * 0.25
      });
    }
  }
  /**
   * Submit this frame's lights. Separate from the sprites so the director can
   * keep lighting on while the lantern sprites are hidden, and so all the
   * lights land together regardless of draw order.
   */
  drawLights() {
    const renderer = this.renderer;
    for (const lantern of this.lanterns) {
      const flicker = __privateMethod(this, _Lanterns_instances, flicker_fn).call(this, lantern);
      renderer.drawLight({
        x: lantern.x,
        y: lantern.y,
        radius: lantern.radius * (0.94 + flicker * 0.06),
        color: lantern.color,
        intensity: 0.75 * flicker
      });
      renderer.drawLight({
        x: lantern.x,
        y: lantern.y + 40,
        radius: lantern.radius * 1.9,
        color: "#5f7196",
        intensity: 0.42
      });
    }
    const lamp = this.lighthouse;
    const flare = Math.max(0, lamp.facing() - 0.7) / 0.3;
    renderer.drawLight({
      x: lamp.x,
      y: lamp.lampY,
      radius: 680,
      color: "#fff0c0",
      intensity: 0.5 + flare * 0.55
    });
  }
}
_Lanterns_instances = new WeakSet();
/** Flicker multiplier for one lantern at the current time. */
flicker_fn = function(lantern) {
  const wobble = Math.sin(this.time * lantern.rate + lantern.phase);
  const fast = Math.sin(this.time * lantern.rate * 2.7 + lantern.phase * 1.7);
  return 0.82 + 0.12 * wobble + 0.06 * fast;
};
class Backdrop {
  /**
   * @param {Object} options - Backdrop options
   * @param {import('../../core/renderers/baseRenderer.js').BaseRenderer} options.renderer - Backend
   * @param {{width: number, height: number}} options.bounds - World bounds
   * @param {number} options.horizonY - Sky/water boundary (the eye level)
   * @param {number} options.shoreY - Water/bank boundary
   * @param {number} options.glitterX - World X the glitter path sits under
   * @param {Object} options.features - Optional backend features in use
   * @param {number} [options.seed=2024] - RNG seed
   */
  constructor({ renderer, bounds, horizonY, shoreY, glitterX, features, seed = 2024 }) {
    __privateAdd(this, _Backdrop_instances);
    this.renderer = renderer;
    this.bounds = bounds;
    this.horizonY = horizonY;
    this.shoreY = shoreY;
    this.glitterX = glitterX;
    this.features = features;
    this.time = 0;
    const rng = makeRng(seed);
    const span = shoreY - horizonY;
    this.ripples = [];
    for (let i = 0; i < 260; i++) {
      const depth = Math.sqrt(rng());
      this.ripples.push({
        x: range(rng, -60, bounds.width + 60),
        y: horizonY + depth * span,
        width: 14 + depth * 110,
        height: 1 + depth * 2.2,
        alpha: 0.12 + depth * 0.3,
        drift: range(rng, -9, 9) * (0.3 + depth),
        phase: range(rng, 0, Math.PI * 2),
        rate: range(rng, 0.4, 1.3)
      });
    }
    this.glitter = [];
    for (let i = 0; i < 90; i++) {
      const depth = rng();
      this.glitter.push({
        offset: range(rng, -1, 1) * (26 + depth * 150),
        y: horizonY + depth * span,
        width: 6 + depth * 34,
        height: 1 + depth * 2,
        alpha: (0.1 + depth * 0.3) * range(rng, 0.4, 1),
        phase: range(rng, 0, Math.PI * 2),
        rate: range(rng, 1.1, 2.8)
      });
    }
  }
  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;
  }
  /**
   * Skyglow on the water.
   *
   * Under a night ambient the water has no headroom left: multiplying any
   * plausible sea colour by the ambient lands it on the same near-black as
   * the sky, and brightening the base colour enough to survive would make it
   * glow in daylight. Lighting it is the honest fix — open water at night is
   * lit, by the sky if nothing else — so the band carries a few broad, cool,
   * low-intensity lights of its own.
   */
  drawLights() {
    const renderer = this.renderer;
    const span = this.shoreY - this.horizonY;
    const midY = this.horizonY + span * 0.45;
    const count = 5;
    for (let i = 0; i < count; i++) {
      renderer.drawLight({
        x: this.bounds.width / count * (i + 0.5),
        y: midY,
        radius: this.bounds.width / count + span,
        color: "#8fb4e8",
        intensity: 0.5
      });
    }
    renderer.drawLight({
      x: this.glitterX,
      y: this.horizonY + span * 0.6,
      radius: span * 1.5,
      color: "#ffd9a0",
      intensity: 0.5
    });
  }
  /**
   * Sky and open water. Drawn before the reeds, which stand in the shallows.
   */
  drawDistance() {
    __privateMethod(this, _Backdrop_instances, drawSky_fn).call(this);
    __privateMethod(this, _Backdrop_instances, drawWater_fn).call(this);
  }
  /**
   * The near bank. Drawn *after* the reeds on purpose: reeds stand further
   * out in the water, so the shore in front of them has to occlude their
   * feet. Painting it with the rest of the backdrop put the near ground
   * behind everything and left the reeds hanging in the water.
   */
  drawBank() {
    __privateMethod(this, _Backdrop_instances, drawBank_fn).call(this);
  }
}
_Backdrop_instances = new WeakSet();
drawSky_fn = function() {
  this.renderer.drawRect({
    x: 0,
    y: 0,
    width: this.bounds.width,
    height: this.horizonY,
    fillStyle: {
      type: "linear",
      x0: 0,
      y0: 0,
      x1: 0,
      y1: this.horizonY,
      stops: [
        { offset: 0, color: "#05070f" },
        { offset: 0.65, color: "#0c1830" },
        { offset: 1, color: "#1b2d4e" }
      ]
    }
  });
};
drawWater_fn = function() {
  const renderer = this.renderer;
  const { width } = this.bounds;
  const span = this.shoreY - this.horizonY;
  const time = this.time;
  const blend = this.features.blendModes ? "additive" : void 0;
  renderer.drawRect({
    x: 0,
    y: this.horizonY,
    width,
    height: span,
    fillStyle: {
      type: "linear",
      x0: 0,
      y0: this.horizonY,
      x1: 0,
      y1: this.shoreY,
      stops: [
        { offset: 0, color: "#264875" },
        { offset: 0.45, color: "#1a3459" },
        { offset: 1, color: "#11223d" }
      ]
    }
  });
  renderer.drawRect({
    x: 0,
    y: this.horizonY - 1,
    width,
    height: 2,
    fillStyle: "rgba(190, 220, 255, 0.34)"
  });
  for (const ripple of this.ripples) {
    const bob = Math.sin(time * ripple.rate + ripple.phase);
    let x = ripple.x + time * ripple.drift;
    const wrapSpan = width + 120;
    x = ((x + 60) % wrapSpan + wrapSpan) % wrapSpan - 60;
    renderer.drawRect({
      x,
      y: ripple.y + bob * 1.5,
      width: ripple.width,
      height: ripple.height,
      fillStyle: "rgba(170, 205, 245, 0.9)",
      globalAlpha: ripple.alpha * (0.65 + 0.35 * bob),
      cornerRadius: ripple.height
    });
  }
  for (const dash of this.glitter) {
    const twinkle = 0.5 + 0.5 * Math.sin(time * dash.rate + dash.phase);
    renderer.drawRect({
      x: this.glitterX + dash.offset - dash.width / 2,
      y: dash.y,
      width: dash.width,
      height: dash.height,
      fillStyle: "rgba(255, 228, 160, 0.95)",
      globalAlpha: dash.alpha * twinkle,
      blend,
      cornerRadius: dash.height
    });
  }
};
drawBank_fn = function() {
  const renderer = this.renderer;
  const { width, height } = this.bounds;
  renderer.drawRect({
    x: 0,
    y: this.shoreY,
    width,
    height: height - this.shoreY,
    fillStyle: {
      type: "linear",
      x0: 0,
      y0: this.shoreY,
      x1: 0,
      y1: height,
      stops: [
        { offset: 0, color: "#243524" },
        { offset: 0.25, color: "#1a2619" },
        { offset: 1, color: "#0b1210" }
      ]
    }
  });
  renderer.drawRect({
    x: 0,
    y: this.shoreY - 3,
    width,
    height: 6,
    fillStyle: "rgba(120, 150, 170, 0.33)"
  });
  renderer.drawRect({
    x: 0,
    y: this.shoreY + 3,
    width,
    height: 14,
    fillStyle: "rgba(60, 92, 56, 0.45)"
  });
};
class Hud extends UIElement {
  /**
   * @param {Object} game - M2D instance
   * @param {Object} showcase - Showcase director (for layer state and counts)
   */
  constructor(game2, showcase2) {
    super(0, 0, 0, 0);
    this.game = game2;
    this.showcase = showcase2;
    this.visible = true;
  }
  /**
   * Backend name as registered, derived from the class name so a new backend
   * needs no change here.
   * @returns {string} Lowercased backend name, e.g. 'webgl'
   */
  backendName() {
    return this.game.renderer.constructor.name.replace(/Renderer$/, "").toLowerCase();
  }
  /**
   * World render resolution, with the visible view size alongside it. The two
   * are deliberately independent: lowering the resolution must not change how
   * much world is on screen.
   * @returns {string}
   */
  resolutionLabel() {
    const view = this.game.viewport;
    const native = this.game.resolution === "native" ? " (native)" : "";
    return `${view.worldWidth}x${view.worldHeight}${native}  view ${Math.round(view.viewWidth)}x${Math.round(view.viewHeight)}`;
  }
  draw() {
    if (!this.visible) return;
    const renderer = this.game.uiRenderer;
    const backend = this.game.renderer;
    const stats = this.showcase.worldStats;
    if (!stats) return;
    const view = this.game.viewport;
    const padding = 12;
    const lineHeight = 17;
    const ratio = stats.drawCalls > 0 ? (stats.primitives / stats.drawCalls).toFixed(1) : "0.0";
    const lines = [
      `backend     ${this.backendName()}   (B to swap)`,
      `fps         ${backend.getFPS()}   avg ${backend.getAverageFPS()}`,
      "",
      "world pass",
      `primitives  ${stats.primitives.toLocaleString()}`,
      `draw calls  ${stats.drawCalls.toLocaleString()}   (${ratio} primitives per call)`,
      `state chg   ${stats.stateChanges.toLocaleString()}`,
      "",
      `sprites     ${stats.spritesDrawn.toLocaleString()}`,
      `text        ${stats.textDrawn.toLocaleString()}`,
      `shapes      ${stats.shapesDrawn.toLocaleString()}`,
      "",
      `load        ${this.showcase.loadLabel()}   ([ / ] to change)`,
      "",
      "display",
      `world res   ${this.resolutionLabel()}   (V to change)`,
      `ui res      ${Math.round(view.uiWidth)}x${Math.round(view.uiHeight)} @ ${view.pixelRatio}x   (always native)`,
      `aspect      ${this.game.aspectMode}   (A to change)`,
      `fullscreen  ${this.game.isFullscreen ? "on" : "off"}   (F to toggle)`
    ];
    const width = 330;
    const height = padding * 2 + lines.length * lineHeight;
    renderer.drawRect({
      x: padding,
      y: padding,
      width,
      height,
      fillStyle: "rgba(6, 14, 22, 0.82)",
      strokeStyle: "rgba(120, 200, 255, 0.4)",
      lineWidth: 1,
      cornerRadius: 8
    });
    lines.forEach((line, index) => {
      if (!line) return;
      renderer.drawText({
        text: line,
        x: padding * 2,
        y: padding * 2 + index * lineHeight,
        fillStyle: index === 5 ? "#7CFFB2" : "#CFE8FF",
        fontSize: "13px",
        fontFamily: "monospace",
        textAlign: "left",
        textBaseline: "top"
      });
    });
    this.drawCapabilities(renderer, padding, padding + height + 10);
    this.drawLayers(renderer, padding, padding + height + 10 + 108);
  }
  /**
   * Print every optional capability with a tick or cross. Reading the list
   * from OPTIONAL_CAPABILITIES rather than a local copy means features added
   * to the contract show up here automatically, unsupported until claimed.
   */
  drawCapabilities(renderer, x, y) {
    const names = Object.keys(OPTIONAL_CAPABILITIES);
    const lineHeight = 16;
    const height = 20 + names.length * lineHeight + 8;
    renderer.drawRect({
      x,
      y,
      width: 330,
      height,
      fillStyle: "rgba(6, 14, 22, 0.82)",
      strokeStyle: "rgba(120, 200, 255, 0.4)",
      lineWidth: 1,
      cornerRadius: 8
    });
    renderer.drawText({
      text: "optional capabilities",
      x: x + 12,
      y: y + 8,
      fillStyle: "rgba(160, 220, 255, 0.8)",
      fontSize: "12px",
      fontFamily: "monospace",
      textAlign: "left",
      textBaseline: "top"
    });
    names.forEach((name, index) => {
      const supported = this.game.renderer.supports(name);
      renderer.drawText({
        text: `${supported ? "+" : "-"} ${name}`,
        x: x + 12,
        y: y + 26 + index * lineHeight,
        fillStyle: supported ? "#7CFFB2" : "rgba(200, 200, 200, 0.45)",
        fontSize: "12px",
        fontFamily: "monospace",
        textAlign: "left",
        textBaseline: "top"
      });
    });
  }
  /**
   * Print the layer toggles and their live counts.
   */
  drawLayers(renderer, x, y) {
    const layers = this.showcase.layerSummary();
    const lineHeight = 16;
    const height = 20 + layers.length * lineHeight + 8;
    renderer.drawRect({
      x,
      y,
      width: 330,
      height,
      fillStyle: "rgba(6, 14, 22, 0.82)",
      strokeStyle: "rgba(120, 200, 255, 0.4)",
      lineWidth: 1,
      cornerRadius: 8
    });
    renderer.drawText({
      text: "layers   (1-7 to toggle, P pauses camera)",
      x: x + 12,
      y: y + 8,
      fillStyle: "rgba(160, 220, 255, 0.8)",
      fontSize: "12px",
      fontFamily: "monospace",
      textAlign: "left",
      textBaseline: "top"
    });
    layers.forEach((layer, index) => {
      renderer.drawText({
        text: `${index + 1} ${layer.enabled ? "[x]" : "[ ]"} ${layer.name.padEnd(10)} ${layer.count}`,
        x: x + 12,
        y: y + 26 + index * lineHeight,
        fillStyle: layer.enabled ? "#CFE8FF" : "rgba(200, 200, 200, 0.45)",
        fontSize: "12px",
        fontFamily: "monospace",
        textAlign: "left",
        textBaseline: "top"
      });
    });
  }
}
const BASE_COUNTS = {
  motes: 2400,
  reeds: 2200,
  labels: 150,
  rain: 6e3
};
const LOAD_LEVELS = [0.25, 0.5, 1, 2, 4, 8, 16];
const DEFAULT_LOAD_INDEX = 2;
class Showcase {
  /**
   * @param {Object} game - M2D instance
   * @param {Object} options - Director options
   * @param {Map<string, Object>} options.spriteSheets - Loaded sheets by key
   * @param {{width: number, height: number}} options.bounds - World bounds
   */
  constructor(game2, { spriteSheets, bounds }) {
    this.game = game2;
    this.bounds = bounds;
    this.time = 0;
    this.cameraPaused = false;
    this.loadIndex = DEFAULT_LOAD_INDEX;
    this.worldStats = null;
    const renderer = game2.renderer;
    const waterline = bounds.height * 0.72;
    const horizonY = waterline - 420;
    const shoreY = waterline + 40;
    this.features = {
      tint: renderer.supports("tint"),
      blendModes: renderer.supports("blendModes"),
      particles: renderer.supports("particles"),
      lights: renderer.supports("lights"),
      postEffects: renderer.supports("postEffects")
    };
    this.field = new MoteField({
      renderer,
      sheet: spriteSheets.get("mote"),
      bounds,
      waterline,
      features: this.features
    });
    this.reeds = new ReedBed({
      renderer,
      sheet: spriteSheets.get("reed"),
      bounds,
      waterline,
      features: this.features
    });
    this.labels = new LabelStorm({ renderer, bounds });
    this.rain = new RainEmitter({
      renderer,
      sheet: spriteSheets.get("rain"),
      bounds,
      waterline,
      features: this.features
    });
    this.lighthouse = new Lighthouse({
      renderer,
      sheet: spriteSheets.get("lighthouse"),
      x: bounds.width * 0.5,
      baseY: shoreY + 30,
      reach: bounds.width * 0.72,
      horizonY,
      scale: 2.6,
      features: this.features
    });
    this.backdrop = new Backdrop({
      renderer,
      bounds,
      horizonY,
      shoreY,
      glitterX: this.lighthouse.x,
      features: this.features
    });
    this.lanterns = new Lanterns({
      renderer,
      sheet: spriteSheets.get("lantern"),
      bounds,
      shoreY,
      lighthouse: this.lighthouse,
      features: this.features
    });
    this.minimap = new Minimap(game2, {
      // Anchored, so the chart stays in the real top-right corner at any
      // aspect ratio and in fullscreen.
      anchor: "top-right",
      x: -110,
      y: 110,
      size: 180,
      bounds,
      field: this.field,
      lighthouse: this.lighthouse,
      shoreY
    });
    this.hud = new Hud(game2, this);
    this.waterline = waterline;
    this.horizonY = horizonY;
    this.shoreY = shoreY;
    this.layers = [
      { name: "drift", enabled: true, target: this.field },
      { name: "reeds", enabled: true, target: this.reeds },
      { name: "labels", enabled: true, target: this.labels },
      { name: "chart", enabled: true, target: this.minimap },
      { name: "rain", enabled: true, target: this.rain },
      { name: "lights", enabled: true, target: this.lanterns },
      { name: "bloom", enabled: true, target: { count: "" } }
    ];
    this.applyLoad();
    this.applyEffects();
  }
  /**
   * Register the HUD and minimap with the scene's UI container.
   *
   * Every scene gets a PerformanceStats strip for free; the showcase's HUD
   * reports the same counters with more context, so the stock strip is
   * silenced rather than left to overlap it.
   */
  attachUI(ui) {
    for (const element of ui.elements) {
      if (element instanceof PerformanceStats) element.options.show = false;
    }
    ui.addElement(this.minimap);
    ui.addElement(this.hud);
  }
  /** @returns {number} Current load multiplier */
  load() {
    return LOAD_LEVELS[this.loadIndex];
  }
  /** @returns {string} Load multiplier formatted for the HUD */
  loadLabel() {
    return `${this.load()}x`;
  }
  /**
   * Step the load multiplier and rebuild the layers at the new size.
   * @param {number} direction - -1 or +1
   */
  stepLoad(direction) {
    const next = Math.min(LOAD_LEVELS.length - 1, Math.max(0, this.loadIndex + direction));
    if (next === this.loadIndex) return;
    this.loadIndex = next;
    this.applyLoad();
  }
  applyLoad() {
    const load = this.load();
    this.field.setCount(BASE_COUNTS.motes * load);
    this.reeds.setCount(BASE_COUNTS.reeds * load);
    this.labels.setCount(BASE_COUNTS.labels * load);
    this.rain.setCount(BASE_COUNTS.rain * load);
  }
  /**
   * Toggle a layer by its 1-based index.
   * @param {number} index - Layer number as shown in the HUD
   */
  toggleLayer(index) {
    const layer = this.layers[index - 1];
    if (!layer) return;
    layer.enabled = !layer.enabled;
    if (layer.target === this.minimap) {
      this.minimap.visible = layer.enabled;
    }
    this.applyEffects();
  }
  /**
   * Push the lighting and post-effect settings the current toggles imply.
   *
   * These are persistent renderer state rather than per-frame draws, so they
   * are set when they change, not every frame. A backend without the
   * capability ignores them, which is exactly the intended degradation: the
   * scene stays evenly lit instead of going dark with nothing to light it.
   */
  applyEffects() {
    const renderer = this.game.renderer;
    const lit = this.layers[5].enabled;
    const bloom = this.layers[6].enabled;
    renderer.setAmbientLight(lit ? "#404a66" : null);
    renderer.setPostEffects(bloom ? {
      bloom: { threshold: 0.72, strength: 0.62, blur: 34 },
      vignette: { strength: 0.42, start: 0.45 }
    } : null);
  }
  /** @returns {Array<{name: string, enabled: boolean, count: string|number}>} HUD rows */
  layerSummary() {
    return this.layers.map((layer) => {
      let count = layer.target.count ?? "";
      if (layer.target === this.rain && this.rain.capped()) {
        count = `${count} (capped, no particles)`;
      }
      return { name: layer.name, enabled: layer.enabled, count };
    });
  }
  toggleHud() {
    this.hud.visible = !this.hud.visible;
  }
  toggleCamera() {
    this.cameraPaused = !this.cameraPaused;
  }
  /**
   * @param {number} deltaTime - Seconds since the last frame
   */
  update(deltaTime) {
    this.time += deltaTime;
    if (!this.cameraPaused) {
      this.panCamera();
    }
    this.field.update(deltaTime);
    this.reeds.update(deltaTime);
    this.labels.update(deltaTime);
    this.rain.update(deltaTime);
    this.lanterns.update(deltaTime);
    this.lighthouse.update(deltaTime);
    this.backdrop.update(deltaTime);
  }
  /**
   * Move the camera along a fixed Lissajous path inside the world bounds.
   */
  panCamera() {
    const camera = this.game.camera;
    const marginX = camera.width / 2;
    const marginY = camera.height / 2;
    const spanX = Math.max(0, this.bounds.width - camera.width) / 2;
    const spanY = Math.max(0, this.bounds.height - camera.height) / 2;
    camera.x = marginX + spanX + Math.sin(this.time * 0.17) * spanX;
    camera.y = marginY + spanY + Math.sin(this.time * 0.11) * spanY;
  }
  /**
   * World-space draw, called from the scene's onDraw hook.
   */
  draw() {
    this.backdrop.drawDistance();
    const behind = this.lighthouse.beamBehindTower();
    if (behind) this.lighthouse.drawBeam();
    if (this.layers[1].enabled) this.reeds.draw();
    this.backdrop.drawBank();
    this.lanterns.drawSprites();
    this.lighthouse.drawTower();
    if (!behind) this.lighthouse.drawBeam();
    this.lighthouse.drawHalo();
    if (this.layers[0].enabled) this.field.draw();
    if (this.layers[4].enabled) this.rain.draw();
    if (this.layers[2].enabled) this.labels.draw();
    if (this.layers[5].enabled) {
      this.backdrop.drawLights();
      this.lanterns.drawLights();
    }
    this.worldStats = this.game.renderer.getStats();
  }
}
const moteSprite = "/m2d-engine/assets/mote-Cb0-AeGd.png";
const reedSprite = "/m2d-engine/assets/reed-BZ7rHt2_.png";
const lanternSprite = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAABmJLR0QA/wD/AP+gvaeTAAABhUlEQVRoge2YwU7DMAyGzYYACSHxJJy478gNgXgCXoQLT8FLIMELIM7AZU+ChJBAsWcOzWi6JVvc1e6g+aVKaRU57vc7izuAoqKiIWsnZ9L56Qm3Cf74Os2K3+f6o1YZ/SPt5kx6//jUz6Sn9UsFSCY/P1wBzBBgRv6KjyfXLyrJPt1dAhMCEwEQARMBI9ZjqsZnt2/ZMUUAgNxqAOTHSmLnlgH4l2acP0NRzO4AUDBWEqNLus5EANgHAIrAUFJVAXHX66qwBECJalDSEoDAdVsAMdctAKBLul4/l60vB5By3bACYq7/jlETAK45BawARFxvbAuBuj0GrQEErm8PAGECEjV/A5ovzYR+a/QJwKQRirveOBoF6gYALW4BnU8Mdph2PdwWMM6OqdQI7bd4vfWat8Kr2mA7AIuuWwBAl3bdt8gVgIPsmH+rEQorINoQaXeCW9AHJF23ADC5+QruRgCwJ1psU13cfwd3Y39tlkP5Ryhn0vHRoX4mPa0/+AooKioatn4AbXL7nNDM46MAAAAASUVORK5CYII=";
const lighthouseSprite = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAACgCAYAAAC8LWpcAAAABmJLR0QA/wD/AP+gvaeTAAAEvElEQVR4nO2cvW4TQRSF79jrXcfBSyyIKAmdxQsEENSUNBYPwF+ZiNYNqRBlREeRJwgNJRIdEig8ALKUgtBHSrCFhJCcockiMiIbyJ4zd0c75wHO3P1853o9e9YiihqtjTdG6+MXmjW0tRYerY03ROSZiNy+fuPOwued9+806lAB8MfFF1KD4B3AXy6+kAoErwBKLr6QdwjeAPzDxRfyCsELgP+4+ELeINABnOPiC3mBQAVQ4eIL0SHQAAAuvhAVgmGYFhqtjS3C5/XL57Q6WyzjUBQBaBegrQhAuwBtRQDaBWiLeh9QyH7fOtf9gFl8SK+v8R0QAWgXoK0IQLsAbUUA2gVoKwLQLkBbEYB2AdqKALQL0FYEoF2AtiIA7QK0BT9xWb17D/I06DTtvH0DrbnxHRABaBegrQhAuwBtUc/dd63NBofTH1U8Li3lmTHmJ66qk6J2wJXZrF/VYwbwKBMVwNHRUeXi5/N5swFY2wkXgEgCAFAdYpmoAKy11YtPAB4l4nZAG1A8AmKJyFuglVe2sACPEnEBQD69oDtAqg9BgEeZ6t8BIc8A2zLVi0d4lNkzzcUC2hfhUaLazwCQx6kiA0C0b8hbAPIVFvAQFBHAjRDAo0T1nwGGOwMoJ0IfhsM9EbkKtv16azJZAXvGM8EIQLsAbUUA2gVoKwLQLkBbEYB2AdqKALQL0Bbt6fD+wbdNEVlHeFmRzeXBxacIL1fEDkD+juedCRAB4B5oGKCXKx4A4HG2NSF2APIgg3gyHMgM4B2MEgEgiw5xC2DP85sNwIQGYNfaTERSoGVmrUX6/RYFACIe54oVl6MAQKTDXLHicsEAYMXlSEOwejzOFSsuRwEAice5IsXlOB2AiMe5IkVlSFuA8OuNFJfjAKB8WkF1AP7OjRWXC6cDQpoBkHicK1JcjtQBhHYlHYoEMwNYP4lJABjtGtIWoHxlBTQEIfE4V6S4XDgzgBSXCwcAaQhCnw1+HA5XrMgXpKcrI3Lt5mSyh/Jr/NPhCEC7AG1FANoFaCsC0C5AWxGAdgHaigC0C9AWPCe4f3C4JWIeoH1FRKzYreXB0iOkJ6EDeJE2RlwOD4D4tjcjLocHwHzPj3AyTNgCzFdd8QejBADMl51D2ALc192bDYARl4MCIMTjXMHjclAAjHicK3RcDgqAkQ5zhY7LBQcAHZcDD0F8PM4VOi4HBUCJx7kCx+WwHcCIx7kCQwZvAe4/v4ng43JYAD62APh2GH0nyB+C4DXC64A6zwBKPM4VeA1wB/C3AHqN4GYAeg0wAA9bALwGGED8GvRwI4RdI7wZAD51Dg9AXYegtbYlIj2UX4kWj9eCKEEZfVpdfTKfTn08bG118vyxiLyCmCFMRESSfNBFeZ2pC/kCygoGwPR73gC0+4uwtXAd0OvBPpWz1O736wdAev46wGZZ/bZAO+362wJd3Fq4Duim3gAYIGzcEOxk3gC00k4NAaSptyEoXRxs3BZIE38dkOC2GwxAK8G15ZnqtOsHQDo+OwAHG5YT3D+YbovYEcqvXGb78iC/j3DCdYCXhyLHSwHjcjgA5L/BPyHgyTDw56u/DkAejAIB+DgRLlTHLeDnOAy+VpAAmP8u1zj9ArGfIZNRraM5AAAAAElFTkSuQmCC";
const rainSprite = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAgCAYAAAAv8DnQAAAABmJLR0QA/wD/AP+gvaeTAAAAQUlEQVQ4jWNgQAL////n+P//PweyGBMDKhCHYpwKRKAYDljQFIii8TEUiFCsgHIr6GACNyEFX0cVjCqgr4Iv6AoAr+waq9zLkxIAAAAASUVORK5CYII=";
const VIEW = { width: 1280, height: 720 };
const WORLD = { width: 2560, height: 1440 };
const canvas = document.getElementById("screen");
const game = new M2D(canvas, {
  initialScene: "showcase",
  width: VIEW.width,
  height: VIEW.height,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height
});
let showcase = null;
game.sceneManager.addScene("showcase", {
  fetch: async () => ({
    version: 1,
    name: "showcase",
    type: "level",
    world: { width: WORLD.width, height: WORLD.height, gravity: { x: 0, y: 0 } },
    assets: {
      spritesheets: {
        mote: { url: moteSprite, frameWidth: 32, frameHeight: 32 },
        reed: { url: reedSprite, frameWidth: 32, frameHeight: 64 },
        lantern: { url: lanternSprite, frameWidth: 32, frameHeight: 32 },
        lighthouse: { url: lighthouseSprite, frameWidth: 64, frameHeight: 160 },
        rain: { url: rainSprite, frameWidth: 8, frameHeight: 32 }
      }
    },
    prefabs: {},
    layers: []
  }),
  onEnter() {
    const scene = game.sceneManager.getCurrentScene();
    showcase = new Showcase(game, { spriteSheets: scene.spriteSheets, bounds: WORLD });
    showcase.attachUI(scene.ui);
  },
  onExit() {
    showcase = null;
  },
  onUpdate(deltaTime) {
    if (showcase) showcase.update(deltaTime);
  },
  onDraw() {
    if (showcase) showcase.draw();
  }
});
game.keys.addKey("[", (pressed) => {
  if (pressed && showcase) showcase.stepLoad(-1);
});
game.keys.addKey("]", (pressed) => {
  if (pressed && showcase) showcase.stepLoad(1);
});
["1", "2", "3", "4", "5", "6", "7"].forEach((key, index) => {
  game.keys.addKey(key, (pressed) => {
    if (pressed && showcase) showcase.toggleLayer(index + 1);
  });
});
game.keys.addKey("p", (pressed) => {
  if (pressed && showcase) showcase.toggleCamera();
});
game.keys.addKey("h", (pressed) => {
  if (pressed && showcase) showcase.toggleHud();
});
game.keys.addKey("f", (pressed) => {
  if (pressed) game.toggleFullscreen();
});
const RESOLUTIONS = ["native", { width: 1280, height: 720 }, { width: 854, height: 480 }, { width: 426, height: 240 }];
game.keys.addKey("v", (pressed) => {
  if (!pressed) return;
  const index = RESOLUTIONS.findIndex((r) => sameResolution(r, game.resolution));
  game.setResolution(RESOLUTIONS[(index + 1) % RESOLUTIONS.length]);
});
game.keys.addKey("a", (pressed) => {
  if (!pressed) return;
  game.setAspectMode(game.aspectMode === "letterbox" ? "expand" : "letterbox");
});
game.keys.addKey("b", (pressed) => {
  if (!pressed) return;
  const params = new URLSearchParams(location.search);
  const current = params.get("renderer") || "webgl";
  params.set("renderer", current === "webgl" ? "canvas" : "webgl");
  location.search = params.toString();
});
new SettingsMenu(game, { resolutions: RESOLUTIONS });
game.start();
