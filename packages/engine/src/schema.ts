// The data formats and their validation: the schema vocabulary, the scene,
// asset manifest and project schemas, and the scene loader. Loads without
// a DOM, so headless tooling (the editor core, a build script) imports it
// without the rest of the engine.
export { s, validate, fieldsOf, refScopesOf } from './core/schema.ts';
export type {
  SchemaKind, SchemaOptions, SchemaDescriptor, SchemaField, ValidateContext, SelectContext, RefScope, RefineContext, Infer
} from './core/schema.ts';
export {
  SCENE_VERSION, BODY_TYPES, BODY_SHAPES, MESH_SHAPES, LIGHT_TYPES, DIMENSIONS, BUTTON_VARIANTS, SORT_MODES,
  DEFAULT_OBJECT_SIZE, RULE_EVENTS, RULE_ACTIONS, PRESENTATION_ACTIONS, ELEMENT_MOTIONS, SELECT_EFFECTS,
  SCENE_TRANSITIONS, BACKDROP_WASH_SIDES, MENU_ITEM_VARIANTS, UI_KINDS, HUD_KINDS, LEVEL_SCHEMA, UI_SCHEMA,
  constraintParamsSchema, actorPropertyFields, actorPropertiesSchema, schemaForType
} from './core/sceneSchema.js';
export { MANIFEST_VERSION, ASSET_TYPES, MANIFEST_SCHEMA } from './core/assetSchema.ts';
export {
  PROJECT_FILE, PROJECT_SCHEMA, DISPLAY_KEYS, choiceValue, checkProject, projectIssues, sceneNameOf
} from './core/projectSchema.ts';
export { SceneLoader, SceneValidationError } from './core/sceneLoader.js';
