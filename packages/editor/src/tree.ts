/**
 * The scene tree panel: the document's outline, rendered.
 *
 * Plain DOM over `sceneOutline`'s nodes — the chrome decision in action.
 * Selection is a path into the document, the same address the inspector
 * reads and a command (E2) will write to.
 */

import type { OutlineNode, PathSegment } from 'm2d-editor-core';

export interface TreeHandle {
  /** Re-render for a new document. */
  show(root: OutlineNode): void;
  /** The selected node's path, or null. */
  selection(): PathSegment[] | null;
}

const pathKey = (path: PathSegment[]) => JSON.stringify(path);

export function createTree(
  container: HTMLElement,
  onSelect: (node: OutlineNode) => void
): TreeHandle {
  let selected: string | null = null;

  const render = (root: OutlineNode): void => {
    container.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = 'Scene';
    container.append(heading, nodeRow(root, 0));
  };

  const nodeRow = (node: OutlineNode, depth: number): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.className = 'node';

    const row = document.createElement('button');
    row.type = 'button';
    row.className = `row kind-${node.kind}`;
    row.style.paddingLeft = `${6 + depth * 14}px`;
    row.dataset.path = pathKey(node.path);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = node.label;
    row.append(label);
    if (node.detail) {
      const detail = document.createElement('span');
      detail.className = 'detail';
      detail.textContent = node.detail;
      row.append(detail);
    }

    row.addEventListener('click', () => {
      selected = pathKey(node.path);
      for (const other of container.querySelectorAll('.row.selected')) other.classList.remove('selected');
      row.classList.add('selected');
      onSelect(node);
    });
    if (selected === row.dataset.path) row.classList.add('selected');

    wrap.append(row);
    for (const child of node.children ?? []) wrap.append(nodeRow(child, depth + 1));
    return wrap;
  };

  return {
    show: render,
    selection: () => (selected ? JSON.parse(selected) as PathSegment[] : null)
  };
}
