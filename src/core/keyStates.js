export class KeyStates {
  constructor(mouseConstraint, eventsOn) {
    this.keys = new Map();
    this.mouseConstraint = mouseConstraint;
    this.eventsOn = eventsOn;
    this.justPressed = new Set();

    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
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

  isPressed(keyName) {
    return this.keys.get(keyName)?.isPressed ?? false;
  }

  pressedKeys() {
    const pressed = new Set();
    for (let [name, key] of this.keys) {
      if (key.isPressed) pressed.add(name);
    }
    return pressed;
  }
} 