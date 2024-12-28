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
    if (!sound) {
      console.warn(`Sound not found: ${key}`);
      return;
    }

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
    if (!audio) {
      console.warn(`Music not found: ${key}`);
      return;
    }

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