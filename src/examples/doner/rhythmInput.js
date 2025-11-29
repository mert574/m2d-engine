// RhythmInput - Handles rhythm-based key input detection
// Listens for A, S, D, F keys and tracks 3-beat patterns with 1s timing per slot
// Key press is recorded but slot only advances when the beat timer completes

export class RhythmInput {
  constructor(game, options = {}) {
    this.game = game;
    this.beatDuration = options.beatDuration || 1000; // 1 second per beat
    this.patternLength = options.patternLength || 3; // 3 beats per pattern
    this.onPatternComplete = options.onPatternComplete || (() => {});
    this.onBeatInput = options.onBeatInput || (() => {});

    // Current pattern being built
    this.currentPattern = [];
    this.isPatternActive = false;
    this.lastBeatTime = 0;

    // Current slot's pending input (null = no input yet, string = key pressed)
    this.pendingInput = null;

    // Visual feedback
    this.currentBeatIndex = 0;

    // Register keys with the game's key system (A, S, D, F)
    this.keys = ['a', 's', 'd', 'f'];
    this.keys.forEach(key => this.game.keys.addKey(key));

    // Auto mode - pattern runs continuously
    this.autoMode = false;
  }

  startAutoMode() {
    this.autoMode = true;
    this.startPattern(performance.now());
  }

  stopAutoMode() {
    this.autoMode = false;
    this.resetPattern();
  }

  update(deltaTime) {
    const now = performance.now();

    // In auto mode, pattern runs continuously
    if (this.autoMode && !this.isPatternActive) {
      this.startPattern(now);
    }

    // Check for key presses (A, S, D, F) - only if no input recorded for current slot yet
    if (this.isPatternActive && this.pendingInput === null) {
      for (let i = 0; i < this.keys.length; i++) {
        if (this.game.keys.isJustPressed(this.keys[i])) {
          this.handleKeyPress(this.keys[i].toUpperCase(), now);
          break; // Only process one key per frame
        }
      }
    }

    // If pattern is active, check if beat duration has elapsed
    if (this.isPatternActive) {
      const timeSinceLastBeat = now - this.lastBeatTime;

      // Beat duration completed - finalize this slot and move to next
      if (timeSinceLastBeat >= this.beatDuration) {
        this.finalizeCurrentSlot(now);
      }
    }
  }

  handleKeyPress(key, now) {
    // Record the key press for the current slot (but don't advance yet)
    this.pendingInput = key;

    // Notify of beat input for visual feedback
    this.onBeatInput(key, this.currentPattern.length, [...this.currentPattern, key]);
  }

  finalizeCurrentSlot(now) {
    // Record the pending input (or empty if no key was pressed)
    const beat = this.pendingInput !== null ? this.pendingInput : '_';
    this.currentPattern.push(beat);

    // If no key was pressed, still notify for visual feedback
    if (this.pendingInput === null) {
      this.onBeatInput('_', this.currentPattern.length - 1, [...this.currentPattern]);
    }

    // Reset for next slot
    this.pendingInput = null;
    this.lastBeatTime = now;
    this.currentBeatIndex = this.currentPattern.length;

    // Check if pattern is complete
    if (this.currentPattern.length >= this.patternLength) {
      this.completePattern();
    }
  }

  startPattern(now) {
    this.isPatternActive = true;
    this.currentPattern = [];
    this.lastBeatTime = now;
    this.currentBeatIndex = 0;
    this.pendingInput = null;
  }

  completePattern() {
    const pattern = [...this.currentPattern];
    this.onPatternComplete(pattern);
    this.resetPattern();
  }

  resetPattern() {
    this.isPatternActive = false;
    this.currentPattern = [];
    this.currentBeatIndex = 0;
    this.pendingInput = null;
  }

  // Force complete the pattern (e.g., when player presses space to finalize)
  forceComplete() {
    if (this.currentPattern.length > 0 || this.pendingInput !== null) {
      // Add pending input if any
      if (this.pendingInput !== null) {
        this.currentPattern.push(this.pendingInput);
      }
      // Fill remaining beats with empty
      while (this.currentPattern.length < this.patternLength) {
        this.currentPattern.push('_');
      }
      this.completePattern();
    }
  }

  // Get current pattern state for UI
  getPatternState() {
    const now = performance.now();
    const timeSinceLastBeat = this.isPatternActive ? now - this.lastBeatTime : 0;
    const beatProgress = Math.min(1, timeSinceLastBeat / this.beatDuration);

    return {
      pattern: [...this.currentPattern],
      pendingInput: this.pendingInput, // The key pressed for current slot (if any)
      beatIndex: this.currentBeatIndex,
      isActive: this.isPatternActive,
      progress: this.currentPattern.length / this.patternLength,
      beatTimeRemaining: this.isPatternActive ? Math.max(0, this.beatDuration - timeSinceLastBeat) : this.beatDuration,
      beatProgress: beatProgress // 0 = just started, 1 = time's up
    };
  }
}
