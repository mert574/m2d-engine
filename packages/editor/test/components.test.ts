import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildCatalog, fieldsOf, registrationSnippet } from '../src/catalog.ts';
import { createComponentsPanel } from '../src/componentsPanel.ts';
import { createTree } from '../src/tree.ts';
import { showMenu, closeMenu, menuIsOpen } from '../src/menu.ts';
import { sceneOutline, type OutlineNode } from 'm2d-editor-core';
import { Health } from 'm2d-engine/constraints/health.js';
import { Prop } from 'm2d-engine/actors/prop.js';

/**
 * The component library and the tree's new behaviours: the catalog merges
 * the game's registries with the engine's own, the panel attaches and
 * makes prefabs, the tree selects sets and opens a menu.
 */

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.replaceChildren(container);
});

describe('the catalog', () => {
  it('lists the game\'s classes first, then the engine\'s unregistered ones with a snippet', () => {
    class Guard { static description = 'Walks a beat'; static properties = { speed: { kind: 'number', initial: 40, unit: 'px/s' } }; }
    const catalog = buildCatalog({ actors: new Map([['Guard', Guard], ['Prop', Prop]]), constraintTypes: new Map([['Health', Health]]) });
    const guard = catalog.find((entry) => entry.name === 'Guard')!;
    expect(guard).toMatchObject({ kind: 'actor', registered: true, description: 'Walks a beat' });
    expect(guard.fields).toEqual([{ key: 'speed', kind: 'number', label: 'Speed', unit: 'px/s', initial: 40, description: undefined, required: undefined }]);
    // Registered first; the engine's Chase is offered unregistered with the lines to add.
    const actors = catalog.filter((entry) => entry.kind === 'actor');
    expect(actors.slice(0, 2).map((entry) => entry.name)).toEqual(['Guard', 'Prop']);
    expect(actors.slice(2).every((entry) => !entry.registered)).toBe(true);
    const chase = catalog.find((entry) => entry.name === 'Chase')!;
    expect(chase.registered).toBe(false);
    expect(registrationSnippet(chase)).toBe("import { Chase } from 'm2d-engine/constraints/chase.js';\ngame.registerConstraint('Chase', Chase);");
    const health = catalog.find((entry) => entry.name === 'Health')!;
    expect(health.registered).toBe(true);
    expect(health.fields.map((field) => field.key)).toEqual(['maxHealth', 'invulnerableDuration', 'showBar']);
    expect(health.description).toMatch(/Hit points/);
  });

  it('merges properties along an actor\'s class chain', () => {
    class Base { static properties = { a: { kind: 'number' } }; }
    class Sub extends Base { static override properties = { b: { kind: 'string', label: 'Bee' } }; }
    expect(fieldsOf(Sub, 'properties').map((field) => [field.key, field.label])).toEqual([['a', 'A'], ['b', 'Bee']]);
  });
});

describe('the components panel', () => {
  it('filters, attaches to the target and makes prefabs', () => {
    const attach = vi.fn();
    const newPrefab = vi.fn();
    let target: { label: string; kind: 'object' | 'prefab' } | null = null;
    const panel = createComponentsPanel(container, {
      catalog: () => buildCatalog({ actors: new Map([['Prop', Prop]]), constraintTypes: new Map([['Health', Health]]) }),
      target: () => target, attach, newPrefab
    });
    panel.refresh();
    const cards = () => [...container.querySelectorAll<HTMLElement>('.component-card')];
    expect(cards().length).toBeGreaterThan(20);
    const health = cards().find((card) => card.dataset.name === 'Health')!;
    const button = health.querySelector<HTMLButtonElement>('.card-action')!;
    expect(button.disabled).toBe(true);                      // nothing selected
    target = { label: 'crate-1', kind: 'object' };
    panel.refresh();
    const enabled = cards().find((card) => card.dataset.name === 'Health')!.querySelector<HTMLButtonElement>('.card-action')!;
    expect(enabled.disabled).toBe(false);
    expect(enabled.textContent).toBe('Attach to crate-1');
    enabled.click();
    expect(attach).toHaveBeenCalledWith(expect.objectContaining({ name: 'Health' }));
    cards().find((card) => card.dataset.name === 'Prop')!.querySelector<HTMLButtonElement>('.card-action')!.click();
    expect(newPrefab).toHaveBeenCalledWith(expect.objectContaining({ name: 'Prop' }));
    // Unregistered: a snippet, no button.
    const chase = cards().find((card) => card.dataset.name === 'Chase')!;
    expect(chase.querySelector('.card-action')).toBeNull();
    expect(chase.querySelector('.component-snippet')?.textContent).toContain('registerConstraint');

    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'hit points';
    input.dispatchEvent(new Event('input'));
    expect(cards().map((card) => card.dataset.name)).toEqual(['Health']);
  });
});

describe('the tree', () => {
  const doc = {
    version: 4, type: 'level', name: 'room', prefabs: { wall: { actor: 'Wall' } },
    layers: [{ name: 'main', objects: [{ id: 'a', prefab: 'wall', x: 0, y: 0 }, { id: 'b', prefab: 'wall', x: 1, y: 0 }, { id: 'c', prefab: 'wall', x: 2, y: 0 }] }]
  };
  it('reports the click\'s mode, highlights a set, and opens a menu on right click', () => {
    const picked: Array<[string, string]> = [];
    const menus: OutlineNode[] = [];
    const tree = createTree(container, (node, mode) => picked.push([node.label, mode]), { menu: (node) => menus.push(node) });
    tree.show(sceneOutline(doc));
    const row = (label: string) => [...container.querySelectorAll<HTMLElement>('.row')].find((r) => r.querySelector('.label')?.textContent === label)!;
    row('a').click();
    row('b').dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
    row('c').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(picked).toEqual([['a', 'replace'], ['b', 'toggle'], ['c', 'range']]);
    tree.select(['layers', 0, 'objects', 0], [['layers', 0, 'objects', 1], ['layers', 0, 'objects', 2]]);
    expect(row('a').classList.contains('selected')).toBe(true);
    expect(row('b').classList.contains('also')).toBe(true);
    expect(row('c').classList.contains('also')).toBe(true);
    row('c').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(menus.map((node) => node.label)).toEqual(['c']);
  });
});

describe('the menu', () => {
  it('shows items, runs one, and closes', () => {
    const ran = vi.fn();
    showMenu([{ label: 'Do it', action: ran }, { label: '-' }, { label: 'Never', disabled: true }], { x: 10, y: 10 });
    expect(menuIsOpen()).toBe(true);
    const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')];
    expect(items.map((item) => item.textContent)).toEqual(['Do it', 'Never']);
    expect(items[1]!.disabled).toBe(true);
    items[0]!.click();
    expect(ran).toHaveBeenCalled();
    expect(menuIsOpen()).toBe(false);
    showMenu([{ label: 'x' }], { x: 0, y: 0 });
    closeMenu();
    expect(document.querySelector('.menu')).toBeNull();
  });
});
