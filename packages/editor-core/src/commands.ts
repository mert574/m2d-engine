/**
 * The command model: the one way a document changes.
 *
 * Every edit — the inspector writing a field, a gizmo moving an object,
 * an agent calling a tool over MCP — is a command applied to the stack,
 * never a direct mutation. That is what buys undo, what lets the GUI and
 * an agent share one API, and what makes an AI edit show up in the
 * human's undo list with a label on it.
 *
 * A command carries its own undo rather than the stack snapshotting the
 * document: a scene is large and most edits are small, so remembering
 * the inverse is cheaper than remembering the world. `apply` returns the
 * undo, which keeps the before-state in a closure and makes a command
 * that forgets to be reversible impossible to write.
 *
 * The concrete commands are edits as data (`edits.ts`); this is the
 * contract they satisfy, and the stack that holds them.
 */

/** Undoes one application of a command. */
export type Undo = () => void;

export interface Command<T = unknown> {
  /** Shown in the undo list: 'Move 3 objects', 'AI: scatter 40 lamps'. */
  readonly label: string;
  /** Change the target and return how to put it back. */
  apply(target: T): Undo;
}

/** An entry the stack is holding, with the undo its application produced. */
interface Entry<T> {
  command: Command<T>;
  undo: Undo;
}

/**
 * Applied commands, newest last, with everything undone kept for redo
 * until the next application discards it.
 */
export class CommandStack<T = unknown> {
  readonly target: T;
  #done: Entry<T>[] = [];
  #undone: Entry<T>[] = [];
  #listeners = new Set<() => void>();

  constructor(target: T) {
    this.target = target;
  }

  /** Apply a command and remember how to undo it. */
  run(command: Command<T>): void {
    const undo = command.apply(this.target);
    this.#done.push({ command, undo });
    // A new edit after an undo is a new branch; the old future is gone.
    this.#undone.length = 0;
    this.#changed();
  }

  /**
   * Apply several as one entry, so a tool that touches twenty objects is
   * one step of undo rather than twenty. Undone in reverse.
   */
  runBatch(label: string, commands: Command<T>[]): void {
    this.run({
      label,
      apply: (target) => {
        const undos = commands.map((command) => command.apply(target));
        return () => { for (const undo of undos.reverse()) undo(); };
      }
    });
  }

  undo(): boolean {
    const entry = this.#done.pop();
    if (!entry) return false;
    entry.undo();
    this.#undone.push(entry);
    this.#changed();
    return true;
  }

  redo(): boolean {
    const entry = this.#undone.pop();
    if (!entry) return false;
    entry.undo = entry.command.apply(this.target);
    this.#done.push(entry);
    this.#changed();
    return true;
  }

  /**
   * Where the history stands, as a token: the newest applied entry, or
   * null at the start. Two equal positions mean the same document, which
   * is how `SceneDocument.dirty` is a comparison rather than a
   * serialization of the scene.
   */
  get position(): object | null { return this.#done.at(-1) ?? null; }

  /** The newest applied command, the one `undo` would revert. */
  get top(): Command<T> | null { return this.#done.at(-1)?.command ?? null; }
  /** The newest undone command, the one `redo` would apply. */
  get next(): Command<T> | null { return this.#undone.at(-1)?.command ?? null; }

  get canUndo(): boolean { return this.#done.length > 0; }
  get canRedo(): boolean { return this.#undone.length > 0; }
  /** Labels of what is applied, oldest first — the undo list. */
  get history(): string[] { return this.#done.map((entry) => entry.command.label); }

  /** Forget the history without touching the document. */
  clear(): void {
    this.#done.length = 0;
    this.#undone.length = 0;
    this.#changed();
  }

  /** Called after every change; returns an unsubscribe. */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }
}
