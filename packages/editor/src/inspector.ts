/**
 * The inspector panel: one node's fields, rendered from the rows
 * `inspectNode` generated out of the engine's own descriptors.
 *
 * Every declared field shows whether or not the document sets it; an
 * absent one shows what absence means (the schema's default or the
 * actor's initial) as a muted placeholder, so the panel reads the way the
 * game behaves. Without an `edit` callback the panel is a read-only
 * property grid. With one:
 *
 * - the node's rows are sorted into **tabs** the caller names (an
 *   object's Transform, Object and Overrides), one strip under the title,
 *   remembered per kind of node so stepping through objects keeps the tab;
 * - within a tab, leaf fields come first as a grid of inputs chosen by
 *   kind and hint — numbers with their unit (angles shown in degrees,
 *   stored in radians), checkboxes, enum and ref choices, colours, text —
 *   and a number's label scrubs its value when dragged (Shift ×10, Alt
 *   ×0.1); an object's placement reads as vector rows: Position, Size, and
 *   for a 3D object Rotation as yaw, pitch and roll over the stored
 *   quaternion;
 * - each block the document sets (physics, mesh, a list) is a **card**
 *   with its own header — fold, summary, add an item, remove — and its
 *   fields inside; the blocks it leaves out are one row of **Add** chips
 *   at the foot, not a column of dashes;
 * - the loader's problems under the node are listed, and each sits on the
 *   row its path names; `reveal` opens the tab a problem's row is in.
 *
 * A write is changes at paths (`undefined` deletes); the caller turns them
 * into one edit.
 */

import type { InspectedRow, PathSegment, ValidationIssue } from 'm2d-editor-core';
import { formatPath, rotation, type Quaternion } from 'm2d-editor-core';
import { ICONS, iconElement } from './icons.ts';

/** One change an inspector write makes. */
export interface Change { path: PathSegment[]; value: unknown }

export interface InspectorOptions {
  /** Write a field; `undefined` deletes it. Absent: the panel is read-only. */
  edit?: (path: PathSegment[], value: unknown, label: string) => void;
  /** Insert into or remove from a list. */
  list?: (op: { op: 'insert' | 'remove'; path: PathSegment[]; index: number; value?: unknown }, label: string) => void;
  /** The names a `ref` row may choose from, by scope ('prefab', 'actor', ...). */
  refs?: (scope: string) => string[];
  /** Rename an entry of the record at `path` (a prefab's name is carried into every object that uses it). */
  rename?: (path: PathSegment[], from: string, to: string) => void;
  /**
   * A number is being scrubbed: show the value before it is written, so
   * the thing on screen moves with the drag. Called with `undefined` when
   * the scrub ends, before the write.
   */
  preview?: (path: PathSegment[], value: number | undefined) => void;
}

/** A constraint the shown entity carries, from the running game (see `Viewport.liveConstraints`). */
export interface LiveConstraint {
  slot: string;
  type: string;
  params: Record<string, unknown>;
}

/** A tab: the top-level keys it holds. Rows no tab names go to the one marked `rest`, else the last. */
export interface InspectorGroup {
  id: string;
  label: string;
  keys: string[];
  rest?: boolean;
}

export interface ShowOptions {
  readOnly?: boolean;
  /** The loader's problems at or under this node. */
  issues?: ValidationIssue[];
  /** A chip beside the title: the node's kind. Also what the remembered tab is keyed by. */
  kind?: string;
  /** The tabs to sort the node's top-level rows into; none means one unnamed tab. */
  groups?: InspectorGroup[];
  /**
   * The constraints the entity really runs, from the game — the ones its
   * actor attached in code as well as the document's — with live param
   * values. Shown under the tab that holds `constraints`; a slot the
   * document does not name gets a Retune that adds an entry for it.
   */
  live?: LiveConstraint[];
  /** Which tab's group the live constraints belong under (the group holding 'constraints'). */
}

export interface InspectorHandle {
  /** Show a node's rows under a title; empty rows show a note instead. */
  show(title: string, rows: InspectedRow[], options?: ShowOptions): void;
  clear(message?: string): void;
  /** Open the tab holding the row at a formatted path and scroll it into view. */
  reveal(path: string): void;
}

const DEG = 180 / Math.PI;

/** A value as the row's text: compact, never multiline. */
function format(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/** `frictionAir` → `Friction air`; a descriptor's own label is kept. */
function labelOf(row: InspectedRow): string {
  if (row.label !== row.key) return row.label;
  if (/^\d+$/.test(row.key)) return `#${row.key}`;
  const words = row.key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A free-form bag the schema does not describe (an undeclared actor's properties): edited as a record of values. */
const isBag = (row: InspectedRow) => row.kind === 'unknown' && row.present && !!row.value && typeof row.value === 'object' && !Array.isArray(row.value);
const isBlock = (row: InspectedRow) => row.kind === 'object' || row.kind === 'record' || isBag(row);
/** Whether entries can be added to a row by name: a record, or a bag. */
const isRecordLike = (row: InspectedRow) => row.kind === 'record' || isBag(row);
const isList = (row: InspectedRow) => row.kind === 'array';
/** A block or a list the document could hold: what gets a card, or an Add chip. */
const isContainer = (row: InspectedRow) => (isBlock(row) || isList(row)) && row.editor !== 'rotation';

/** A tuple of a few numbers reads as one row of cells, like a vector. */
const isNumberTuple = (row: InspectedRow) =>
  !!row.tuple && Array.isArray(row.value) && row.value.length <= 6 && row.value.every((v) => typeof v === 'number');

/** Which of a row's alternatives its value is, by shape. */
function currentAlternative(row: InspectedRow): number {
  const alternatives = row.alternatives ?? [];
  const value = row.present ? row.value : row.fallback;
  const exact = alternatives.findIndex((a) => JSON.stringify(a.value) === JSON.stringify(value));
  if (exact >= 0) return exact;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    // A tagged variant: the alternative whose tag the value carries.
    const tagged = alternatives.findIndex((a) => a.value && typeof a.value === 'object'
      && Object.entries(a.value as Record<string, unknown>).some(([key, v]) => v === a.label && object[key] === a.label));
    if (tagged >= 0) return tagged;
    return alternatives.findIndex((a) => a.value && typeof a.value === 'object');
  }
  return alternatives.findIndex((a) => typeof a.value === typeof value && (typeof value !== 'string' || a.value === value));
}

/** Whether a row is a single value an input can hold. */
function editableLeaf(row: InspectedRow): boolean {
  if (row.children?.length || row.summary) return false;
  if (['number', 'integer', 'boolean', 'enum', 'string', 'ref', 'id'].includes(row.kind)) return true;
  const value = row.present ? row.value : row.fallback;
  return row.kind === 'unknown' && row.present && (value === null || typeof value !== 'object');
}

/** How a number row shows: degrees for radians, otherwise as stored. */
function display(row: InspectedRow) {
  const degrees = row.unit === 'rad';
  return {
    unit: degrees ? '°' : row.unit,
    show: (value: number) => (degrees ? Math.round(value * DEG * 1e4) / 1e4 : value),
    store: (value: number) => (degrees ? Math.round((value / DEG) * 1e6) / 1e6 : value),
    step: degrees ? 1 : row.unit === 'px' || row.kind === 'integer' ? 1 : 0.01
  };
}

/** The vector rows a placed thing's fields fold into. */
const VECTORS = [
  { label: 'Position', keys: ['x', 'y', 'z'], letters: ['X', 'Y', 'Z'] },
  { label: 'Size', keys: ['width', 'height', 'depth'], letters: ['W', 'H', 'D'] }
];

export function createInspector(container: HTMLElement, options: InspectorOptions = {}): InspectorHandle {
  let readOnly = false;
  let issues: ValidationIssue[] = [];
  /** Folded sections, by formatted path; survives re-renders. */
  const folded = new Set<string>();
  /** The open tab per kind of node, so the next object opens on the same one. */
  const activeTab = new Map<string, string>();
  const editing = () => !!options.edit && !readOnly;

  const render = (title: string, rows: InspectedRow[], show: ShowOptions = {}): void => {
    container.replaceChildren();
    const head = document.createElement('div');
    head.className = 'panel-header inspector-head';
    const heading = document.createElement('h2');
    heading.textContent = title;
    head.append(heading);
    if (show.kind) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = show.kind;
      head.append(chip);
    }
    if (readOnly && options.edit) {
      const chip = document.createElement('span');
      chip.className = 'chip warn';
      chip.textContent = 'read-only';
      head.append(chip);
    }
    container.append(head);

    if (issues.length) {
      const list = document.createElement('ul');
      list.className = 'issue';
      for (const issue of issues) {
        const item = document.createElement('li');
        item.append(iconElement(ICONS.warning));
        const text = document.createElement('span');
        const where = document.createElement('code');
        where.textContent = issue.path || '(document)';
        text.append(where, document.createTextNode(` ${issue.message}`));
        item.append(text);
        list.append(item);
      }
      container.append(list);
    }

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Nothing to show for this node.';
      container.append(empty);
      return;
    }
    if (!options.edit) {
      const list = document.createElement('dl');
      list.className = 'fields';
      for (const row of rows) appendReadOnly(list, row, 0);
      container.append(list);
      return;
    }

    // The tabs: each top-level row goes to the group that names its key,
    // the rest to the group for the rest. Groups left with nothing are
    // not shown; one group needs no strip.
    const groups = show.groups?.length ? show.groups : [{ id: 'all', label: 'Fields', keys: [], rest: true }];
    const rest = groups.find((group) => group.rest) ?? groups[groups.length - 1]!;
    const byGroup = new Map<string, InspectedRow[]>(groups.map((group) => [group.id, []]));
    for (const row of rows) {
      const group = groups.find((each) => each.keys.includes(row.key)) ?? rest;
      byGroup.get(group.id)!.push(row);
    }
    for (const group of groups) {
      // In the order the group names them, then the rest as they came.
      const own = byGroup.get(group.id)!;
      own.sort((a, b) => rank(group.keys, a.key) - rank(group.keys, b.key));
    }
    const shown = groups.filter((group) => byGroup.get(group.id)!.length);
    const memory = show.kind ?? title;
    let current = activeTab.get(memory);
    if (!shown.some((group) => group.id === current)) current = shown[0]?.id;
    if (shown.length > 1) {
      const strip = document.createElement('div');
      strip.className = 'inspector-tabs';
      strip.setAttribute('role', 'tablist');
      for (const group of shown) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'inspector-tab';
        tab.setAttribute('role', 'tab');
        tab.dataset.group = group.id;
        tab.setAttribute('aria-selected', String(group.id === current));
        tab.textContent = group.label;
        const bad = byGroup.get(group.id)!.filter((row) => issues.some((issue) => issue.path === formatPath(row.path) || issue.path.startsWith(`${formatPath(row.path)}.`) || issue.path.startsWith(`${formatPath(row.path)}[`))).length;
        if (bad) {
          const badge = document.createElement('span');
          badge.className = 'badge problem';
          badge.textContent = String(bad);
          tab.append(badge);
        }
        tab.addEventListener('click', () => {
          activeTab.set(memory, group.id);
          rerender();
        });
        strip.append(tab);
      }
      container.append(strip);
    }
    const body = document.createElement('div');
    body.className = 'inspector-body';
    container.append(body);
    appendGroup(body, byGroup.get(current ?? '') ?? []);
    const holdsConstraints = (byGroup.get(current ?? '') ?? []).some((row) => row.key === 'constraints');
    if (show.live?.length && holdsConstraints) body.append(liveCard(show.live, rows.find((row) => row.key === 'constraints')));
  };

  /**
   * What the game runs: every constraint on the entity with its live
   * params, read-only — the document's entries are edited in their own
   * card above. A slot the document does not name can be retuned: that
   * adds an entry for the slot (no type, so it retunes what the actor
   * attached), and its params then edit above.
   */
  const liveCard = (live: LiveConstraint[], declared?: InspectedRow): HTMLElement => {
    const section = document.createElement('section');
    section.className = 'card live open';
    section.dataset.key = 'live-constraints';
    const head = document.createElement('div');
    head.className = 'card-head';
    const name = document.createElement('span');
    name.className = 'fold open';
    name.append(iconElement(ICONS.link), document.createTextNode('Running constraints'));
    name.title = 'Every constraint on this entity in the running game, with its live values: the ones its actor attached in code and the ones the document declares';
    head.append(name);
    const meta = document.createElement('span');
    meta.className = 'muted meta';
    meta.textContent = `${live.length} slot${live.length === 1 ? '' : 's'}`;
    head.append(meta);
    section.append(head);
    const inDocument = new Set(Object.keys(isPlainRecord(declared?.value) ? declared!.value as object : {}));
    for (const entry of live) {
      const row = document.createElement('div');
      row.className = 'live-slot';
      row.dataset.slot = entry.slot;
      const title = document.createElement('div');
      title.className = 'live-title';
      const slot = document.createElement('b');
      slot.textContent = entry.slot;
      const type = document.createElement('span');
      type.className = 'muted';
      type.textContent = entry.type;
      title.append(slot, type);
      if (inDocument.has(entry.slot)) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = 'in document';
        title.append(chip);
      } else if (editing() && declared) {
        const retune = button('Retune', ICONS.plus, `Add a '${entry.slot}' entry to the document, to set its params here`);
        retune.classList.add('retune');
        // Into the document's constraints block, made whole when the object has none yet.
        retune.addEventListener('click', () => (declared.present
          ? options.edit!([...declared.path, entry.slot], {}, `Retune ${entry.slot}`)
          : options.edit!(declared.path, { [entry.slot]: {} }, `Retune ${entry.slot}`)));
        title.append(retune);
      }
      row.append(title);
      const keys = Object.keys(entry.params);
      if (keys.length) {
        const list = document.createElement('dl');
        list.className = 'component-fields';
        for (const key of keys) {
          const term = document.createElement('dt');
          term.textContent = key;
          const detail = document.createElement('dd');
          detail.textContent = format(entry.params[key]);
          list.append(term, detail);
        }
        row.append(list);
      }
      section.append(row);
    }
    return section;
  };

  const rank = (keys: string[], key: string) => { const i = keys.indexOf(key); return i < 0 ? keys.length : i; };

  /** One tab's rows: the leaves as a grid, the set blocks as cards, the unset ones as Add chips. */
  const appendGroup = (body: HTMLElement, rows: InspectedRow[]): void => {
    const leaves = rows.filter((row) => !isContainer(row));
    const blocks = rows.filter(isContainer);
    if (leaves.length) {
      const list = document.createElement('dl');
      list.className = 'fields';
      appendEditable(list, leaves, 0);
      body.append(list);
    }
    for (const row of blocks.filter((row) => row.present)) body.append(card(row));
    const absent = blocks.filter((row) => !row.present);
    if (!absent.length) return;
    const add = document.createElement('div');
    add.className = 'add-row';
    const label = document.createElement('span');
    label.className = 'muted';
    label.textContent = editing() ? 'Add' : 'Not set';
    add.append(label);
    for (const row of absent) {
      if (!editing()) {
        const name = document.createElement('span');
        name.className = 'chip';
        name.textContent = labelOf(row);
        name.dataset.key = row.key;
        if (row.fallback !== undefined) name.title = `${format(row.fallback)} (default)`;
        add.append(name);
        continue;
      }
      const chip = button(labelOf(row), ICONS.plus, `${row.description ?? `Add ${labelOf(row).toLowerCase()}`}${row.fallback !== undefined ? ` (default: ${format(row.fallback)})` : ''}`);
      chip.classList.add('add-chip');
      chip.dataset.key = row.key;
      chip.dataset.path = formatPath(row.path);
      markIssue(row, chip, chip);
      chip.addEventListener('click', () => options.edit!(row.path, isList(row) ? [] : {}, `Add ${labelOf(row).toLowerCase()}`));
      add.append(chip);
    }
    body.append(add);
  };

  /** A set block or list at the top of a tab: a header with its tools, its rows inside. */
  const card = (row: InspectedRow): HTMLElement => {
    const key = formatPath(row.path);
    const open = !folded.has(key);
    const section = document.createElement('section');
    section.className = `card${open ? ' open' : ''}`;
    section.dataset.key = row.key;
    section.dataset.path = key;
    const head = document.createElement('div');
    head.className = 'card-head';
    head.dataset.key = row.key;
    head.dataset.path = key;
    markIssue(row, head, head);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `fold${open ? ' open' : ''}`;
    toggle.append(iconElement(ICONS.chevron));
    const name = document.createElement('span');
    name.textContent = labelOf(row);
    toggle.append(name);
    if (row.description) toggle.title = row.description;
    toggle.addEventListener('click', () => {
      if (folded.has(key)) folded.delete(key); else folded.add(key);
      rerender();
    });
    head.append(toggle);

    const meta = document.createElement('span');
    meta.className = 'muted meta';
    const size = Array.isArray(row.value) ? row.value.length : row.value && typeof row.value === 'object' ? Object.keys(row.value).length : 0;
    meta.textContent = row.summary ?? (isList(row) ? `${size} item${size === 1 ? '' : 's'}` : open ? '' : `${size} set`);
    head.append(meta);
    if (row.alternatives) head.append(variantPicker(row));
    if (editing()) {
      if (isList(row) && Array.isArray(row.value) && !row.summary && (row.value.length || row.itemTemplate !== undefined)) {
        const add = button('', ICONS.plus, row.value.length ? 'Add an item (a copy of the last)' : 'Add an item');
        add.addEventListener('click', () => {
          const items = row.value as unknown[];
          const value = items.length ? structuredClone(items.at(-1)) : structuredClone(row.itemTemplate);
          options.list?.({ op: 'insert', path: row.path, index: items.length, value }, `Add to ${labelOf(row)}`);
        });
        head.append(add);
      }
      if (!row.required) {
        const remove = button('', ICONS.close, `Remove ${labelOf(row).toLowerCase()}`);
        remove.classList.add('reset');
        remove.addEventListener('click', () => options.edit!(row.path, undefined, `Remove ${labelOf(row).toLowerCase()}`));
        head.append(remove);
      }
    }
    section.append(head);
    if (open) {
      const list = document.createElement('dl');
      list.className = 'fields';
      if (row.children?.length) appendEditable(list, row.children, 0, row);
      else if (!isRecordLike(row) || !editing()) {
        const none = document.createElement('div');
        none.className = 'muted span';
        none.textContent = isList(row) ? 'No items.' : 'Nothing set yet.';
        list.append(none);
      }
      section.append(list);
      if (isRecordLike(row) && editing()) section.append(addEntryRow(row));
    }
    return section;
  };

  // --- Read-only ----------------------------------------------------------

  const appendReadOnly = (list: HTMLElement, row: InspectedRow, depth: number): void => {
    const term = termFor(row, depth);
    const detail = document.createElement('dd');
    detail.dataset.key = row.key;
    detail.dataset.path = formatPath(row.path);
    markIssue(row, term, detail);
    const hasChildren = !!row.children?.length;
    if (hasChildren) {
      detail.classList.add('nested');
    } else if (row.summary) {
      detail.classList.add('muted');
      detail.textContent = row.summary;
    } else if (row.present) {
      detail.textContent = format(row.value);
      if (row.editor === 'color' && typeof row.value === 'string') detail.prepend(swatch(row.value));
    } else if (row.fallback !== undefined) {
      detail.classList.add('muted');
      detail.textContent = format(row.fallback);
    } else {
      detail.classList.add('muted');
      detail.textContent = '—';
    }
    const meta: string[] = [];
    if (row.unit && (row.present || row.fallback !== undefined) && !hasChildren) meta.push(row.unit);
    if (row.kind === 'enum' && row.options && !row.present) meta.push(row.options.map(String).join(' | '));
    if (meta.length) {
      const unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = ` ${meta.join(' ')}`;
      detail.append(unit);
    }
    list.append(term, detail);
    for (const child of row.children ?? []) appendReadOnly(list, child, depth + 1);
  };

  // --- Editable -----------------------------------------------------------

  const appendEditable = (list: HTMLElement, rows: InspectedRow[], depth: number, parent?: InspectedRow): void => {
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const grouped = new Set<string>();
    // Placement first, as vectors — at the top of a node, where a placed
    // object's fields are.
    if (depth === 0 && !parent) {
      for (const vector of VECTORS) {
        const parts = vector.keys.map((key) => byKey.get(key)).filter((row): row is InspectedRow => row?.kind === 'number');
        if (parts.length < 2 || parts[0]!.key !== vector.keys[0]) continue;
        appendVector(list, vector.label, parts, vector.letters);
        for (const part of parts) grouped.add(part.key);
      }
    }
    for (const row of rows) {
      if (grouped.has(row.key)) continue;
      if (row.editor === 'rotation') appendRotation(list, row, depth);
      else if (isNumberTuple(row) && row.children?.length) {
        const letters = row.children.map((cell, i) => row.tuple?.[i]?.label?.charAt(0).toUpperCase() ?? String(i));
        appendVector(list, labelOf(row), row.children, letters, { depth, parent, row });
      } else if (isBlock(row) || isList(row)) appendSection(list, row, depth, parent);
      else appendLeaf(list, row, depth, parent);
    }
  };

  /**
   * The row that adds an entry to a record: a name, a type for a
   * constraints block (the registered types), and Add. The entry starts
   * as the record's template, its required fields begun.
   */
  const addEntryRow = (row: InspectedRow): HTMLElement => {
    const form = document.createElement('form');
    form.className = 'add-entry';
    const name = document.createElement('input');
    name.className = 'control';
    name.placeholder = row.key === 'constraints' ? 'slot' : row.key === 'prefabs' ? 'prefab name' : 'name';
    name.required = true;
    name.spellcheck = false;
    name.setAttribute('aria-label', 'Name of the new entry');
    form.append(name);
    let type: HTMLSelectElement | null = null;
    if (row.key === 'constraints' && options.refs) {
      type = document.createElement('select');
      type.className = 'control';
      type.setAttribute('aria-label', 'Constraint type');
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'retune (no type)';
      type.append(none);
      for (const choice of options.refs('constraint')) {
        const option = document.createElement('option');
        option.value = choice;
        option.textContent = choice;
        type.append(option);
      }
      if (type.options.length > 1) type.selectedIndex = 1;
      type.addEventListener('change', () => {
        if (type!.value && !name.dataset.typed) name.value = type!.value.charAt(0).toLowerCase() + type!.value.slice(1);
      });
      if (type.value) name.value = type.value.charAt(0).toLowerCase() + type.value.slice(1);
      name.addEventListener('input', () => { name.dataset.typed = name.value ? '1' : ''; });
      form.append(type);
    }
    const add = button('Add', ICONS.plus, `Add an entry to ${labelOf(row).toLowerCase()}`);
    add.type = 'submit';
    form.append(add);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const key = name.value.trim();
      if (!key) return;
      if (isPlainRecord(row.value) && key in row.value) { name.setCustomValidity(`'${key}' is already there`); name.reportValidity(); return; }
      let value: unknown = row.entryTemplate !== undefined ? structuredClone(row.entryTemplate) : isBag(row) ? '' : {};
      if (type) value = type.value ? { type: type.value } : {};
      options.edit!([...row.path, key], value, `Add ${key} to ${labelOf(row).toLowerCase()}`);
    });
    name.addEventListener('input', () => name.setCustomValidity(''));
    return form;
  };

  /** A select over a row's shapes; choosing one replaces the value with that shape's start. */
  const variantPicker = (row: InspectedRow): HTMLElement => {
    const select = document.createElement('select');
    select.className = 'control variant';
    select.title = 'The shape of this field';
    select.setAttribute('aria-label', `Shape of ${labelOf(row)}`);
    row.alternatives!.forEach((alternative, i) => {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = alternative.label;
      select.append(option);
    });
    const current = currentAlternative(row);
    select.value = current >= 0 ? String(current) : '';
    select.disabled = !editing();
    select.addEventListener('change', () => {
      const alternative = row.alternatives![Number(select.value)];
      if (alternative) options.edit!(row.path, structuredClone(alternative.value), `Change ${labelOf(row).toLowerCase()}`);
    });
    return select;
  };

  /** An entry's name, with a rename control when its record can carry one. */
  const renameable = (name: HTMLElement, row: InspectedRow, parent: InspectedRow | undefined): void => {
    if (!editing() || !parent || !isRecordLike(parent) || !options.rename) return;
    const edit = button('', ICONS.rename, `Rename ${row.key}`);
    edit.classList.add('rename');
    edit.addEventListener('click', (event) => {
      event.stopPropagation();
      const field = document.createElement('input');
      field.className = 'control rename-field';
      field.value = row.key;
      field.spellcheck = false;
      const done = (commit: boolean) => {
        const to = field.value.trim();
        field.replaceWith(name);
        if (commit && to && to !== row.key) options.rename!(parent.path, row.key, to);
      };
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); done(true); }
        if (e.key === 'Escape') done(false);
      });
      field.addEventListener('blur', () => done(true));
      name.replaceWith(field);
      field.focus();
      field.select();
    });
    name.after(edit);
  };

  /** A folding section for an object, a record or a list nested inside a card. */
  const appendSection = (list: HTMLElement, row: InspectedRow, depth: number, parent?: InspectedRow): void => {
    const key = formatPath(row.path);
    const term = document.createElement('dt');
    term.className = 'section';
    term.style.paddingLeft = `${depth * 12}px`;
    term.dataset.path = key;
    const detail = document.createElement('dd');
    detail.className = 'section';
    detail.dataset.key = row.key;
    detail.dataset.path = key;
    markIssue(row, term, detail);

    if (!row.present) {
      term.textContent = labelOf(row);
      if (row.description) term.title = row.description;
      const none = document.createElement('span');
      none.className = 'muted';
      none.textContent = row.fallback !== undefined ? `${format(row.fallback)} (default)` : 'None';
      detail.append(none);
      if (editing()) {
        const add = button('Add', ICONS.plus, `Add ${labelOf(row).toLowerCase()}`);
        add.addEventListener('click', () => options.edit!(row.path, isList(row) ? [] : {}, `Add ${labelOf(row).toLowerCase()}`));
        detail.append(add);
      }
      list.append(term, detail);
      return;
    }

    const open = !folded.has(key);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'fold';
    toggle.append(iconElement(ICONS.chevron));
    toggle.classList.toggle('open', open);
    const name = document.createElement('span');
    name.textContent = labelOf(row);
    toggle.append(name);
    if (row.description) toggle.title = row.description;
    toggle.addEventListener('click', () => {
      if (folded.has(key)) folded.delete(key); else folded.add(key);
      rerender();
    });
    term.append(toggle);
    renameable(name, row, parent);

    const meta = document.createElement('span');
    meta.className = 'muted';
    const size = Array.isArray(row.value) ? row.value.length : row.value && typeof row.value === 'object' ? Object.keys(row.value).length : 0;
    meta.textContent = row.summary ?? (isList(row) ? `${size} item${size === 1 ? '' : 's'}` : '');
    detail.append(meta);
    if (row.alternatives) detail.append(variantPicker(row));
    if (editing()) {
      if (isList(row) && Array.isArray(row.value) && !row.summary && (row.value.length || row.itemTemplate !== undefined)) {
        const add = button('', ICONS.plus, row.value.length ? 'Add an item (a copy of the last)' : 'Add an item');
        add.addEventListener('click', () => {
          const items = row.value as unknown[];
          const value = items.length ? structuredClone(items.at(-1)) : structuredClone(row.itemTemplate);
          options.list?.({ op: 'insert', path: row.path, index: items.length, value }, `Add to ${labelOf(row)}`);
        });
        detail.append(add);
      }
      // An entry of a list or a record can go; so can an optional block.
      const inList = parent && isList(parent) && typeof row.path.at(-1) === 'number';
      if (!row.required || inList) {
        const remove = button('', ICONS.close, inList ? 'Remove this item' : `Remove ${labelOf(row).toLowerCase()}`);
        remove.classList.add('reset');
        remove.addEventListener('click', () => (inList
          ? options.list?.({ op: 'remove', path: parent!.path, index: row.path.at(-1) as number }, `Remove from ${labelOf(parent!)}`)
          : options.edit!(row.path, undefined, `Remove ${labelOf(row).toLowerCase()}`)));
        detail.append(remove);
      }
    }
    list.append(term, detail);
    if (open) {
      if (row.children?.length) appendEditable(list, row.children, depth + 1, row);
      if (isRecordLike(row) && editing()) {
        const holder = document.createElement('div');
        holder.className = 'span';
        holder.style.paddingLeft = `${(depth + 1) * 12}px`;
        holder.append(addEntryRow(row));
        list.append(holder);
      }
    }
  };

  /** One field: a label (that scrubs, for a number) and its control. */
  const appendLeaf = (list: HTMLElement, row: InspectedRow, depth: number, parent?: InspectedRow): void => {
    const term = termFor(row, depth);
    const detail = document.createElement('dd');
    detail.dataset.key = row.key;
    detail.dataset.path = formatPath(row.path);
    markIssue(row, term, detail);
    if (row.alternatives) detail.append(variantPicker(row));
    if (editableLeaf(row)) {
      if (!row.present) detail.classList.add('unset');
      const control = input(row, detail);
      if (control instanceof HTMLInputElement && control.type === 'number') scrub(term, control, display(row).step, row.path, display(row).store);
    } else {
      detail.classList.add('muted');
      detail.textContent = row.summary ?? (row.present ? format(row.value) : row.fallback !== undefined ? format(row.fallback) : '—');
    }
    // A list's entries can go.
    if (editing() && parent && isList(parent) && typeof row.path.at(-1) === 'number') {
      const remove = button('', ICONS.close, 'Remove this item');
      remove.classList.add('reset');
      remove.addEventListener('click', () =>
        options.list?.({ op: 'remove', path: parent.path, index: row.path.at(-1) as number }, `Remove from ${labelOf(parent)}`));
      detail.append(remove);
    }
    if (parent && isRecordLike(parent)) {
      const name = document.createElement('span');
      name.textContent = term.textContent;
      term.replaceChildren(name);
      renameable(name, row, parent);
    }
    list.append(term, detail);
    appendIssueLine(list, row);
  };

  /** Position or Size: one row of labelled number boxes. */
  const appendVector = (
    list: HTMLElement, label: string, parts: InspectedRow[], letters: string[],
    tuple?: { depth: number; parent?: InspectedRow; row: InspectedRow }
  ): void => {
    const term = document.createElement('dt');
    term.textContent = label;
    if (tuple) {
      term.style.paddingLeft = `${tuple.depth * 12}px`;
      if (tuple.row.description) term.title = tuple.row.description;
    }
    const detail = document.createElement('dd');
    detail.className = 'vector';
    if (tuple) {
      detail.dataset.key = tuple.row.key;
      detail.dataset.path = formatPath(tuple.row.path);
    }
    const unit = parts.find((part) => part.unit)?.unit;
    if (unit) term.title = `${label} (${unit})`;
    parts.forEach((part, i) => {
      const cell = document.createElement('label');
      cell.className = `component axis-${part.key}`;
      cell.dataset.key = part.key;
      cell.dataset.path = formatPath(part.path);
      if (!part.present) cell.classList.add('unset');
      if (issueFor(part)) { cell.classList.add('invalid'); cell.title = issueFor(part)!.message; }
      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = letters[i] ?? part.key;
      cell.append(letter);
      // A tuple's positions cannot be removed one by one; a vector's optional z can.
      const control = input(part, cell, { compact: true, resettable: !tuple });
      if (control instanceof HTMLInputElement) scrub(letter, control, display(part).step, part.path, display(part).store);
      detail.append(cell);
    });
    if (tuple && editing() && tuple.parent && isList(tuple.parent) && typeof tuple.row.path.at(-1) === 'number') {
      const remove = button('', ICONS.close, 'Remove this item');
      remove.classList.add('reset');
      remove.addEventListener('click', () =>
        options.list?.({ op: 'remove', path: tuple.parent!.path, index: tuple.row.path.at(-1) as number }, `Remove from ${labelOf(tuple.parent!)}`));
      detail.append(remove);
    }
    list.append(term, detail);
    for (const part of parts) appendIssueLine(list, part);
  };

  /** A 3D rotation: yaw, pitch and roll in degrees over the stored quaternion. */
  const appendRotation = (list: HTMLElement, row: InspectedRow, depth: number): void => {
    const term = termFor(row, depth);
    term.textContent = 'Rotation';
    term.title = `${row.description ?? ''} (yaw, pitch, roll in degrees)`.trim();
    const detail = document.createElement('dd');
    detail.className = 'vector';
    detail.dataset.key = row.key;
    detail.dataset.path = formatPath(row.path);
    markIssue(row, term, detail);
    const q = (Array.isArray(row.value) && row.value.length === 4 ? row.value : rotation.IDENTITY) as Quaternion;
    const euler = rotation.toEuler(q);
    const angles = [euler.yaw, euler.pitch, euler.roll].map((a) => Math.round(a * DEG * 100) / 100);
    const fields: HTMLInputElement[] = [];
    const write = () => {
      const [yaw, pitch, roll] = fields.map((field) => (Number(field.value) || 0) / DEG);
      options.edit!(row.path, rotation.forScene(rotation.fromEuler({ yaw: yaw!, pitch: pitch!, roll: roll! })), 'Set rotation');
    };
    ['Yaw', 'Pitch', 'Roll'].forEach((name, i) => {
      const cell = document.createElement('label');
      cell.className = `component axis-${['y', 'x', 'z'][i]}`;
      if (!row.present) cell.classList.add('unset');
      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = name[0]!;
      letter.title = `${name} (°)`;
      const field = document.createElement('input');
      field.type = 'number';
      field.step = 'any';
      field.className = 'control';
      field.value = row.present ? String(angles[i]) : '';
      field.placeholder = '0';
      field.disabled = !editing();
      field.addEventListener('change', write);
      enterBlurs(field, () => { field.value = row.present ? String(angles[i]) : ''; });
      fields.push(field);
      scrub(letter, field, 1);
      cell.append(letter, field);
      detail.append(cell);
    });
    if (row.present && editing()) {
      const reset = button('', ICONS.close, 'Reset to no rotation');
      reset.classList.add('reset');
      reset.addEventListener('click', () => options.edit!(row.path, undefined, 'Reset rotation'));
      detail.append(reset);
    }
    list.append(term, detail);
    appendIssueLine(list, row);
  };

  /** The control for a leaf, appended to `host`. */
  const input = (row: InspectedRow, host: HTMLElement, { compact = false, resettable = true } = {}): HTMLElement => {
    const current = row.present ? row.value : undefined;
    const shown = row.present ? row.value : row.fallback;
    const commit = (value: unknown) => {
      if (row.present && JSON.stringify(value) === JSON.stringify(current)) return;
      options.edit!(row.path, value, `Set ${labelOf(row).toLowerCase()}`);
    };
    let control: HTMLInputElement | HTMLSelectElement;

    if (row.kind === 'boolean') {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'control switch';
      box.checked = shown === true;
      box.addEventListener('change', () => commit(box.checked));
      control = box;
    } else if (row.kind === 'enum' || (row.kind === 'ref' && options.refs && row.refScope)) {
      const select = document.createElement('select');
      const choices = row.kind === 'enum' ? (row.options ?? []) : options.refs!(row.refScope!);
      if (!row.present) {
        const none = document.createElement('option');
        none.value = '';
        none.textContent = shown === undefined ? '—' : `${format(shown)} (default)`;
        select.append(none);
      }
      for (const choice of choices) {
        const option = document.createElement('option');
        option.value = JSON.stringify(choice);
        option.textContent = format(choice);
        select.append(option);
      }
      select.value = row.present ? JSON.stringify(current) : '';
      if (row.present && select.value === '') {
        // A value the choices do not list (a ref to nothing): keep it visible.
        const stray = document.createElement('option');
        stray.value = JSON.stringify(current);
        stray.textContent = `${format(current)} (unknown)`;
        select.append(stray);
        select.value = stray.value;
      }
      select.addEventListener('change', () => { if (select.value) commit(JSON.parse(select.value)); });
      control = select;
    } else {
      const field = document.createElement('input');
      const numeric = row.kind === 'number' || row.kind === 'integer' || (row.kind === 'unknown' && typeof shown === 'number');
      const { show, store, unit } = display(row);
      field.type = numeric ? 'number' : 'text';
      if (numeric) field.step = 'any';
      field.spellcheck = false;
      field.value = row.present && current !== null && current !== undefined
        ? String(numeric && typeof current === 'number' ? show(current) : current) : '';
      if (!row.present) field.placeholder = shown === undefined ? '—' : format(numeric && typeof shown === 'number' ? show(shown) : shown);
      const write = () => {
        const text = field.value.trim();
        if (text === '' && !row.present) return;
        let value: unknown;
        if (numeric) {
          if (text === '') return;
          const number = Number(text);
          if (!Number.isFinite(number)) return;
          value = store(number);
        } else if (row.kind === 'unknown') {
          try { value = JSON.parse(text); } catch { value = text; }
        } else {
          value = field.value;
        }
        commit(value);
      };
      field.addEventListener('change', write);
      enterBlurs(field, () => { field.value = row.present ? String(numeric && typeof current === 'number' ? show(current) : current) : ''; });
      control = field;
      if (row.editor === 'color') {
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.className = 'colour';
        picker.value = typeof shown === 'string' && /^#[0-9a-f]{6}$/i.test(shown) ? shown : '#000000';
        picker.disabled = !editing();
        picker.addEventListener('change', () => commit(picker.value));
        host.append(picker);
      }
      if (unit && !compact) {
        field.classList.add('with-unit');
        const wrap = document.createElement('span');
        wrap.className = 'unit-wrap';
        const suffix = document.createElement('span');
        suffix.className = 'unit';
        suffix.textContent = unit;
        control.classList.add('control');
        control.disabled = !editing();
        wrap.append(control, suffix);
        host.append(wrap);
        if (resettable) addReset(row, host);
        return control;
      }
    }
    control.classList.add('control');
    control.disabled = !editing();
    host.append(control);
    if (resettable) addReset(row, host);
    return control;
  };

  const addReset = (row: InspectedRow, host: HTMLElement) => {
    if (!row.present || row.required || !editing()) return;
    const reset = button('', ICONS.close, row.fallback !== undefined ? `Reset to ${format(row.fallback)}` : 'Remove');
    reset.classList.add('reset');
    reset.addEventListener('click', (event) => {
      event.preventDefault();
      options.edit!(row.path, undefined, `Reset ${labelOf(row).toLowerCase()}`);
    });
    host.append(reset);
  };

  /**
   * Drag a label sideways to change its number: live in the box, one edit
   * on release. Shift for ten times the step, Alt for a tenth.
   */
  const scrub = (handle: HTMLElement, field: HTMLInputElement, step: number, path?: PathSegment[], store: (shown: number) => number = (v) => v) => {
    if (!editing()) return;
    handle.classList.add('scrub');
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const start = Number(field.value || field.placeholder) || 0;
      const x0 = event.clientX;
      let moved = false;
      handle.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) => {
        const factor = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 2) moved = true;
        if (!moved) return;
        const value = start + Math.round(dx / 2) * step * factor;
        field.value = String(Math.round(value * 1e4) / 1e4);
        if (path) options.preview?.(path, store(Number(field.value)));
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        if (path && moved) options.preview?.(path, undefined);
        if (moved) field.dispatchEvent(new Event('change'));
        else field.focus();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  };

  // --- Shared ------------------------------------------------------------

  const termFor = (row: InspectedRow, depth: number): HTMLElement => {
    const term = document.createElement('dt');
    term.style.paddingLeft = `${depth * 12}px`;
    term.textContent = labelOf(row);
    if (row.description || row.kind !== 'unknown') {
      term.title = [row.description, row.kind !== 'unknown' ? `(${row.kind}${row.unit ? `, ${row.unit}` : ''})` : '']
        .filter(Boolean).join(' ');
    }
    if (row.required) term.classList.add('required');
    return term;
  };

  const issueFor = (row: InspectedRow) => issues.find((issue) => issue.path === formatPath(row.path));

  const markIssue = (row: InspectedRow, term: HTMLElement, detail: HTMLElement) => {
    const issue = issueFor(row);
    if (!issue) return;
    term.classList.add('invalid');
    detail.classList.add('invalid');
    detail.title = issue.message;
  };

  /** The problem under the row it names, spanning both columns. */
  const appendIssueLine = (list: HTMLElement, row: InspectedRow) => {
    const issue = issueFor(row);
    if (!issue || !options.edit) return;
    const line = document.createElement('div');
    line.className = 'row-issue';
    line.textContent = issue.message;
    list.append(line);
  };

  const enterBlurs = (field: HTMLInputElement, revert: () => void) => {
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') field.blur();
      if (event.key === 'Escape') { revert(); field.blur(); }
    });
  };

  let last: { title: string; rows: InspectedRow[]; show: ShowOptions } | null = null;
  const rerender = () => { if (last) render(last.title, last.rows, last.show); };

  return {
    show(title, rows, show = {}) {
      readOnly = show.readOnly === true;
      issues = show.issues ?? [];
      last = { title, rows, show };
      render(title, rows, show);
    },
    clear(message = 'Select something in the scene tree.') {
      issues = [];
      last = null;
      render('Inspector', []);
      const empty = container.querySelector('.empty');
      if (empty) empty.textContent = message;
    },
    reveal(path) {
      if (last?.show.groups?.length) {
        // The top-level row the path is under names the tab.
        const row = last.rows.find((each) => {
          const own = formatPath(each.path);
          return path === own || path.startsWith(`${own}.`) || path.startsWith(`${own}[`);
        });
        if (row) {
          const groups = last.show.groups;
          const rest = groups.find((group) => group.rest) ?? groups[groups.length - 1]!;
          const group = groups.find((each) => each.keys.includes(row.key)) ?? rest;
          activeTab.set(last.show.kind ?? last.title, group.id);
        }
        // Unfold every card and section on the way to it.
        for (const prefix of prefixesOf(path)) folded.delete(prefix);
        rerender();
      }
      const target = container.querySelector(`[data-path="${CSS.escape(path)}"]`);
      target?.scrollIntoView?.({ block: 'center' });
    }
  };
}

/** Every ancestor of a formatted path, as formatted paths: `a.b[0].c` → `a`, `a.b`, `a.b[0]`. */
function prefixesOf(path: string): string[] {
  const prefixes: string[] = [];
  for (let i = 1; i < path.length; i++) {
    if (path[i] === '.' || path[i] === '[') prefixes.push(path.slice(0, i));
  }
  return prefixes;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function swatch(colour: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'swatch';
  chip.style.background = colour;
  return chip;
}

function button(text: string, icon: string, title: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = text ? 'mini' : 'mini icon-only';
  element.title = title;
  element.append(iconElement(icon));
  if (text) element.append(document.createTextNode(text));
  return element;
}
