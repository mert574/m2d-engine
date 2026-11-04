/**
 * A quest as a line of stages.
 *
 * `stages` is an ordered list of `{ id, objective }`. The quest starts on
 * the first, `advance()` moves to the next, `complete(id)` jumps to the
 * stage after a named one (so an event can say "the part where you talk to
 * Oswin is done" without knowing what follows). `onStage` fires on every
 * change with the new stage and the old; `objective` is the current text
 * for a HUD. Anything richer — who says what, what unlocks — lives in the
 * game and hangs off `onStage`.
 *
 * @param {Array<{id: string, objective?: string}>} stages
 * @param {Object} [hooks]
 * @param {(stage, previous) => void} [hooks.onStage]
 */
export class Quest {
  constructor(stages, hooks = {}) {
    if (!stages?.length) throw new Error('A quest needs at least one stage');
    this.stages = stages;
    this.index = 0;
    this.hooks = hooks;
  }

  get stage() {
    return this.stages[this.index];
  }

  get id() {
    return this.stage.id;
  }

  get objective() {
    return this.stage.objective ?? '';
  }

  get done() {
    return this.index === this.stages.length - 1;
  }

  /** Whether a named stage is behind us. */
  passed(id) {
    const at = this.stages.findIndex(s => s.id === id);
    return at !== -1 && at < this.index;
  }

  is(id) {
    return this.id === id;
  }

  advance() {
    if (this.done) return false;
    this.#goTo(this.index + 1);
    return true;
  }

  /** Mark a stage done: move past it if it is the current one. */
  complete(id) {
    if (this.id !== id) return false;
    return this.advance();
  }

  goTo(id) {
    const at = this.stages.findIndex(s => s.id === id);
    if (at === -1) throw new Error(`Quest has no stage '${id}'`);
    this.#goTo(at);
  }

  #goTo(index) {
    const previous = this.stage;
    this.index = index;
    this.hooks.onStage?.(this.stage, previous);
  }
}
