import { describe, it, expect, vi } from 'vitest';
import { SceneDocument, CommandStack, validateScene, type Command } from '../src/index.ts';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';

/**
 * The document, the command stack and validation: the shape every edit
 * goes through, before any concrete command exists to make one.
 */

const level = () => ({
  version: SCENE_VERSION, type: 'level', name: 'room',
  world: { gravity: { x: 0, y: 1000 } },
  prefabs: { wall: { actor: 'Block', physics: { bodyType: 'static' } } },
  layers: [{ name: 'main', objects: [{ id: 'floor', prefab: 'wall', x: 0, y: 0 }] }]
});

/** A test command: set a top-level field, remembering what was there. */
const setField = (key: string, value: unknown): Command<SceneDocument> => ({
  label: `Set ${key}`,
  apply(doc) {
    const had = key in doc.data;
    const before = doc.data[key];
    doc.data[key] = value;
    return () => {
      if (had) doc.data[key] = before;
      else delete doc.data[key];
    };
  }
});

describe('SceneDocument', () => {
  it('reads what the editor shows in a tab', () => {
    const doc = SceneDocument.parse(JSON.stringify(level()), 'scenes/room.json');
    expect(doc.type).toBe('level');
    expect(doc.name).toBe('room');
    expect(doc.path).toBe('scenes/room.json');
    expect(doc.generator).toBeNull();
    expect(doc.dirty).toBe(false);
  });

  it('reports a generated scene, which an editor shows read-only', () => {
    const doc = new SceneDocument({ ...level(), generator: 'scripts/buildRoomScene.mjs' });
    expect(doc.generator).toBe('scripts/buildRoomScene.mjs');
  });

  it('writes canonical text and tracks whether it has changed', () => {
    const doc = new SceneDocument(level());
    expect(doc.text).toContain('"version": 2');
    expect(doc.dirty).toBe(false);

    doc.run(setField('title', 'The Room'));
    expect(doc.dirty).toBe(true);
    expect(doc.text).toContain('"title": "The Room"');

    doc.markSaved();
    expect(doc.dirty).toBe(false);

    // An edit that lands back on the saved text is not a change.
    doc.run(setField('title', 'Other'));
    doc.commands.undo();
    expect(doc.dirty).toBe(false);
  });

  it('validates through the engine loader', () => {
    const doc = new SceneDocument(level());
    expect(doc.validate().ok).toBe(true);

    const broken = new SceneDocument({
      ...level(),
      layers: [{ name: 'main', objects: [{ prefab: 'wall', x: 0, y: 0 }] }]
    });
    const result = broken.validate();
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe('layers[0].objects[0].id');
    expect(result.issues[0]?.message).toMatch(/missing or non-string id/);
  });

  it('reports a malformed document as an issue, not a crash', () => {
    const result = validateScene({ version: 1, type: 'level' });
    expect(result.ok).toBe(false);
    expect(result.loaded).toBeNull();
    expect(result.issues[0]?.path).toBe('version');
  });
});

describe('CommandStack', () => {
  it('applies, undoes and redoes', () => {
    const doc = new SceneDocument(level());
    doc.run(setField('title', 'One'));
    doc.run(setField('title', 'Two'));
    expect(doc.data.title).toBe('Two');
    expect(doc.commands.history).toEqual(['Set title', 'Set title']);

    expect(doc.commands.undo()).toBe(true);
    expect(doc.data.title).toBe('One');
    expect(doc.commands.undo()).toBe(true);
    expect(doc.data.title).toBeUndefined();     // restored to absent, not undefined-in-place
    expect('title' in doc.data).toBe(false);

    expect(doc.commands.undo()).toBe(false);
    expect(doc.commands.redo()).toBe(true);
    expect(doc.data.title).toBe('One');
  });

  it('discards the redo branch once a new edit lands', () => {
    const doc = new SceneDocument(level());
    doc.run(setField('title', 'One'));
    doc.commands.undo();
    expect(doc.commands.canRedo).toBe(true);
    doc.run(setField('title', 'Other'));
    expect(doc.commands.canRedo).toBe(false);
  });

  it('batches many edits into one undo step, reversed', () => {
    // What a tool — or an agent's one call — looks like in the history.
    const doc = new SceneDocument(level());
    doc.commands.runBatch('Scatter lamps', [setField('a', 1), setField('b', 2)]);
    expect(doc.commands.history).toEqual(['Scatter lamps']);
    doc.commands.undo();
    expect('a' in doc.data).toBe(false);
    expect('b' in doc.data).toBe(false);
  });

  it('tells listeners when anything changed', () => {
    const stack = new CommandStack<{ n: number }>({ n: 0 });
    const heard = vi.fn();
    const off = stack.onChange(heard);
    stack.run({ label: 'inc', apply: (t) => { t.n++; return () => { t.n--; }; } });
    stack.undo();
    expect(heard).toHaveBeenCalledTimes(2);
    off();
    stack.redo();
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
