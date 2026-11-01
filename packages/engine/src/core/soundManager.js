export class SoundManager {
  constructor() {
    this.sounds = new Map();
    this.music = new Map();
    this.currentMusic = null;
    this.isMuted = false;
    this.soundVolume = 1.0;
    this.musicVolume = 0.5;
    this.pendingMusic = null;
    this.isInitialized = false;

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
  }

  loadSound(key, file) {
    const audio = new Audio(file);
    this.sounds.set(key, audio);
  }

  loadMusic(key, file) {
    const audio = new Audio(file);
    audio.loop = true;
    this.music.set(key, audio);
  }

  playSound(key) {
    if (this.isMuted) return;

    const sound = this.sounds.get(key);
    if (!sound) return;

    const clone = sound.cloneNode();
    clone.volume = this.soundVolume;
    clone.play().catch(error => {
      console.warn(`Failed to play sound ${key}:`, error);
    });
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

    audio.volume = this.musicVolume;
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
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.currentMusic && !this.isMuted) {
      this.currentMusic.volume = this.musicVolume;
    }
  }

  setSoundVolume(volume) {
    this.soundVolume = Math.max(0, Math.min(1, volume));
  }
} 