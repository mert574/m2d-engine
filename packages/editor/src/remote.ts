/**
 * A replica of a document the host holds.
 *
 * The host is authoritative (packages/editor-host/src/session.ts): it
 * orders every change, from this tab, another tab or an agent, and tells
 * every replica each one as ops. This tab's own edits apply here at once —
 * a gizmo cannot wait for a round trip — and stay *pending* until the
 * host's broadcast of them comes back. A change from anyone else that
 * lands first is applied underneath them: pending edits are taken back,
 * the other change applied, the pending ones applied again — the order
 * the host itself applies them in. Anything this cannot reconcile (a
 * refused edit, a skipped revision, the file replaced on disk) is a
 * resync: the host's copy, fetched again.
 *
 * Undo and redo are never applied here first; the host's broadcast of
 * them carries their ops like any other change.
 */

import { SceneDocument, applyOps, type Edit, type Op } from 'm2d-editor-core';
import { fetchDocument, send, onHost, type ChangeEvent, type DocState } from './host.ts';

/** This tab, as the host's acknowledgements name it. */
const CLIENT = `tab-${Math.random().toString(36).slice(2, 10)}`;

/** What a replica tells the editor after a change. */
export type ReplicaChange =
  /** The data changed by these ops, in order: apply them to the view. */
  | { kind: 'ops'; ops: Op[]; label?: string; origin?: string; own: boolean }
  /** The data was replaced wholesale: rebuild the view. */
  | { kind: 'reset'; reason: string }
  /** Only the state changed: saved, or a conflict with the disk. */
  | { kind: 'state'; reason: string };

interface Pending {
  id: number;
  edit: Edit;
  inverse: Op[];
}

export class RemoteDocument {
  readonly path: string;
  doc: SceneDocument;
  revision: number;
  state: DocState;
  #pending: Pending[] = [];
  #nextId = 1;
  #listeners = new Set<(change: ReplicaChange) => void>();
  #resyncing: Promise<void> | null = null;
  #closed = false;

  private constructor(path: string, data: Record<string, unknown>, revision: number, state: DocState) {
    this.path = path;
    this.doc = new SceneDocument(data, path);
    this.revision = revision;
    this.state = state;
  }

  static async open(path: string): Promise<RemoteDocument> {
    const snapshot = await fetchDocument(path);
    const remote = new RemoteDocument(path, snapshot.data, snapshot.revision, snapshot.state);
    openReplicas.add(remote);
    return remote;
  }

  /** The tab stops showing it. */
  close(): void {
    this.#closed = true;
    this.#listeners.clear();
    openReplicas.delete(this);
  }

  onChange(listener: (change: ReplicaChange) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  /** Whether the host has unsaved edits, counting this tab's in flight. */
  get dirty(): boolean {
    return this.state.dirty || this.#pending.length > 0;
  }

  /**
   * Edit: applied here at once, sent to the host, and pending until the
   * host's broadcast of it returns. Throws — applying nothing — when the
   * ops do not fit the document.
   */
  edit(edit: Edit): Op[] {
    const inverse = applyOps(this.doc.data, edit.ops);
    const id = this.#nextId++;
    this.#pending.push({ id, edit, inverse });
    send('m2d:edit', { path: this.path, client: CLIENT, id, edit });
    this.#emit({ kind: 'ops', ops: edit.ops, label: edit.label, own: true });
    return edit.ops;
  }

  undo(): void { send('m2d:undo', { path: this.path, client: CLIENT }); }
  redo(): void { send('m2d:redo', { path: this.path, client: CLIENT }); }
  save(): void { send('m2d:save', { path: this.path, client: CLIENT }); }

  /** A change from the host, in the host's order. */
  receive(event: ChangeEvent): void {
    if (this.#closed || event.path !== this.path) return;
    if (this.#resyncing) return;   // the snapshot on its way already includes it
    this.state = event.state;

    if (event.kind === 'saved' || event.kind === 'conflict') {
      this.#emit({ kind: 'state', reason: event.kind });
      return;
    }
    if (event.kind === 'reset' || event.revision !== this.revision + 1) {
      void this.resync(event.kind === 'reset' ? 'changed on disk' : 'missed a change');
      return;
    }
    this.revision = event.revision;

    // Our own edit coming back: already applied, only no longer pending.
    const first = this.#pending[0];
    if (event.client === CLIENT && event.id !== undefined && first?.id === event.id) {
      this.#pending.shift();
      this.#emit({ kind: 'state', reason: 'acknowledged' });
      return;
    }

    // Someone else's change, or an undo or redo: under our pending edits.
    const ops: Op[] = [];
    try {
      for (const pending of [...this.#pending].reverse()) {
        applyOps(this.doc.data, pending.inverse);
        ops.push(...pending.inverse);
      }
      applyOps(this.doc.data, event.ops ?? []);
      ops.push(...(event.ops ?? []));
      for (const pending of this.#pending) {
        pending.inverse = applyOps(this.doc.data, pending.edit.ops);
        ops.push(...pending.edit.ops);
      }
    } catch {
      void this.resync('could not apply a change');
      return;
    }
    this.#emit({ kind: 'ops', ops, label: event.label, origin: event.origin, own: event.client === CLIENT });
  }

  /** The host refused one of this tab's edits. */
  refused(id: number | undefined, message: string): void {
    if (id === undefined || this.#pending.some((pending) => pending.id === id)) void this.resync(message);
  }

  /** Start again from the host's copy. Pending edits the host refused are gone. */
  resync(reason: string): Promise<void> {
    this.#resyncing ??= (async () => {
      try {
        const snapshot = await fetchDocument(this.path);
        if (this.#closed) return;
        this.doc = new SceneDocument(snapshot.data, this.path);
        this.revision = snapshot.revision;
        this.state = snapshot.state;
        this.#pending = [];
      } finally {
        this.#resyncing = null;
      }
      this.#emit({ kind: 'reset', reason });
    })();
    return this.#resyncing;
  }

  #emit(change: ReplicaChange): void {
    for (const listener of this.#listeners) listener(change);
  }
}

// One subscription to the host for every replica this tab opens.
const openReplicas = new Set<RemoteDocument>();
onHost<ChangeEvent>('m2d:change', (event) => {
  for (const replica of openReplicas) replica.receive(event);
});
onHost<{ path: string; client?: string; id?: number; message: string }>('m2d:error', (error) => {
  if (error.client !== CLIENT) return;
  for (const replica of openReplicas) if (replica.path === error.path) replica.refused(error.id, error.message);
});
