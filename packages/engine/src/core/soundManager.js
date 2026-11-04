export class SoundManager {
  constructor() {
    this.sounds = new Map();
    this.music = new Map();
    this.currentMusic = null;
    this.isMuted = false;
    this.soundVolume = 0.15;
    this.musicVolume = 0.3;
    this.pendingMusic = null;
    this.isInitialized = false;
    /** Continuous sounds started with `loop()`, for mute and teardown. */
    this.loops = new Set();

    // Browsers refuse to start audio before a user gesture, so the first
    // click or keypress unblocks it. Kept on the instance so destroy() can
    // detach them: `{ once: true }` only clears them if the gesture actually
    // happens, and a game can be torn down before anyone touches it.
    this.onFirstGesture = () => this.initialize();
    if (typeof document !== 'undefined') {
      document.addEventListener('click', this.onFirstGesture, { once: true });
      document.addEventListener('keydown', this.onFirstGesture, { once: true });
    }
  }

  /** Stop everything this manager is playing and release its listeners. */
  destroy() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', this.onFirstGesture);
      document.removeEventListener('keydown', this.onFirstGesture);
    }
    this.stopMusic();
    for (const loop of [...this.loops]) loop.stop();
    // Music elements are shared across plays, so pausing the map covers a
    // track that was started and then swapped out without stopMusic().
    for (const audio of this.music.values()) audio.pause();
    this.sounds.clear();
    this.music.clear();
    this.pendingMusic = null;
  }

  initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (this.pendingMusic) {
      this.playMusic(this.pendingMusic);
      this.pendingMusic = null;
    }
    for (const start of this.pendingLoops ?? []) start();
    this.pendingLoops = [];
  }

  /**
   * Register a sound. `file` is a URL, or `{ src, volume }` to give the
   * clip its own gain under the global sound volume: footsteps at 0.7,
   * a hit at 1.
   */
  loadSound(key, file) {
    const { src, volume } = SoundManager.#clip(file);
    const audio = new Audio(src);
    audio.baseVolume = volume;
    this.sounds.set(key, audio);
  }

  /** Register a looping track; `file` as for `loadSound`. */
  loadMusic(key, file) {
    const { src, volume } = SoundManager.#clip(file);
    const audio = new Audio(src);
    audio.loop = true;
    audio.baseVolume = volume;
    this.music.set(key, audio);
  }

  static #clip(file) {
    if (file && typeof file === 'object') {
      return { src: file.src, volume: Math.max(0, Math.min(1, file.volume ?? 1)) };
    }
    return { src: file, volume: 1 };
  }

  /** A track's own gain times the music volume. */
  #musicGain(audio) {
    return this.musicVolume * (audio.baseVolume ?? 1);
  }

  playSound(key) {
    if (this.isMuted) return;

    const sound = this.sounds.get(key);
    if (!sound) return;

    const clone = sound.cloneNode();
    clone.volume = this.soundVolume * (sound.baseVolume ?? 1);
    // A few cents of random detune: the same sample twice in a row reads as
    // two events instead of a sampler being hit.
    clone.playbackRate = 0.94 + Math.random() * 0.12;
    clone.preservesPitch = false;
    clone.play().catch(error => {
      console.warn(`Failed to play sound ${key}:`, error);
    });
  }

  /**
   * Start a sound that keeps playing until stopped, with live pitch and
   * volume — an engine note that follows the revs, tyres that squeal while
   * the car slides. Unlike `playSound`, the element is not cloned, so the
   * loop is one voice that the game steers each frame.
   *
   * @param {string} key - A sound loaded with `loadSound`
   * @param {object} [options]
   * @param {number} [options.volume=1] - 0..1, scaled by the sound volume
   * @param {number} [options.rate=1] - Playback rate; pitch follows it
   * @returns {{setRate: (rate: number) => void, setVolume: (volume: number) => void,
   *   stop: () => void, playing: boolean}|null} A handle, or null when the
   *   sound is unknown
   */
  loop(key, options = {}) {
    const sound = this.sounds.get(key);
    if (!sound) return null;
    const audio = sound.cloneNode();
    audio.loop = true;
    audio.preservesPitch = false;
    let volume = (options.volume ?? 1) * (sound.baseVolume ?? 1);
    const manager = this;
    const handle = {
      playing: true,
      setRate(rate) {
        audio.playbackRate = Math.max(0.25, Math.min(4, rate));
      },
      setVolume(value) {
        volume = Math.max(0, Math.min(1, value));
        audio.volume = manager.isMuted ? 0 : volume * manager.soundVolume;
      },
      stop() {
        if (!this.playing) return;
        this.playing = false;
        audio.pause();
        manager.loops.delete(handle);
      },
      /** Re-read mute and sound volume; the manager calls it on changes. */
      refresh() {
        audio.volume = manager.isMuted ? 0 : volume * manager.soundVolume;
      }
    };
    handle.setRate(options.rate ?? 1);
    handle.refresh();
    this.loops.add(handle);
    if (this.isInitialized) {
      audio.play().catch(error => console.warn(`Failed to loop sound ${key}:`, error));
    } else {
      // Before the first gesture the browser refuses; start on unlock.
      const start = () => audio.play().catch(() => {});
      this.pendingLoops = this.pendingLoops ?? [];
      this.pendingLoops.push(() => { if (handle.playing) start(); });
    }
    return handle;
  }

  playMusic(key) {
    if (!this.isInitialized) {
      this.pendingMusic = key;
      return;
    }

    if (this.isMuted) return;

    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
    }

    const audio = this.music.get(key);
    if (!audio) return;

    audio.volume = this.#musicGain(audio);
    this.currentMusic = audio;
    audio.play().catch(error => {
      console.warn(`Failed to play music ${key}:`, error);
    });
  }

  stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
      this.currentMusic = null;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopMusic();
    }
    for (const loop of this.loops) loop.refresh();
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.currentMusic && !this.isMuted) {
      this.currentMusic.volume = this.#musicGain(this.currentMusic);
    }
  }

  setSoundVolume(volume) {
    this.soundVolume = Math.max(0, Math.min(1, volume));
    for (const loop of this.loops) loop.refresh();
  }
} 