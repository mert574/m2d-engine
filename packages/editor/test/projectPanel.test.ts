import { describe, it, expect, vi, afterEach } from 'vitest';
import { createProjectPanel } from '../src/projectPanel.ts';

/**
 * The Project tab: m2d.project.json drawn by the inspector from the
 * engine's project schema, and an edit sent to the host as ops — the
 * same edit the MCP edit_project tool makes.
 */

afterEach(() => vi.unstubAllGlobals());

function host(file: Record<string, unknown>) {
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    if (url === '/__project/file') return new Response(JSON.stringify({ file }));
    if (url === '/__project/edit') {
      const { ops } = JSON.parse(init!.body!) as { ops: Array<{ path: string[]; value: unknown }> };
      posts.push(ops);
      for (const op of ops) (file as Record<string, unknown>)[op.path[0]!] = op.value;
      return new Response(JSON.stringify({ file }));
    }
    return new Response('{}', { status: 404 });
  }));
  return posts;
}

describe('the Project tab', () => {
  it('shows the project\'s fields in tabs, and writes an edit through the host', async () => {
    const posts = host({ name: 'Game', definition: 'game.js' });
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const said: string[] = [];
    const changed = vi.fn();
    const panel = createProjectPanel(container, { say: (m) => said.push(m), changed, scenes: () => ['menu', 'level'] });
    await panel.refresh();
    expect(container.querySelector('h2')?.textContent).toBe('m2d.project.json');
    const tabs = [...container.querySelectorAll('.inspector-tabs button')].map((tab) => tab.textContent);
    expect(tabs).toEqual(['Game', 'Display', 'Input', 'Audio']);
    const picker = container.querySelector<HTMLSelectElement>('[data-path="initialScene"] select');
    expect([...picker!.options].map((option) => option.value)).toEqual(expect.arrayContaining(['"menu"', '"level"']));
    picker!.value = '"menu"';
    picker!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(posts[0]).toEqual([{ op: 'set', path: ['initialScene'], value: 'menu' }]);
  });
});
