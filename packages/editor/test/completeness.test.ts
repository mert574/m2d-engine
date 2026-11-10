import { describe, it, expect, beforeEach } from 'vitest';
import { inspectNode } from 'm2d-editor-core';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { LEVEL_SCHEMA, UI_SCHEMA } from 'm2d-engine/core/sceneSchema.js';
import { createInspector } from '../src/inspector.ts';

/**
 * The completeness criterion (docs/plans/editor-e6-e9.md): every
 * descriptor kind the scene schemas use has an editor in the inspector,
 * and every container can gain and lose entries. The first test pins the
 * set of kinds, so a new kind in the schema fails here until the
 * inspector learns it; the rest render a node of each kind and look for
 * its control.
 */

interface Desc { kind: string; fields?: Record<string, Desc>; value?: Desc; item?: Desc; items?: Desc[]; branches?: Desc[]; variants?: Record<string, Desc> }

function kindsOf(desc: Desc, into = new Set<string>()): Set<string> {
  into.add(desc.kind);
  for (const child of Object.values(desc.fields ?? {})) kindsOf(child, into);
  if (desc.value) kindsOf(desc.value, into);
  if (desc.item) kindsOf(desc.item, into);
  for (const child of desc.items ?? []) kindsOf(child, into);
  for (const child of desc.branches ?? []) kindsOf(child, into);
  for (const child of Object.values(desc.variants ?? {})) kindsOf(child, into);
  return into;
}

/** The kinds the inspector draws, and how. */
const HANDLED = ['number', 'integer', 'string', 'boolean', 'enum', 'ref', 'object', 'record', 'array', 'tuple', 'union', 'tagged', 'dynamic', 'any'];

const level = (): Record<string, unknown> => ({
  version: SCENE_VERSION, type: 'level', name: 'room',
  world: { dimensions: 2, width: 640, height: 360, gravity: { x: 0, y: 900 }, projection: 'isometric' },
  assets: { spritesheets: { hero: { url: 'hero.png', frameWidth: 16, frameHeight: 16, animations: { run: { frames: [[0, 0], [1, 0]] } } } } },
  prefabs: { wall: { actor: 'Platform', physics: { bodyType: 'static' }, constraints: { hp: { type: 'Health', params: { maxHealth: 3 } } } } },
  layers: [{ name: 'main', objects: [{ id: 'floor', prefab: 'wall', x: 0, y: 0, properties: { anything: 1 } }] }],
  tileLayers: [{ name: 'ground', spritesheet: 'hero', parallax: 0.5, cells: [[0, 0]] }]
});

let container: HTMLElement;
let writes: Array<{ path: unknown[]; value: unknown }>;
let lists: Array<{ op: string; path: unknown[]; index: number; value?: unknown }>;
let renames: Array<[unknown[], string, string]>;
beforeEach(() => {
  container = document.createElement('div');
  document.body.replaceChildren(container);
  writes = []; lists = []; renames = [];
});
const inspector = () => createInspector(container, {
  edit: (path, value) => writes.push({ path, value }),
  list: (op) => lists.push(op),
  rename: (path, from, to) => renames.push([path, from, to]),
  refs: (scope) => (scope === 'constraint' ? ['Health', 'Chase'] : scope === 'prefab' ? ['wall'] : [])
});

describe('the schema', () => {
  it('uses only kinds the inspector has an editor for', () => {
    const kinds = new Set([...kindsOf(LEVEL_SCHEMA as Desc), ...kindsOf(UI_SCHEMA as Desc)]);
    for (const kind of kinds) expect(HANDLED, `kind '${kind}' has no inspector editor`).toContain(kind);
  });
});

describe('every container can gain and lose entries', () => {
  it('adds an entry to a record by name, and a typed one to a constraints block', () => {
    inspector().show('wall', inspectNode(level(), ['prefabs', 'wall']));
    const form = container.querySelector<HTMLFormElement>('.card[data-key="constraints"] > .add-entry')!;
    expect(form).toBeTruthy();
    const name = form.querySelector<HTMLInputElement>('input')!;
    const type = form.querySelector<HTMLSelectElement>('select')!;
    expect([...type.options].map((o) => o.value)).toEqual(['', 'Health', 'Chase']);
    // The slot name follows the type until typed.
    expect(name.value).toBe('health');
    type.value = 'Chase';
    type.dispatchEvent(new Event('change'));
    expect(name.value).toBe('chase');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(writes.at(-1)).toEqual({ path: ['prefabs', 'wall', 'constraints', 'chase'], value: { type: 'Chase' } });
    // A taken name is refused.
    name.value = 'hp';
    name.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(writes).toHaveLength(1);
  });

  it('adds a sprite sheet with its required fields begun, and renames a record entry', () => {
    inspector().show('assets', inspectNode(level(), ['assets']));
    const form = container.querySelector<HTMLFormElement>('.card[data-key="spritesheets"] > .add-entry')!;
    form.querySelector<HTMLInputElement>('input')!.value = 'tiles';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(writes.at(-1)).toEqual({ path: ['assets', 'spritesheets', 'tiles'], value: { url: '', frameWidth: 0, frameHeight: 0 } });

    const rename = container.querySelector<HTMLButtonElement>('dt[data-path="assets.spritesheets.hero"] .rename')!;
    expect(rename).toBeTruthy();
    rename.click();
    const field = container.querySelector<HTMLInputElement>('.rename-field')!;
    field.value = 'knight';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(renames).toEqual([[['assets', 'spritesheets'], 'hero', 'knight']]);
  });

  it('adds an item to an empty list from its template, and removes one', () => {
    const doc = level();
    (doc.tileLayers as Array<Record<string, unknown>>)[0]!.cells = [];
    inspector().show('tiles', inspectNode(doc, ['tileLayers', 0]));
    const add = container.querySelector<HTMLButtonElement>('.card[data-key="cells"] .card-head button[title="Add an item"]')!;
    expect(add).toBeTruthy();
    add.click();
    expect(lists.at(-1)).toEqual({ op: 'insert', path: ['tileLayers', 0, 'cells'], index: 0, value: [0, 0] });

    inspector().show('tiles', inspectNode(level(), ['tileLayers', 0]));
    container.querySelector<HTMLButtonElement>('.card[data-key="cells"] dd.vector .reset')!.click();
    expect(lists.at(-1)).toEqual({ op: 'remove', path: ['tileLayers', 0, 'cells'], index: 0 });
  });
});

describe('every kind has a control', () => {
  it('draws a tuple as a row of cells that write their position', () => {
    inspector().show('tiles', inspectNode(level(), ['tileLayers', 0]));
    const cells = container.querySelectorAll<HTMLInputElement>('.card[data-key="cells"] dd.vector .component input');
    expect(cells).toHaveLength(2);
    cells[1]!.value = '3';
    cells[1]!.dispatchEvent(new Event('change'));
    expect(writes.at(-1)).toEqual({ path: ['tileLayers', 0, 'cells', 0, 1], value: 3 });
  });

  it('offers a union\'s shapes and replaces the value with the chosen one', () => {
    inspector().show('world', inspectNode(level(), ['world']));
    const projection = container.querySelector<HTMLSelectElement>('dd[data-key="projection"] select.variant')!;
    expect(projection).toBeTruthy();
    const labels = [...projection.options].map((o) => o.textContent);
    expect(labels).toContain('isometric');
    expect(labels).toContain('{ type, ratio }');
    expect(projection.selectedOptions[0]?.textContent).toBe('isometric');
    projection.value = String(labels.indexOf('{ type, ratio }'));
    projection.dispatchEvent(new Event('change'));
    expect(writes.at(-1)?.path).toEqual(['world', 'projection']);
    expect(writes.at(-1)?.value).toMatchObject({ type: expect.any(String) });

    inspector().show('tiles', inspectNode(level(), ['tileLayers', 0]));
    const parallax = container.querySelector<HTMLSelectElement>('dd[data-key="parallax"] select.variant')!;
    expect([...parallax.options].map((o) => o.textContent)).toEqual(['number', '{ x, y }']);
    expect(parallax.selectedIndex).toBe(0);
  });

  it('offers a tagged union\'s variants on a UI element', () => {
    const ui = { version: SCENE_VERSION, type: 'ui', name: 'menu', elements: [{ type: 'rect', id: 'bg', fill: true, color: '#111' }] };
    inspector().show('elements', inspectNode(ui, ['elements']));
    const variant = container.querySelector<HTMLSelectElement>('[data-key="0"] select.variant, .card-head select.variant')!;
    expect(variant).toBeTruthy();
    expect([...variant.options].map((o) => o.textContent)).toEqual(['button', 'text', 'image', 'rect']);
    expect(variant.selectedOptions[0]?.textContent).toBe('rect');
    variant.value = '0';
    variant.dispatchEvent(new Event('change'));
    expect(writes.at(-1)?.value).toMatchObject({ type: 'button' });
  });

  it('leaves a free-form bag editable as values', () => {
    inspector().show('floor', inspectNode(level(), ['layers', 0, 'objects', 0]));
    // Properties under an undeclared actor: the key is shown with a control.
    expect(container.querySelector('.card[data-key="properties"]')).toBeTruthy();
    expect(container.querySelector('[data-key="anything"] .control')).toBeTruthy();
  });
});
