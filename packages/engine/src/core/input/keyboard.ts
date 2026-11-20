/**
 * Keyboard state, keyed by physical position.
 *
 * ## Why `event.code` and not `event.key`
 *
 * `key` is the character the layout produces, so a game bound to `'w'` is
 * bound to a different *key* on AZERTY and Dvorak — WASD stops being a
 * diamond under the left hand, which is the only reason anyone chose it.
 * `code` names the physical key (`'KeyW'`, `'Space'`, `'ArrowLeft'`) and is
 * identical on every layout, so that is what the engine tracks.
 *
 * The cost is that `'KeyZ'` is not what the player's keycap says. For
 * *showing* a binding, `label()` asks the browser's keyboard layout map and
 * falls back to a readable form of the code.
 *
 * ## Browser defaults
 *
 * Two rules decide whether a keypress also reaches the browser. A key in
 * `DEFAULT_PREVENTED` is suppressed because games poll it. Any other key is
 * suppressed exactly when the engine's UI consumed it, which is resolved
 * synchronously inside the DOM handler — key records drain immediately
 * rather than waiting for the next frame, which is what makes
 * `preventDefault` still legal at that point. Either way a held modifier
 * cancels the suppression, because that is the player reaching for a
 * browser shortcut rather than for the game.
 *
 * ## Focus
 *
 * Listeners sit on the canvas, which is made focusable, rather than on the
 * document. An engine that listens on the document eats keystrokes meant for
 * any other element on the page — a name field, a dev console, a link. The
 * canvas is focused on construction and on every press, so a full-page game
 * behaves exactly as if the listeners were global.
 */

/**
 * Keys whose browser default is actively hostile to a game: scrolling the
 * page, moving focus out of the canvas, or going back a page. Prevented
 * unless a modifier is held, so the browser's own shortcuts still work.
 *
 * This list only has to cover keys a game reads by *polling* — `isDown`,
 * `axis`, `vector` — because nothing consumes those events, so there is no
 * other signal that the key was wanted. A key the engine's UI actually
 * handles (the readout's F3, the settings hotkey, the console's backquote)
 * is suppressed because it was consumed, not because it is listed here; see
 * the keydown listener. That is deliberate: a game may replace this list
 * wholesale, and doing so must not re-expose the browser's find bar
 * underneath the engine's own bindings.
 */
/** A queued key record; `consumed` is set by the router during the flush. */
export interface KeyRecord {
  kind: 'keydown' | 'keyup';
  code: string;
  key: string;
  modifiers: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
  time: number;
  consumed?: boolean;
}

/** Where key records go: the input manager's queue. */
interface KeySink {
  push(record: KeyRecord): void;
  flush(): void;
}

const DEFAULT_PREVENTED = new Set([
  'Space', 'Tab', 'Enter',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End', 'Backspace'
]);

/**
 * Which modifier keys were held. Key events carry them for the same reason
 * pointer events do: a shortcut is a key *and* its modifiers, and Shift+Tab
 * is a different binding from Tab.
 */
function modifiersOf(event: KeyboardEvent) {
  return {
    shift: event.shiftKey === true,
    ctrl: event.ctrlKey === true,
    alt: event.altKey === true,
    meta: event.metaKey === true
  };
}

/** Human-readable fallback for a `code` the layout map cannot name. */
function readableCode(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace(/^Arrow/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

export class Keyboard {
  /** Element that holds keyboard focus. */
  canvas: HTMLCanvasElement;
  sink: KeySink;
  /** Codes whose browser default is suppressed; replaces the built-in list. */
  prevented: Set<string>;
  /** Codes currently held. */
  down: Set<string>;
  /**
   * Codes whose press the engine's UI consumed, so auto-repeats of the
   * same key keep being kept from the browser. Cleared on release.
   */
  claimed: Set<string>;
  /** Codes that went down this frame. */
  pressed: Set<string>;
  /** Codes that came up this frame. */
  released: Set<string>;
  listeners: (() => void)[];
  /** Resolved layout map, when the browser offers one. */
  layout: { get?(code: string): string | undefined } | null;

  constructor(canvas: HTMLCanvasElement, sink: KeySink, options: { preventDefault?: Iterable<string> } = {}) {
    this.canvas = canvas;
    this.sink = sink;
    this.prevented = new Set(options.preventDefault ?? DEFAULT_PREVENTED);
    this.down = new Set();
    this.claimed = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.listeners = [];
    this.layout = null;

    if (canvas && canvas.tabIndex === undefined) canvas.tabIndex = 0;
    else if (canvas && canvas.tabIndex < 0) canvas.tabIndex = 0;

    if (typeof canvas?.addEventListener === 'function') this.#listen();
    this.#loadLayout();
  }

  #on(target: EventTarget, type: string, handler: (event: never) => void) {
    const listener = handler as EventListener;
    target.addEventListener(type, listener);
    this.listeners.push(() => target.removeEventListener(type, listener));
  }

  #listen() {
    this.canvas.focus?.({ preventScroll: true });

    // The listeners only enqueue; `apply` below is what moves the held-key
    // state, driven from the queue. Keeping the two in one place is what
    // lets synthesized key input (replays, on-screen keys) behave exactly
    // like the real thing.
    this.#on(this.canvas, 'keydown', (event: KeyboardEvent) => {
      const code = event.code;
      // A modifier held means the player is reaching for a *browser*
      // shortcut, so the engine never takes those.
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;

      // Known before dispatch: the static list, and anything the UI claimed
      // on a previous press that is now auto-repeating.
      if (plain && (this.prevented.has(code) || this.claimed.has(code))) {
        event.preventDefault();
      }

      // Auto-repeat keeps firing keydown; the held state is already true and
      // an edge that repeats is not an edge.
      if (event.repeat || this.down.has(code)) return;

      const record: KeyRecord = {
        kind: 'keydown', code, key: event.key,
        modifiers: modifiersOf(event), time: event.timeStamp
      };
      this.sink.push(record);
      // Key records drain synchronously, so by the time this returns the
      // router has run and `record.consumed` is known — still inside the DOM
      // handler, which is the only place preventDefault works.
      this.sink.flush();

      // Whatever the engine's own UI took, the browser does not also get.
      // This is what keeps F3 from opening the find bar while it toggles the
      // readout, and it covers every key a screen or subscriber claims
      // without anyone having to maintain a second list of them.
      if (plain && record.consumed) {
        this.claimed.add(code);
        event.preventDefault();
      }
    });

    this.#on(this.canvas, 'keyup', (event: KeyboardEvent) => {
      this.claimed.delete(event.code);
      if (!this.down.has(event.code)) return;
      this.sink.push({
        kind: 'keyup', code: event.code, key: event.key,
        modifiers: modifiersOf(event), time: event.timeStamp
      });
      this.sink.flush();
    });

    // Keys held while focus leaves never report their release, and the game
    // would keep running in that direction forever.
    this.#on(this.canvas, 'blur', () => this.releaseAll());
    if (typeof window !== 'undefined') this.#on(window, 'blur', () => this.releaseAll());
  }

  /** Ask the browser what the player's keycaps actually say. */
  async #loadLayout() {
    try {
      // The keyboard layout map is not in TS7's DOM lib yet.
      const keyboard = (navigator as { keyboard?: { getLayoutMap?(): Promise<{ get(code: string): string | undefined }> } })?.keyboard;
      const map = await keyboard?.getLayoutMap?.();
      if (map) this.layout = map;
    } catch {
      // Unsupported or blocked by permissions policy; readableCode() covers it.
    }
  }

  /**
   * Move the held-key state for one queued record. Returns whether this
   * was a real edge worth dispatching.
   */
  apply(record: { kind: 'keydown' | 'keyup'; code: string }): boolean {
    if (record.kind === 'keydown') {
      if (this.down.has(record.code)) return false;
      this.down.add(record.code);
      this.pressed.add(record.code);
      return true;
    }
    if (!this.down.delete(record.code)) return false;
    this.released.add(record.code);
    return true;
  }

  /** Drop every held key, as if all were released. */
  releaseAll(): void {
    for (const code of this.down) this.released.add(code);
    this.down.clear();
    this.claimed.clear();
  }

  /** Whether `code` is held right now. */
  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Whether `code` went down during this frame. */
  justPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Whether `code` came up during this frame. */
  justReleased(code: string): boolean {
    return this.released.has(code);
  }

  /**
   * A -1..1 axis from two keys, the shape movement code actually wants.
   * Both held cancel out.
   */
  axis(negative: string, positive: string): number {
    return (this.down.has(positive) ? 1 : 0) - (this.down.has(negative) ? 1 : 0);
  }

  /**
   * A direction vector from four keys, normalized so diagonals are not
   * faster than the cardinals.
   */
  vector(up: string, down: string, left: string, right: string): { x: number; y: number } {
    const x = this.axis(left, right);
    const y = this.axis(up, down);
    if (x !== 0 && y !== 0) {
      const inverse = 1 / Math.SQRT2;
      return { x: x * inverse, y: y * inverse };
    }
    return { x, y };
  }

  /** What the player's keyboard prints on `code`: the keycap legend, or a readable form of the code. */
  label(code: string): string {
    const printed = this.layout?.get?.(code);
    if (printed) return printed.toUpperCase();
    return readableCode(code);
  }

  /** Clear this frame's edges. Called by the engine at the end of a frame. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }

  destroy(): void {
    for (const remove of this.listeners) remove();
    this.listeners = [];
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }
}
