/**
 * A scene document as a tree: what the editor's scene panel shows.
 *
 * Built from the document, not from a running game — the tree must show
 * a scene that fails to materialize (that is when an editor is most
 * needed), and it shows structure a live scene flattens away: prefabs,
 * layers as groups, props as placements. Every node carries the path of
 * the thing it stands for, which is what the inspector looks up and what
 * a command (E2) will address.
 */

import { isPlainObject, type PathSegment } from './descriptors.ts';

export interface OutlineNode {
  /** What the row says: an id, a prefab name, 'Layer main'. */
  label: string;
  /** Muted text beside it: the actor, a count. */
  detail?: string;
  kind: 'scene' | 'world' | 'background' | 'group' | 'prefab' | 'layer' | 'object' | 'props' | 'tileLayer' | 'element';
  /** Into the document, for the inspector; empty for the scene itself. */
  path: PathSegment[];
  children?: OutlineNode[];
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** The tree for a scene document. Tolerates any shape; shows what is there. */
export function sceneOutline(doc: unknown): OutlineNode {
  const data = isPlainObject(doc) ? doc : {};
  const children: OutlineNode[] = [];

  if (isPlainObject(data.world)) {
    children.push({ label: 'World', kind: 'world', path: ['world'] });
  }
  if (isPlainObject(data.background)) {
    children.push({ label: 'Background', kind: 'background', path: ['background'] });
  }

  if (isPlainObject(data.prefabs)) {
    const prefabs = Object.entries(data.prefabs).map(([name, prefab]): OutlineNode => ({
      label: name,
      detail: isPlainObject(prefab) ? str(prefab.actor) : undefined,
      kind: 'prefab',
      path: ['prefabs', name]
    }));
    if (prefabs.length) {
      children.push({ label: 'Prefabs', kind: 'group', path: ['prefabs'], children: prefabs });
    }
  }

  const layers = Array.isArray(data.layers) ? data.layers : [];
  layers.forEach((layer, index) => {
    if (!isPlainObject(layer)) return;
    const rows: OutlineNode[] = [];
    const objects = Array.isArray(layer.objects) ? layer.objects : [];
    objects.forEach((object, objectIndex) => {
      if (!isPlainObject(object)) return;
      rows.push({
        label: str(object.id) ?? `#${objectIndex}`,
        detail: str(object.prefab),
        kind: 'object',
        path: ['layers', index, 'objects', objectIndex]
      });
    });
    const props = Array.isArray(layer.props) ? layer.props : [];
    props.forEach((prop, propIndex) => {
      if (!isPlainObject(prop)) return;
      const count = Array.isArray(prop.instances) ? prop.instances.length : 0;
      rows.push({
        label: str(prop.id) ?? `#${propIndex}`,
        detail: `${str(prop.prefab) ?? '?'} ×${count}`,
        kind: 'props',
        path: ['layers', index, 'props', propIndex]
      });
    });
    children.push({
      label: `Layer ${str(layer.name) ?? index}`,
      detail: rows.length ? `${rows.length}` : undefined,
      kind: 'layer',
      path: ['layers', index],
      children: rows
    });
  });

  const tileLayers = Array.isArray(data.tileLayers) ? data.tileLayers : [];
  tileLayers.forEach((layer, index) => {
    if (!isPlainObject(layer)) return;
    children.push({
      label: `Tiles ${str(layer.name) ?? index}`,
      kind: 'tileLayer',
      path: ['tileLayers', index]
    });
  });

  const elements = Array.isArray(data.elements) ? data.elements : [];
  if (elements.length) {
    children.push({
      label: 'Elements',
      kind: 'group',
      path: ['elements'],
      children: elements.flatMap((element, index): OutlineNode[] => isPlainObject(element) ? [{
        label: str(element.id) ?? `#${index}`,
        detail: str(element.type),
        kind: 'element',
        path: ['elements', index]
      }] : [])
    });
  }

  return {
    label: str(data.name) ?? 'scene',
    detail: str(data.type),
    kind: 'scene',
    path: [],
    children
  };
}
