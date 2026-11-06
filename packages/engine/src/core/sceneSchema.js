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

/** The only scene format version this engine understands. */
export const SCENE_VERSION = 1;

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
  physics: PHYSICS
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

// === Layers and objects ===

const OBJECT = s.object({
  // Author-facing label only: nothing in the engine reads it, and the demos
  // number theirs. A stable identity an editor can rely on is a separate
  // concern — see `docs/plans/3d-and-editor.md`, step A2.
  id: s.union([
    s.string({ match: value => typeof value === 'string' }),
    s.number({ match: value => typeof value === 'number' })
  ], { message: 'must be a string or a number' }),
  prefab: s.ref('prefab', { required: true }),
  x: s.number({ required: true, unit: 'px' }),
  y: s.number({ required: true, unit: 'px' }),
  width: s.number({ positive: true, unit: 'px', default: DEFAULT_OBJECT_SIZE }),
  height: s.number({ positive: true, unit: 'px', default: DEFAULT_OBJECT_SIZE }),
  angle: s.number({ unit: 'rad', message: value => `must be a number (radians), got ${JSON.stringify(value)}` }),
  zIndex: s.number({ label: 'Draw order' }),
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
  id: s.string(),
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

export const LEVEL_SCHEMA = s.object({
  ...SCENE_COMMON,
  gameType: s.string({ description: 'Free text, unused by the engine' }),
  world: WORLD,
  assets: ASSETS,
  prefabs: s.record(PREFAB),
  layers: s.array(LAYER),
  background: BACKGROUND,
  tileLayers: s.array(TILE_LAYER)
}, {
  refine(level, { fail }) {
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
  assets: ASSETS,
  elements: s.array(ELEMENTS, { required: true })
});

/** The schema for a scene of this `type`, or null. */
export function schemaForType(type) {
  if (type === 'level') return LEVEL_SCHEMA;
  if (type === 'ui') return UI_SCHEMA;
  return null;
}
