import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Companion, Project } from '../src/index.ts';

/**
 * The companion and its MCP server, driven by a real client over a real
 * transport — the proof that an agent can reach a project without a
 * browser, which is the milestone this package exists for.
 */

let root: string;
let companion: Companion;
let client: Client;

const level = (fields: Record<string, unknown> = {}) => JSON.stringify({
  version: 2, type: 'level', name: 'room',
  world: { gravity: { x: 0, y: 1000 } },
  prefabs: { wall: { actor: 'Block', physics: { bodyType: 'static' } } },
  layers: [{ name: 'main', objects: [{ id: 'floor', prefab: 'wall', x: 0, y: 0 }] }],
  ...fields
}, null, 2);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'm2d-editor-mcp-'));
  await mkdir(join(root, 'scenes'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'junk'), { recursive: true });
  await writeFile(join(root, 'scenes', 'room.json'), level());
  await writeFile(join(root, 'scenes', 'menu.json'), JSON.stringify({
    version: 2, type: 'ui', name: 'menu',
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
    expect(tools.map((tool) => tool.name).sort()).toEqual(['list_scenes', 'read_scene', 'validate_scene']);
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
    expect(text).toContain('"version": 2');
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
