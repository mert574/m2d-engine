/**
 * An open scene, as the editor holds it.
 *
 * The document is the parsed JSON and nothing more — no live entities, no
 * engine. That separation is the point: an agent over MCP edits documents
 * in Node with no browser, the GUI edits the same documents and hands
 * them to a running engine to draw, and both go through the same
 * commands. What the engine makes of a document is the engine's business;
 * `fetch: () => doc.data` is the whole handoff.
 */

import { writeScene } from './writer.ts';
import { validateScene, type ValidationResult } from './validate.ts';
import { CommandStack, type Command } from './commands.ts';

export class SceneDocument {
  /** Where it came from, for saving; null for one made in memory. */
  readonly path: string | null;
  /** The parsed scene. Changed only through commands. */
  data: Record<string, unknown>;
  /** Applied edits, for undo. */
  readonly commands: CommandStack<SceneDocument>;
  /** The canonical text last saved, to tell a real edit from a no-op. */
  #saved: string;

  constructor(data: Record<string, unknown>, path: string | null = null) {
    this.data = data;
    this.path = path;
    this.commands = new CommandStack<SceneDocument>(this);
    this.#saved = this.text;
  }

  /** Parse a scene's text. Throws `SyntaxError` on malformed JSON. */
  static parse(text: string, path: string | null = null): SceneDocument {
    return new SceneDocument(JSON.parse(text) as Record<string, unknown>, path);
  }

  /** `'level'` or `'ui'`. */
  get type(): string | null {
    return typeof this.data.type === 'string' ? this.data.type : null;
  }

  get name(): string | null {
    return typeof this.data.name === 'string' ? this.data.name : null;
  }

  /**
   * The script that owns this file, when the scene is generated. An
   * editor shows such a scene read-only: the next run of the script
   * overwrites whatever was saved here. Detaching is deleting the field.
   */
  get generator(): string | null {
    return typeof this.data.generator === 'string' ? this.data.generator : null;
  }

  /** The document as canonical text — what a save writes. */
  get text(): string {
    return writeScene(this.data);
  }

  /** Whether the canonical text differs from the last save. */
  get dirty(): boolean {
    return this.text !== this.#saved;
  }

  /** Apply an edit. The one way the document changes. */
  run(command: Command<SceneDocument>): void {
    this.commands.run(command);
  }

  validate(game: unknown = null): ValidationResult {
    return validateScene(this.data, game);
  }

  /** Note the current text as saved; the caller writes it where it belongs. */
  markSaved(): void {
    this.#saved = this.text;
  }
}
