/**
 * The inspector panel: one node's fields, rendered from the rows
 * `inspectNode` generated out of the engine's own descriptors.
 *
 * Read-only in E1. Every declared field shows whether or not the
 * document sets it — an absent one shows what absence means (the
 * schema's default or the actor's initial), muted. E2 turns these rows
 * into inputs that emit commands.
 */

import type { InspectedRow } from 'm2d-editor-core';

export interface InspectorHandle {
  /** Show a node's rows under a title; empty rows show a note instead. */
  show(title: string, rows: InspectedRow[]): void;
  clear(message?: string): void;
}

/** A value as the row's text: compact, never multiline. */
function format(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function createInspector(container: HTMLElement): InspectorHandle {
  const render = (title: string, rows: InspectedRow[]): void => {
    container.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = title;
    container.append(heading);
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Nothing to show for this node.';
      container.append(empty);
      return;
    }
    const list = document.createElement('dl');
    list.className = 'fields';
    for (const row of rows) appendRow(list, row, 0);
    container.append(list);
  };

  const appendRow = (list: HTMLElement, row: InspectedRow, depth: number): void => {
    const term = document.createElement('dt');
    term.style.paddingLeft = `${depth * 12}px`;
    term.textContent = row.label;
    if (row.description || row.kind !== 'unknown') {
      term.title = [row.description, row.kind !== 'unknown' ? `(${row.kind}${row.unit ? `, ${row.unit}` : ''})` : '']
        .filter(Boolean).join(' ');
    }
    if (row.required) term.classList.add('required');

    const detail = document.createElement('dd');
    detail.dataset.key = row.key;
    const hasChildren = !!row.children?.length;
    if (hasChildren) {
      detail.classList.add('nested');
    } else if (row.summary) {
      detail.classList.add('muted');
      detail.textContent = row.summary;
    } else if (row.present) {
      detail.textContent = format(row.value);
      if (row.editor === 'color' && typeof row.value === 'string') {
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = row.value;
        detail.prepend(swatch);
      }
    } else if (row.fallback !== undefined) {
      // What absence means, shown but visibly not the document's.
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
    for (const child of row.children ?? []) appendRow(list, child, depth + 1);
  };

  return {
    show: render,
    clear(message = 'Select something in the scene tree.') {
      render('Inspector', []);
      const empty = container.querySelector('.empty');
      if (empty) empty.textContent = message;
    }
  };
}
