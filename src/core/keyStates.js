export class KeyStates {
  constructor() {
    this.keys = new Map();
    this.justPressed = new Set();

    // Kept on the instance so destroy() can remove them again: `.bind()`
    // returns a *new* function every call, so binding inline at
    // addEventListener leaves nothing removeEventListener could match — which
    // is how these outlived every game that created them.
    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.onKeyDown);
      document.addEventListener('keyup', this.onKeyUp);
    }
  }

  /** Release the document listeners and forget every binding. */
  destroy() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.onKeyDown);
      document.removeEventListener('keyup', this.onKeyUp);
    }
    this.keys.clear();
    this.justPressed.clear();
  }

  addKey(keyName, callback) {
    this.keys.set(keyName, {
      isPressed: false,
      callback: callback
    });
  }

  removeKey(keyName) {
    this.keys.delete(keyName);
  }

  handleKeyDown(event) {
    // Ignore key repeat events
    if (event.repeat) return;

    const key = this.keys.get(event.key);
    if (key && !key.isPressed) {
      key.isPressed = true;
      this.justPressed.add(event.key);
      if (key.callback) key.callback(true);
    }
  }

  handleKeyUp(event) {
    const key = this.keys.get(event.key);
    if (key) {
      key.isPressed = false;
      this.justPressed.delete(event.key);
      if (key.callback) key.callback(false);
    }
  }

  update() {
    this.justPressed.clear();
  }

  isJustPressed(keyName) {
    return this.justPressed.has(keyName);
  }

  pressedKeys() {
    const pressed = new Set();
    for (let [name, key] of this.keys) {
      if (key.isPressed) pressed.add(name);
    }
    return pressed;
  }
} 