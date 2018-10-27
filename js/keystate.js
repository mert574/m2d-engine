export const PRESSED = 1;
export const NOT_PRESSED = 0;

export default class KeyState {
    constructor(matterMouseConstraint, eventAttacher) {
        this.keys = new Map();
        this.handlers = new Map();
        this._handleKeyboard = this._handleKeyboard.bind(this);
        this._handleMouse = this._handleMouse.bind(this);
        this.mouseConstraint = matterMouseConstraint;
        
        document.addEventListener('contextmenu', e=>e.preventDefault());
        
        for (let eventName of ['keydown', 'keyup']) {
            document.addEventListener(eventName, this._handleKeyboard);
        }
        for (let eventName of ['mousedown', 'mouseup', 'mousemove']) {
            eventAttacher(matterMouseConstraint, eventName, this._handleMouse);
        }
    }

    _handleMouse(event) {
        const newState = event.name === 'mousedown' ? PRESSED : NOT_PRESSED;
    }

    _handleKeyboard(event) {
        const {keyCode, type} = event;
        const newState = type === 'keydown' ? PRESSED : NOT_PRESSED;

        if (!this.keys.has(keyCode) && !this.debug) {
            return;
        }
        
        event.preventDefault();

        if (this.keys.get(keyCode) !== newState) {
            this.keys.set(keyCode, newState);
            const f = this.handlers.get(keyCode);

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
