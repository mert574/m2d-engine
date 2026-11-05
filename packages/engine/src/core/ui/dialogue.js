import { UIElement } from './uiElement.js';

/**
 * A spoken line, typed out, with the speaker's name and an advance hint.
 *
 * `start(speaker, lines, onDone)` opens it; `advance()` finishes the
 * typing, then moves to the next line, then closes and calls `onDone`.
 * The game wires `advance` to its interact key. `canOpen` is false for a
 * moment after closing, so the key that closed a conversation does not
 * start the next one.
 *
 * By default the typing runs on frame time. A game whose conversations
 * change the simulation (freeze the player, advance a quest) calls
 * `advance` from a tick and passes `clock: () => game.time.elapsed`, so
 * whether a press finishes the line or moves on is decided by game time
 * and replays the same at any frame rate.
 *
 * @param {Object} [options] - `UIElement` options, plus:
 * @param {number} [options.charsPerSecond=46]
 * @param {() => number} [options.clock] - Seconds to type and debounce
 *   against, read when needed. Without it the dialogue counts frames
 * @param {number} [options.width=720]
 * @param {number} [options.height=128]
 * @param {string} [options.advanceHint='E'] - The key named in the hint
 */
export class UIDialogue extends UIElement {
  constructor(options = {}) {
    super({ anchor: 'bottom', pivot: 'bottom', x: 0, y: -64, width: 720, height: 128, visible: false, ...options });
    this.charsPerSecond = options.charsPerSecond ?? 46;
    this.advanceHint = options.advanceHint ?? 'E';
    this.clock = options.clock ?? null;
    this.speaker = '';
    this.lines = [];
    this.index = 0;
    this.shown = 0;
    this.onDone = null;
    this.sinceClosed = Infinity;
    this.textColor = options.textColor ?? '$color.text.primary';
    this.nameColor = options.nameColor ?? '$color.text.accent';
    this.background = options.background ?? 'rgba(12, 18, 14, 0.84)';
    this.borderColor = options.borderColor ?? '$color.border.subtle';
  }

  get open() { return this.visible; }
  get canOpen() { return !this.visible && this.sinceClosed > 0.5; }

  /** Characters typed on the current line. Infinity once skipped to the end. */
  get shown() {
    if (!this.clock) return this.#shown;
    return this.#skipped ? Infinity : (this.clock() - this.#lineStart) * this.charsPerSecond;
  }

  set shown(value) {
    this.#shown = value;
    if (!this.clock) return;
    this.#skipped = value === Infinity;
    if (!this.#skipped) this.#lineStart = this.clock() - value / this.charsPerSecond;
  }

  /** Seconds since the last conversation closed. */
  get sinceClosed() {
    return this.clock ? this.clock() - this.#closedAt : this.#sinceClosed;
  }

  set sinceClosed(value) {
    this.#sinceClosed = value;
    if (this.clock) this.#closedAt = this.clock() - value;
  }

  #shown = 0;
  #skipped = false;
  #lineStart = 0;
  #sinceClosed = Infinity;
  #closedAt = -Infinity;

  start(speaker, lines, onDone) {
    this.speaker = speaker;
    this.lines = Array.isArray(lines) ? lines : [lines];
    this.index = 0;
    this.shown = 0;
    this.onDone = onDone ?? null;
    this.visible = true;
  }

  advance() {
    if (!this.visible) return;
    const line = this.lines[this.index] ?? '';
    if (this.shown < line.length) { this.shown = Infinity; return; }
    if (this.index < this.lines.length - 1) { this.index++; this.shown = 0; return; }
    this.visible = false;
    this.sinceClosed = 0;
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }

  update(deltaTime) {
    super.update(deltaTime);
    if (this.clock) return;
    if (this.visible) this.shown += deltaTime * this.charsPerSecond;
    else this.sinceClosed += deltaTime;
  }

  draw() {
    const f = this.frame;
    const paint = this.paint;
    paint.drawRect({ x: f.x, y: f.y, width: f.width, height: f.height, fillStyle: this.background, strokeStyle: this.borderColor, lineWidth: 1.5, cornerRadius: 10 });
    const nameWidth = paint.measureText(this.speaker.toUpperCase(), { fontSize: 14, letterSpacing: 2 }).width + 28;
    paint.drawRect({ x: f.x + 18, y: f.y - 14, width: nameWidth, height: 26, fillStyle: '$color.bg.raised', strokeStyle: this.borderColor, lineWidth: 1.5, cornerRadius: 6 });
    paint.drawText({ x: f.x + 32, y: f.y - 1, text: this.speaker.toUpperCase(), fillStyle: this.nameColor, fontSize: 14, letterSpacing: 2, textBaseline: 'middle' });

    const line = this.lines[this.index] ?? '';
    const text = line.slice(0, Math.floor(Math.min(this.shown, line.length)));
    const rows = [];
    let row = '';
    for (const word of text.split(' ')) {
      const next = row ? `${row} ${word}` : word;
      if (paint.measureText(next, { fontSize: 18 }).width > f.width - 60 && row) { rows.push(row); row = word; }
      else row = next;
    }
    rows.push(row);
    rows.forEach((r, i) => paint.drawText({ x: f.x + 30, y: f.y + 26 + i * 26, text: r, fillStyle: this.textColor, fontSize: 18, textBaseline: 'top' }));

    const more = this.index < this.lines.length - 1 || this.shown < line.length;
    paint.drawText({
      x: f.x + f.width - 22, y: f.y + f.height - 14, text: `${this.advanceHint} · ${more ? 'next' : 'close'}`,
      fillStyle: '$color.text.muted', fontSize: 12, textAlign: 'right', textBaseline: 'bottom'
    });
  }
}
