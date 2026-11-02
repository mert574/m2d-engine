import { UIElement } from '../ui/uiElement.js';

/**
 * The drop-down developer console.
 *
 * Source's grammar over this engine's registries: a scrollback, an input
 * line, history on the up arrow, Tab completion, and every cvar and command
 * one keystroke away. Opens with backquote.
 *
 * ## Where it sits
 *
 * In `game.ui.debug`, above every screen, with `captureAll` set while open —
 * the stack routes it every event before anything else, because a console
 * that cannot take keys away from the game is not a console. It is not
 * modal, though: keys are captured, but pointer events outside the panel
 * fall through, so the game and its menus stay clickable underneath.
 *
 * ## Text input
 *
 * The engine deliberately keys game input off `event.code` (physical keys).
 * The console is the sanctioned exception: it reads `event.key`, the
 * character the player's layout actually produced, because typed text is
 * exactly the case layouts exist for. Keydown events already carry both.
 *
 * ## console.* capture
 *
 * The engine logs through `console.warn`/`console.debug`; a sprite that
 * fails to load should be readable in-game, not only in devtools. While
 * mounted, the global console methods are wrapped (and forwarded), and
 * `destroy` restores the originals it saved.
 */

/** Scrollback kept, in submitted lines. Oldest fall off. */
const MAX_LINES = 400;

/** Input history kept. */
const MAX_HISTORY = 64;

/** Colour per line kind. */
const LINE_COLORS = Object.freeze({
  input: '$color.text.accent',
  print: '$color.text.secondary',
  warn: '$color.status.warning',
  error: '$color.status.danger',
  debug: '$color.text.muted'
});

export class DevConsole extends UIElement {
  /**
   * @param {import('../m2d.js').M2D} game
   * @param {Object} [options]
   * @param {string} [options.hotkey='Backquote'] - Physical key that toggles
   * @param {number} [options.coverage=0.45] - Share of the screen it drops over
   * @param {boolean} [options.captureConsole=true] - Mirror `console.*` here
   */
  constructor(game, options = {}) {
    super({ pivot: 'top-left' });
    this.game = game;
    this.hotkey = options.hotkey ?? 'Backquote';
    this.coverage = options.coverage ?? 0.45;
    this.isOpen = false;
    /**
     * The stack routes every event here first, always — not only while
     * open. The hotkey has to outrank a blocking screen, or the console
     * could not be opened over a menu, and a console that cannot take keys
     * away from *everything* is not a console. While closed, `handleInput`
     * touches nothing but that one key.
     */
    this.captureAll = true;

    /** @type {Array<{text: string, kind: string}>} */
    this.lines = [];
    /** Wrapped lines, rebuilt when the width or the content changes. */
    this.wrapped = [];
    this.wrappedWidth = 0;
    this.wrappedCount = 0;
    /** How many wrapped lines up from the bottom the view is scrolled. */
    this.scroll = 0;

    this.input = '';
    this.caret = 0;
    /** @type {string[]} */
    this.history = [];
    this.historyIndex = -1;
    /** The line being typed when history browsing began. */
    this.pendingInput = '';
    this.blinkClock = 0;

    /** Fixed metrics; the console is a terminal, not a themed component. */
    this.lineHeight = 16;
    this.fontSize = 12;
    this.pad = 10;

    this.wants('scroll');

    // Everything a command needs to talk back. `print` is the console's
    // whole output API, so commands never know about wrapping or kinds.
    this.io = {
      print: (text) => this.append(String(text), 'print'),
      warn: (text) => this.append(String(text), 'warn'),
      error: (text) => this.append(String(text), 'error'),
      clear: () => this.clearLines()
    };

    /** Restorers for the wrapped console.* methods. @type {Function[]} */
    this.restores = [];
    if (options.captureConsole ?? true) this.#captureConsole();

    game.ui.debug.add(this);
    this.visible = false;

    this.append(`m2d console — 'help' lists commands, Tab completes, ${game.input.keyLabel(this.hotkey)} closes`, 'debug');
  }

  // === Lifecycle ===

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.visible = true;
    this.captureAll = true;
    this.scroll = 0;
    this.game.motion.to(this, { offsetY: 0 }, {
      from: { offsetY: -this.panelHeight },
      duration: '$motion.duration.fast',
      easing: '$motion.easing.decelerate'
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.captureAll = false;
    this.game.uiRenderer.setCursor('default');
    this.game.motion.to(this, { offsetY: -this.panelHeight }, {
      duration: '$motion.duration.fast',
      easing: '$motion.easing.accelerate',
      onComplete: () => {
        // Only actually hide if nothing reopened it mid-slide.
        if (!this.isOpen) this.visible = false;
      }
    });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  destroy() {
    this.captureAll = false;
    for (const restore of this.restores) restore();
    this.restores = [];
    super.destroy();
  }

  // === Output ===

  /** Panel height at the current coverage, in UI units. */
  get panelHeight() {
    return Math.round((this.game.uiRenderer?.height ?? 0) * this.coverage);
  }

  /**
   * Add one line to the scrollback.
   * @param {string} text
   * @param {'input'|'print'|'warn'|'error'|'debug'} [kind='print']
   */
  append(text, kind = 'print') {
    // Multi-line payloads (a stack trace) become one scrollback line each.
    for (const part of String(text).split('\n')) {
      this.lines.push({ text: part, kind });
    }
    if (this.lines.length > MAX_LINES) {
      this.lines.splice(0, this.lines.length - MAX_LINES);
    }
    // Invalidate the wrap cache; a scrolled view keeps its place and is
    // re-clamped the next time it scrolls.
    this.wrappedCount = -1;
  }

  clearLines() {
    this.lines = [];
    this.wrapped = [];
    this.wrappedCount = 0;
    this.scroll = 0;
  }

  /** Run one line as if typed. Public so games and tests can script it. */
  execute(line) {
    const text = line.trim();
    if (!text) return;
    this.append(`> ${text}`, 'input');
    if (text !== this.history[this.history.length - 1]) {
      this.history.push(text);
      if (this.history.length > MAX_HISTORY) this.history.shift();
    }
    this.historyIndex = -1;
    this.game.commands.execute(text, this.io);
  }

  // === Input ===

  handleInput(event) {
    // The one thing a closed console reacts to.
    if (!this.isOpen) {
      if (event.type === 'keydown' && event.code === this.hotkey) {
        this.open();
        event.consume();
      }
      return;
    }

    if (event.type === 'keydown') {
      this.#onKey(event);
      // Every key belongs to the console while it is open — including the
      // ones it ignored, or the game underneath starts moving while the
      // player types. Releases pass (handled by the stack routing nothing
      // for keyup here) so held game keys still clear.
      event.consume();
      return;
    }

    if (event.type === 'scroll') {
      if (this.#inPanel(event.ui)) {
        this.#scrollBy(event.scroll.y > 0 ? -3 : 3);
        event.consume();
      }
      return;
    }

    // Pointer events: the console is not modal. Inside the panel they are
    // consumed (a click focuses nothing, a wheel scrolls); outside they fall
    // through so the game and its menus stay usable under an open console.
    if (event.ui && this.#inPanel(event.ui)) {
      event.consume();
    }
  }

  #inPanel(point) {
    return point.y <= this.offsetY + this.panelHeight;
  }

  #onKey(event) {
    this.blinkClock = 0;

    switch (event.code) {
      case this.hotkey:
      case 'Escape':
        this.close();
        return;
      case 'Enter': {
        const line = this.input;
        this.input = '';
        this.caret = 0;
        this.scroll = 0;
        this.execute(line);
        return;
      }
      case 'Backspace':
        if (this.caret > 0) {
          this.input = this.input.slice(0, this.caret - 1) + this.input.slice(this.caret);
          this.caret--;
        }
        return;
      case 'Delete':
        this.input = this.input.slice(0, this.caret) + this.input.slice(this.caret + 1);
        return;
      case 'ArrowLeft':
        this.caret = Math.max(0, this.caret - 1);
        return;
      case 'ArrowRight':
        this.caret = Math.min(this.input.length, this.caret + 1);
        return;
      case 'Home':
        this.caret = 0;
        return;
      case 'End':
        this.caret = this.input.length;
        return;
      case 'ArrowUp':
        this.#browseHistory(-1);
        return;
      case 'ArrowDown':
        this.#browseHistory(1);
        return;
      case 'PageUp':
        this.#scrollBy(this.#visibleLines() - 1);
        return;
      case 'PageDown':
        this.#scrollBy(-(this.#visibleLines() - 1));
        return;
      case 'Tab':
        this.#complete();
        return;
      default:
        break;
    }

    // Printable input, by the character the layout produced. Modifier chords
    // are not text — and not consuming them here would be wrong too, so they
    // are simply ignored and die with the general consume above.
    const key = event.key;
    if (key && key.length === 1 && !event.modifiers?.ctrl && !event.modifiers?.alt && !event.modifiers?.meta) {
      this.input = this.input.slice(0, this.caret) + key + this.input.slice(this.caret);
      this.caret++;
    }
  }

  #browseHistory(direction) {
    if (this.history.length === 0) return;

    if (this.historyIndex === -1) {
      if (direction === 1) return;
      this.pendingInput = this.input;
      this.historyIndex = this.history.length - 1;
    } else {
      this.historyIndex += direction;
    }

    if (this.historyIndex >= this.history.length) {
      // Walked past the newest entry: back to whatever was being typed.
      this.historyIndex = -1;
      this.input = this.pendingInput;
    } else {
      this.historyIndex = Math.max(0, this.historyIndex);
      this.input = this.history[this.historyIndex];
    }
    this.caret = this.input.length;
  }

  #complete() {
    const head = this.input.slice(0, this.caret);
    const tail = this.input.slice(this.caret);
    const { completions, prefix } = this.game.commands.complete(head);
    if (completions.length === 0) return;

    if (completions.length === 1) {
      // One answer: take it, and a trailing space to move on to arguments.
      const replacement = head.slice(0, head.length - prefix.length) + completions[0] + ' ';
      this.input = replacement + tail;
      this.caret = replacement.length;
      return;
    }

    // Several: extend to the longest common prefix and show the choices,
    // which is the bash behaviour everyone's hands already know.
    const common = commonPrefix(completions);
    if (common.length > prefix.length) {
      const replacement = head.slice(0, head.length - prefix.length) + common;
      this.input = replacement + tail;
      this.caret = replacement.length;
    }
    this.append(completions.join('   '), 'debug');
  }

  #scrollBy(lines) {
    const max = Math.max(0, this.#wrappedLines().length - this.#visibleLines());
    this.scroll = Math.max(0, Math.min(max, this.scroll + lines));
  }

  // === console.* capture ===

  #captureConsole() {
    if (typeof console === 'undefined') return;
    const kinds = { log: 'print', info: 'print', debug: 'debug', warn: 'warn', error: 'error' };
    for (const [method, kind] of Object.entries(kinds)) {
      const original = console[method];
      // The first mounted console wins. Without this, every engine
      // constructed on one page (or in one test file) would add another
      // layer of wrapping to the same global functions.
      if (typeof original !== 'function' || original.__m2dConsole) continue;
      const wrapped = (...args) => {
        original.apply(console, args);
        this.append(args.map(stringify).join(' '), kind);
      };
      wrapped.__m2dConsole = true;
      console[method] = wrapped;
      this.restores.push(() => { console[method] = original; });
    }
  }

  // === Rendering ===

  update(deltaTime) {
    if (this.visible) this.blinkClock += deltaTime;
    // A real frame, so the stack's hover pass sees the panel and nothing
    // underneath shows a hover state through it.
    this.width = this.game.uiRenderer?.width ?? 0;
    this.height = this.panelHeight;
  }

  #visibleLines() {
    const logHeight = this.panelHeight - this.pad * 2 - this.lineHeight - 8;
    return Math.max(1, Math.floor(logHeight / this.lineHeight));
  }

  /** Scrollback wrapped to the current width, cached until either changes. */
  #wrappedLines() {
    const width = (this.game.uiRenderer?.width ?? 0) - this.pad * 2;
    if (this.wrappedWidth === width && this.wrappedCount === this.lines.length &&
        this.wrappedCount !== -1) {
      return this.wrapped;
    }

    const style = { fontSize: this.fontSize, fontFamily: this.theme?.get('font.mono') };
    const out = [];
    for (const line of this.lines) {
      if (line.text === '') {
        out.push({ text: '', kind: line.kind });
        continue;
      }
      let rest = line.text;
      let guard = 0;
      while (rest.length > 0 && guard++ < 50) {
        const take = this.#fit(rest, width, style);
        out.push({ text: rest.slice(0, take), kind: line.kind });
        rest = rest.slice(take);
      }
    }
    this.wrapped = out;
    this.wrappedWidth = width;
    this.wrappedCount = this.lines.length;
    return out;
  }

  /**
   * How many characters of `text` fit in `width`. Estimated from the whole
   * string's measure and refined, rather than measured per character — the
   * console can hold hundreds of lines and this runs on every re-wrap.
   */
  #fit(text, width, style) {
    const total = this.paint.measureText(text, style).width;
    if (total <= width) return text.length;
    let take = Math.max(1, Math.floor((text.length * width) / total));
    while (take > 1 && this.paint.measureText(text.slice(0, take), style).width > width) take--;
    while (take < text.length &&
      this.paint.measureText(text.slice(0, take + 1), style).width <= width) take++;
    return take;
  }

  draw() {
    if (!this.game || !this.visible) return;
    const ui = this.paint;
    const width = ui.width;
    const height = this.panelHeight;
    const top = this.offsetY;
    const mono = this.theme?.get('font.mono');

    ui.drawRect({
      x: 0, y: top, width, height,
      fillStyle: 'rgba(5, 10, 16, 0.92)'
    });
    ui.drawRect({
      x: 0, y: top + height - 1, width, height: 1,
      fillStyle: '$color.border.strong'
    });

    // Scrollback, bottom-anchored above the input line.
    const wrapped = this.#wrappedLines();
    const visible = this.#visibleLines();
    const inputY = top + height - this.pad - this.lineHeight;
    const end = wrapped.length - this.scroll;
    const start = Math.max(0, end - visible);
    for (let i = start; i < end; i++) {
      const line = wrapped[i];
      ui.drawText({
        text: line.text,
        x: this.pad,
        y: inputY - 6 - (end - i) * this.lineHeight,
        fillStyle: LINE_COLORS[line.kind] ?? LINE_COLORS.print,
        fontSize: this.fontSize,
        fontFamily: mono,
        textBaseline: 'top'
      });
    }

    if (this.scroll > 0) {
      ui.drawText({
        text: `· ${this.scroll} line${this.scroll === 1 ? '' : 's'} below ·`,
        x: width - this.pad,
        y: inputY - 6 - this.lineHeight,
        fillStyle: '$color.text.muted',
        fontSize: this.fontSize,
        fontFamily: mono,
        textAlign: 'right',
        textBaseline: 'top'
      });
    }

    // The input line: prompt, text, caret.
    const promptStyle = { fontSize: this.fontSize, fontFamily: mono };
    ui.drawText({
      text: '>',
      x: this.pad, y: inputY,
      fillStyle: '$color.text.accent',
      ...promptStyle, textBaseline: 'top'
    });
    const inputX = this.pad + 14;
    ui.drawText({
      text: this.input,
      x: inputX, y: inputY,
      fillStyle: '$color.text.primary',
      ...promptStyle, textBaseline: 'top'
    });

    if (Math.floor(this.blinkClock * 2.4) % 2 === 0) {
      const caretX = inputX + ui.measureText(this.input.slice(0, this.caret), promptStyle).width;
      ui.drawRect({
        x: caretX + 0.5, y: inputY - 1,
        width: 7, height: this.lineHeight - 2,
        fillStyle: '$color.text.accent',
        globalAlpha: 0.8
      });
    }
  }
}

function commonPrefix(items) {
  let prefix = items[0] ?? '';
  for (const item of items) {
    let length = 0;
    while (length < prefix.length && prefix[length] === item[length]) length++;
    prefix = prefix.slice(0, length);
  }
  return prefix;
}

function stringify(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
