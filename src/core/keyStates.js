export class KeyStates {
  constructor(mouseConstraint, eventsOn) {
    this.keys = new Map();
    this.mouseConstraint = mouseConstraint;
    this.eventsOn = eventsOn;

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
    const key = this.keys.get(event.key);
    if (key) {
      key.isPressed = true;
      if (key.callback) key.callback(true);
    }
  }

  handleKeyUp(event) {
    const key = this.keys.get(event.key);
    if (key) {
      key.isPressed = false;
      if (key.callback) key.callback(false);
    }
  }

  pressedKeys() {
    const pressed = new Set();
    for (let [name, key] of this.keys) {
      if (key.isPressed) pressed.add(name);
    }
    return pressed;
  }
} 