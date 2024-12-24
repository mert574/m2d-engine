export class KeyStates {
  constructor(mouseConstraint, eventsOn) {
    this.keys = new Map();
    this.mouseConstraint = mouseConstraint;
    this.eventsOn = eventsOn;

    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  addKey(keyCode, callback) {
    this.keys.set(keyCode, {
      isPressed: false,
      callback: callback
    });
  }

  handleKeyDown(event) {
    const key = this.keys.get(event.keyCode);
    if (key) {
      key.isPressed = true;
      if (key.callback) key.callback(true);
    }
  }

  handleKeyUp(event) {
    const key = this.keys.get(event.keyCode);
    if (key) {
      key.isPressed = false;
      if (key.callback) key.callback(false);
    }
  }

  pressedKeys() {
    const pressed = new Set();
    for (let [code, key] of this.keys) {
      if (key.isPressed) pressed.add(code);
    }
    return pressed;
  }
} 