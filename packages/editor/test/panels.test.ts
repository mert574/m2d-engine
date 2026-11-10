import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sceneOutline, inspectNode, type OutlineNode } from 'm2d-editor-core';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { createTree } from '../src/tree.ts';
import { createInspector } from '../src/inspector.ts';
import { demoScene } from '../src/demoScene.ts';
import { namedClasses } from '../src/viewport.ts';

/**
 * The panels as DOM: the tree renders the outline and reports what was
 * clicked, the inspector renders the rows with set and unset fields told
 * apart. The data those render is editor-core's and tested there; what
 * is proven here is the rendering and the wiring.
 */

const DOC = demoScene();

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.replaceChildren(container);
});

describe('the scene tree', () => {
  it('renders every node with its path, and reports a click', () => {
    const picked: OutlineNode[] = [];
    const tree = createTree(container, (node) => picked.push(node));
    tree.show(sceneOutline(DOC));

    const rows = [...container.querySelectorAll<HTMLButtonElement>('.row')];
    expect(rows[0]?.textContent).toContain('courtyard');
    const labels = rows.map((row) => row.querySelector('.label')?.textContent);
    expect(labels).toContain('crate-1');
    expect(labels).toContain('Prefabs');

    const crate = rows.find((row) => row.querySelector('.label')?.textContent === 'crate-1');
    crate?.click();
    expect(picked[0]?.label).toBe('crate-1');
    expect(picked[0]?.path.slice(0, 3)).toEqual(['layers', 0, 'objects']);
    expect(crate?.classList.contains('selected')).toBe(true);
    expect(tree.selection()).toEqual(picked[0]?.path);

    // Selecting another moves the highlight rather than adding one.
    rows.find((row) => row.querySelector('.label')?.textContent === 'floor')?.click();
    expect(container.querySelectorAll('.row.selected')).toHaveLength(1);
  });
});

describe('the inspector', () => {
  it('renders set fields as values and unset ones as their muted fallback', () => {
    const inspector = createInspector(container);
    const objects = (DOC.layers as Array<{ objects: Array<{ id: string }> }>)[0]!.objects;
    const pebble = objects.findIndex((object) => object.id === 'pebble');
    inspector.show('pebble', inspectNode(DOC, ['layers', 0, 'objects', pebble]));

    expect(container.querySelector('h2')?.textContent).toBe('pebble');
    const value = (key: string) => container.querySelector<HTMLElement>(`dd[data-key="${key}"]`);

    expect(value('id')?.textContent).toBe('pebble');
    expect(value('x')?.textContent).toContain('520');
    expect(value('x')?.textContent).toContain('px');          // the descriptor's unit
    // width is unset: the schema default shows, muted.
    expect(value('width')?.textContent).toContain('32');
    expect(value('width')?.classList.contains('muted')).toBe(true);
    // z is unset with no default at all.
    expect(value('z')?.textContent).toContain('—');
  });

  it('renders nested rows for an object field', () => {
    const inspector = createInspector(container);
    inspector.show('wall', inspectNode(DOC, ['prefabs', 'wall']));
    const keys = [...container.querySelectorAll<HTMLElement>('dd')].map((dd) => dd.dataset.key);
    expect(keys).toContain('actor');
    expect(keys).toContain('bodyType');      // nested under physics
    expect(keys).toContain('friction');
  });

  it('clears to a message', () => {
    const inspector = createInspector(container);
    inspector.clear('Pick something.');
    expect(container.textContent).toContain('Pick something.');
  });
});

describe('what the viewport registers', () => {
  it('collects the actor names and constraint types a document uses', () => {
    const named = namedClasses({
      prefabs: {
        guard: { actor: 'Guard', constraints: { chase: { type: 'Chase' } } },
        tree: { actor: 'Tree' }
      },
      layers: [{ objects: [{ id: 'g', prefab: 'guard', constraints: { flee: { type: 'Flee' } } }] }]
    });
    expect([...named.actors].sort()).toEqual(['Guard', 'Tree']);
    expect([...named.constraints].sort()).toEqual(['Chase', 'Flee']);
  });

  it('the demo scene is a valid document', () => {
    // Belt and braces: the demo must never rot, since ?demo is the
    // app's own smoke test.
    expect(DOC.version).toBe(SCENE_VERSION);
    expect(sceneOutline(DOC).children?.length).toBeGreaterThan(1);
  });
});
