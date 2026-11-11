/**
 * The editing session: the one authoritative copy of every open document.
 *
 * Documents live here, in the host, and not in a browser tab: an agent
 * over MCP and a person in the editor then edit the same document through
 * the same history, an agent's edit lands in the person's undo list with
 * its label, and saving is the host's job — it owns the folder. A tab holds
 * a replica (packages/editor/src/remote.ts), applies its own edits at once
 * and is told, in order, everything that happened: the same shape the
 * networking plan chose for play, server-authoritative, applied to editing.
 *
 * Every change goes out as a `ChangeEvent` carrying the ops it applied —
 * an undo too, since an edit's inverse is ops (`edits.ts`) — so a replica
 * never needs the host's undo stack, only the sequence of changes.
 */

import { createHash } from 'node:crypto';
import { SceneDocument, EditCommand, type Edit, type Op } from 'm2d-editor-core';
import type { Project } from './project.ts';

/**
 * Where unsaved edits survive the host: `.m2d/journal/<scene path>.json`
 * under the project, one file per open document, rewritten after every
 * change and removed on save. A journal holds the applied edits (label,
 * ops, origin) over a hash of the file they were applied to; opening the
 * scene again with the same file on disk replays them, history and all.
 * A file that changed underneath makes the journal moot, and it is dropped.
 */
export const JOURNAL_DIR = '.m2d/journal';

interface Journal {
  /** The sha1 of the file text the edits were applied to. */
  base: string;
  edits: Array<{ label: string; ops: Op[]; origin: string }>;
}

/** What every client shows about a document besides its data. */
export interface DocState {
  dirty: boolean;
  generator: string | null;
  /** The undo list, oldest first, each label with who made it. */
  history: string[];
  /** What undo and redo would do next, or null. */
  undo: string | null;
  redo: string | null;
}

export interface ChangeEvent {
  path: string;
  /** Bumped by every change to the data; a replica that skips one resyncs. */
  revision: number;
  /**
   * `edit`, `undo`, `redo`: `ops` changed the data. `saved`: written to
   * disk, data unchanged. `reset`: the file changed on disk and replaced
   * the document — fetch it again. `conflict`: the file changed on disk
   * but the document has unsaved edits, which are kept.
   */
  kind: 'edit' | 'undo' | 'redo' | 'saved' | 'reset' | 'conflict';
  ops?: Op[];
  label?: string;
  origin?: string;
  /** Who sent it and their number for it, so the sender knows its own. */
  client?: string;
  id?: number;
  state: DocState;
}

/** Who is asking, for the history and for the sender's acknowledgement. */
export interface Origin {
  /** 'editor', 'agent', ... */
  origin: string;
  client?: string;
  id?: number;
}

interface Open {
  doc: SceneDocument;
  revision: number;
  /** The file's text as this session last read or wrote it; tells an echo from a change. */
  disk: string;
  /** The applied edits, oldest first, as the journal records them (undone ones drop off). */
  applied: Array<{ label: string; ops: Op[]; origin: string }>;
  /** How many of `applied` an undo took back and a redo may bring back. */
  undone: Array<{ label: string; ops: Op[]; origin: string }>;
}

export class Session {
  readonly project: Project;
  #open = new Map<string, Open>();
  #loading = new Map<string, Promise<Open>>();
  /** Journal writes per path, in order: two in flight at once would interleave on disk. */
  #journalling = new Map<string, Promise<void>>();
  #listeners = new Set<(event: ChangeEvent) => void>();

  constructor(project: Project) {
    this.project = project;
  }

  /** Hear every change to every open document. Returns an unsubscribe. */
  onChange(listener: (event: ChangeEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  /** The open document at a path, opening it from disk the first time. */
  async document(path: string): Promise<SceneDocument> {
    return (await this.#get(path)).doc;
  }

  /** What a replica starts from: the data, the revision, the state. */
  async snapshot(path: string): Promise<{ path: string; data: Record<string, unknown>; revision: number; state: DocState }> {
    const open = await this.#get(path);
    return { path, data: open.doc.data, revision: open.revision, state: stateOf(open.doc) };
  }

  /**
   * Apply an edit. Refused whole, with the engine-free reason, when an op
   * does not fit the document — and refused on a generated scene, except
   * the edit that detaches it by deleting `generator`.
   */
  async edit(path: string, edit: Edit, who: Origin): Promise<ChangeEvent> {
    const open = await this.#get(path);
    if (!Array.isArray(edit?.ops) || typeof edit.label !== 'string') {
      throw new Error('an edit is { label, ops: [...] }');
    }
    const detaching = edit.ops.length > 0 && edit.ops.every((op) =>
      op.op === 'set' && op.path.length === 1 && op.path[0] === 'generator' && !('value' in op && op.value !== undefined));
    if (open.doc.generator && !detaching) {
      throw new Error(`'${path}' is generated by ${open.doc.generator} and read-only; detach it first (delete its 'generator')`);
    }
    const label = who.origin === 'editor' ? edit.label : `${edit.label} (${who.origin})`;
    const command = new EditCommand({ label, ops: edit.ops }, who.origin);
    open.doc.run(command);
    open.applied.push({ label, ops: edit.ops, origin: who.origin });
    open.undone = [];
    void this.#journal(path, open);
    return this.#emit(path, open, { kind: 'edit', ops: command.lastOps, label, ...who });
  }

  async undo(path: string, who: Origin): Promise<ChangeEvent | null> {
    return this.#step(path, who, 'undo');
  }

  async redo(path: string, who: Origin): Promise<ChangeEvent | null> {
    return this.#step(path, who, 'redo');
  }

  /** Write the document to its file, canonically. */
  async save(path: string, who: Origin): Promise<ChangeEvent> {
    const open = await this.#get(path);
    open.disk = await this.project.saveScene(open.doc);
    // Saved: the journal has nothing left to carry.
    open.applied = [];
    open.undone = [];
    await this.#dropJournal(path);
    return this.#emit(path, open, { kind: 'saved', ...who }, false);
  }

  /**
   * A file changed on disk. The session's own save comes back as an echo
   * and is ignored; anything else replaces a clean document (and tells
   * every replica to fetch it again) or is reported against a dirty one,
   * whose edits are kept. Unopened files are none of the session's
   * business.
   */
  async fileChanged(path: string): Promise<ChangeEvent | null> {
    const open = this.#open.get(path);
    if (!open) return null;
    let text: string;
    try {
      text = await this.project.readText(path);
    } catch {
      return null;
    }
    if (text === open.disk) return null;
    open.disk = text;
    if (open.doc.dirty) {
      // The edits now ride over a different file; the journal says which.
      void this.#journal(path, open);
      return this.#emit(path, open, { kind: 'conflict', origin: 'disk' }, false);
    }
    try {
      open.doc = SceneDocument.parse(text, path);
    } catch {
      // Half-written or broken: keep the document, wait for the next write.
      return null;
    }
    return this.#emit(path, open, { kind: 'reset', origin: 'disk' });
  }

  /** Forget one document (its file was deleted or moved); its replicas are told to reset. */
  forget(path: string): void {
    this.#open.delete(path);
    this.#loading.delete(path);
  }

  /** Whether the document at `path` is open with unsaved edits. */
  isDirty(path: string): boolean {
    return this.#open.get(path)?.doc.dirty ?? false;
  }

  /** Forget every document, unsaved edits included. */
  close(): void {
    this.#open.clear();
    this.#listeners.clear();
  }

  async #step(path: string, who: Origin, kind: 'undo' | 'redo'): Promise<ChangeEvent | null> {
    const open = await this.#get(path);
    const stack = open.doc.commands;
    const command = (kind === 'undo' ? stack.top : stack.next) as EditCommand | null;
    if (!command) return null;
    if (kind === 'undo') {
      stack.undo();
      const last = open.applied.pop();
      if (last) open.undone.push(last);
    } else {
      stack.redo();
      const back = open.undone.pop();
      if (back) open.applied.push(back);
    }
    void this.#journal(path, open);
    return this.#emit(path, open, { kind, ops: command.lastOps, label: command.label, ...who });
  }

  /**
   * Write the document's unsaved edits beside the project, or remove the
   * file when there are none. Serialized per path and written whole (a
   * temp file renamed into place), so a reader never sees half a journal
   * and a later write never lands under an earlier, longer one.
   */
  #journal(path: string, open: Open): Promise<void> {
    const snapshot: Journal | null = open.applied.length || open.undone.length
      ? { base: hashOf(open.disk), edits: [...open.applied] }
      : null;
    const previous = this.#journalling.get(path) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        if (!snapshot) {
          await this.project.removeFile(journalPath(path));
          return;
        }
        const file = journalPath(path);
        await this.project.writeText(`${file}.tmp`, JSON.stringify(snapshot));
        await this.project.moveFile(`${file}.tmp`, file);
      } catch (error) {
        console.warn(`m2d-editor: could not journal ${path}: ${(error as Error).message}`);
      }
    });
    this.#journalling.set(path, next);
    return next;
  }

  async #dropJournal(path: string): Promise<void> {
    const previous = this.#journalling.get(path) ?? Promise.resolve();
    const next = previous.then(() => this.project.removeFile(journalPath(path)).catch(() => undefined));
    this.#journalling.set(path, next);
    await next;
  }

  /**
   * Replay a journal left by an earlier host over a freshly read file, when
   * the file is still the one the edits were made on. The edits go through
   * the document's stack as commands, so undo covers them as it did.
   */
  async #restore(path: string, open: Open): Promise<void> {
    let journal: Journal;
    try {
      journal = JSON.parse(await this.project.readText(journalPath(path))) as Journal;
    } catch {
      return;
    }
    if (journal.base !== hashOf(open.disk) || !Array.isArray(journal.edits)) {
      await this.#dropJournal(path);
      return;
    }
    for (const entry of journal.edits) {
      try {
        open.doc.run(new EditCommand({ label: entry.label, ops: entry.ops }, entry.origin));
        open.applied.push(entry);
      } catch (error) {
        console.warn(`m2d-editor: a journaled edit of ${path} no longer applies (${(error as Error).message}); the rest are kept`);
      }
    }
  }

  #emit(path: string, open: Open, change: Omit<ChangeEvent, 'path' | 'revision' | 'state'>, changesData = true): ChangeEvent {
    if (changesData) open.revision++;
    const event: ChangeEvent = { path, revision: open.revision, state: stateOf(open.doc), ...change };
    for (const listener of this.#listeners) listener(event);
    return event;
  }

  async #get(path: string): Promise<Open> {
    const open = this.#open.get(path);
    if (open) return open;
    // Two clients opening the same scene at once share one read.
    let loading = this.#loading.get(path);
    if (!loading) {
      loading = (async () => {
        const disk = await this.project.readText(path);
        const doc = SceneDocument.parse(disk, path);
        const fresh: Open = { doc, revision: 0, disk, applied: [], undone: [] };
        await this.#restore(path, fresh);
        this.#open.set(path, fresh);
        return fresh;
      })().finally(() => this.#loading.delete(path));
      this.#loading.set(path, loading);
    }
    return loading;
  }
}

function stateOf(doc: SceneDocument): DocState {
  return {
    dirty: doc.dirty,
    generator: doc.generator,
    history: doc.commands.history,
    undo: doc.commands.top?.label ?? null,
    redo: doc.commands.next?.label ?? null
  };
}

/** The journal file for a scene path: `.m2d/journal/scenes__level.json`. */
function journalPath(path: string): string {
  return `${JOURNAL_DIR}/${path.replace(/[\\/]/g, '__')}`;
}

function hashOf(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}
