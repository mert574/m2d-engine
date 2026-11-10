/// <reference path="./engine.d.ts" />
/**
 * The canonical scene and manifest writer.
 *
 * The loader reads JSON; until now nothing wrote it, so every file was
 * formatted by whoever touched it last and a generated scene was one long
 * line. This module is the one way a scene document becomes text, for the
 * editor's saves, the generator scripts and anything else — so that a
 * save, a regeneration and a hand edit produce diffs against the same
 * canonical form.
 *
 * The form, and why:
 *
 * - **Key order is the schema's declaration order.** The same descriptors
 *   that validate a document say what order its fields are discussed in,
 *   so a saved file reads like the format reference. Keys the schema does
 *   not know (actor `properties`, constraint params and other `s.any`
 *   regions) keep the document's own order — the writer never invents an
 *   order it would have to defend.
 * - **Fields equal to their schema `default` are omitted.** The loader
 *   puts them back, so this is lossless through a load — and it keeps a
 *   saved file as short as a hand-written one. Values equal to an
 *   `initial` are kept: `initial` is inspector metadata the loader never
 *   applies, so omitting those would change what loads.
 * - **A value prints on one line when it fits.** Within the line width, an
 *   object or array is inline; past it, one entry per line. A long array
 *   of short tuples (prop placements, animation frames) therefore packs
 *   one tuple per line, which is the shape a reviewer can scan and a
 *   diff can address.
 *
 * The writer formats; it does not validate. A document that needs
 * checking goes through `SceneLoader` first, which is the one validator.
 * Writing is idempotent — formatting the writer's own output changes
 * nothing — which is what makes "saved byte for byte" a meaningful test.
 */

import type { SchemaDescriptor } from 'm2d-engine/core/schema.js';
import { resolveDescriptor, isPlainObject } from './descriptors.ts';
import { schemaForType } from 'm2d-engine/core/sceneSchema.js';
import { MANIFEST_SCHEMA } from 'm2d-engine/core/assetSchema.js';

/** Lines try to stay within this, indentation included. */
const WIDTH = 100;
const INDENT = '  ';

/** Thrown for a value JSON cannot carry. `path` names the field. */
export class WriteError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`Writer at ${path || '(document)'}: ${message}`);
    this.name = 'WriteError';
    this.path = path;
  }
}

/**
 * A scene document as canonical JSON text, schema picked by its `type`.
 * The document is formatted as-is; validate it with `SceneLoader` first.
 */
export function writeScene(doc: unknown): string {
  const type = isPlainObject(doc) && typeof doc.type === 'string' ? doc.type : null;
  const schema = type === null ? null : schemaForType(type);
  if (!schema) {
    throw new WriteError('type', `a scene document needs a type of 'level' or 'ui', got ${JSON.stringify(type)}`);
  }
  return write(doc, schema);
}

/** An asset manifest as canonical JSON text. */
export function writeManifest(doc: unknown): string {
  return write(doc, MANIFEST_SCHEMA);
}

/** Any document against any descriptor; the two entry points above, generalized. */
export function write(doc: unknown, schema: SchemaDescriptor): string {
  if (!isPlainObject(doc)) throw new WriteError('', 'the document must be an object');
  return render(doc, schema, '', 0, true) + '\n';
}

// Descriptor resolution is shared with the inspector; a writer resolves
// with no registries, so dynamic regions (constraint params, actor
// properties) keep the document's own key order.
const resolve = (desc: SchemaDescriptor | null, value: unknown) => resolveDescriptor(desc, value);

/** Deep equality over JSON shapes, for comparing a value to its default. */
function equalsDefault(value: unknown, fallback: unknown): boolean {
  if (Object.is(value, fallback)) return true;
  if (Array.isArray(value) && Array.isArray(fallback)) {
    return value.length === fallback.length && value.every((entry, i) => equalsDefault(entry, fallback[i]));
  }
  if (isPlainObject(value) && isPlainObject(fallback)) {
    const keys = Object.keys(value);
    return keys.length === Object.keys(fallback).length
      && keys.every(key => key in fallback && equalsDefault(value[key], fallback[key]));
  }
  return false;
}

function render(
  value: unknown, desc: SchemaDescriptor | null, path: string, depth: number, forceBlock = false
): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new WriteError(path, `${value} cannot be written as JSON`);
      return JSON.stringify(value);
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'object':
      return Array.isArray(value)
        ? renderArray(value, desc, path, depth)
        : renderObject(value as Record<string, unknown>, desc, path, depth, forceBlock);
    default:
      throw new WriteError(path, `a ${typeof value} cannot be written as JSON`);
  }
}

function renderObject(
  value: Record<string, unknown>, desc: SchemaDescriptor | null,
  path: string, depth: number, forceBlock: boolean
): string {
  const resolved = resolve(desc, value);
  const fields = resolved?.kind === 'object' ? resolved.fields ?? null : null;
  const valueDesc = resolved?.kind === 'record' ? resolved.value ?? null : null;

  // Schema-known keys first, in declaration order; anything else (and
  // everything, in a record or an unknown region) in document order.
  const keys = fields
    ? [...Object.keys(fields).filter(key => key in value),
      ...Object.keys(value).filter(key => !(key in fields))]
    : Object.keys(value);

  const parts: string[] = [];
  for (const key of keys) {
    const entry = value[key];
    if (entry === undefined) continue;
    const field = fields?.[key] ?? valueDesc;
    if (field?.default !== undefined && equalsDefault(entry, field.default)) continue;
    const childPath = path ? `${path}.${key}` : key;
    parts.push(`${JSON.stringify(key)}: ${render(entry, field ?? null, childPath, depth + 1)}`);
  }

  if (parts.length === 0) return '{}';
  return block(parts, '{', '}', depth, forceBlock, ' ');
}

function renderArray(
  value: unknown[], desc: SchemaDescriptor | null, path: string, depth: number
): string {
  const resolved = resolve(desc, value);
  const parts = value.map((entry, i) => {
    const item = resolved?.kind === 'array' ? resolved.item ?? null
      : resolved?.kind === 'tuple' ? resolved.items?.[i] ?? null
        : null;
    return render(entry, item, `${path}[${i}]`, depth + 1);
  });

  if (parts.length === 0) return '[]';
  return block(parts, '[', ']', depth, false, '');
}

/** One line when every part is and the line fits; otherwise one part per line. */
function block(
  parts: string[], open: string, close: string, depth: number, forceBlock: boolean, pad: string
): string {
  if (!forceBlock && parts.every(part => !part.includes('\n'))) {
    const inline = `${open}${pad}${parts.join(', ')}${pad}${close}`;
    if (depth * INDENT.length + inline.length <= WIDTH) return inline;
  }
  const inner = INDENT.repeat(depth + 1);
  return `${open}\n${inner}${parts.join(`,\n${inner}`)}\n${INDENT.repeat(depth)}${close}`;
}
