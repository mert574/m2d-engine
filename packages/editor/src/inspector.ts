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
 * - leaf fields are inputs chosen by kind and hint — numbers with their
 *   unit (angles shown in degrees, stored in radians), checkboxes, enum and
 *   ref choices, colours, text — and a number's label scrubs its value
 *   when dragged (Shift ×10, Alt ×0.1);
 * - an object's placement reads as vector rows: Position, Size, and for a
 *   3D object Rotation as yaw, pitch and roll over the stored quaternion;
 * - object fields are folding sections; an absent block can be added, a
 *   set optional one removed, a list's entries removed or one appended;
 * - the loader's problems under the node are listed, and each sits on the
 *   row its path names.
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
}

export interface ShowOptions {
  readOnly?: boolean;
  /** The loader's problems at or under this node. */
  issues?: ValidationIssue[];
  /** A chip beside the title: the node's kind. */
  kind?: string;
}

export interface InspectorHandle {
  /** Show a node's rows under a title; empty rows show a note instead. */
  show(title: string, rows: InspectedRow[], options?: ShowOptions): void;
  clear(message?: string): void;
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

const isBlock = (row: InspectedRow) => row.kind === 'object' || row.kind === 'record';
const isList = (row: InspectedRow) => row.kind === 'array';

/** Whether a row is a single value an input can hold. */
function editableLeaf(row: InspectedRow): boolean {
  if (row.children?.length || row.summary) return false;
  if (['number', 'boolean', 'enum', 'string', 'ref', 'id'].includes(row.kind)) return true;
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
    step: degrees ? 1 : row.unit === 'px' ? 1 : 0.01
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
    const list = document.createElement('dl');
    list.className = 'fields';
    if (options.edit) appendEditable(list, rows, 0);
    else for (const row of rows) appendReadOnly(list, row, 0);
    container.append(list);
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
    if (depth === 0) {
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
      else if (isBlock(row) || isList(row)) appendSection(list, row, depth);
      else appendLeaf(list, row, depth, parent);
    }
  };

  /** A folding section for an object, a record or a list. */
  const appendSection = (list: HTMLElement, row: InspectedRow, depth: number): void => {
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

    const meta = document.createElement('span');
    meta.className = 'muted';
    const size = Array.isArray(row.value) ? row.value.length : row.value && typeof row.value === 'object' ? Object.keys(row.value).length : 0;
    meta.textContent = row.summary ?? (isList(row) ? `${size} item${size === 1 ? '' : 's'}` : '');
    detail.append(meta);
    if (editing()) {
      if (isList(row) && Array.isArray(row.value) && row.value.length && !row.summary) {
        const add = button('', ICONS.plus, 'Add an item (a copy of the last)');
        add.addEventListener('click', () => {
          const items = row.value as unknown[];
          options.list?.({ op: 'insert', path: row.path, index: items.length, value: structuredClone(items.at(-1)) }, `Add to ${labelOf(row)}`);
        });
        detail.append(add);
      }
      if (!row.required) {
        const remove = button('', ICONS.close, `Remove ${labelOf(row).toLowerCase()}`);
        remove.classList.add('reset');
        remove.addEventListener('click', () => options.edit!(row.path, undefined, `Remove ${labelOf(row).toLowerCase()}`));
        detail.append(remove);
      }
    }
    list.append(term, detail);
    if (open && row.children?.length) appendEditable(list, row.children, depth + 1, row);
  };

  /** One field: a label (that scrubs, for a number) and its control. */
  const appendLeaf = (list: HTMLElement, row: InspectedRow, depth: number, parent?: InspectedRow): void => {
    const term = termFor(row, depth);
    const detail = document.createElement('dd');
    detail.dataset.key = row.key;
    detail.dataset.path = formatPath(row.path);
    markIssue(row, term, detail);
    if (editableLeaf(row)) {
      if (!row.present) detail.classList.add('unset');
      const control = input(row, detail);
      if (control instanceof HTMLInputElement && control.type === 'number') scrub(term, control, display(row).step);
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
    list.append(term, detail);
    appendIssueLine(list, row);
  };

  /** Position or Size: one row of labelled number boxes. */
  const appendVector = (list: HTMLElement, label: string, parts: InspectedRow[], letters: string[]): void => {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.className = 'vector';
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
      const control = input(part, cell, { compact: true });
      if (control instanceof HTMLInputElement) scrub(letter, control, display(part).step);
      detail.append(cell);
    });
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
  const input = (row: InspectedRow, host: HTMLElement, { compact = false } = {}): HTMLElement => {
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
      const numeric = row.kind === 'number' || (row.kind === 'unknown' && typeof shown === 'number');
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
        addReset(row, host);
        return control;
      }
    }
    control.classList.add('control');
    control.disabled = !editing();
    host.append(control);
    addReset(row, host);
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
  const scrub = (handle: HTMLElement, field: HTMLInputElement, step: number) => {
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
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
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
    }
  };
}

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
