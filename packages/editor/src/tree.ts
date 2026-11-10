/**
 * The scene tree panel: the document's outline, rendered.
 *
 * Plain DOM over `sceneOutline`'s nodes. Groups fold (their state survives
 * a re-render), a filter narrows the rows to matches and their ancestors,
 * each kind has its glyph, and a node with problems under it carries a
 * badge. Selection is a path into the document — the address the
 * inspector reads and an edit writes to; a pick in the viewport selects
 * here too, and a double-click asks for the node to be framed.
 */

import type { OutlineNode, PathSegment } from 'm2d-editor-core';
import { ICONS, KIND_ICONS, iconElement } from './icons.ts';

export interface TreeHandle {
  /** Re-render for a new or changed document. */
  show(root: OutlineNode): void;
  /** The selected node's path, or null. */
  selection(): PathSegment[] | null;
  /** Select a node from elsewhere (a pick in the viewport); no callback. */
  select(path: PathSegment[] | null): void;
  /** Problem counts by document path; a node shows the sum at and under it. */
  setProblems(paths: PathSegment[][]): void;
}

export interface TreeOptions {
  /** A node was double-clicked: frame it. */
  activate?: (node: OutlineNode) => void;
}

const pathKey = (path: PathSegment[]) => JSON.stringify(path);
const startsWith = (path: PathSegment[], prefix: PathSegment[]) => prefix.every((segment, i) => path[i] === segment);

export function createTree(
  container: HTMLElement,
  onSelect: (node: OutlineNode) => void,
  options: TreeOptions = {}
): TreeHandle {
  let selected: string | null = null;
  let root: OutlineNode | null = null;
  let query = '';
  let problems: PathSegment[][] = [];
  /** Folded nodes, by path key. Big groups start folded the first time they are seen. */
  const folded = new Set<string>();
  const seen = new Set<string>();

  container.replaceChildren();
  const header = document.createElement('div');
  header.className = 'panel-header';
  const heading = document.createElement('h2');
  heading.textContent = 'Scene';
  const count = document.createElement('span');
  count.className = 'count';
  header.append(heading, count);

  const search = document.createElement('label');
  search.className = 'search';
  search.append(iconElement(ICONS.search));
  const filter = document.createElement('input');
  filter.type = 'search';
  filter.placeholder = 'Filter objects';
  filter.setAttribute('aria-label', 'Filter the scene tree');
  search.append(filter);

  const body = document.createElement('div');
  body.className = 'tree-body';
  body.setAttribute('role', 'tree');
  container.append(header, search, body);

  filter.addEventListener('input', () => {
    query = filter.value.trim().toLowerCase();
    render();
  });

  const matches = (node: OutlineNode): boolean =>
    !query || node.label.toLowerCase().includes(query) || (node.detail ?? '').toLowerCase().includes(query);
  /** Whether the node or anything under it matches the filter. */
  const visible = (node: OutlineNode): boolean => matches(node) || (node.children ?? []).some(visible);

  let rows = 0;
  const render = (): void => {
    body.replaceChildren();
    rows = 0;
    if (!root) return;
    body.append(nodeRow(root, 0));
    count.textContent = query ? `${rows} shown` : '';
  };

  const nodeRow = (node: OutlineNode, depth: number): HTMLElement => {
    const key = pathKey(node.path);
    const children = (node.children ?? []).filter(visible);
    if (!seen.has(key)) {
      seen.add(key);
      // A six-hundred-object layer folded, so it does not bury what follows.
      if ((node.kind === 'group' || node.kind === 'layer') && (node.children?.length ?? 0) > 60) folded.add(key);
    }
    const open = !folded.has(key) || !!query;

    const wrap = document.createElement('div');
    wrap.className = 'node';
    wrap.setAttribute('role', 'treeitem');

    const row = document.createElement('button');
    row.type = 'button';
    row.className = `row kind-${node.kind}`;
    row.style.paddingLeft = `${4 + depth * 14}px`;
    row.dataset.path = key;
    rows++;

    const twist = document.createElement('span');
    twist.className = 'twist';
    if (node.children?.length) {
      twist.append(iconElement(ICONS.chevron));
      twist.classList.toggle('open', open);
      twist.title = open ? 'Fold' : 'Unfold';
      twist.addEventListener('click', (event) => {
        event.stopPropagation();
        if (folded.has(key)) folded.delete(key); else folded.add(key);
        render();
      });
    }
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.append(iconElement(KIND_ICONS[node.kind] ?? KIND_ICONS.object!));
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = node.label;
    row.append(twist, glyph, label);
    if (node.detail) {
      const detail = document.createElement('span');
      detail.className = 'detail';
      detail.textContent = node.detail;
      row.append(detail);
    }
    const issues = problems.filter((path) => startsWith(path, node.path)).length;
    if (issues) {
      const badge = document.createElement('span');
      badge.className = 'badge problem';
      badge.textContent = String(issues);
      badge.title = `${issues} problem${issues === 1 ? '' : 's'}`;
      row.append(badge);
    }

    row.addEventListener('click', () => {
      selected = key;
      for (const other of body.querySelectorAll('.row.selected')) other.classList.remove('selected');
      row.classList.add('selected');
      onSelect(node);
    });
    row.addEventListener('dblclick', () => options.activate?.(node));
    if (selected === key) row.classList.add('selected');

    wrap.append(row);
    if (open) for (const child of children) wrap.append(nodeRow(child, depth + 1));
    return wrap;
  };

  /** Unfold every ancestor of a path, so a selection made elsewhere shows. */
  const reveal = (path: PathSegment[]): boolean => {
    let changed = false;
    for (let i = 0; i < path.length; i++) if (folded.delete(pathKey(path.slice(0, i)))) changed = true;
    return changed;
  };

  // Up and down walk the visible rows.
  body.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const all = [...body.querySelectorAll<HTMLButtonElement>('.row')];
    const at = all.findIndex((row) => row.classList.contains('selected'));
    const next = all[Math.max(0, Math.min(all.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      event.preventDefault();
      next.click();
      next.focus();
    }
  });

  return {
    show(next) {
      root = next;
      render();
    },
    selection: () => (selected ? JSON.parse(selected) as PathSegment[] : null),
    select(path) {
      selected = path ? pathKey(path) : null;
      if (path && reveal(path)) render();
      for (const other of body.querySelectorAll('.row.selected')) other.classList.remove('selected');
      if (!selected) return;
      const row = [...body.querySelectorAll<HTMLElement>('.row')].find((each) => each.dataset.path === selected);
      row?.classList.add('selected');
      row?.scrollIntoView?.({ block: 'nearest' });
    },
    setProblems(paths) {
      problems = paths;
      render();
    }
  };
}
