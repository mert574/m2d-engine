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
 * What a placed object passes its actor's constructor as `options`.
 *
 * An actor declares what it understands in `static properties`, the way a
 * constraint declares `static params`: schema descriptors named after the
 * fields they set, defaults recorded as `initial`. When the actor is
 * registered and says, this is checked here, so a misspelled property
 * fails on load naming its path instead of silently doing nothing. An
 * actor that declares nothing keeps the old contract — a free-form bag
 * the engine never looks inside — so adding a schema is per actor and
 * nothing breaks without one.
 */
const actorProperties = s.dynamic((value, ctx) => {
  const prefab = ctx.context?.prefabs?.[ctx.parent?.prefab];
  const ActorClass = prefab?.actor ? ctx.context?.actors?.get(prefab.actor) : null;
  return actorPropertyFields(ActorClass) ? actorPropertiesSchema(ActorClass) : null;
}, {
  label: 'Properties',
  description: "Passed to the actor's constructor"
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

/** An HDR environment a 3D level lights with: a Radiance `.hdr` panorama. */
const ENVIRONMENT = s.object({
  url: s.string({ required: true, nonEmpty: true, description: 'Relative to the game\'s basePath' }),
  intensity: s.number({ initial: 1, min: 0, description: 'Scales the panorama\'s radiance' })
});

/** A sound effect or a music track the scene brings: a file, and how loud it plays. */
const SOUND = s.object({
  url: s.string({ required: true, nonEmpty: true, description: 'Relative to the game\'s basePath' }),
  volume: s.number({ min: 0, max: 1, initial: 1 })
});

const ASSETS = s.object({
  spritesheets: s.record(SPRITESHEET),
  models: s.record(MODEL),
  environments: s.record(ENVIRONMENT),
  sounds: s.record(SOUND, { description: 'Effects, loaded into the sound manager by key when the scene loads' }),
  music: s.record(SOUND, { description: 'Tracks, loaded by key; world.music plays one' })
});

// === World ===

const PROJECTION = s.union([
  s.enumOf(PROJECTION_TYPES, { match: value => typeof value === 'string' }),
  s.object({
    type: s.enumOf(PROJECTION_TYPES, { required: true }),
    ratio: s.number({ positive: true })
  }, { match: value => typeof value === 'object' && value !== null })
], { message: value => `expected one of ${list(PROJECTION_TYPES)}, got ${JSON.stringify(value)}` });

/** A CSS colour, as everywhere in a scene file. */
const colour = (options = {}) => s.string({ editor: 'color', ...options });

/**
 * How the level is seen: the camera's configuration, applied when the
 * scene shows (the editor's own camera stands aside while editing). The 2D
 * fields are the `Camera`'s, the 3D ones the `Camera3D`'s; a scene sets the
 * ones its dimension has. `follow` is the id of a placed object.
 */
const CAMERA = s.object({
  mode: s.enumOf(['follow', 'scroll', 'rooms', 'orbit', 'free'], { description: '2D: follow, scroll or rooms; 3D: orbit or free' }),
  follow: s.string({ description: 'The id of the placed object the camera follows (the player, by default)' }),
  zoom: s.number({ positive: true, description: '2D' }),
  lerp: s.number({ min: 0, max: 1, description: 'Fraction of the way to the target per frame at 60 Hz' }),
  followAxes: s.object({ x: s.boolean(), y: s.boolean() }, { label: 'Follow axes', description: '2D: which axes follow the target' }),
  bounds: s.union([
    s.enumOf(['world'], { match: value => typeof value === 'string' }),
    s.object({ left: s.number({ required: true }), top: s.number({ required: true }), right: s.number({ required: true }), bottom: s.number({ required: true }) },
      { match: value => typeof value === 'object' && value !== null })
  ], { description: '2D: "world" for the world\'s size, or a rectangle in px', message: 'must be "world" or { left, top, right, bottom }' }),
  followRotation: s.boolean({ label: 'Follow rotation', description: '2D: turn with the target' }),
  rotationLerp: s.number({ min: 0, max: 1, label: 'Rotation lerp' }),
  rotationMaxRate: s.number({ positive: true, unit: 'rad/s', label: 'Rotation max rate' }),
  distance: s.number({ positive: true, unit: 'm', description: '3D orbit' }),
  yaw: s.number({ unit: 'rad', description: '3D orbit' }),
  pitch: s.number({ unit: 'rad', description: '3D orbit' }),
  minDistance: s.number({ positive: true, unit: 'm', label: 'Min distance' }),
  maxDistance: s.number({ positive: true, unit: 'm', label: 'Max distance' }),
  minPitch: s.number({ unit: 'rad', label: 'Min pitch' }),
  maxPitch: s.number({ unit: 'rad', label: 'Max pitch' }),
  fov: s.number({ positive: true, unit: 'rad', label: 'Field of view', description: '3D: vertical' }),
  targetOffset: s.object({ x: s.number(), y: s.number(), z: s.number() }, { label: 'Target offset', description: '3D: added to the followed object\'s position' })
}, { label: 'Camera' });

/**
 * The light the level stands in. 2D: an ambient colour switches lighting
 * on, and the actors' `drawLight` calls add to it. 3D: the sun, the sky
 * and ground ambient, the fog, the exposure and the shadow distance, as
 * `frame3D` takes them; a scene's `onRender` may still change any of them
 * afterwards, which is how a day and night cycle moves these.
 */
const LIGHTING = s.object({
  ambient: colour({ description: '2D: the ambient light; set, the world is lit (actors add lights). Unset, full brightness' }),
  sun: s.object({
    direction: s.object({ x: s.number(), y: s.number(), z: s.number() }, { description: 'Where the light goes; down is negative y' }),
    color: colour({ label: 'Colour' }),
    intensity: s.number({ min: 0 })
  }, { description: '3D' }),
  sky: colour({ description: '3D: ambient from above' }),
  ground: colour({ description: '3D: ambient from below' }),
  ambientIntensity: s.number({ min: 0, label: 'Ambient intensity', description: '3D: scales sky and ground' }),
  fog: s.object({ color: colour({ label: 'Colour' }), density: s.number({ min: 0 }) }, { description: '3D' }),
  exposure: s.number({ positive: true, description: '3D' }),
  shadowDistance: s.number({ positive: true, unit: 'm', label: 'Shadow distance', description: '3D: how far the sun casts shadows' })
}, { label: 'Lighting' });

/**
 * The full-screen pass over the level. Each block is what the renderer
 * takes: in 2D `setPostEffects` (bloom { threshold, strength, blur },
 * vignette { strength, start }, grade { shadows, highlights, amount,
 * saturation, contrast }, chromatic, distortion, grain, scanlines, blur,
 * glitch, flash — all `{ strength }` unless said), in 3D `frame.post` and
 * `frame.bloom`. Blocks a renderer does not know are ignored.
 */
const POST = s.object({
  bloom: s.any({ description: '2D { threshold, strength, blur }; 3D { threshold, intensity, scatter }' }),
  vignette: s.any({ description: '2D { strength, start }; 3D a number' }),
  grade: s.any({ description: '2D { shadows, highlights, amount, saturation, contrast }; 3D { saturation, contrast, temperature }' }),
  chromatic: s.any({ description: '{ strength }' }),
  distortion: s.any({ description: '{ strength }' }),
  grain: s.any({ description: '2D { strength }; 3D a number' }),
  scanlines: s.any({ description: '2D { strength, density }' }),
  blur: s.any({ description: '2D { strength }' }),
  dof: s.any({ label: 'Depth of field', description: '3D { focalLength, fStop, maxBlur }; the focus follows the camera\'s target' }),
  autoExposure: s.any({ label: 'Auto exposure', description: '3D { enabled, key, min, max, speed }' })
}, { label: 'Post effects' });

/** What a rule watches for; see core/rules.js. */
const RULE_WHEN = s.tagged('event', {
  start: s.object({ event: s.string({ required: true }) }),
  collected: s.object({ event: s.string({ required: true }), prefab: s.ref('prefab', { required: true, description: 'Fires when no object of this prefab is left' }) }),
  enter: s.object({ event: s.string({ required: true }), object: s.string({ required: true, description: 'The object the player touches; "player" is not allowed here' }) }),
  death: s.object({ event: s.string({ required: true }), object: s.string({ initial: 'player', description: 'The object that died, or "player"' }) }),
  fall: s.object({ event: s.string({ required: true }) })
}, { label: 'When', message: value => `unknown event ${JSON.stringify(value)} (known: start, collected, enter, death, fall)` });

/** What a rule does; see core/rules.js. */
const RULE_ACTION = s.tagged('do', {
  notice: s.object({ do: s.string({ required: true }), text: s.string({ required: true }), seconds: s.number({ positive: true }), element: s.string({ description: 'A notice element\'s id; the first one by default' }) }),
  objective: s.object({ do: s.string({ required: true }), text: s.string({ required: true }), element: s.string({ initial: 'objective', description: 'A text element\'s id' }) }),
  sound: s.object({ do: s.string({ required: true }), key: s.string({ required: true }) }),
  unseal: s.object({ do: s.string({ required: true }), object: s.string({ required: true, description: 'Sets its active true and its sealed false' }) }),
  remove: s.object({ do: s.string({ required: true }), object: s.string({ required: true }) }),
  set: s.object({ do: s.string({ required: true }), object: s.string({ required: true }), property: s.string({ required: true }), value: s.any() }),
  switch: s.object({ do: s.string({ required: true }), scene: s.string({ required: true, nonEmpty: true, description: 'A scene by name: one of the project\'s, or one the game\'s page builds in code (a menu)' }), after: s.number({ min: 0, unit: 's' }) }),
  gameOver: s.object({ do: s.string({ required: true }), after: s.number({ min: 0, unit: 's' }) }),
  cycle: s.object({ do: s.string({ required: true }), target: s.number({ min: 0, description: 'The lighting state to ease to' }), phase: s.number({ min: 0, description: 'Jump to this state' }), ease: s.number({ positive: true }) })
}, { label: 'Action', message: value => `unknown action ${JSON.stringify(value)} (known: notice, objective, sound, unseal, remove, set, switch, gameOver, cycle)` });

const RULE = s.object({
  when: RULE_WHEN,
  then: s.array(RULE_ACTION, { required: true }),
  once: s.boolean({ default: true, description: 'Fire once, or every tick the event holds' })
}, { refine(rule, { path, fail }) { if (!rule.when) fail(`${path}.when`, 'a rule needs an event to watch for'); } });

/**
 * A day and night cycle (or any turn of the light): named looks the level
 * blends between. `period` seconds turns through them all and round
 * again; without one the phase eases toward `target`, which game code or
 * a rule sets (`scene.cycle.target = 1`). `phase` is where it starts.
 */
const CYCLE = s.object({
  states: s.array(s.object({
    name: s.string(),
    lighting: LIGHTING,
    post: POST
  }), { required: true, minLength: 2, message: 'must be a list of at least two states' }),
  period: s.number({ min: 0, unit: 's', description: 'Seconds per full turn; 0 means the phase is moved by hand' }),
  phase: s.number({ min: 0, description: 'The starting state (fractions blend)' }),
  ease: s.number({ positive: true, initial: 1.5, description: 'How fast the phase approaches its target, per second' })
}, { label: 'Cycle' });

const WORLD = s.object({
  dimensions: s.enumOf(DIMENSIONS, {
    label: 'Dimensions',
    description: 'How many axes the simulation has. 2 unless stated'
  }),
  width: s.number({ unit: 'px' }),
  height: s.number({ unit: 'px' }),
  gravity: vector('Gravity'),
  sort: s.enumOf(SORT_MODES, { label: 'Draw order' }),
  projection: PROJECTION,
  environment: s.ref('environment', {
    label: 'Environment',
    description: 'Three-dimensional levels only: a key in assets.environments, the HDR panorama ' +
      'that lights the level and is its sky. Game code may still set the frame\'s own'
  }),
  player: s.string({ description: 'The id of the placed object that is the player: game.player, and what the camera follows unless told otherwise' }),
  camera: CAMERA,
  lighting: LIGHTING,
  post: POST,
  music: s.object({
    track: s.string({ required: true, description: 'A key in assets.music (or one the game loaded)' }),
    volume: s.number({ min: 0, max: 1 })
  }, { label: 'Music', description: 'Played when the scene shows, stopped when it leaves' }),
  cycle: CYCLE,
  killPlane: s.number({ label: 'Kill plane', unit: 'px', description: '2D: the player falling below this y fires the fall rules (game over without one); the world\'s height plus 50 by default' }),
  rules: s.array(RULE, { label: 'Rules', description: 'What happens when: see the guide' })
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
 * Every `static properties` descriptor along an actor's class chain, base
 * first, a subclass's own entry winning — so a subclass adds to what its
 * bases said rather than restating it, the way `static replicated` works.
 * Null when nothing in the chain declares any, which is what tells the
 * loader to leave the bag unchecked.
 * @param {Function} ActorClass
 * @returns {object|null}
 */
export function actorPropertyFields(ActorClass) {
  if (typeof ActorClass !== 'function') return null;
  let fields = null;
  const chain = [];
  for (let c = ActorClass; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    if (Object.prototype.hasOwnProperty.call(c, 'properties') && c.properties) chain.unshift(c.properties);
  }
  for (const own of chain) fields = { ...fields, ...own };
  return fields;
}

/**
 * The schema for an actor's `properties`, from its `static properties` —
 * the actor-side twin of `constraintParamsSchema`, and what an inspector
 * walks to draw an entity's own fields.
 *
 * Defaults are recorded as `initial` for the same reason constraints do
 * it: a scene that sets one property must not thereby reset the rest.
 * @param {Function} ActorClass
 */
export function actorPropertiesSchema(ActorClass) {
  return s.object(actorPropertyFields(ActorClass) ?? {});
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
      //
      // A class whose `static params` is null opts out of the check — the
      // base's `{}` means "nothing settable", null means "anything": an
      // editor's placeholder for a constraint whose real class it cannot
      // load says null, so a project's scene still materializes.
      return ConstraintClass?.params ? constraintParamsSchema(ConstraintClass) : null;
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
  category: s.union([
    s.string({ match: value => typeof value === 'string' }),
    s.integer({ min: 1, match: value => typeof value === 'number' })
  ], { label: 'Collision category', description: 'A CollisionCategories name (player, enemy, platform, …) or a bit', message: 'must be a category name or a bit' }),
  mask: s.union([
    s.integer({ min: 0, match: value => typeof value === 'number' }),
    s.array(s.string(), { match: value => Array.isArray(value) })
  ], { label: 'Collides with', description: 'Category names this body collides with, or a bit mask; everything when unset', message: 'must be a list of category names or a bit mask' }),
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
  castShadow: s.boolean({ default: true, description: 'Off for a glowing shell around a light, which would otherwise shadow its own lamp' }),
  texture: s.object({
    url: s.string({ required: true, nonEmpty: true, description: 'An image, relative to the game\'s basePath' }),
    size: s.number({ positive: true, initial: 1, unit: 'm', description: 'World metres per tile: mapped planar from the position, so a floor and a wall tile alike' })
  }, { description: 'A tiling texture over the shape, dev-grid style' }),
  animation: s.object({
    clip: s.string({ required: true, description: 'A clip in the model' }),
    loop: s.boolean(),
    speed: s.number({ positive: true })
  }, { description: 'The clip a skinned model plays when it appears; game code may change it through entity.animator' }),
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
  shadow: s.boolean({ description: 'Whether the light casts a shadow — a map for a spot, a cube for a point; the nearest few do, by the quality setting' })
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
  rotation: s.tuple([s.number(), s.number(), s.number(), s.number()], {
    label: 'Rotation',
    editor: 'rotation',
    description: 'Three-dimensional levels only: the orientation as a unit quaternion [x, y, z, w] ' +
      '(the form the 3D physics reads; an editor shows it as yaw, pitch and roll)',
    message: 'must be a quaternion: an [x, y, z, w] tuple of numbers'
  }),
  zIndex: s.number({ label: 'Draw order' }),
  constraints: OBJECT_CONSTRAINTS,
  overrides: OVERRIDES,
  properties: actorProperties
});

/**
 * A prefab placed many times as scenery, in a 3D level. A prop is
 * presentation only: no entity, no body, no light — the prefab's `mesh`
 * draws it, resident on the GPU, and its `physics` and `light` are not
 * read. Each instance is `[x, y, z, yaw, scale]`: position in metres, a
 * turn about the up axis in radians, and a multiplier on the size.
 */
const PROP_INSTANCE = s.tuple(
  [s.number(), s.number(), s.number(), s.number(), s.number({ positive: true })],
  { message: 'must be an [x, y, z, yaw, scale] tuple of numbers' }
);

/**
 * What a prop's instances collide as, if anything: nothing by default (a
 * tuft of grass), the model's bounding box, or a shape standing on the
 * instance's origin — a tree wants a trunk-sized cylinder, not its canopy.
 */
const PROP_COLLIDER = s.union([
  s.enumOf(['none', 'bounds'], { match: value => typeof value === 'string' }),
  s.object({
    shape: s.enumOf(['box', 'cylinder', 'sphere'], { required: true }),
    width: s.number({ positive: true, unit: 'm', required: true }),
    height: s.number({ positive: true, unit: 'm', required: true }),
    depth: s.number({ positive: true, unit: 'm' })
  }, { match: value => typeof value === 'object' && value !== null })
], { message: 'must be "none", "bounds" or { "shape", "width", "height", "depth" }' });

const PROP = s.object({
  id: identity('Id'),
  prefab: s.ref('prefab', { required: true }),
  width: s.number({ positive: true, unit: 'm', default: DEFAULT_OBJECT_SIZE }),
  height: s.number({ positive: true, unit: 'm', default: DEFAULT_OBJECT_SIZE }),
  depth: s.number({ positive: true, unit: 'm' }),
  castShadow: s.boolean({ default: true }),
  collider: PROP_COLLIDER,
  instances: s.array(PROP_INSTANCE, { required: true, message: 'must be an array of [x, y, z, yaw, scale] tuples' })
});

const LAYER = s.object({
  name: s.string(),
  type: s.string(),
  objects: s.array(OBJECT, { required: true }),
  props: s.array(PROP, { description: 'Three-dimensional levels only' })
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

/** A level's HUD: the UI scene's elements plus the three that read the game. */
const HUD_ELEMENTS = s.tagged('type', {
  text: s.object({ ...ELEMENT_COMMON, properties: s.object({ text: styled('text'), fontSize: styled('size'), fontFamily: styled('font'), fontWeight: styled('font'), fontStyle: styled('font'), color: styled('color'), align: styled('align') }) }),
  notice: s.object({ ...ELEMENT_COMMON, properties: s.object({ fontSize: styled('size'), fontWeight: styled('font'), color: styled('color'), align: styled('align'), seconds: s.number({ positive: true, initial: 2.5, unit: 's' }) }) }),
  meter: s.object({
    ...ELEMENT_COMMON,
    width: s.number({ positive: true, unit: 'px', initial: 180 }),
    height: s.number({ positive: true, unit: 'px', initial: 12 }),
    bind: s.object({
      object: s.string({ initial: 'player', description: 'An object id, or "player"' }),
      constraint: s.string({ initial: 'health', description: 'The constraint slot read from (health by default); an empty string reads the entity\'s own fields' }),
      current: s.string({ initial: 'currentHealth' }),
      max: s.string({ initial: 'maxHealth' })
    }, { label: 'Binding' }),
    properties: s.object({ label: styled('text'), color: styled('color'), background: styled('color') })
  }),
  minimap: s.object({
    ...ELEMENT_COMMON,
    size: s.number({ positive: true, unit: 'px', initial: 160 }),
    bounds: s.object({ width: s.number({ required: true, positive: true }), height: s.number({ required: true, positive: true }) }, { description: 'The world area mapped; the world\'s size when unset' }),
    plot: s.record(s.string({ editor: 'color' }), { label: 'Plot', description: 'Prefab name to dot colour' }),
    properties: s.object({ background: styled('color') })
  }),
  image: s.object({ ...ELEMENT_COMMON, sprite: s.string({ required: true, editor: 'asset' }), properties: s.object({ width: styled('size'), height: styled('size'), scale: styled('size') }) }),
  rect: s.object({ ...ELEMENT_COMMON, width: styled('size'), height: styled('size'), color: styled('color'), fill: s.boolean({ label: 'Fill the screen' }), properties: s.object({}) })
}, {
  message: (value) => `unknown HUD element type ${JSON.stringify(value)} (known: text, notice, meter, minimap, image, rect)`
});

// === Scenes ===

const SCENE_COMMON = {
  version: s.integer({ required: true }),
  name: s.string(),
  type: s.string({ required: true }),
  title: s.string(),
  /**
   * The script that owns this file, when the scene is generated rather
   * than authored — `examples/scripts/buildRowScene.mjs` writes
   * `scripts/buildRowScene.mjs` here. Hand edits to a generated scene are
   * overwritten by the next run, so an editor shows such a scene
   * read-only until it is deliberately detached by deleting this field.
   * The engine itself ignores it.
   */
  generator: s.string({ label: 'Generated by', description: 'Path of the script that owns this file; an editor treats the scene as read-only while it is set' })
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
  }

  if (dimensions === 3) {
    (level.layers ?? []).forEach((layer, li) => {
      layer.objects.forEach((object, oi) => {
        const where = `layers[${li}].objects[${oi}]`;
        if (object.angle !== undefined) {
          fail(`${where}.angle`, "'angle' turns a 2D body in its plane; a 3D object turns by 'rotation', a quaternion");
        }
        if (object.rotation && Math.hypot(...object.rotation) < 1e-6) {
          fail(`${where}.rotation`, 'a rotation quaternion cannot be zero; [0, 0, 0, 1] is no rotation');
        }
      });
    });
    return;
  }
  if (level.world?.environment !== undefined) {
    fail('world.environment', 'an environment lights a 3D level, and this level is 2D ' +
      '(set world.dimensions to 3)');
  }
  if (level.world?.gravity?.z !== undefined) {
    fail('world.gravity.z', "'z' needs a third axis, and this level is 2D " +
      '(set world.dimensions to 3)');
  }
  (level.layers ?? []).forEach((layer, li) => {
    if (layer.props) {
      fail(`layers[${li}].props`, 'props are drawn by the 3D renderer, and this level is 2D ' +
        '(set world.dimensions to 3)');
    }
    layer.objects.forEach((object, oi) => {
      for (const key of ['z', 'depth', 'rotation']) {
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
  tileLayers: s.array(TILE_LAYER),
  hud: s.array(HUD_ELEMENTS, { label: 'HUD', description: 'The overlay drawn over the level: texts, meters, notices, a minimap' })
}, {
  refine(level, { fail }) {
    checkDimension(level, fail);

    // Ids are unique across the scene, not per layer: an object keeps its
    // identity when an editor moves it from one layer to another.
    checkUniqueIds(
      (level.layers ?? []).flatMap((layer, li) => [
        ...layer.objects.map((object, oi) => ({ id: object.id, path: `layers[${li}].objects[${oi}].id` })),
        ...(layer.props ?? []).map((prop, pi) => ({ id: prop.id, path: `layers[${li}].props[${pi}].id` }))
      ]),
      fail);

    // A prop is drawn by its prefab's mesh and nothing else, so a prefab
    // without one has nothing to show for a thousand placements.
    (level.layers ?? []).forEach((layer, li) => {
      (layer.props ?? []).forEach((prop, pi) => {
        const prefab = level.prefabs?.[prop.prefab];
        if (prefab && !prefab.mesh) {
          fail(`layers[${li}].props[${pi}].prefab`,
            `prefab '${prop.prefab}' has no mesh, and a prop is drawn by its mesh alone`);
        }
      });
    });

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
