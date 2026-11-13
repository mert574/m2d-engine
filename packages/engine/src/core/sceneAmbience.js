/**
 * A level's ambience — `world.ambience` — while it shows: looping sounds
 * under everything (wind, a hum, rain), each faded in from silence so the
 * scene never opens on a gust, and stopped when the scene leaves.
 *
 * Presentation: started when the scene shows, never in edit mode, where a
 * scene is silent. Each loop is one voice from `soundManager.loop`, so
 * mute and the sound volume reach it as they reach every loop.
 */
export class SceneAmbience {
  /**
   * @param {import('./m2d.js').M2D} game
   * @param {Array<{sound: string, volume?: number, fadeIn?: number, rate?: number}>} entries
   */
  constructor(game, entries = []) {
    this.game = game;
    /** @type {Array<{handle: object, volume: number, fadeIn: number, elapsed: number}>} */
    this.loops = [];
    for (const entry of entries) {
      const handle = game.soundManager?.loop(entry.sound, { volume: 0, rate: entry.rate ?? 1 });
      if (!handle) {
        console.warn(`M2D ambience: no sound '${entry.sound}' (add it to assets.sounds)`);
        continue;
      }
      const fadeIn = entry.fadeIn ?? 1;
      const volume = entry.volume ?? 1;
      if (fadeIn <= 0) handle.setVolume(volume);
      this.loops.push({ handle, volume, fadeIn, elapsed: 0 });
    }
  }

  /** One frame of wall time: the fades move. Runs while paused too, as music does. */
  update(deltaTime) {
    for (const loop of this.loops) {
      if (loop.fadeIn <= 0 || loop.elapsed >= loop.fadeIn) continue;
      loop.elapsed = Math.min(loop.fadeIn, loop.elapsed + deltaTime);
      loop.handle.setVolume(loop.volume * (loop.elapsed / loop.fadeIn));
    }
  }

  stop() {
    for (const loop of this.loops) loop.handle.stop();
    this.loops = [];
  }
}
