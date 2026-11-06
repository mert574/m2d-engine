/**
 * The scene format, written as schema descriptors.
 *
 * This is the single definition of what a scene file may contain. The
 * loader validates against it; a visual editor reads the same descriptors
 * to build its inspector, so the two cannot drift. Adding a field to the
 * format means adding it here — and to `docs/reference/scene-format.md`.
 *
 * Cross-references between parts of a scene (an object naming a prefab, a
 * prefab naming a spritesheet or a registered actor, a button naming a
 * scene) are `s.ref` fields. The `scope` names the namespace; `sceneLoader`
 * resolves it per document. That makes every reference in the format
 * discoverable — `refScopesOf(LEVEL_SCHEMA)` lists the pickers an editor
 * has to provide — instead of hiding inside an `if`.
 *
 * Rules that span several fields, or that depend on a sibling, stay as
 * `refine` hooks on the object they belong to: a prefab's `defaultAnimation`
 * has to exist in *its own* spritesheet, and a button must do exactly one
 * thing.
 *
 * See `schema.js` for the descriptor vocabulary.
 */

import { s } from './schema.js';
import { ANCHOR_ORIGINS } from './ui/uiElement.js';
import { PROJECTION_TYPES } from './projection.js';

/**
 * The scene format version this engine reads and writes. A scene declares
 * the version it was written for, and anything else is refused rather than
 * half-understood.
 */
export const SCENE_VERSION = 2;

/**
 * What an `id` may look like: letters, digits, `-`, `_` and `.`, starting
 * with a letter or a digit. Narrow on purpose — an id is used as a map key,
 * shown in an editor's outliner and meant to be readable in a diff, so
 * whitespace and punctuation would only ever be a mistake.
 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * A stable identity, unique within the scene.
 *
 * Required, because identity you cannot rely on is not identity: an
 * editor's selection, its undo entries and any reference from one object to
 * another all need every object to have one, and the loader cannot invent
 * one that stays the same when objects are reordered or the file is saved
 * again.
 */
const identity = (label) => s.string({
  required: true,
  nonEmpty: true,
  pattern: ID_PATTERN,
  label,
  message: value => (typeof value === 'string' && value
    ? `'${value}' is not a valid id: letters, digits, '-', '_' and '.', starting with a letter or digit`
    : 'missing or non-string id')
});

/**
 * Reject a repeated id, naming the second one. Two objects with one id
 * means a reference to it is ambiguous and an editor cannot tell them
 * apart.
 */
function checkUniqueIds(entries, fail) {
  const seen = new Set();
  for (const { id, path } of entries) {
    if (seen.has(id)) fail(path, `duplicate id '${id}'`);
    seen.add(id);
  }
}

/** Physics body types `createEntity` understands. */
export const BODY_TYPES = ['static', 'dynamic', 'kinematic', 'character'];

/** Collider shapes `createEntity` understands. */
export const BODY_SHAPES = ['box', 'circle', 'capsule'];

/** Button variants `setupUIScene` understands. */
export const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'];

/** Entity draw orders `Scene` understands. See Entity.depth. */
export const SORT_MODES = ['depth', 'insertion'];

/** Default object size when a layer object gives none. */
export const DEFAULT_OBJECT_SIZE = 32;

const list = values => values.join(', ');

// === Shared pieces ===

const vector2 = (label) => s.object({
  x: s.number({ required: true }),
  y: s.number({ required: true })
}, { label });

/**
 * A free-form bag passed to an actor's constructor as its `options`. The
 * engine never looks inside it, so neither does validation — the keys an
 * actor understands are the actor's business.
 */
const actorProperties = s.any({
  label: 'Properties',
  description: "Passed to the actor's constructor untouched"
});

/**
 * A property an editor should draw with a particular widget but whose value
 * the engine accepts loosely — a size that may also be a `$token` theme
 * reference. Validated as "anything", hinted for the inspector.
 */
const styled = (editor, label) => s.any({ editor, label });

// === Assets ===

const ANIMATION = s.object({
  frames: s.array(
    s.tuple([s.number(), s.number()], { message: 'must be a [tileX, tileY] pair' }),
    { required: true, minLength: 1, message: 'must be a non-empty array of [tileX, tileY] pairs' }
  ),
  fps: s.number({ min: 0 }),
  loop: s.boolean()
});

const SPRITESHEET = s.object({
  url: s.string({ required: true, editor: 'asset', label: 'Image' }),
  frameWidth: s.number({ required: true, positive: true, unit: 'px' }),
  frameHeight: s.number({ required: true, positive: true, unit: 'px' }),
  animations: s.record(ANIMATION)
});

const ASSETS = s.object({
  spritesheets: s.record(SPRITESHEET)
});

// === World ===

const PROJECTION = s.union([
  s.enumOf(PROJECTION_TYPES, { match: value => typeof value === 'string' }),
  s.object({
    type: s.enumOf(PROJECTION_TYPES, { required: true }),
    ratio: s.number({ positive: true })
  }, { match: value => typeof value === 'object' && value !== null })
], { message: value => `expected one of ${list(PROJECTION_TYPES)}, got ${JSON.stringify(value)}` });

const WORLD = s.object({
  width: s.number({ unit: 'px' }),
  height: s.number({ unit: 'px' }),
  gravity: vector2('Gravity'),
  sort: s.enumOf(SORT_MODES, { label: 'Draw order' }),
  projection: PROJECTION
});

// === Constraints ===

/**
 * The schema for one constraint's `params`: its class's `static params`,
 * as an object descriptor.
 *
 * Defaults are deliberately not applied. A constraint's defaults belong to
 * its constructor, and a scene object that overrides one param must not
 * thereby reset the rest — which is what filling in defaults here would
 * do. `static params` records a default as `initial`, which validation
 * ignores and an inspector shows.
 */
export function constraintParamsSchema(ConstraintClass) {
  return s.object(ConstraintClass?.params ?? {});
}

/**
 * A constraint attached by a prefab or by a placed object.
 *
 * `type` names a class registered with `game.registerConstraint`. It may
 * be omitted when the entry only retunes a constraint that is already
 * there — one the actor added in its constructor, or one the prefab
 * declared — which is how a single placed guard patrols faster than the
 * rest without a new prefab.
 */
function constraintEntry(inheritedType) {
  return s.object({
    type: s.ref('constraint', { label: 'Constraint' }),
    params: s.dynamic((value, ctx) => {
      const type = ctx.parent?.type ?? inheritedType;
      const ConstraintClass = type ? ctx.context?.constraintTypes?.get(type) : null;
      // Nothing names a class here: the entry retunes a constraint its
      // actor attached in code, or there is no registry to ask because the
      // loader has no game. Either way the params are checked when they
      // are applied, where the entity makes the class known.
      return ConstraintClass ? constraintParamsSchema(ConstraintClass) : null;
    }, { label: 'Parameters' })
  });
}

const CONSTRAINTS = s.record(constraintEntry(null), {
  label: 'Constraints',
  description: 'By slot name, as passed to entity.getConstraint'
});

/**
 * The constraints block on a placed object.
 *
 * An entry here usually names no `type`, because it retunes one already
 * attached. When the prefab is the thing that attached it, the type is
 * knowable from this document, so the override's params are checked here
 * rather than left to load time — which is most of them.
 */
const OBJECT_CONSTRAINTS = s.dynamic((value, ctx) => {
  const declared = ctx.context?.prefabs?.[ctx.parent?.prefab]?.constraints;
  return s.record(s.dynamic((entry, entryCtx) => constraintEntry(declared?.[entryCtx.key]?.type)));
}, { label: 'Constraints' });

// === Prefabs ===

const FOOTPRINT = s.object({
  width: s.number({ positive: true, unit: 'px' }),
  height: s.number({ required: true, positive: true, unit: 'px' })
}, { message: 'must be an object with a height and an optional width' });

const PHYSICS = s.object({
  bodyType: s.enumOf(BODY_TYPES, { label: 'Body type' }),
  shape: s.enumOf(BODY_SHAPES, { label: 'Collider' }),
  angle: s.number({ unit: 'rad' }),
  lockRotation: s.boolean(),
  isSensor: s.boolean(),
  friction: s.number({ min: 0 }),
  frictionAir: s.number({ min: 0 }),
  restitution: s.number({ min: 0 }),
  density: s.number({ positive: true }),
  footprint: FOOTPRINT
});

const PREFAB = s.object({
  actor: s.ref('actor', { required: true }),
  spritesheet: s.ref('spritesheet'),
  defaultAnimation: s.string(),
  physics: PHYSICS,
  constraints: CONSTRAINTS
}, {
  // An animation belongs to *this* prefab's sheet, so it cannot be a plain
  // `ref` — the namespace depends on a sibling field.
  refine(prefab, { path, fail, context }) {
    if (prefab.defaultAnimation === undefined) return;
    const animations = context.spritesheets?.[prefab.spritesheet]?.animations;
    // A sheet with no `animations` block gets a single 'default' frame at
    // load time, so there is nothing to check against.
    if (!animations) return;
    if (!(prefab.defaultAnimation in animations)) {
      fail(`${path}.defaultAnimation`,
        `spritesheet '${prefab.spritesheet}' has no animation ` +
        `'${prefab.defaultAnimation}' (has: ${list(Object.keys(animations))})`);
    }
  }
});

/**
 * What a placed object may change about its prefab.
 *
 * Placement (`x`, `width`, `angle`) is the object's own and sits at the
 * top level; this is for the prefab's *definition* — a heavier crate, a
 * recoloured guard — so one object can differ without a prefab of its own.
 * `actor` is deliberately absent: a different actor is a different prefab,
 * not an override of one.
 */
const OVERRIDES = s.object({
  spritesheet: s.ref('spritesheet'),
  defaultAnimation: s.string(),
  physics: PHYSICS
}, { label: 'Overrides' });

// === Layers and objects ===

const OBJECT = s.object({
  id: identity('Id'),
  prefab: s.ref('prefab', { required: true }),
  x: s.number({ required: true, unit: 'px' }),
  y: s.number({ required: true, unit: 'px' }),
  width: s.number({ positive: true, unit: 'px', default: DEFAULT_OBJECT_SIZE }),
  height: s.number({ positive: true, unit: 'px', default: DEFAULT_OBJECT_SIZE }),
  angle: s.number({ unit: 'rad', message: value => `must be a number (radians), got ${JSON.stringify(value)}` }),
  zIndex: s.number({ label: 'Draw order' }),
  constraints: OBJECT_CONSTRAINTS,
  overrides: OVERRIDES,
  properties: actorProperties
});

const LAYER = s.object({
  name: s.string(),
  type: s.string(),
  objects: s.array(OBJECT, { required: true })
});

// === Tile layers ===

const PARALLAX = s.union([
  s.number({ match: value => typeof value === 'number' }),
  s.object({ x: s.number(), y: s.number() },
    { match: value => typeof value === 'object' && value !== null })
], { message: 'must be a number or { "x", "y" }' });

const TILE_LAYER = s.object({
  name: s.string({ required: true, nonEmpty: true }),
  spritesheet: s.ref('spritesheet', { required: true }),
  tileX: s.number(),
  tileY: s.number(),
  zIndex: s.number({ label: 'Draw order' }),
  parallax: PARALLAX,
  repeat: s.boolean(),
  tileSize: s.number({ positive: true, unit: 'px' }),
  scale: s.number({ positive: true }),
  stretch: s.boolean(),
  cells: s.array(
    s.tuple([s.integer(), s.integer()], { message: 'must be an [column, row] pair of integers' }),
    { message: 'must be an array of [column, row] pairs' }
  )
});

const BACKGROUND = s.object({
  spritesheet: s.ref('spritesheet', { required: true }),
  tileX: s.number(),
  tileY: s.number()
});

// === UI elements ===

const ANCHORS = Object.keys(ANCHOR_ORIGINS);

const ELEMENT_COMMON = {
  type: s.string({ required: true }),
  id: identity('Id'),
  // A rect that fills the screen ignores position, so it needs none.
  x: s.number({ required: element => !element.fill, unit: 'px' }),
  y: s.number({ required: element => !element.fill, unit: 'px' }),
  anchor: s.enumOf(ANCHORS, {
    message: value => `unknown anchor ${JSON.stringify(value)} (known: ${list(ANCHORS)})`
  })
};

/** A button must do exactly one thing, and the thing must exist. */
function refineButton(element, { path, fail }) {
  const { action, onClick } = element.properties ?? {};
  if (action && onClick) {
    fail(path, `has both action '${action}' and onClick '${onClick}'; ` +
      'a button does one or the other');
  }
  if (!action && !onClick) {
    fail(path, 'has neither action nor onClick, so clicking it does nothing');
  }
}

const ELEMENTS = s.tagged('type', {
  button: s.object({
    ...ELEMENT_COMMON,
    properties: s.object({
      text: styled('text', 'Label'),
      // Cross-references the scene this button switches to. The check that
      // would have caught the platformer's Settings button, which pointed
      // at a scene nobody registered and failed only on click.
      onClick: s.ref('scene', { label: 'Switch to scene' }),
      action: s.string({ label: 'Action' }),
      width: styled('size'),
      height: styled('size'),
      variant: s.enumOf(BUTTON_VARIANTS),
      fontSize: styled('size'),
      fontFamily: styled('font'),
      fontWeight: styled('font'),
      fontStyle: styled('font'),
      background: styled('color'),
      textColor: styled('color')
    })
  }, { refine: refineButton }),

  text: s.object({
    ...ELEMENT_COMMON,
    properties: s.object({
      text: styled('text'),
      fontSize: styled('size'),
      fontFamily: styled('font'),
      fontWeight: styled('font'),
      fontStyle: styled('font'),
      color: styled('color'),
      align: styled('align')
    })
  }),

  image: s.object({
    ...ELEMENT_COMMON,
    sprite: s.string({ required: true, editor: 'asset' }),
    properties: s.object({
      width: styled('size'),
      height: styled('size'),
      scale: styled('size')
    })
  }),

  rect: s.object({
    ...ELEMENT_COMMON,
    width: styled('size'),
    height: styled('size'),
    color: styled('color'),
    fill: s.boolean({ label: 'Fill the screen' }),
    properties: s.object({
      interactive: s.boolean()
    })
  })
}, {
  message: (value, _key) => `unknown element type ${JSON.stringify(value)} ` +
    `(known: ${list(['button', 'text', 'image', 'rect'])})`
});

// === Scenes ===

const SCENE_COMMON = {
  version: s.integer({ required: true }),
  name: s.string(),
  type: s.string({ required: true }),
  title: s.string()
};

/**
 * External assets this scene uses, binding a uid to a short local name.
 *
 * Everything else in the scene refers to that name, so the body of a
 * scene file stays readable and reviewable while identity rests on the
 * uid, which survives a rename. Godot's `ext_resource` block is the same
 * idea. A used sprite sheet or prefab joins the inline ones; a name
 * declared in both places is an error rather than a precedence rule.
 */
const USES = s.record(s.ref('asset', { required: true, editor: 'asset' }), {
  label: 'Assets used',
  description: 'Local name to asset uid'
});

export const LEVEL_SCHEMA = s.object({
  ...SCENE_COMMON,
  gameType: s.string({ description: 'Free text, unused by the engine' }),
  uses: USES,
  world: WORLD,
  assets: ASSETS,
  prefabs: s.record(PREFAB),
  layers: s.array(LAYER),
  background: BACKGROUND,
  tileLayers: s.array(TILE_LAYER)
}, {
  refine(level, { fail }) {
    // Ids are unique across the scene, not per layer: an object keeps its
    // identity when an editor moves it from one layer to another.
    checkUniqueIds(
      (level.layers ?? []).flatMap((layer, li) =>
        layer.objects.map((object, oi) => ({ id: object.id, path: `layers[${li}].objects[${oi}].id` }))),
      fail);

    // A tile layer is addressed by name, so two with the same one means the
    // second silently replaces the first.
    const names = new Set(level.background ? ['background'] : []);
    (level.tileLayers ?? []).forEach((layer, i) => {
      if (names.has(layer.name)) {
        fail(`tileLayers[${i}].name`, `duplicate tile layer name '${layer.name}'`);
      }
      names.add(layer.name);
    });
  }
});

export const UI_SCHEMA = s.object({
  ...SCENE_COMMON,
  uses: USES,
  assets: ASSETS,
  elements: s.array(ELEMENTS, { required: true })
}, {
  refine(scene, { fail }) {
    checkUniqueIds(
      scene.elements.map((element, i) => ({ id: element.id, path: `elements[${i}].id` })),
      fail);
  }
});

/** The schema for a scene of this `type`, or null. */
export function schemaForType(type) {
  if (type === 'level') return LEVEL_SCHEMA;
  if (type === 'ui') return UI_SCHEMA;
  return null;
}
