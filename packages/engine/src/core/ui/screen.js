import { UIElement } from './uiElement.js';
import { FocusManager } from './focus.js';
import { resolveTransition, transitionTiming } from './transitions.js';

/**
 * A named, self-contained piece of UI that sits above the game: a pause
 * menu, a settings panel, an inventory, a dialog.
 *
 * ## Why this is not a scene
 *
 * Before this existed, a menu was a `Scene` of `type: 'ui'`, and reaching it
 * meant `sceneManager.switchTo`, which *unloads the current scene* — every
 * entity, body and sprite sheet gone. A pause menu over a live level was
 * therefore impossible, and so was going back: `switchTo` keeps no history.
 * The only alternative was `game.overlays`, an unordered `Set` with no
 * lifecycle in which each member decided its own modality.
 *
 * A screen is pushed onto a stack over whatever is already running. The game
 * stays loaded and visible underneath; `pop()` goes back. That is the whole
 * difference, and it is what makes pause → settings → back → back work.
 *
 * ## Modality
 *
 * `blocking` (the default) means the screen consumes the input it is given,
 * so nothing behind it reacts — the entire implementation of "the menu
 * blocks the game". A non-blocking screen (a HUD, a toast) lets events fall
 * through to whatever is below.
 *
 * `scrim` dims the game behind the screen. `pauseGame` freezes the
 * simulation while the screen is on the stack and restores the previous
 * pause state on the way out, so a screen pushed over an already-paused
 * game does not resume it.
 *
 * ## Focus
 *
 * Each screen owns a `FocusManager` scoped to itself, so Tab cannot walk out
 * of a dialog into the game behind it, and popping a screen restores the
 * focus the one underneath had.
 */
export class UIScreen extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {string} options.name - Identifier for `popTo` and `has`
   * @param {boolean} [options.blocking=true] - Consume input rather than
   *   letting it reach the scene and world below
   * @param {boolean} [options.scrim=false] - Dim what is behind
   * @param {string} [options.scrimColor='$color.bg.scrim']
   * @param {boolean} [options.pauseGame=false] - Freeze the simulation while
   *   this screen is on the stack
   * @param {boolean} [options.closeOnEscape=true] - Escape pops this screen
   * @param {boolean} [options.autoFocus=true] - Focus the first control on
   *   entry, so the screen is usable from a controller immediately
   * @param {string|Object|null} [options.transition='fade'] - How the screen
   *   arrives and leaves. A name from `TRANSITIONS`, a custom
   *   `{enter, exit}` pair, or `null` for an instant change
   * @param {number} [options.transitionDuration] - Overrides the theme
   * @param {number} [options.blurBehind=0] - Blur the world behind this
   *   screen by this many units. Needs the `postEffects` capability;
   *   backends without it fall back to the scrim alone
   */
  constructor(options = {}) {
    super({ pivot: 'top-left', ...options });
    this.name = options.name ?? 'screen';
    this.blocking = options.blocking ?? true;
    this.scrim = options.scrim ?? false;
    this.scrimColor = options.scrimColor ?? '$color.bg.scrim';
    this.pauseGame = options.pauseGame ?? false;
    this.closeOnEscape = options.closeOnEscape ?? true;
    this.autoFocus = options.autoFocus ?? true;

    this.transition = options.transition === undefined ? 'fade' : options.transition;
    this.transitionDuration = options.transitionDuration;
    this.blurBehind = options.blurBehind ?? 0;

    /**
     * Where the screen is in its own lifecycle: `'entering'`, `'open'` or
     * `'exiting'`. An exiting screen still draws — that is the point of an
     * exit animation — but takes no input and is no longer the top of the
     * stack. Distinct from `UIElement.state`, which is the *interaction*
     * state of a control.
     * @type {'entering'|'open'|'exiting'}
     */
    this.phase = 'open';

    /**
     * The stack holding this screen, or null while detached. Named `owner`
     * rather than `stack` so it cannot be confused with a layout `Stack`,
     * which is the thing a screen's contents are usually built from.
     * @type {import('./screenStack.js').ScreenStack|null}
     */
    this.owner = null;
    this.focus = new FocusManager(this);
    /** Whether closing should resume the game; captured when entering paused it. */
    this.resumeOnExit = false;
  }

  /** A screen fills the display, so children anchor against the whole of it. */
  get frame() {
    const ui = this.game?.uiRenderer;
    if (!ui) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: 0, y: 0, width: ui.width, height: ui.height };
  }

  /**
   * Never a hit target itself. A blocking screen swallows input through the
   * stack's dispatch rather than by covering the display with a hit box,
   * which would also make every click look like a click on the screen.
   */
  contains() {
    return false;
  }

  /** Whether this screen is on its way out and should be ignored by input. */
  get isExiting() {
    return this.phase === 'exiting';
  }

  /** Remove this screen from whatever stack holds it. */
  close() {
    return this.owner?.remove(this);
  }

  /**
   * Run the entrance. Called by the stack after `onEnter`.
   * @returns {import('./motion.js').Tween|null}
   */
  playEnter(motion) {
    const timing = transitionTiming(this.theme, {
      duration: this.transitionDuration
    });
    const tween = resolveTransition(this.transition).enter(this, motion, timing);
    this.phase = tween ? 'entering' : 'open';
    if (!tween) return null;

    return tween.whenComplete(() => {
      // Only settle if nothing else happened meanwhile: a screen dismissed
      // mid-entrance is already exiting and must not be marked open.
      if (this.phase === 'entering') this.phase = 'open';
    });
  }

  /**
   * Run the exit. Called by the stack, which detaches the screen when the
   * returned tween completes.
   * @returns {import('./motion.js').Tween|null}
   */
  playExit(motion) {
    const timing = transitionTiming(this.theme, {
      duration: this.transitionDuration
    });
    this.phase = 'exiting';
    return resolveTransition(this.transition).exit(this, motion, timing);
  }

  /**
   * Put the visual state back where a fresh entrance expects it. Screens are
   * reused — the settings menu is built once — so a screen that faded out
   * would otherwise still be transparent the next time it is pushed.
   */
  resetTransform() {
    this.opacity = 1;
    this.scaleX = 1;
    this.scaleY = 1;
    this.rotation = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /** Called when the screen is pushed. Build the UI here or in the constructor. */
  onEnter() {}

  /** Called when the screen is popped, before it is detached. */
  onExit() {}

  /**
   * Input routed from the stack. The default walks the element tree the way
   * the scene's UI band does, then handles the keys every screen shares.
   * Override for a screen that wants the raw stream.
   * @param {object} event
   */
  handleInput(event) {
    // On the way out it is scenery, not a target.
    if (this.isExiting) return;

    if (event.type === 'keydown') {
      if (this.#handleKey(event)) {
        event.consume();
        return;
      }
    } else {
      const target = this.hitTest(event.ui.x, event.ui.y);
      if (target) {
        // A pointer landing on a control moves focus there, so the keyboard
        // picks up where the mouse left off instead of somewhere unrelated.
        if (target.focusable && event.type === 'pointerdown') {
          this.focus.keyboardMode = false;
          this.focus.focus(target);
        }
        target.handleInput(event);
      }
    }

    if (this.blocking) event.consume();
  }

  /**
   * Navigation and activation keys. Returns whether the key was used.
   *
   * A non-blocking screen with nothing to focus (a HUD, a toast) takes no
   * keys at all: the arrows, Space and Escape belong to the game under it.
   */
  #handleKey(event) {
    if (!this.blocking && this.focus.candidates().length === 0) return false;
    switch (event.code) {
      case 'Tab':
        this.focus.advance(event.modifiers?.shift ? -1 : 1);
        return true;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        this.focus.move(event.code.replace('Arrow', '').toLowerCase());
        return true;
      case 'Enter':
      case 'Space':
        return this.focus.activate((type, extra) =>
          this.game.input.makeSyntheticEvent(type, extra));
      case 'Escape':
        if (!this.closeOnEscape) return false;
        this.close();
        return true;
      default:
        return false;
    }
  }

  updateTree(deltaTime) {
    super.updateTree(deltaTime);
    this.focus.prune();
  }

  draw(deltaTime) {
    if (!this.scrim) return;
    const ui = this.paint;
    this.paint.drawRect({
      x: 0, y: 0, width: ui.width, height: ui.height, fillStyle: this.scrimColor
    });
  }
}
