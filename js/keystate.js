export const PRESSED = 1;
export const NOT_PRESSED = 0;

export default class KeyState {
    constructor(selector=window) {
        this.keys = new Map();
        this.handlers = new Map();
        this._eventListener = this._eventListener.bind(this);
        this.debug = false;

        for (let eventName of ['keydown', 'keyup']) {
            selector.addEventListener(eventName, this._eventListener);
        }
    }

    _eventListener(event) {
        const {keyCode, type} = event;
        const newState = type === 'keydown' ? PRESSED : NOT_PRESSED;

        if (!this.keys.has(keyCode) && !this.debug) {
            return;
        }

        if (this.keys.get(keyCode) !== newState) {
            this.keys.set(keyCode, newState);
            const f = this.handlers.get(keyCode);

            if (this.debug) {
                console.log(`${keyCode}: ${type} (${f ? 'Handled' : 'Not Handled'})`);
            }

            if (typeof f === 'function') {
                f(newState === PRESSED, keyCode);
            }
        };
    };

    getState(keyCode) {
        return this.keys.get(keyCode) === PRESSED;
    }

    pressedKeys() {
        let pressed = [];
        for (let [keyCode, state] of this.keys) {
            if (state === PRESSED)
                pressed.push(keyCode);
        }
        return pressed;
    }

    addKey(keyCode, callback) {
        if (!this.keys.has(keyCode)) {
            this.keys.set(keyCode, NOT_PRESSED);
        }

        if (typeof callback === 'function') {
            this.handlers.set(keyCode, callback);
        }
    }

    removeKey(keyCode) {
        this.keys.delete(keyCode);
        this.handlers.delete(keyCode);
    }
}
