import { describe, it, expect } from 'vitest';
import { project } from '../src/index.ts';

/**
 * The project file as the editor's panel and the MCP tools see it: rows
 * from the engine's schema, edits refused whole when they would leave an
 * invalid file, and canonical text.
 */
describe('the project file', () => {
  const file = { name: 'Game', definition: 'game.js', hooks: 'hooks.js' };

  it('inspects every declared field, set or not', () => {
    const rows = project.inspectProject(file);
    const keys = rows.map((row) => row.key);
    expect(keys).toEqual(expect.arrayContaining(['name', 'initialScene', 'display', 'input', 'settings']));
    expect(rows.find((row) => row.key === 'initialScene')).toMatchObject({ present: false, kind: 'ref', refScope: 'scene' });
    const display = project.inspectProject(file, ['display']);
    expect(display.find((row) => row.key === 'aspectMode')?.options).toEqual(['letterbox', 'expand']);
  });

  it('applies an edit only when the result is a valid project', () => {
    const next = project.editProject(file, [
      { op: 'set', path: ['initialScene'], value: 'menu' },
      { op: 'set', path: ['input'], value: { actions: { menu: ['Escape'] } } }
    ]);
    expect(next).toMatchObject({ initialScene: 'menu', input: { actions: { menu: ['Escape'] } } });
    expect(file).not.toHaveProperty('initialScene');
    expect(() => project.editProject(file, [{ op: 'set', path: ['input'], value: { actions: { menu: 'Escape' } } }]))
      .toThrow(/input.actions.menu/);
    expect(() => project.editProject(file, [{ op: 'set', path: ['name'] }])).toThrow(/name/);
  });

  it('writes canonical text', () => {
    const text = project.writeProject({ ...file, display: { width: 960, height: 540 } });
    expect(JSON.parse(text)).toEqual({ ...file, display: { width: 960, height: 540 } });
    expect(text.endsWith('\n')).toBe(true);
  });
});
