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

/** Collider shapes `createEntity` understands, by the scene's dimension. */
export const BODY_SHAPES = {
  2: ['box', 'circle', 'capsule'],
  3: ['box', 'sphere', 'capsule', 'cylinder']
};

/** Shapes a 3D prefab's `mesh` may draw: the colliders', plus a flat plane. */
export const MESH_SHAPES = [...BODY_SHAPES[3], 'plane'];

/** Kinds of light a 3D prefab may carry. The sun is the scene's, not a prefab's. */
export const LIGHT_TYPES = ['point', 'spot'];

/** Dimensions a level can be simulated in. See `world.dimensions`. */
export const DIMENSIONS = [2, 3];

/** Button variants `setupUIScene` understands. */
export const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'];

/** Entity draw orders `Scene` understands. See Entity.depth. */
export const SORT_MODES = ['depth', 'insertion'];

/** Default object size when a layer object gives none. */
export const DEFAULT_OBJECT_SIZE = 32;

const list = values => values.join(', ');

// === Shared pieces ===

/** A world vector. `z` means something only in a 3D level; see checkDimension. */
const vector = (label) => s.object({
  x: s.number({ required: true }),
  y: s.number({ required: true }),
  z: s.number()
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

/** A model a 3D level draws: a glTF 2.0 `.glb`, in metres, y up. */
const MODEL = s.object({
  url: s.string({ required: true, nonEmpty: true, description: 'Relative to the game\'s basePath' })
});

const ASSETS = s.object({
  spritesheets: s.record(SPRITESHEET),
  models: s.record(MODEL)
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
  dimensions: s.enumOf(DIMENSIONS, {
    label: 'Dimensions',
    description: 'How many axes the simulation has. 2 unless stated'
  }),
  width: s.number({ unit: 'px' }),
  height: s.number({ unit: 'px' }),
  gravity: vector('Gravity'),
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
  // Which shapes exist depends on how many dimensions the scene runs in,
  // so the check belongs where that is known: the level's refine, below.
  shape: s.string({ label: 'Collider' }),
  angle: s.number({ unit: 'rad' }),
  lockRotation: s.boolean(),
  isSensor: s.boolean(),
  friction: s.number({ min: 0 }),
  frictionAir: s.number({ min: 0 }),
  restitution: s.number({ min: 0 }),
  density: s.number({ positive: true }),
  footprint: FOOTPRINT
});

/**
 * How a 3D prefab is drawn. Without one, an entity draws its collider's
 * shape in grey; with one, a shape and a material. Colours are CSS, as
 * everywhere else in a scene file, and converted to linear light on load.
 */
const MESH = s.object({
  model: s.ref('model', { label: 'Model', description: 'A key in assets.models; drawn instead of a shape' }),
  scale: s.number({ positive: true, description: 'Multiplies the model\'s own size' }),
  offset: s.object({ x: s.number(), y: s.number(), z: s.number() }, { description: 'Moves the model against the body, in metres' }),
  shape: s.enumOf(MESH_SHAPES, { label: 'Shape', description: 'The collider shape unless stated' }),
  color: s.string({ label: 'Colour', description: 'CSS colour; sRGB' }),
  metallic: s.number({ min: 0, max: 1 }),
  roughness: s.number({ min: 0, max: 1 }),
  emissive: s.number({ min: 0, description: 'Self-illumination, as a multiple of the colour' }),
  checker: s.number({ min: 0, unit: 'm', description: 'A two-tone checker of this cell size; 0 for none' }),
  visible: s.boolean()
}, { label: 'Mesh' });

/**
 * A light carried by a 3D prefab: a point light at the body, or a spot
 * light pointing along `direction`. Intensity is radiance at one metre
 * before the inverse-square falloff, so a 10 is a bright room lamp.
 */
const LIGHT = s.object({
  type: s.enumOf(LIGHT_TYPES, { label: 'Type' }),
  color: s.string({ label: 'Colour', description: 'CSS colour; sRGB' }),
  intensity: s.number({ min: 0 }),
  range: s.number({ positive: true, unit: 'm' }),
  offset: s.object({ x: s.number(), y: s.number(), z: s.number() }, { description: 'From the body\'s centre, in metres' }),
  direction: s.object({ x: s.number(), y: s.number(), z: s.number() }, { description: 'Where a spot points' }),
  innerCone: s.number({ min: 0, unit: 'rad' }),
  outerCone: s.number({ min: 0, unit: 'rad' }),
  shadow: s.boolean({ description: 'Whether a spot casts a shadow map; the nearest few do' })
}, { label: 'Light' });

const PREFAB = s.object({
  actor: s.ref('actor', { required: true }),
  spritesheet: s.ref('spritesheet'),
  defaultAnimation: s.string(),
  physics: PHYSICS,
  mesh: MESH,
  light: LIGHT,
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
  physics: PHYSICS,
  mesh: MESH,
  light: LIGHT
}, { label: 'Overrides' });

// === Layers and objects ===

const OBJECT = s.object({
  id: identity('Id'),
  prefab: s.ref('prefab', { required: true }),
  x: s.number({ required: true, unit: 'px' }),
  y: s.number({ required: true, unit: 'px' }),
  z: s.number({ unit: 'px', description: 'Three-dimensional levels only' }),
  width: s.number({ positive: true, unit: 'px', default: DEFAULT_OBJECT_SIZE }),
  height: s.number({ positive: true, unit: 'px', default: DEFAULT_OBJECT_SIZE }),
  depth: s.number({ positive: true, unit: 'px', description: 'Three-dimensional levels only' }),
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

/**
 * The checks that depend on how many dimensions the level runs in.
 *
 * A dimension is not a field like the others: it decides what the rest of
 * the document is allowed to say. Which collider shapes exist, and whether
 * a third axis means anything, both follow from it — and a `z` quietly
 * ignored by a 2D level is exactly the failure this format exists to
 * prevent, so it is an error rather than a no-op.
 */
function checkDimension(level, fail) {
  const dimensions = level.world?.dimensions ?? 2;
  const shapes = BODY_SHAPES[dimensions];

  for (const [name, prefab] of Object.entries(level.prefabs ?? {})) {
    const shape = prefab.physics?.shape;
    if (shape !== undefined && !shapes.includes(shape)) {
      fail(`prefabs.${name}.physics.shape`,
        `expected one of ${list(shapes)}, got ${JSON.stringify(shape)}` +
        ` (this level is ${dimensions}D)`);
    }
    if (dimensions === 3 && prefab.physics?.footprint) {
      // A footprint is the 2D perspective kit's answer to depth: the
      // collider is the feet and the sprite stands above it. With a real
      // third axis there is nothing to fake.
      fail(`prefabs.${name}.physics.footprint`,
        'a footprint fakes depth for a 2D perspective, and this level is 3D');
    }
    if (dimensions === 2 && prefab.mesh) {
      fail(`prefabs.${name}.mesh`, 'a mesh is drawn by the 3D renderer, and this level is 2D ' +
        '(set world.dimensions to 3, or give the prefab a spritesheet)');
    }
    if (dimensions === 2 && prefab.light) {
      fail(`prefabs.${name}.light`, 'a light belongs to the 3D renderer, and this level is 2D ' +
        "(set world.dimensions to 3; 2D lights are the renderer's drawLight)");
    }
  }

  if (dimensions === 3) return;
  if (level.world?.gravity?.z !== undefined) {
    fail('world.gravity.z', "'z' needs a third axis, and this level is 2D " +
      '(set world.dimensions to 3)');
  }
  (level.layers ?? []).forEach((layer, li) => {
    layer.objects.forEach((object, oi) => {
      for (const key of ['z', 'depth']) {
        if (object[key] !== undefined) {
          fail(`layers[${li}].objects[${oi}].${key}`,
            `'${key}' needs a third axis, and this level is 2D ` +
            "(set world.dimensions to 3)");
        }
      }
    });
  });
}

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
    checkDimension(level, fail);

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
