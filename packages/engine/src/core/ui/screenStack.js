import { UIElement } from './uiElement.js';

/**
 * The engine's UI above the scene: a stack of screens, plus a debug layer
 * that outlives all of them.
 *
 * Reached as `game.ui`. It replaces `game.overlays`, which was a `Set` with
 * no order, no lifecycle and no modality contract — every member decided for
 * itself whether it was modal, and the router had to ask each one in turn.
 *
 * ## Order
 *
 * Drawing runs bottom-up: scene UI (drawn by the scene), then screens from
 * the bottom of the stack to the top, then the debug layer, then the
 * pointer cursor. Input runs the other way: debug first — the developer
 * console must be able to take keys away from the game — then screens from
 * the top down, stopping at the first blocking one, then the scene's UI and
 * the world, which the router handles.
 *
 * ## Why the top blocking screen is the only one that matters
 *
 * The router used to hand every overlay every event and let each decide.
 * That made modality a property each overlay reimplemented. Here the stack
 * knows: events go to screens from the top down, and the first `blocking`
 * one consumes. A non-blocking HUD above a blocking menu still sees its
 * events; a menu below one does not.
 */

/** Pause states are refcounted, so two paused screens do not fight over one flag. */
export class ScreenStack {
  /**
   * @param {import('../m2d.js').M2D} game
   */
  constructor(game) {
    this.game = game;

    /**
     * Screens, bottom first. Not a `UIElement` tree, because a screen's
     * frame is the whole display and nesting them would make each one's
     * box depend on the one below.
     * @type {import('./screen.js').UIScreen[]}
     */
    this.screens = [];

    /**
     * Always-on UI above every screen: the performance readout, and the
     * developer console once it exists. Lives outside the scene's container
     * so switching scenes does not clear it and scene hit testing never
     * sees it.
     */
    this.debug = new UIElement({ pivot: 'top-left' });
    this.debug.game = game;
    this.debug.mounted = true;
    // The debug layer covers the display, like a screen.
    Object.defineProperty(this.debug, 'frame', {
      get: () => {
        const ui = game.uiRenderer;
        return ui ? { x: 0, y: 0, width: ui.width, height: ui.height } : { x: 0, y: 0, width: 0, height: 0 };
      }
    });
    this.debug.contains = () => false;

    /**
     * Screens animating out. They still draw — that is what an exit
     * animation is — but are not on `screens`, so they are not the top, take
     * no input and hold no pause.
     * @type {import('./screen.js').UIScreen[]}
     */
    this.exiting = [];

    /** What the pointer is over in the debug layer or the top screen. */
    this.hovered = null;
    /** Pause state to restore when the last pausing screen leaves. */
    this.resumeOnEmpty = false;
    this.pauseDepth = 0;
  }

  /** The topmost screen, or null. */
  get top() {
    return this.screens[this.screens.length - 1] ?? null;
  }

  /** Whether any screen blocks input, which is what "a menu is open" means. */
  get capturesInput() {
    return this.screens.some((screen) => screen.blocking);
  }

  /** Whether a screen with this name is on the stack. */
  has(name) {
    return this.screens.some((screen) => screen.name === name);
  }

  /** The screen with this name, if any. */
  get(name) {
    return this.screens.find((screen) => screen.name === name) ?? null;
  }

  /**
   * Push a screen on top of whatever is showing.
   * @template {import('./screen.js').UIScreen} T
   * @param {T} screen
   * @returns {T}
   */
  push(screen) {
    if (this.screens.includes(screen)) return screen;
    // Pushing something that is still animating out cancels the exit: the
    // player changed their mind, and it should come back rather than
    // finish leaving and then re-enter from nothing.
    this.#dropExiting(screen);

    screen.owner = this;
    screen.setGame(this.game);
    this.screens.push(screen);
    screen.mounted = true;
    for (const child of screen.children) child.setGame(this.game);

    if (screen.pauseGame) {
      // Restore, don't just resume: a game paused before the screen opened
      // stays paused after it closes.
      if (this.pauseDepth === 0) this.resumeOnEmpty = !this.game.paused;
      this.pauseDepth++;
      this.game.paused = true;
    }

    screen.onEnter();
    if (screen.autoFocus) screen.focus.focusFirst();

    screen.resetTransform();
    screen.playEnter(this.game.motion);
    this.#applyWorldEffects();
    return screen;
  }

  /**
   * Pop the top screen.
   * @returns {import('./screen.js').UIScreen|null} The screen that left
   */
  pop() {
    return this.remove(this.top);
  }

  /**
   * Remove a specific screen, wherever it sits.
   * @param {import('./screen.js').UIScreen|null} screen
   */
  remove(screen, { animate = true } = {}) {
    const index = screen ? this.screens.indexOf(screen) : -1;
    if (index < 0) return null;

    screen.onExit();
    this.screens.splice(index, 1);
    screen.focus.blur();
    if (this.hovered && isUnder(screen, this.hovered)) this.#setHovered(null);

    // The pause lifts as the screen starts leaving, not when it finishes:
    // the game should be running again by the time the menu has faded.
    if (screen.pauseGame) {
      this.pauseDepth = Math.max(0, this.pauseDepth - 1);
      if (this.pauseDepth === 0 && this.resumeOnEmpty) this.game.paused = false;
    }

    this.game.uiRenderer.setCursor('default');
    this.#applyWorldEffects();

    const exit = animate ? screen.playExit(this.game.motion) : null;
    if (!exit) {
      this.#detach(screen);
      return screen;
    }

    this.exiting.push(screen);
    // Synchronously on the frame the tween lands, so `isEmpty` and the draw
    // list agree with each other within that frame rather than a microtask
    // later.
    exit.whenComplete(() => {
      // It may have been pushed again while leaving, in which case it is
      // alive and owned once more and must not be torn down.
      const index = this.exiting.indexOf(screen);
      if (index < 0) return;
      this.exiting.splice(index, 1);
      this.#detach(screen);
    });
    return screen;
  }

  /** Final teardown once nothing is animating it. */
  #detach(screen) {
    screen.owner = null;
    screen.mounted = false;
    screen.phase = 'open';
    screen.resetTransform();
  }

  /** Stop animating a screen out, because it is being pushed again. */
  #dropExiting(screen) {
    const index = this.exiting.indexOf(screen);
    if (index < 0) return;
    this.exiting.splice(index, 1);
    this.game.motion.cancel(screen);
  }

  /** Replace the top screen, for a sideways move that should not deepen the stack. */
  replace(screen) {
    this.pop();
    return this.push(screen);
  }

  /** Pop until the named screen is on top. Does nothing if it is not on the stack. */
  popTo(name) {
    if (!this.has(name)) return null;
    while (this.top && this.top.name !== name) this.pop();
    return this.top;
  }

  /**
   * Pop everything, without animating. Used by teardown, where there is no
   * next frame for an exit to play in.
   */
  clear() {
    while (this.screens.length) this.remove(this.top, { animate: false });
    for (const screen of [...this.exiting]) {
      this.game.motion.cancel(screen);
      this.#detach(screen);
    }
    this.exiting.length = 0;
  }

  // === Per-frame ===

  update(deltaTime) {
    // A copy, because a screen's update may push or pop.
    for (const screen of [...this.exiting]) screen.updateTree(deltaTime);
    for (const screen of [...this.screens]) screen.updateTree(deltaTime);
    this.debug.updateTree(deltaTime);
  }

  draw(deltaTime) {
    // Leaving screens draw beneath the live ones, so a replacement arrives
    // over the thing it replaced rather than under it.
    for (const screen of this.exiting) screen.drawTree(deltaTime);
    for (const screen of this.screens) screen.drawTree(deltaTime);
    this.debug.drawTree(deltaTime);
  }

  /** Whether there is anything at all to draw. */
  get isEmpty() {
    return this.screens.length === 0 && this.exiting.length === 0 &&
      this.debug.children.length === 0;
  }

  /**
   * Push the blur the topmost blurring screen asks for into the renderer.
   *
   * The world's post-effect pass runs between the world and screen passes,
   * so blurring there dims and softens the game without touching the UI
   * drawn over it. A backend without `postEffects` ignores it and the
   * screen's scrim carries the separation alone.
   */
  #applyWorldEffects() {
    const renderer = this.game.renderer;
    if (!renderer.supports?.('postEffects')) return;

    let blur = 0;
    for (const screen of this.screens) blur = Math.max(blur, screen.blurBehind ?? 0);
    if (blur === this.appliedBlur) return;
    this.appliedBlur = blur;

    const existing = renderer.postEffects ?? null;
    if (blur > 0) {
      renderer.setPostEffects({ ...existing, blur: { strength: blur } });
    } else if (existing) {
      const { blur: _dropped, ...rest } = existing;
      renderer.setPostEffects(Object.keys(rest).length ? rest : null);
    }
  }

  // === Input ===

  /**
   * Route one event, highest layer first.
   *
   * Called by the input router's overlay band, before the scene's UI and the
   * world see anything.
   * @param {object} event
   */
  handleInput(event) {
    // Debug children holding `captureAll` — the developer console, a menu's
    // hotkey — see every event before anything else, position
    // notwithstanding: a console that cannot take keys away from the game is
    // not a console, and a hotkey a blocking menu can eat is not a hotkey.
    // Each decides per event whether to consume, which is how pointer input
    // outside the console's panel still reaches the menus below.
    const captures = this.#captureAllTargets();
    for (const capture of captures) {
      capture.handleInput(event);
      if (event.consumed) return;
    }

    const debugTarget = this.#debugTarget(event);
    if (debugTarget && !captures.includes(debugTarget)) {
      debugTarget.handleInput(event);
      if (event.consumed) return;
    }

    for (let i = this.screens.length - 1; i >= 0; i--) {
      this.screens[i].handleInput(event);
      if (event.consumed) return;
    }
  }

  /**
   * The debug children that take everything, in order. Deliberately not
   * gated on `visible`: the console is hidden while closed but still owns
   * its own hotkey, which otherwise a blocking screen would eat first.
   */
  #captureAllTargets() {
    return this.debug.children.filter((child) => child.captureAll);
  }

  /** Whether any screen is still animating in or out. */
  get isTransitioning() {
    return this.exiting.length > 0 ||
      this.screens.some((screen) => screen.phase === 'entering');
  }

  /**
   * Recompute what the pointer is over, across the debug layer and the top
   * screen. Mirrors the router's own hover pass, but inside this band.
   * @param {object} event
   */
  updateHover(event) {
    const target = this.#debugTarget(event) ?? this.#screenTarget(event);
    this.#setHovered(target);
    return target;
  }

  /** Whether this band owns the pointer, so nothing below shows hover. */
  ownsPointer(event) {
    if (this.#debugTarget(event)) return true;
    return this.capturesInput;
  }

  #debugTarget(event) {
    if (!event.ui) return null;
    return this.debug.hitTest(event.ui.x, event.ui.y);
  }

  #screenTarget(event) {
    if (!event.ui) return null;
    for (let i = this.screens.length - 1; i >= 0; i--) {
      const hit = this.screens[i].hitTest(event.ui.x, event.ui.y);
      if (hit) return hit;
      if (this.screens[i].blocking) return null;
    }
    return null;
  }

  #setHovered(target) {
    if (target === this.hovered) return;
    const previous = this.hovered;
    this.hovered = target;
    if (previous) {
      previous.isHovered = false;
      previous.onHoverEnd?.();
    }
    if (target) {
      target.isHovered = true;
      target.onHover?.();
    }

    // Focus follows the pointer onto a control. Focus and hover share one
    // appearance, so without this the keyboard's selection and the mouse's
    // would both light up and the player would see two highlights with no
    // way to tell which one Enter will take.
    if (target?.focusable && target.enabled) {
      for (const screen of this.screens) {
        if (isUnder(screen, target)) {
          screen.focus.keyboardMode = false;
          screen.focus.focus(target);
          break;
        }
      }
    }
  }

  destroy() {
    this.clear();
    this.debug.destroy();
    this.hovered = null;
  }
}

function isUnder(root, element) {
  for (let node = element; node; node = node.parent) {
    if (node === root) return true;
  }
  return false;
}
