/**
 * The component library: the dock's Components tab.
 *
 * Every actor and constraint the game registers, and every one the engine
 * ships, as a card: its name, what it does, and the fields a scene may set
 * (an actor's `properties`, a constraint's `params`) with their kinds,
 * units and starting values — the catalog a scene author browses before
 * attaching anything (docs/plans/editor-e6-e9.md). A filter narrows it.
 *
 * Each card acts: **Attach** puts a constraint on the selected object or
 * prefab, **New prefab** makes a prefab of an actor. An engine class the
 * game does not register cannot be named by a scene yet, so its card says
 * so and shows the two lines to add to the game's definition instead.
 */

import { ICONS, KIND_ICONS, iconElement } from './icons.ts';
import { registrationSnippet, type CatalogEntry } from './catalog.ts';

export interface ComponentsPanelOptions {
  /** The catalog as it stands; called on every render. */
  catalog(): CatalogEntry[];
  /** What a constraint would attach to: the selected object or prefab, by label, or null. */
  target(): { label: string; kind: 'object' | 'prefab' } | null;
  attach(entry: CatalogEntry): void;
  newPrefab(entry: CatalogEntry): void;
}

export interface ComponentsPanelHandle {
  /** The registries or the selection changed. */
  refresh(): void;
}

export function createComponentsPanel(container: HTMLElement, options: ComponentsPanelOptions): ComponentsPanelHandle {
  let query = '';
  let kind: 'all' | 'actor' | 'constraint' = 'all';

  container.replaceChildren();
  container.classList.add('components-pane');
  const bar = document.createElement('div');
  bar.className = 'assets-bar';
  const views = document.createElement('div');
  views.className = 'segmented';
  const segments = (['all', 'actor', 'constraint'] as const).map((which) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = which === 'all' ? 'All' : which === 'actor' ? 'Actors' : 'Constraints';
    button.addEventListener('click', () => { kind = which; render(); });
    views.append(button);
    return [which, button] as const;
  });
  const search = document.createElement('label');
  search.className = 'search';
  search.append(iconElement(ICONS.search));
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Filter components';
  input.addEventListener('input', () => { query = input.value.trim().toLowerCase(); render(); });
  search.append(input);
  const where = document.createElement('span');
  where.className = 'source';
  bar.append(views, search, where);
  const grid = document.createElement('div');
  grid.className = 'component-grid';
  container.append(bar, grid);

  const render = (): void => {
    for (const [which, button] of segments) button.setAttribute('aria-pressed', String(kind === which));
    const target = options.target();
    where.textContent = target ? `Attach to ${target.kind} ${target.label}` : 'Select an object or a prefab to attach constraints';
    grid.replaceChildren();
    const entries = options.catalog().filter((entry) =>
      (kind === 'all' || entry.kind === kind)
      && (!query || `${entry.name} ${entry.description} ${entry.fields.map((f) => f.key).join(' ')}`.toLowerCase().includes(query)));
    if (!entries.length) {
      const note = document.createElement('div');
      note.className = 'asset-note';
      note.textContent = query ? 'Nothing matches.' : 'No components: the game registers nothing and the engine could not be read.';
      grid.append(note);
      return;
    }
    let lastKind: string | null = null;
    for (const entry of entries) {
      if (kind === 'all' && entry.kind !== lastKind) {
        const heading = document.createElement('div');
        heading.className = 'asset-heading';
        heading.textContent = entry.kind === 'actor' ? 'Actors' : 'Constraints';
        const hint = document.createElement('span');
        hint.textContent = entry.kind === 'actor' ? 'A prefab names one' : "Attached under a prefab's or an object's constraints";
        heading.append(hint);
        grid.append(heading);
        lastKind = entry.kind;
      }
      grid.append(card(entry, target));
    }
  };

  const card = (entry: CatalogEntry, target: ReturnType<ComponentsPanelOptions['target']>): HTMLElement => {
    const element = document.createElement('div');
    element.className = `component-card${entry.registered ? '' : ' unregistered'}`;
    element.dataset.name = entry.name;
    element.dataset.kind = entry.kind;
    const head = document.createElement('div');
    head.className = 'component-head';
    head.append(iconElement(entry.kind === 'actor' ? KIND_ICONS.prefab! : ICONS.link));
    const name = document.createElement('span');
    name.className = 'component-name';
    name.textContent = entry.name;
    head.append(name);
    if (!entry.registered) {
      const chip = document.createElement('span');
      chip.className = 'chip warn';
      chip.textContent = 'not registered';
      chip.title = 'The game does not register this class, so a scene cannot name it yet';
      head.append(chip);
    } else if (entry.builtin) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = 'engine';
      chip.title = "The engine's own; a scene may name it without the game registering it";
      head.append(chip);
    }
    element.append(head);
    if (entry.description) {
      const text = document.createElement('div');
      text.className = 'component-text';
      text.textContent = entry.description;
      element.append(text);
    }
    if (entry.fields.length) {
      const list = document.createElement('dl');
      list.className = 'component-fields';
      for (const field of entry.fields) {
        const term = document.createElement('dt');
        term.textContent = field.label;
        term.title = `${field.key}${field.description ? ` — ${field.description}` : ''}`;
        const detail = document.createElement('dd');
        const start = field.initial !== undefined ? ` = ${format(field.initial)}` : field.required ? ' (required)' : '';
        detail.textContent = `${field.kind}${field.unit ? ` ${field.unit}` : ''}${start}`;
        list.append(term, detail);
      }
      element.append(list);
    } else {
      const none = document.createElement('div');
      none.className = 'component-text muted';
      none.textContent = entry.kind === 'actor' ? 'Declares no properties: any bag is passed through.' : 'Nothing a scene can set.';
      element.append(none);
    }
    const actions = document.createElement('div');
    actions.className = 'component-actions';
    if (entry.registered) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'card-action';
      if (entry.kind === 'constraint') {
        action.textContent = target ? `Attach to ${target.label}` : 'Attach';
        action.disabled = !target;
        action.title = target ? `Add a ${entry.name} to ${target.label}` : 'Select an object or a prefab first';
        action.addEventListener('click', () => options.attach(entry));
      } else {
        action.textContent = 'New prefab';
        action.title = `Make a prefab of ${entry.name}`;
        action.addEventListener('click', () => options.newPrefab(entry));
      }
      actions.append(action);
    } else {
      const code = document.createElement('pre');
      code.className = 'component-snippet';
      code.textContent = registrationSnippet(entry);
      code.title = "Add these to the game's definition (register) to make it available to scenes";
      actions.append(code);
    }
    element.append(actions);
    return element;
  };

  // The first render waits for the caller's own setup (the selection it
  // reads is declared after the panel is made); `refresh` draws it.
  return { refresh: render };
}

function format(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  if (typeof value === 'string') return JSON.stringify(value);
  const text = JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 37)}…` : text;
}
