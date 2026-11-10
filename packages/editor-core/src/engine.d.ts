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
  }

  export const s: Record<string, (...args: never[]) => SchemaDescriptor>;
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

declare module 'm2d-engine/core/sceneLoader.js' {
  export const SCENE_VERSION: number;
  export class SceneLoader {
    constructor(game: unknown);
    load(data: unknown): Record<string, unknown>;
  }
}
