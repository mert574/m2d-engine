import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyOps, type Op } from 'm2d-editor-core';

/**
 * The replica against a scripted host: the host's order wins, this tab's
 * own edits show at once and rebase under anything that lands first, and
 * whatever cannot be reconciled is a resync from the host's copy.
 */

const sent: Array<{ event: string; data: Record<string, unknown> }> = [];
const listeners = new Map<string, (data: unknown) => void>();
let hostData: Record<string, unknown>;
let hostRevision = 0;

vi.mock('../src/host.ts', () => ({
  send: (event: string, data: Record<string, unknown>) => { sent.push({ event, data: JSON.parse(JSON.stringify(data)) }); },
  onHost: (event: string, listener: (data: unknown) => void) => { listeners.set(event, listener); },
  fetchDocument: async (path: string) => ({
    path, data: JSON.parse(JSON.stringify(hostData)), revision: hostRevision,
    state: { dirty: hostRevision > 0, generator: null, history: [], undo: null, redo: null }
  })
}));

const { RemoteDocument } = await import('../src/remote.ts');

const STATE = { dirty: true, generator: null, history: [], undo: null, redo: null };
const set = (key: string, value: unknown): Op => ({ op: 'set', path: [key], value });

/** The host applying what it is sent or told, in its order, and broadcasting it. */
function hostApplies(ops: Op[], extra: Record<string, unknown> = {}) {
  applyOps(hostData, ops);
  hostRevision++;
  listeners.get('m2d:change')!({ path: 'a.json', revision: hostRevision, kind: 'edit', ops, state: STATE, ...extra });
}

beforeEach(() => {
  sent.length = 0;
  hostData = { type: 'level', name: 'a', a: 0, b: 0 };
  hostRevision = 0;
});

describe('RemoteDocument', () => {
  it('applies its own edit at once and sends it; the echo only clears it', async () => {
    const remote = await RemoteDocument.open('a.json');
    const heard: string[] = [];
    remote.onChange((change) => heard.push(change.kind));
    remote.edit({ label: 'A', ops: [set('a', 1)] });
    expect(remote.doc.data.a).toBe(1);
    expect(remote.dirty).toBe(true);
    const request = sent[0]!.data as { client: string; id: number; edit: { ops: Op[] } };
    expect(sent[0]!.event).toBe('m2d:edit');

    hostApplies(request.edit.ops, { client: request.client, id: request.id });
    expect(remote.doc.data).toEqual(hostData);
    expect(heard).toEqual(['ops', 'state']);
    remote.close();
  });

  it('puts a change that landed first underneath its pending edits', async () => {
    const remote = await RemoteDocument.open('a.json');
    remote.edit({ label: 'mine', ops: [set('a', 1)] });
    const mine = sent[0]!.data as { client: string; id: number; edit: { ops: Op[] } };

    // An agent's edit to the same field reaches the host first...
    hostApplies([set('a', 7), set('b', 7)], { client: 'agent' });
    // ...so on the host ours applies after it, and wins the field.
    expect(remote.doc.data).toEqual({ ...hostData, a: 1 });
    hostApplies(mine.edit.ops, { client: mine.client, id: mine.id });
    expect(remote.doc.data).toEqual(hostData);
    expect(hostData).toMatchObject({ a: 1, b: 7 });
    remote.close();
  });

  it('applies an undo from the host as the ops it carries', async () => {
    const remote = await RemoteDocument.open('a.json');
    hostApplies([set('a', 3)], { client: 'agent' });
    hostApplies([set('a', 0)], { kind: 'undo', client: 'agent' });
    expect(remote.doc.data.a).toBe(0);
    remote.close();
  });

  it('resyncs when it missed a revision, or the host refused its edit', async () => {
    const remote = await RemoteDocument.open('a.json');
    const resets: string[] = [];
    remote.onChange((change) => { if (change.kind === 'reset') resets.push(change.reason); });

    applyOps(hostData, [set('a', 5)]);
    hostRevision += 2;   // two changes, one of them never heard
    listeners.get('m2d:change')!({ path: 'a.json', revision: hostRevision, kind: 'edit', ops: [set('a', 5)], state: STATE });
    await vi.waitFor(() => expect(resets).toEqual(['missed a change']));
    expect(remote.doc.data.a).toBe(5);
    expect(remote.revision).toBe(hostRevision);

    remote.edit({ label: 'bad', ops: [set('b', 9)] });
    const bad = sent.at(-1)!.data as { client: string; id: number };
    listeners.get('m2d:error')!({ path: 'a.json', client: bad.client, id: bad.id, message: 'refused' });
    await vi.waitFor(() => expect(resets).toHaveLength(2));
    expect(remote.doc.data.b).toBe(0);
    expect(remote.dirty).toBe(true);   // the host still has its own unsaved change
    remote.close();
  });

  it('ignores other documents', async () => {
    const remote = await RemoteDocument.open('a.json');
    listeners.get('m2d:change')!({ path: 'b.json', revision: 1, kind: 'edit', ops: [set('a', 9)], state: STATE });
    expect(remote.doc.data.a).toBe(0);
    remote.close();
  });
});
