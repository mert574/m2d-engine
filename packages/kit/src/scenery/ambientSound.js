import { s } from 'm2d-engine/core/schema.js';
import { Entity } from 'm2d-engine/core/entity.js';

/**
 * A looping sound in the level: wind, a hum, rain, a generator. Faded in
 * from silence so the scene never opens on a gust, quieter the further
 * the view is from it (none of that with `radius: 0`, which fills the
 * scene), and stopped when the entity goes — removed, or its scene left.
 *
 * Presentation: it starts on its first frame, never in the editor, where
 * a scene is silent, and never headless. One voice from
 * `soundManager.loop`, so mute and the sound volume reach it as they reach
 * every loop. The listener is the camera: the view's centre in 2D, the
 * eye in 3D.
 */
export class AmbientSound extends Entity {
  static description = 'A looping sound, faded in, carried as far as its radius';
  static properties = {
    sound: s.string({ description: 'A key in assets.sounds (or one the game loaded)' }),
    volume: s.number({ min: 0, max: 1, initial: 1 }),
    fadeIn: s.number({ min: 0, unit: 's', initial: 1, label: 'Fade in' }),
    rate: s.number({ positive: true, initial: 1, description: 'Playback rate; pitch follows it' }),
    radius: s.number({ min: 0, initial: 0, description: 'How far it carries, in px (2D) or metres (3D): full at its place, silent at this distance. 0 fills the scene' })
  };

  static tool = { color: '#38bdf8', label: 'sound' };
  name = 'AmbientSound';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.sound = options.sound ?? null;
    this.volume = options.volume ?? 1;
    this.fadeIn = options.fadeIn ?? 1;
    this.rate = options.rate ?? 1;
    this.radius = options.radius ?? 0;
    /** The playing voice, or null before the first frame and after it stops. */
    this.loop = null;
    this.elapsed = 0;
    this.started = false;
  }

  update(deltaTime) {
    super.update(deltaTime);
    if (this.dead || this.game.editMode || this.game.headless) return;
    if (!this.started) this.#start();
    if (!this.loop) return;
    this.elapsed = Math.min(this.fadeIn, this.elapsed + deltaTime);
    const fade = this.fadeIn > 0 ? this.elapsed / this.fadeIn : 1;
    this.loop.setVolume(this.volume * fade * this.#reach());
  }

  destroy() {
    this.loop?.stop();
    this.loop = null;
    super.destroy();
  }

  /** Back after a snapshot restore: it starts again on its next frame, faded in. */
  revive() {
    super.revive();
    this.loop = null;
    this.started = false;
    this.elapsed = 0;
  }

  #start() {
    this.started = true;
    if (!this.sound || !this.game.soundManager) return;
    this.loop = this.game.soundManager.loop(this.sound, { volume: 0, rate: this.rate });
    if (!this.loop) console.warn(`M2D AmbientSound: no sound '${this.sound}' (add it to assets.sounds)`);
  }

  /** 1 at its place, falling to 0 at `radius` from the listener; 1 throughout with no radius. */
  #reach() {
    if (!this.radius) return 1;
    const camera = this.game.camera;
    const ear = camera.position ?? camera;
    // The 2D camera stands on the render plane, which a projection is not the ground of.
    const at = this.game.physics.dimensions === 3 ? this.body.renderPosition : this.renderAnchor;
    const distance = Math.hypot(at.x - ear.x, at.y - ear.y, (at.z ?? 0) - (ear.z ?? 0));
    const t = Math.max(0, 1 - distance / this.radius);
    return t * t;
  }
}
