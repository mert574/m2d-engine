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
 * The place itself is the scene's: the concrete is its `background`
 * layer, the panels, stains and vents a `FloorMarks` object, the ceiling
 * lamps placed objects with their own light, the player's light its
 * prefab's. What is left here moves with the moment:
 *
 *   drawForeground   the sonar echo and a low fill light — after entities
 *   atmosphere       the post pass, torn by damage, set on enter
 */
export class FacilityBackdrop {
  /** @param {import('m2d-engine/core/m2d.js').M2D} game */
  constructor(game) {
    this.game = game;
    this.renderer = game.renderer;
    this.time = 0;
    this.ping = { at: 0, x: 0, y: 0 };
    this.features = {
      blendModes: game.renderer.supports('blendModes'),
      lights: game.renderer.supports('lights')
    };
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
    if (player && !player.dead && this.time - this.ping.at >= (player.sonarPeriod ?? 3.2)) {
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


  /** The sonar echo and the low fill light. After the entities. */
  drawForeground() {
    const renderer = this.renderer;
    const view = this.#view();
    const blend = this.features.blendModes ? 'additive' : undefined;

    // Two rings per echo, the second a beat behind, like the menu's sweep
    // leaving a trail.
    const age = this.time - this.ping.at;
    for (const lag of [0, 0.35]) {
      const t = (age - lag) / 1.6;
      if (t <= 0 || t >= 1) continue;
      renderer.drawArc({
        x: this.ping.x, y: this.ping.y,
        radius: 24 + t * (this.game.player?.sonarRange ?? 460),
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

    // A low fill so nothing is pure black; the ceiling lamps (placed in the
    // scene) and the player's own light (its prefab's) do the real lighting.
    renderer.drawLight({
      x: view.left + view.width / 2, y: view.top + view.height / 2,
      radius: view.width,
      color: '#9aa3b8',
      intensity: 0.32
    });
  }
}
