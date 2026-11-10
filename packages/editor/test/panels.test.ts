import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sceneOutline, inspectNode, type OutlineNode } from 'm2d-editor-core';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { createTree } from '../src/tree.ts';
import { createInspector } from '../src/inspector.ts';
import { namedClasses } from '../src/viewport.ts';

/** A small level exercising the panels: prefabs, ids, set and unset fields. */
function fixtureScene(): Record<string, unknown> {
  return {
    version: SCENE_VERSION, name: 'courtyard', type: 'level',
    world: { width: 960, height: 540, gravity: { x: 0, y: 900 } },
    prefabs: {
      wall: { actor: 'Wall', physics: { bodyType: 'static', friction: 0.4 } },
      ball: { actor: 'Ball', physics: { bodyType: 'dynamic', shape: 'circle' } }
    },
    layers: [{
      name: 'main',
      objects: [
        { id: 'floor', prefab: 'wall', x: 480, y: 520, width: 960, height: 40 },
        { id: 'crate-1', prefab: 'wall', x: 620, y: 460, width: 56, height: 56 },
        // No size at all: the schema's default applies, shown muted.
        { id: 'pebble', prefab: 'ball', x: 520, y: 80 }
      ]
    }]
  };
}

/**
 * The panels as DOM: the tree renders the outline and reports what was
 * clicked, the inspector renders the rows with set and unset fields told
 * apart. The data those render is editor-core's and tested there; what
 * is proven here is the rendering and the wiring.
 */

const DOC = fixtureScene();

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

  it('turns leaf rows into inputs that write a path and a value', () => {
    const writes: Array<[unknown[], unknown, string]> = [];
    const inspector = createInspector(container, {
      edit: (path, value, label) => writes.push([path, value, label]),
      refs: (scope) => (scope === 'prefab' ? ['wall', 'ball'] : [])
    });
    const objects = (DOC.layers as Array<{ objects: Array<{ id: string }> }>)[0]!.objects;
    const crate = objects.findIndex((object) => object.id === 'crate-1');
    inspector.show('crate-1', inspectNode(DOC, ['layers', 0, 'objects', crate]));

    // Placement reads as vector rows: x, y in Position, width, height in Size.
    const position = [...container.querySelectorAll('dt')].find((dt) => dt.textContent === 'Position');
    expect(position).toBeTruthy();
    const x = container.querySelector<HTMLInputElement>('[data-key="x"] input')!;
    expect(x.type).toBe('number');
    x.value = '700';
    x.dispatchEvent(new Event('change'));
    expect(writes.at(-1)).toEqual([['layers', 0, 'objects', crate, 'x'], 700, 'Set x']);

    // A ref chooses among the names in its scope.
    const prefab = container.querySelector<HTMLSelectElement>('dd[data-key="prefab"] select')!;
    expect([...prefab.options].map((option) => option.textContent)).toEqual(['wall', 'ball']);
    prefab.value = JSON.stringify('ball');
    prefab.dispatchEvent(new Event('change'));
    expect(writes.at(-1)?.[1]).toBe('ball');

    // A set field that may be absent resets; a required one does not.
    expect(container.querySelector('[data-key="x"] .reset')).toBeNull();
    container.querySelector<HTMLButtonElement>('[data-key="width"] .reset')!.click();
    expect(writes.at(-1)).toEqual([['layers', 0, 'objects', crate, 'width'], undefined, 'Reset width']);
  });

  it('scrubs a number by dragging its label, as one write on release', () => {
    const writes: Array<[unknown[], unknown, string]> = [];
    const inspector = createInspector(container, { edit: (path, value, label) => writes.push([path, value, label]) });
    inspector.show('crate-1', inspectNode(DOC, ['layers', 0, 'objects', 1]));
    const letter = container.querySelector<HTMLElement>('[data-key="x"] .letter')!;
    letter.setPointerCapture = () => {};
    const at = (type: string, clientX: number) => letter.dispatchEvent(new PointerEvent(type, { clientX, button: 0, bubbles: true }));
    at('pointerdown', 100);
    at('pointermove', 120);
    at('pointermove', 140);
    expect(writes).toHaveLength(0);                     // live in the box, not yet written
    at('pointerup', 140);
    expect(writes).toEqual([[['layers', 0, 'objects', 1, 'x'], 640, 'Set x']]);   // 620 + 40 px / 2 × 1
  });

  it('shows radians as degrees and stores radians', () => {
    const writes: Array<[unknown[], unknown, string]> = [];
    const doc = JSON.parse(JSON.stringify(DOC));
    doc.layers[0].objects[1].angle = Math.PI / 2;
    const inspector = createInspector(container, { edit: (path, value, label) => writes.push([path, value, label]) });
    inspector.show('crate-1', inspectNode(doc, ['layers', 0, 'objects', 1]));
    const angle = container.querySelector<HTMLInputElement>('dd[data-key="angle"] input')!;
    expect(angle.value).toBe('90');
    expect(container.querySelector('dd[data-key="angle"] .unit')?.textContent).toBe('°');
    angle.value = '45';
    angle.dispatchEvent(new Event('change'));
    expect(writes.at(-1)?.[1]).toBeCloseTo(Math.PI / 4, 6);
  });

  it('offers to add an absent block and to remove a set optional one', () => {
    const writes: Array<[unknown[], unknown, string]> = [];
    const inspector = createInspector(container, { edit: (path, value, label) => writes.push([path, value, label]) });
    inspector.show('wall', inspectNode(DOC, ['prefabs', 'wall']));
    const add = [...container.querySelectorAll<HTMLButtonElement>('dd.section button')].find((b) => b.textContent === 'Add');
    expect(add).toBeTruthy();
    add!.click();
    expect(writes.at(-1)?.[1]).toEqual({});
    const physics = container.querySelector<HTMLButtonElement>('dd.section[data-key="physics"] .reset')!;
    physics.click();
    expect(writes.at(-1)).toEqual([['prefabs', 'wall', 'physics'], undefined, 'Remove physics']);
  });

  it('marks the field the loader objected to, and goes read-only on request', () => {
    const inspector = createInspector(container, { edit: () => {} });
    inspector.show('floor', inspectNode(DOC, ['layers', 0, 'objects', 0]), {
      readOnly: true,
      issues: [{ path: 'layers[0].objects[0].x', message: 'must be a number' }]
    });
    expect(container.querySelector('.issue')?.textContent).toContain('must be a number');
    expect(container.querySelector('[data-key="x"]')?.classList.contains('invalid')).toBe(true);
    expect(container.querySelector('.row-issue')?.textContent).toBe('must be a number');
    const controls = [...container.querySelectorAll<HTMLInputElement>('.control')];
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.disabled)).toBe(true);
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

  it('the fixture is a valid document', () => {
    expect(DOC.version).toBe(SCENE_VERSION);
    expect(sceneOutline(DOC).children?.length).toBeGreaterThan(1);
  });
});
