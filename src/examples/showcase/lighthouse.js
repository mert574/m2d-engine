/**
 * The harbour lighthouse and its sweeping beam.
 *
 * The lamp rotates about a *vertical* axis, the way a real lantern does, and
 * the scene is a side view whose eye level is the horizon the backdrop draws
 * (`horizonY`, well above the reeds' waterline). So the beam is not a 2D hand
 * on a clock: its horizontal angle `angle` is projected for that viewpoint.
 * Pointing along the shore it is long and level. Pointing away it
 * foreshortens, narrows, dims, converges on the horizon the way anything
 * receding does, and is drawn behind the tower. Pointing at the viewer it
 * flares short, wide and bright. The harbour chart plots the same `angle`
 * top-down, so the two views always agree.
 *
 * It is also the world-space clipping demo: a stack of rectangular clips
 * under one transform, each holding a radial gradient that fades with
 * distance. The transform's non-uniform scale is what turns the circular
 * falloff into the foreshortened ellipse — the clips and gradients know
 * nothing about perspective, which is the point.
 */

/**
 * Beam cross-sections, widest first.
 *
 * Stacking uniform slabs is the only way to soften a hard-edged clip, and the
 * widths are derived rather than guessed: for N slabs of equal alpha, putting
 * slab i's half-width where a Gaussian falls to (i + 0.5) / N makes the stack
 * approximate that Gaussian. More slabs is a smoother edge at one clip each,
 * and fewer visible steps than a hand-written table of three.
 *
 * @param {number} count - Number of slabs
 * @param {number} sigma - Gaussian half-width in world units
 * @param {number} peak - Combined alpha at the beam's centre line
 * @returns {Array<{spread: number, alpha: number}>}
 */
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

/** Hard ceiling on how far the shaft may tilt from horizontal, in radians. */
const MAX_TILT = 0.30;

/**
 * Reference radius the halo gradients are baked at. The halo grows by being
 * drawn under a scale transform rather than by rebuilding its descriptor,
 * so the gradient scales with it and the backend's cached lookup texture
 * stays valid for the whole run.
 */
const HALO_RADIUS = 100;

export class Lighthouse {
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
    this.renderer = renderer;
    this.features = features;
    this.sheet = sheet;
    this.x = x;
    this.baseY = baseY;
    this.reach = reach;
    this.height = sheet.tileH * scale;
    this.width = sheet.tileW * scale;
    /** Horizontal angle of the lamp: 0 along +X, PI/2 toward the viewer. */
    this.angle = 0;
    this.speed = 0.45;

    // The lamp sits ~17% down the sprite; the beam must leave from there, not
    // from the tower's centre, or it visibly misses the lamp room.
    this.lampY = baseY - this.height * 0.83;

    // Vertical screen offset per unit of depth. Derived, not tuned: the
    // receding beam's tip should land on the horizon, so the lamp's offset
    // from the horizon over the beam's reach is the ratio. Signed, so a lamp
    // below eye level makes a receding beam rise rather than fall.
    this.dropPerDepth = (horizonY - this.lampY) / reach;

    // One gradient shared by every shaft and every frame. The alpha lives in
    // globalAlpha instead of the colour stops: on the WebGL backend a gradient
    // descriptor is baked into a cached lookup texture keyed by its stops, so
    // per-frame stop strings would re-bake and re-upload a texture per shaft
    // per frame. A constant descriptor is baked exactly once.
    this.beamGradient = {
      type: 'radial',
      x: 0,
      y: 0,
      r0: 0,
      r1: reach,
      stops: [
        { offset: 0, color: 'rgba(255, 226, 150, 1)' },
        { offset: 0.4, color: 'rgba(255, 214, 128, 0.45)' },
        { offset: 1, color: 'rgba(255, 214, 128, 0)' }
      ]
    };

    // Two ramps rather than one: the flare needs a hotter core so a head-on
    // lamp reads as being stared into, not merely as a bigger glow. Both are
    // built once — a per-frame descriptor would re-bake the WebGL gradient
    // lookup texture every frame.
    this.haloGradient = {
      type: 'radial',
      x: 0,
      y: 0,
      r0: 0,
      r1: HALO_RADIUS,
      stops: [
        { offset: 0, color: 'rgba(255, 240, 180, 1)' },
        { offset: 0.35, color: 'rgba(255, 220, 140, 0.33)' },
        { offset: 1, color: 'rgba(255, 214, 128, 0)' }
      ]
    };

    this.flareGradient = {
      type: 'radial',
      x: 0,
      y: 0,
      r0: 0,
      r1: HALO_RADIUS,
      stops: [
        { offset: 0, color: 'rgba(255, 252, 232, 1)' },
        { offset: 0.18, color: 'rgba(255, 238, 176, 0.62)' },
        { offset: 0.55, color: 'rgba(255, 214, 128, 0.16)' },
        { offset: 1, color: 'rgba(255, 206, 110, 0)' }
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
  #projection() {
    const along = Math.cos(this.angle);
    const depth = this.facing();

    // Depth offsets the beam vertically: a receding beam converges on the
    // horizon and an approaching one pulls away from it, whichever side of
    // eye level the lamp happens to be on — `dropPerDepth` carries the sign.
    // The approaching case is damped; by then the shaft is nearly gone.
    const screenY = depth < 0
      ? -depth * this.dropPerDepth
      : -depth * this.dropPerDepth * 0.25;

    const horizontal = Math.abs(along);
    const tilt = Math.atan2(screenY, Math.max(horizontal, 1e-4));
    const clamped = Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt));
    const heading = along >= 0 ? clamped : Math.PI - clamped;

    // Broadside drives shaft visibility; head-on drives the flare.
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
  }

  /**
   * Draw the sweeping shaft of light, projected for the viewpoint.
   */
  drawBeam() {
    const renderer = this.renderer;
    const { heading, length, width, intensity, shaft } = this.#projection();
    if (shaft <= 0.001) return;

    // Light adds to what it falls on. Without the blend the shafts just paint
    // a pale wash over the scene instead of lighting it.
    const blend = this.features.blendModes ? 'additive' : undefined;

    // The beam is geometry in the world pass, so the light map multiplies it
    // like everything else — and over the dark night sky that crushes it to a
    // grey smudge. A point light cannot express a shaft, so the beam instead
    // pre-compensates for the ambient it is about to be multiplied by.
    const lightCompensation = this.features.lights ? 1.8 : 1;
    const alpha = intensity * shaft * lightCompensation;

    renderer.pushTransform({
      x: this.x,
      y: this.lampY,
      rotation: heading,
      scaleX: length,
      scaleY: width
    });

    // Concentric slabs under one rotation, a clip each (see beamShafts).
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
    const { flare } = this.#projection();
    const lightCompensation = this.features.lights ? 1.6 : 1;
    const scale = 0.55 + flare * 1.0;

    renderer.pushTransform({ x: this.x, y: this.lampY, scaleX: scale, scaleY: scale });
    renderer.drawArc({
      x: 0,
      y: 0,
      radius: HALO_RADIUS,
      blend: this.features.blendModes ? 'additive' : undefined,
      globalAlpha: Math.min(0.82, (0.4 + flare * 0.34) * lightCompensation),
      fillStyle: flare > 0.001 ? this.flareGradient : this.haloGradient
    });
    renderer.popTransform();
  }
}

/** Hermite ramp between two edges. */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
