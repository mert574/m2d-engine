/**
 * Hand-written declarations for the engine modules this package imports.
 *
 * The engine is plain JavaScript whose JSDoc nothing checks yet (the Types
 * item in docs/contributing/roadmap.md). Rather than let those imports
 * collapse to `any`, the surface this package actually uses is declared
 * here, precisely. When the engine gains checked types, this file shrinks
 * to nothing and the imports resolve for real.
 */

declare module 'm2d-engine/core/schema.js' {
  /**
   * A schema descriptor as `core/schema.js` builds them: a frozen object
   * with a `kind` and the options of that kind. The writer walks these;
   * the fields below are the ones it reads.
   */
  export interface SchemaDescriptor {
    kind: string;
    /** `object`: field name to descriptor, in declaration order. */
    fields?: Record<string, SchemaDescriptor>;
    /** `record`: the descriptor every value validates against. */
    value?: SchemaDescriptor;
    /** `array`: the descriptor every element validates against. */
    item?: SchemaDescriptor;
    /** `tuple`: one descriptor per position. */
    items?: SchemaDescriptor[];
    /** `union`: branches, each with an optional `match`. */
    branches?: SchemaDescriptor[];
    /** `union` branch: whether this branch claims the value. */
    match?: (value: unknown) => boolean;
    /** `tagged`: the field whose value picks the variant. */
    tag?: string;
    /** `tagged`: tag value to object descriptor. */
    variants?: Record<string, SchemaDescriptor>;
    /** `dynamic`: resolves the descriptor for a value, or null. */
    select?: (value: unknown, ctx: unknown) => SchemaDescriptor | null;
    /** Applied by `validate` when the field is absent. */
    default?: unknown;
    /** Inspector metadata: what a new object starts with. Never applied on load. */
    initial?: unknown;
    /** `enum`: the allowed values. */
    values?: unknown[];
    /** `ref`: the namespace it points into ('prefab', 'spritesheet', ...). */
    scope?: string;
    /** Inspector metadata, carried through untouched by validation. */
    label?: string;
    description?: string;
    unit?: string;
    /** The widget hint: 'color', 'asset', 'file', 'keys', 'cursor', 'font'. */
    editor?: string;
    /** True, or a predicate on the containing object. */
    required?: boolean | ((parent: unknown) => boolean);
  }

  /** The descriptor builders, as `core/schema.js` exports them. */
  export interface SchemaBuilders {
    number(options?: Record<string, unknown>): SchemaDescriptor;
    integer(options?: Record<string, unknown>): SchemaDescriptor;
    string(options?: Record<string, unknown>): SchemaDescriptor;
    boolean(options?: Record<string, unknown>): SchemaDescriptor;
    enumOf(values: unknown[], options?: Record<string, unknown>): SchemaDescriptor;
    object(fields: Record<string, SchemaDescriptor>, options?: Record<string, unknown>): SchemaDescriptor;
    record(value: SchemaDescriptor, options?: Record<string, unknown>): SchemaDescriptor;
    array(item: SchemaDescriptor, options?: Record<string, unknown>): SchemaDescriptor;
    tuple(items: SchemaDescriptor[], options?: Record<string, unknown>): SchemaDescriptor;
    union(branches: SchemaDescriptor[], options?: Record<string, unknown>): SchemaDescriptor;
    tagged(tag: string, variants: Record<string, SchemaDescriptor>, options?: Record<string, unknown>): SchemaDescriptor;
    ref(scope: string, options?: Record<string, unknown>): SchemaDescriptor;
    dynamic(select: (value: unknown, ctx: unknown) => SchemaDescriptor | null, options?: Record<string, unknown>): SchemaDescriptor;
    any(options?: Record<string, unknown>): SchemaDescriptor;
  }
  export const s: SchemaBuilders;
  export function fieldsOf(desc: SchemaDescriptor): Array<{ key: string } & SchemaDescriptor>;
  export function refScopesOf(desc: SchemaDescriptor): string[];
  export function validate(desc: SchemaDescriptor, value: unknown, ctx: unknown): unknown;
}

declare module 'm2d-engine/core/sceneSchema.js' {
  import type { SchemaDescriptor } from 'm2d-engine/core/schema.js';
  export const SCENE_VERSION: number;
  export const LEVEL_SCHEMA: SchemaDescriptor;
  export const UI_SCHEMA: SchemaDescriptor;
  export function schemaForType(type: string): SchemaDescriptor | null;
}

declare module 'm2d-engine/core/assetSchema.js' {
  import type { SchemaDescriptor } from 'm2d-engine/core/schema.js';
  export const MANIFEST_VERSION: number;
  export const MANIFEST_SCHEMA: SchemaDescriptor;
}

declare module 'm2d-engine/core/entity.js' {
  export class Entity {
    constructor(body: unknown, sprite: unknown, game: unknown, options?: unknown);
    static properties: Record<string, unknown> | null;
    name: string;
  }
}

declare module 'm2d-engine/core/constraint.js' {
  export class Constraint {
    constructor(entity?: unknown, options?: unknown);
    static params: Record<string, unknown> | null;
  }
}

declare module 'm2d-engine/core/sceneLoader.js' {
  export const SCENE_VERSION: number;
  export class SceneValidationError extends Error {
    path: string;
    detail: string;
  }
  export class SceneLoader {
    constructor(game: unknown);
    load(data: unknown): Record<string, unknown>;
    check(data: unknown): { loaded: Record<string, unknown> | null; issues: SceneValidationError[] };
  }
}
