/**
 * The scene-shaped data the kit ships: prefab fragments a scene copies,
 * which the editor's component library and `list_components` offer.
 *
 * These describe the scene *format*, which the engine validates at load
 * (`core/sceneSchema.js`) — the schema is the authority, and this is the
 * part of it the kit writes, kept loose where the format is open.
 */

/** A prefab as a scene declares it. */
export interface ScenePrefab {
  /** A registered actor's name. */
  actor: string;
  /** The body's kind, layer and material, as `prefabs.*.physics` takes it. */
  physics?: Record<string, unknown>;
  /** The actor's own properties, as its `static properties` declares them. */
  properties?: Record<string, unknown>;
  /** Constraints by slot name, each `{ type, params }`. */
  constraints?: Record<string, { type: string; params?: Record<string, unknown> }>;
  /** A sprite sheet key in `assets.spritesheets`. */
  spritesheet?: string;
  /** The animation it starts on. */
  defaultAnimation?: string;
  /** The 3D look, as `prefabs.*.mesh` takes it. */
  mesh?: Record<string, unknown>;
  /** A light the entity carries, as `prefabs.*.light` takes it. */
  light?: Record<string, unknown>;
}

/** A ready-made prefab the component library offers, with a line on what it is. */
export interface PrefabTemplate {
  /** One line for the card and for `list_components`. */
  description: string;
  /** The one dimension it fits, or absent for both. */
  dimensions?: 2 | 3;
  /** What a scene copies into its `prefabs`. */
  prefab: ScenePrefab;
}
