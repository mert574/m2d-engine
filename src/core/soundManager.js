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

    document.addEventListener('click', () => this.initialize(), { once: true });
    document.addEventListener('keydown', () => this.initialize(), { once: true });
  }

  initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (this.pendingMusic) {
      this.playMusic(this.pendingMusic);
      this.pendingMusic = null;
    }
  }

  async loadSound(key, path) {
    try {
      const audio = new Audio();
      audio.src = path;
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', resolve, { once: true });
        audio.addEventListener('error', reject);
        audio.load();
      });
      this.sounds.set(key, audio);
    } catch (error) {
      console.error(`Failed to load sound: ${path}`, error);
    }
  }

  async loadMusic(key, path) {
    try {
      const audio = new Audio();
      audio.src = path;
      audio.loop = true;
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', resolve, { once: true });
        audio.addEventListener('error', reject);
        audio.load();
      });
      this.music.set(key, audio);
    } catch (error) {
      console.error(`Failed to load music: ${path}`, error);
    }
  }

  playSound(key) {
    if (this.isMuted) return;
    const sound = this.sounds.get(key);
    if (sound) {
      const clone = sound.cloneNode();
      clone.volume = this.soundVolume;
      clone.play().catch(error => {
        console.warn(`Failed to play sound ${key}:`, error);
      });
    }
  }

  playMusic(key) {
    if (!this.isInitialized) {
      this.pendingMusic = key;
      return;
    }

    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
    }

    const music = this.music.get(key);
    if (music) {
      music.volume = this.isMuted ? 0 : this.musicVolume;
      music.play().catch(error => {
        console.warn(`Failed to play music ${key}:`, error);
      });
      this.currentMusic = music;
    }
  }

  stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
      this.currentMusic = null;
    }
    this.pendingMusic = null;
  }

  pauseMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
    }
  }

  resumeMusic() {
    if (this.currentMusic && !this.isMuted) {
      this.currentMusic.play().catch(error => {
        console.warn('Failed to resume music:', error);
      });
    }
  }

  setMute(muted) {
    this.isMuted = muted;
    if (this.currentMusic) {
      this.currentMusic.volume = muted ? 0 : this.musicVolume;
    }
  }

  setSoundVolume(volume) {
    this.soundVolume = Math.max(0, Math.min(1, volume));
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.currentMusic && !this.isMuted) {
      this.currentMusic.volume = this.musicVolume;
    }
  }
} 