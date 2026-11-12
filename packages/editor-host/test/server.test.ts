import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { settle } from '../src/playtest.ts';
import type { RunReport } from '../src/server.ts';
import { structure, type Rest } from 'm2d-editor-core';
import { Companion, Project, renderCredits } from '../src/index.ts';
import { createProject } from '../src/templates.ts';

/**
 * The companion and its MCP server, driven by a real client over a real
 * transport — the proof that an agent can reach a project without a
 * browser, which is the milestone this package exists for.
 */

let root: string;
let companion: Companion;
let client: Client;

const level = (fields: Record<string, unknown> = {}) => JSON.stringify({
  version: 4, type: 'level', name: 'room',
  world: { gravity: { x: 0, y: 1000 } },
  prefabs: { wall: { actor: 'Block', physics: { bodyType: 'static' } } },
  layers: [{ name: 'main', objects: [{ id: 'floor', prefab: 'wall', x: 0, y: 0 }] }],
  ...fields
}, null, 2);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'm2d-editor-host-'));
  await mkdir(join(root, 'scenes'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'junk'), { recursive: true });
  await writeFile(join(root, 'scenes', 'room.json'), level());
  await writeFile(join(root, 'scenes', 'menu.json'), JSON.stringify({
    version: 4, type: 'ui', name: 'menu',
    elements: [{ type: 'rect', id: 'background', fill: true, color: '#111' }]
  }, null, 2));
  await writeFile(join(root, 'scenes', 'lot.json'), level({ name: 'lot', generator: 'scripts/buildLot.mjs' }));
  await writeFile(join(root, 'scenes', 'broken.json'), level({ layers: [{ name: 'main', objects: [{ prefab: 'wall', x: 0, y: 0 }] }] }));
  // Not scenes: a manifest, a config, and something under node_modules.
  await writeFile(join(root, 'assets.json'), JSON.stringify({ version: 1, assets: {} }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'demo' }));
  await writeFile(join(root, 'node_modules', 'junk', 'scene.json'), level({ name: 'decoy' }));

  companion = new Companion({ root });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0' });
  await Promise.all([companion.mcp.connect(serverSide), client.connect(clientSide)]);
});

afterAll(async () => {
  await client?.close();
  companion?.close();
  await rm(root, { recursive: true, force: true });
});

/** The text of a tool result, which is how these tools answer. */
const textOf = (result: unknown) =>
  (((result as { content?: unknown }).content as Array<{ type: string; text?: string }> | undefined) ?? [])
    .filter((part) => part.type === 'text').map((part) => part.text).join('\n');

describe('the MCP server', () => {
  it('advertises its tools to a client', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'build_project', 'create_scene', 'delete_scene', 'edit_scene', 'import_asset', 'inspect_node', 'list_assets',
      'list_components', 'list_scenes', 'outline_scene', 'read_scene', 'redo', 'rename_entry', 'rename_scene', 'run_scene', 'save_scene',
      'screenshot_scene', 'search_library', 'settle_scene', 'undo', 'validate_scene'
    ]);
    // Every tool says what it is for: the description is the agent's
    // only documentation.
    for (const tool of tools) expect(tool.description?.length ?? 0).toBeGreaterThan(40);
  });

  it('lists the project\'s scenes and nothing else', async () => {
    const scenes = JSON.parse(textOf(await client.callTool({ name: 'list_scenes', arguments: {} })));
    expect(scenes.map((s: { path: string }) => s.path))
      .toEqual(['scenes/broken.json', 'scenes/lot.json', 'scenes/menu.json', 'scenes/room.json']);
    // The manifest, the package.json and node_modules are not scenes.
    expect(JSON.stringify(scenes)).not.toMatch(/assets\.json|package\.json|decoy/);
    expect(scenes.find((s: { name: string }) => s.name === 'menu').type).toBe('ui');
    expect(scenes.find((s: { name: string }) => s.name === 'lot').generator).toBe('scripts/buildLot.mjs');
  });

  it('reads a scene as canonical text', async () => {
    const text = textOf(await client.callTool({ name: 'read_scene', arguments: { path: 'scenes/room.json' } }));
    expect(JSON.parse(text).name).toBe('room');
    expect(text).toContain('"version": 4');
  });

  it('validates, and reports a problem with its field path', async () => {
    const good = await client.callTool({ name: 'validate_scene', arguments: { path: 'scenes/room.json' } });
    expect(textOf(good)).toBe('valid');
    expect(good.isError).toBeFalsy();

    const bad = await client.callTool({ name: 'validate_scene', arguments: { path: 'scenes/broken.json' } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toMatch(/layers\[0\]\.objects\[0\]\.id: missing or non-string id/);
  });

  it('refuses a path outside the project', async () => {
    const result = await client.callTool({ name: 'read_scene', arguments: { path: '../../etc/passwd' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/outside the project/);
  });
});

describe('the project declaration', () => {
  it('reads m2d.project.json: one game, with defaults for what it omits', async () => {
    await writeFile(join(root, 'm2d.project.json'), JSON.stringify({ name: 'Rooms', definition: 'src/game.js' }));
    const project = new Project(root);
    expect(await project.declared()).toBe(true);
    expect(await project.config()).toEqual({ name: 'Rooms', definition: 'src/game.js', hooks: null, scenes: 'scenes', basePath: '.' });
    await rm(join(root, 'm2d.project.json'));
  });

  it('falls back to the folder name and no code when there is no declaration', async () => {
    const project = new Project(root);
    expect(await project.declared()).toBe(false);
    const config = await project.config();
    expect(config.definition).toBeNull();
    expect(config.name).toContain('m2d-editor-host-');
  });
});

describe('agents edit through the session', () => {
  it('edits, undoes, redoes and saves, in one history the editor shares', async () => {
    const heard: string[] = [];
    const off = companion.session.onChange((event) => heard.push(`${event.kind}:${event.revision}`));
    const path = 'scenes/menu.json';
    const ops = [{ op: 'set', path: ['elements', 0, 'color'], value: '#224466' }];

    const edited = await client.callTool({ name: 'edit_scene', arguments: { path, label: 'Recolour', ops } });
    expect(edited.isError).toBeFalsy();
    expect(JSON.parse(textOf(edited))).toMatchObject({ revision: 1, dirty: true, undo: 'Recolour (agent)' });
    expect(textOf(await client.callTool({ name: 'read_scene', arguments: { path } }))).toContain('#224466');
    // Not on disk until saved.
    expect(await readFile(join(root, path), 'utf8')).not.toContain('#224466');

    await client.callTool({ name: 'undo', arguments: { path } });
    expect(textOf(await client.callTool({ name: 'read_scene', arguments: { path } }))).toContain('#111');
    await client.callTool({ name: 'redo', arguments: { path } });
    await client.callTool({ name: 'save_scene', arguments: { path } });
    expect(await readFile(join(root, path), 'utf8')).toContain('#224466');
    expect(heard).toEqual(['edit:1', 'undo:2', 'redo:3', 'saved:3']);

    // The save comes back from the watcher as an echo, and changes nothing.
    expect(await companion.session.fileChanged(path)).toBeNull();
    off();
  });

  it('creates, renames and deletes scene files', async () => {
    const made = JSON.parse(textOf(await client.callTool({ name: 'create_scene', arguments: { name: 'Cellar Two', type: 'level', dimensions: 3 } })));
    expect(made.path).toBe('scenes/Cellar-Two.json');
    const written = JSON.parse(await readFile(join(root, made.path), 'utf8'));
    expect(written).toMatchObject({ type: 'level', name: 'Cellar Two', world: { dimensions: 3 } });
    // Listed, and refused a second time.
    const listed = JSON.parse(textOf(await client.callTool({ name: 'list_scenes', arguments: {} }))) as Array<{ path: string }>;
    expect(listed.map((scene) => scene.path)).toContain(made.path);
    expect((await client.callTool({ name: 'create_scene', arguments: { name: 'Cellar Two' } })).isError).toBe(true);

    const copy = JSON.parse(textOf(await client.callTool({ name: 'create_scene', arguments: { name: 'room-copy', copyOf: 'scenes/room.json' } })));
    expect(JSON.parse(await readFile(join(root, copy.path), 'utf8'))).toMatchObject({ name: 'room-copy', prefabs: { wall: expect.anything() } });

    const moved = JSON.parse(textOf(await client.callTool({ name: 'rename_scene', arguments: { path: copy.path, name: 'room-two' } })));
    expect(moved.path).toBe('scenes/room-two.json');
    expect(await readFile(join(root, copy.path), 'utf8').catch(() => 'gone')).toBe('gone');

    // Dirty documents do not move.
    await client.callTool({ name: 'edit_scene', arguments: { path: moved.path, label: 'Tweak', ops: [{ op: 'set', path: ['title'], value: 'x' }] } });
    expect((await client.callTool({ name: 'rename_scene', arguments: { path: moved.path, name: 'nope' } })).isError).toBe(true);

    for (const path of [made.path, moved.path]) {
      expect((await client.callTool({ name: 'delete_scene', arguments: { path } })).isError).toBeFalsy();
    }
    expect((await client.callTool({ name: 'delete_scene', arguments: { path: made.path } })).isError).toBe(true);
    // A name is a file stem, never a path: it cannot leave the scenes folder.
    const tamed = JSON.parse(textOf(await client.callTool({ name: 'create_scene', arguments: { name: '../escape' } })));
    expect(tamed.path).toBe('scenes/escape.json');
    await client.callTool({ name: 'delete_scene', arguments: { path: tamed.path } });
  });

  it('builds a path and renames it with its followers, in steps an agent can take', async () => {
    const path = 'scenes/room.json';
    const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: { path, ...args } });
    await call('edit_scene', { label: 'Add a route', ops: [
      { op: 'set', path: ['paths'], value: { beat: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } } },
      { op: 'set', path: ['layers', 0, 'objects', 0, 'constraints'], value: { patrol: { type: 'PathFollow', params: { path: 'beat' } } } }
    ] });
    await call('edit_scene', { label: 'Bend it', ops: [{ op: 'insert', path: ['paths', 'beat', 'points'], index: 1, value: { x: 50, y: 40 } }] });
    expect(textOf(await call('outline_scene', {}))).toContain('beat');

    const renamed = await call('rename_entry', { kind: 'paths', from: 'beat', to: 'round' });
    expect(JSON.parse(textOf(renamed))).toMatchObject({ undo: 'Rename beat to round (agent)' });
    const doc = JSON.parse(textOf(await call('read_scene', {}))) as { paths: Record<string, { points: unknown[] }>; layers: Array<{ objects: Array<{ constraints: { patrol: { params: { path: string } } } }> }> };
    expect(Object.keys(doc.paths)).toEqual(['round']);
    expect(doc.paths.round!.points).toHaveLength(3);
    expect(doc.layers[0]!.objects[0]!.constraints.patrol.params.path).toBe('round');
    expect((await call('rename_entry', { kind: 'paths', from: 'nope', to: 'x' })).isError).toBe(true);

    for (let i = 0; i < 3; i++) await call('undo', {});
    expect(companion.session.isDirty(path)).toBe(false);
  });

  it('refuses a malformed edit whole, saying where', async () => {
    const result = await client.callTool({
      name: 'edit_scene',
      arguments: { path: 'scenes/room.json', label: 'Bad', ops: [
        { op: 'set', path: ['layers', 0, 'objects', 0, 'x'], value: 5 },
        { op: 'set', path: ['layers', 9, 'objects', 0, 'x'], value: 5 }
      ] }
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/layers\[9\]/);
    expect((await companion.session.document('scenes/room.json')).dirty).toBe(false);
  });

  it('refuses edits to a generated scene, except the one that detaches it', async () => {
    const path = 'scenes/lot.json';
    const refused = await client.callTool({ name: 'edit_scene', arguments: {
      path, label: 'Move', ops: [{ op: 'set', path: ['layers', 0, 'objects', 0, 'x'], value: 9 }]
    } });
    expect(textOf(refused)).toMatch(/generated by scripts\/buildLot\.mjs/);
    const detached = await client.callTool({ name: 'edit_scene', arguments: {
      path, label: 'Detach', ops: [{ op: 'set', path: ['generator'] }]
    } });
    expect(detached.isError).toBeFalsy();
    expect((await companion.session.document(path)).generator).toBeNull();
    await client.callTool({ name: 'undo', arguments: { path } });
  });

  it('outlines and inspects with the paths edits address', async () => {
    const outline = JSON.parse(textOf(await client.callTool({ name: 'outline_scene', arguments: { path: 'scenes/room.json' } })));
    const layer = outline.children.find((node: { kind: string }) => node.kind === 'layer');
    expect(layer.children[0].path).toEqual(['layers', 0, 'objects', 0]);
    const rows = JSON.parse(textOf(await client.callTool({
      name: 'inspect_node', arguments: { path: 'scenes/room.json', node: ['layers', 0, 'objects', 0] }
    })));
    expect(rows.find((row: { key: string }) => row.key === 'x')).toMatchObject({ kind: 'number', unit: 'px', value: 0 });
  });

  it('reloads a clean document changed on disk, and keeps a dirty one', async () => {
    const path = 'scenes/room.json';
    await companion.session.document(path);
    await writeFile(join(root, path), level({ title: 'From disk' }));
    expect((await companion.session.fileChanged(path))?.kind).toBe('reset');
    expect((await companion.session.document(path)).data.title).toBe('From disk');

    await companion.session.edit(path, { label: 'Mine', ops: [{ op: 'set', path: ['title'], value: 'Mine' }] }, { origin: 'editor' });
    await writeFile(join(root, path), level({ title: 'Theirs' }));
    expect((await companion.session.fileChanged(path))?.kind).toBe('conflict');
    expect((await companion.session.document(path)).data.title).toBe('Mine');
    await writeFile(join(root, path), level());
  });
});

describe('the project', () => {
  it('saves a document in canonical form', async () => {
    const project = new Project(root);
    const doc = await project.openScene('scenes/room.json');
    doc.data.title = 'The Room';
    await project.saveScene(doc);
    expect(await readFile(join(root, 'scenes', 'room.json'), 'utf8')).toBe(doc.text);
    expect(doc.dirty).toBe(false);
  });

  it('refuses to save a generated scene over its script', async () => {
    const project = new Project(root);
    const doc = await project.openScene('scenes/lot.json');
    await expect(project.saveScene(doc)).rejects.toThrow(/generated by scripts\/buildLot\.mjs.*read-only/s);
  });
});

describe('what only the serving host can do', () => {
  it('says so instead of pretending, when run over stdio', async () => {
    const run = await client.callTool({ name: 'run_scene', arguments: { path: 'scenes/room.json' } });
    expect(run.isError).toBe(true);
    expect(textOf(run)).toMatch(/running editor/);
    const build = await client.callTool({ name: 'build_project', arguments: {} });
    expect(textOf(build)).toMatch(/running editor/);
    const settled = await client.callTool({ name: 'settle_scene', arguments: { path: 'scenes/room.json' } });
    expect(textOf(settled)).toMatch(/running editor/);
    const shot = await client.callTool({ name: 'screenshot_scene', arguments: { path: 'scenes/room.json' } });
    expect(shot.isError).toBe(true);
    expect(textOf(shot)).toMatch(/running editor/);
  });
});

describe('assets', () => {
  it('lists the project\'s files by kind, with the url a scene names them by', async () => {
    await mkdir(join(root, 'models'), { recursive: true });
    await writeFile(join(root, 'models', 'crate.glb'), 'glb');
    await writeFile(join(root, 'sky.hdr'), 'hdr');
    await mkdir(join(root, 'library', 'sources', 'x'), { recursive: true });
    await writeFile(join(root, 'library', 'sources', 'x', 'raw.gltf'), 'never listed');
    const files = await companion.assets.list();
    expect(files.map((file) => [file.path, file.kind, file.url])).toEqual(expect.arrayContaining([
      ['models/crate.glb', 'model', 'models/crate.glb'],
      ['sky.hdr', 'environment', 'sky.hdr']
    ]));
    expect(files.some((file) => file.path.includes('sources'))).toBe(false);
  });

  it('renders credits from the library: pack, author, licence and link', () => {
    const credits = renderCredits([{
      source: 'polyhaven', type: 'models', id: 'barrel_01', resolution: '2k', name: 'Barrel 01',
      authors: ['Someone'], license: 'CC0', page: 'https://polyhaven.com/a/barrel_01', files: ['library/models/barrel_01.glb']
    }]);
    expect(credits).toContain('| Barrel 01 | Someone | CC0 | https://polyhaven.com/a/barrel_01 |');
    expect(credits).toContain('## Poly Haven');
  });
});

describe('templates', () => {
  it('make a complete project in an empty folder, and refuse one in use', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'm2d-template-'));
    const made = await createProject(join(folder, 'sunny-hop'), '3d', 'Sunny Hop');
    expect(made.name).toBe('Sunny Hop');
    const config = JSON.parse(await readFile(join(made.root, 'm2d.project.json'), 'utf8'));
    expect(config).toMatchObject({ name: 'Sunny Hop', definition: 'game.js', hooks: 'hooks.js' });
    expect(JSON.parse(await readFile(join(made.root, 'package.json'), 'utf8')).name).toBe('sunny-hop');
    expect(await readFile(join(made.root, 'index.html'), 'utf8')).toContain('<title>Sunny Hop</title>');
    const project = new Project(made.root);
    const scenes = await project.scenes();
    expect(scenes.map((scene) => scene.path).sort()).toEqual(['scenes/level.json', 'scenes/room.json']);
    const doc = await project.openScene('scenes/level.json');
    expect(doc.validate().ok).toBe(true);
    await expect(createProject(made.root, '2d')).rejects.toThrow(/not empty/);
    await expect(createProject(join(folder, 'other'), 'nope')).rejects.toThrow(/no template/);
    await rm(folder, { recursive: true, force: true });
  });
});

describe('the journal of unsaved edits', () => {
  it('survives the host: a new session over the same files replays the edits, history and all, until a save', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'm2d-editor-journal-'));
    try {
      await mkdir(join(dir, 'scenes'), { recursive: true });
      await writeFile(join(dir, 'scenes', 'room.json'), level());
      const first = new Companion({ root: dir });
      await first.session.edit('scenes/room.json', { label: 'Move floor', ops: [{ op: 'set', path: ['layers', 0, 'objects', 0, 'x'], value: 40 }] }, { origin: 'editor' });
      await first.session.edit('scenes/room.json', { label: 'Lift floor', ops: [{ op: 'set', path: ['layers', 0, 'objects', 0, 'y'], value: 9 }] }, { origin: 'agent' });
      await first.session.undo('scenes/room.json', { origin: 'editor' });
      // Give the journal write a tick; it is fire-and-forget behind the event.
      await new Promise((done) => setTimeout(done, 50));
      first.close();

      // The host died. The next one finds the journal and starts where the last left off.
      const second = new Companion({ root: dir });
      const snapshot = await second.session.snapshot('scenes/room.json');
      expect(snapshot.state.dirty).toBe(true);
      expect(snapshot.state.history).toEqual(['Move floor']);
      expect((snapshot.data.layers as Array<{ objects: Array<{ x: number; y: number }> }>)[0]!.objects[0]).toMatchObject({ x: 40, y: 0 });
      // The replayed edit undoes like any other.
      await second.session.undo('scenes/room.json', { origin: 'editor' });
      expect(second.session.isDirty('scenes/room.json')).toBe(false);
      await second.session.redo('scenes/room.json', { origin: 'editor' });
      await second.session.save('scenes/room.json', { origin: 'editor' });
      await new Promise((done) => setTimeout(done, 50));
      second.close();

      // Saved: nothing journaled, and a third host opens a clean document.
      const third = new Companion({ root: dir });
      const clean = await third.session.snapshot('scenes/room.json');
      expect(clean.state.dirty).toBe(false);
      expect(clean.state.history).toEqual([]);
      expect((clean.data.layers as Array<{ objects: Array<{ x: number }> }>)[0]!.objects[0]!.x).toBe(40);
      third.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('is dropped when the file changed underneath it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'm2d-editor-journal-'));
    try {
      await mkdir(join(dir, 'scenes'), { recursive: true });
      await writeFile(join(dir, 'scenes', 'room.json'), level());
      const first = new Companion({ root: dir });
      await first.session.edit('scenes/room.json', { label: 'Move floor', ops: [{ op: 'set', path: ['layers', 0, 'objects', 0, 'x'], value: 40 }] }, { origin: 'editor' });
      await new Promise((done) => setTimeout(done, 50));
      first.close();
      await writeFile(join(dir, 'scenes', 'room.json'), level({ title: 'edited elsewhere' }));
      const second = new Companion({ root: dir });
      const snapshot = await second.session.snapshot('scenes/room.json');
      expect(snapshot.state.dirty).toBe(false);
      expect(snapshot.state.history).toEqual([]);
      second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('settling', () => {
  const report = (objects: Rest[], errors: string[] = []): RunReport => ({ ticks: 120, seconds: 0, objects, removed: [], spawned: 0, errors });
  const crate = (fields: Partial<Rest> = {}): Rest => ({ id: 'floor', bodyType: 'dynamic', x: 5, y: 42, moved: 42, ...fields });

  it('writes where the run left dynamic bodies, as one labelled edit, and nothing when nothing moved', async () => {
    const path = 'scenes/room.json';
    const before = (await companion.session.snapshot(path)).state.undo;
    let asked = 0;
    const run = async (_data: Record<string, unknown>, ticks: number) => { asked = ticks; return report([crate()]); };
    const settled = await settle(companion.session, run, path, { seconds: 1 }, { origin: 'agent' });
    expect(asked).toBe(60);
    expect(settled?.moved).toEqual(['floor']);
    const doc = await companion.session.document(path);
    expect(structure.valueAt(doc.data, ['layers', 0, 'objects', 0])).toMatchObject({ x: 5, y: 42 });
    expect((await companion.session.snapshot(path)).state.undo).toBe('Settle 1 object (agent)');
    await companion.session.undo(path, { origin: 'agent' });

    expect(await settle(companion.session, async () => report([crate({ bodyType: 'static' })]), path, {}, { origin: 'agent' })).toBeNull();
    await expect(settle(companion.session, async () => report([crate()], ['boom']), path, {}, { origin: 'agent' })).rejects.toThrow(/logged errors.*boom/);
    expect((await companion.session.snapshot(path)).state.undo).toBe(before);
  });
});
