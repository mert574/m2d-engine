import { ANCHOR_ORIGINS } from './ui/uiElement.js';

/**
 * Scene validation and normalization: the one place raw scene JSON is checked
 * before anything tries to build a scene out of it.
 *
 * `Scene` reads the scene config directly, field by field, as it builds
 * entities and widgets. That is a fine way to *consume* a scene and a poor
 * way to *diagnose* one: a mistyped prefab name surfaces as a console error
 * per object with the level half-populated, an unregistered actor the same, a
 * misspelled `"anchour"` not at all. The failure always lands far from the
 * line of JSON that caused it.
 *
 * This loader runs first and fails loudly instead. It validates structure and
 * every cross-reference the scene makes — prefab to spritesheet, object to
 * prefab, actor to registered actor, button to registered scene — applies the
 * format's defaults once, and hands back a config of exactly the shape
 * `Scene` already expects. It deliberately does *not* invent an intermediate
 * representation: the normalized output is the input plus defaults, so there
 * is only ever one scene format to understand.
 *
 * Validation is strict. Anything structurally wrong, unresolvable, or simply
 * not in the schema throws, with a message naming the scene and the path to
 * the offending field. Unknown keys are errors too, which is the point:
 * silently ignoring a field the author believed in is the failure mode that
 * leaves a Settings button doing nothing for a year.
 */

/** The only scene format version this engine understands. */
export const SCENE_VERSION = 1;

/** Keys allowed at the top level, by scene type. */
const TOP_LEVEL_KEYS = {
  common: ['version', 'name', 'type', 'title'],
  level: ['gameType', 'world', 'assets', 'prefabs', 'layers', 'background', 'tileLayers'],
  ui: ['assets', 'elements']
};

/** Keys allowed on a UI element, by element type. */
const ELEMENT_KEYS = {
  common: ['type', 'id', 'x', 'y', 'anchor', 'properties'],
  button: [],
  text: [],
  image: ['sprite'],
  rect: ['width', 'height', 'color', 'fill']
};

/**
 * Keys allowed inside an element's `properties`, by element type.
 *
 * Colours and sizes accept a `$token` reference as readily as a literal, so
 * a scene can be authored against the theme (`"color": "$color.text.accent"`)
 * and follow a retheme. Buttons name a `variant` rather than three hover
 * colours; `background` and `textColor` remain for the cases a variant does
 * not cover.
 */
const ELEMENT_PROPERTY_KEYS = {
  button: ['text', 'onClick', 'action', 'width', 'height', 'variant',
    'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'background', 'textColor'],
  text: ['text', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'align'],
  image: ['width', 'height', 'scale'],
  rect: ['interactive']
};

/** Button variants `setupUIScene` understands. */
const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'];

/** Physics body types `createEntity` understands. */
const BODY_TYPES = ['static', 'dynamic', 'kinematic', 'character'];

/** Collider shapes `createEntity` understands. */
const BODY_SHAPES = ['box', 'circle', 'capsule'];

import { PROJECTION_TYPES } from './projection.js';

/** Entity draw orders `Scene` understands. See Entity.depth. */
const SORT_MODES = ['depth', 'insertion'];

/** Default object size when a layer object gives none. */
const DEFAULT_OBJECT_SIZE = 32;

/** An error carrying the scene and the field path that caused it. */
export class SceneValidationError extends Error {
  constructor(scene, path, message) {
    super(`Scene '${scene}'${path ? ` at ${path}` : ''}: ${message}`);
    this.name = 'SceneValidationError';
    this.scene = scene;
    this.path = path;
  }
}

export class SceneLoader {
  /** @param {import('./m2d.js').M2D} game */
  constructor(game) {
    this.game = game;
  }

  /**
   * Validate and normalize raw scene data.
   *
   * @param {Object} data - Parsed scene JSON
   * @param {string} [sceneName] - Registered name, for error messages
   * @returns {Object} The same scene with defaults applied
   * @throws {SceneValidationError} On anything the schema does not allow
   */
  load(data, sceneName = data?.name ?? 'unknown') {
    const fail = (path, message) => { throw new SceneValidationError(sceneName, path, message); };

    if (!data || typeof data !== 'object') fail('', 'scene data is not an object');
    if (data.version !== SCENE_VERSION) {
      fail('version', `expected ${SCENE_VERSION}, got ${JSON.stringify(data.version)}`);
    }
    if (data.type !== 'level' && data.type !== 'ui') {
      fail('type', `expected 'level' or 'ui', got ${JSON.stringify(data.type)}`);
    }

    this.#checkKeys(fail, '', data, [...TOP_LEVEL_KEYS.common, ...TOP_LEVEL_KEYS[data.type]]);

    return data.type === 'level'
      ? this.#loadLevel(data, fail)
      : this.#loadUI(data, fail);
  }

  /** Reject keys the schema does not define, listing what was allowed. */
  #checkKeys(fail, path, object, allowed) {
    for (const key of Object.keys(object)) {
      if (!allowed.includes(key)) {
        fail(path ? `${path}.${key}` : key,
          `unknown field '${key}' (allowed: ${allowed.join(', ')})`);
      }
    }
  }

  // === Level scenes ===

  #loadLevel(data, fail) {
    const spritesheets = data.assets?.spritesheets ?? {};
    if (data.world?.sort !== undefined && !SORT_MODES.includes(data.world.sort)) {
      fail('world.sort', `expected one of ${SORT_MODES.join(', ')}, got ${JSON.stringify(data.world.sort)}`);
    }
    const projection = data.world?.projection;
    if (projection !== undefined) {
      const type = typeof projection === 'string' ? projection : projection?.type;
      if (!PROJECTION_TYPES.includes(type)) {
        fail('world.projection', `expected one of ${PROJECTION_TYPES.join(', ')}, got ${JSON.stringify(projection)}`);
      }
      if (typeof projection === 'object') {
        this.#checkKeys(fail, 'world.projection', projection, ['type', 'ratio']);
        if (projection.ratio !== undefined && !(projection.ratio > 0)) {
          fail('world.projection.ratio', 'must be a positive number');
        }
      }
    }
    if (data.assets) this.#checkKeys(fail, 'assets', data.assets, ['spritesheets']);

    for (const [name, sheet] of Object.entries(spritesheets)) {
      const path = `assets.spritesheets.${name}`;
      this.#checkKeys(fail, path, sheet,
        ['url', 'frameWidth', 'frameHeight', 'animations']);
      if (typeof sheet.url !== 'string') fail(`${path}.url`, 'missing or non-string url');
      if (!(sheet.frameWidth > 0)) fail(`${path}.frameWidth`, 'must be a positive number');
      if (!(sheet.frameHeight > 0)) fail(`${path}.frameHeight`, 'must be a positive number');

      for (const [anim, body] of Object.entries(sheet.animations ?? {})) {
        const animPath = `${path}.animations.${anim}`;
        this.#checkKeys(fail, animPath, body, ['frames', 'fps', 'loop']);
        if (!Array.isArray(body.frames) || body.frames.length === 0) {
          fail(`${animPath}.frames`, 'must be a non-empty array of [tileX, tileY] pairs');
        }
        body.frames.forEach((frame, i) => {
          if (!Array.isArray(frame) || frame.length !== 2) {
            fail(`${animPath}.frames[${i}]`, 'must be a [tileX, tileY] pair');
          }
        });
        if (body.fps !== undefined && !(Number.isFinite(body.fps) && body.fps >= 0)) {
          fail(`${animPath}.fps`, 'must be a non-negative number');
        }
        if (body.loop !== undefined && typeof body.loop !== 'boolean') {
          fail(`${animPath}.loop`, 'must be a boolean');
        }
      }
    }

    const prefabs = data.prefabs ?? {};
    for (const [name, prefab] of Object.entries(prefabs)) {
      const path = `prefabs.${name}`;
      this.#checkKeys(fail, path, prefab,
        ['actor', 'spritesheet', 'defaultAnimation', 'physics']);

      // Cross-reference: an unregistered actor used to be a console error per
      // object, with the level loading silently incomplete around it.
      if (typeof prefab.actor !== 'string') fail(`${path}.actor`, 'missing or non-string actor');
      if (this.game?.actors && !this.game.actors.has(prefab.actor)) {
        fail(`${path}.actor`, `actor '${prefab.actor}' is not registered ` +
          `(registered: ${[...this.game.actors.keys()].join(', ') || 'none'})`);
      }
      if (prefab.spritesheet !== undefined && !(prefab.spritesheet in spritesheets)) {
        fail(`${path}.spritesheet`, `no spritesheet named '${prefab.spritesheet}' ` +
          `(declared: ${Object.keys(spritesheets).join(', ') || 'none'})`);
      }
      if (prefab.defaultAnimation !== undefined) {
        const animations = spritesheets[prefab.spritesheet]?.animations;
        if (animations && !(prefab.defaultAnimation in animations)) {
          fail(`${path}.defaultAnimation`,
            `spritesheet '${prefab.spritesheet}' has no animation ` +
            `'${prefab.defaultAnimation}' (has: ${Object.keys(animations).join(', ')})`);
        }
      }
      if (prefab.physics) {
        const type = prefab.physics.bodyType;
        if (type !== undefined && !BODY_TYPES.includes(type)) {
          fail(`${path}.physics.bodyType`,
            `expected one of ${BODY_TYPES.join(', ')}, got ${JSON.stringify(type)}`);
        }
        const shape = prefab.physics.shape;
        if (shape !== undefined && !BODY_SHAPES.includes(shape)) {
          fail(`${path}.physics.shape`,
            `expected one of ${BODY_SHAPES.join(', ')}, got ${JSON.stringify(shape)}`);
        }
        const footprint = prefab.physics.footprint;
        if (footprint !== undefined) {
          if (!footprint || typeof footprint !== 'object') {
            fail(`${path}.physics.footprint`, 'must be an object with a height and an optional width');
          }
          this.#checkKeys(fail, `${path}.physics.footprint`, footprint, ['width', 'height']);
          if (!(footprint.height > 0)) fail(`${path}.physics.footprint.height`, 'must be a positive number');
          if (footprint.width !== undefined && !(footprint.width > 0)) {
            fail(`${path}.physics.footprint.width`, 'must be a positive number');
          }
        }
      }
    }

    const layers = (data.layers ?? []).map((layer, li) => {
      const path = `layers[${li}]`;
      this.#checkKeys(fail, path, layer, ['name', 'type', 'objects']);
      if (!Array.isArray(layer.objects)) fail(`${path}.objects`, 'must be an array');

      return {
        ...layer,
        objects: layer.objects.map((object, oi) => {
          const objectPath = `${path}.objects[${oi}]`;
          this.#checkKeys(fail, objectPath, object,
            ['id', 'prefab', 'x', 'y', 'width', 'height', 'angle', 'zIndex', 'properties']);
          if (object.angle !== undefined && !Number.isFinite(object.angle)) {
            fail(`${objectPath}.angle`, `must be a number (radians), got ${JSON.stringify(object.angle)}`);
          }
          if (object.zIndex !== undefined && !Number.isFinite(object.zIndex)) {
            fail(`${objectPath}.zIndex`, `must be a number, got ${JSON.stringify(object.zIndex)}`);
          }
          if (!(object.prefab in prefabs)) {
            fail(`${objectPath}.prefab`, `no prefab named '${object.prefab}' ` +
              `(declared: ${Object.keys(prefabs).join(', ') || 'none'})`);
          }
          if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) {
            fail(objectPath, 'x and y must be numbers');
          }
          // The format's one default, applied here rather than at use.
          return {
            ...object,
            width: object.width ?? DEFAULT_OBJECT_SIZE,
            height: object.height ?? DEFAULT_OBJECT_SIZE
          };
        })
      };
    });

    if (data.background !== undefined) {
      const sheet = data.background?.spritesheet;
      this.#checkKeys(fail, 'background', data.background, ['spritesheet', 'tileX', 'tileY']);
      if (!(sheet in spritesheets)) {
        fail('background.spritesheet', `no spritesheet named '${sheet}' ` +
          `(declared: ${Object.keys(spritesheets).join(', ') || 'none'})`);
      }
    }

    if (data.tileLayers !== undefined) {
      if (!Array.isArray(data.tileLayers)) fail('tileLayers', 'must be an array');
      const names = new Set(data.background ? ['background'] : []);
      data.tileLayers.forEach((layer, i) => {
        const path = `tileLayers[${i}]`;
        this.#checkKeys(fail, path, layer,
          ['name', 'spritesheet', 'tileX', 'tileY', 'zIndex', 'parallax', 'repeat', 'tileSize', 'scale', 'cells', 'stretch']);
        if (typeof layer.name !== 'string' || !layer.name) fail(`${path}.name`, 'missing or non-string name');
        if (names.has(layer.name)) fail(`${path}.name`, `duplicate tile layer name '${layer.name}'`);
        names.add(layer.name);
        if (!(layer.spritesheet in spritesheets)) {
          fail(`${path}.spritesheet`, `no spritesheet named '${layer.spritesheet}' ` +
            `(declared: ${Object.keys(spritesheets).join(', ') || 'none'})`);
        }
        if (layer.zIndex !== undefined && !Number.isFinite(layer.zIndex)) {
          fail(`${path}.zIndex`, `must be a number, got ${JSON.stringify(layer.zIndex)}`);
        }
        const parallax = layer.parallax;
        if (parallax !== undefined && !Number.isFinite(parallax)) {
          if (!parallax || typeof parallax !== 'object' ||
              (parallax.x !== undefined && !Number.isFinite(parallax.x)) ||
              (parallax.y !== undefined && !Number.isFinite(parallax.y))) {
            fail(`${path}.parallax`, 'must be a number or { "x", "y" }');
          }
          this.#checkKeys(fail, `${path}.parallax`, parallax, ['x', 'y']);
        }
        if (layer.repeat !== undefined && typeof layer.repeat !== 'boolean') {
          fail(`${path}.repeat`, 'must be a boolean');
        }
        if (layer.tileSize !== undefined && !(layer.tileSize > 0)) fail(`${path}.tileSize`, 'must be a positive number');
        if (layer.scale !== undefined && !(layer.scale > 0)) fail(`${path}.scale`, 'must be a positive number');
        if (layer.stretch !== undefined && typeof layer.stretch !== 'boolean') fail(`${path}.stretch`, 'must be a boolean');
        if (layer.cells !== undefined) {
          if (!Array.isArray(layer.cells)) fail(`${path}.cells`, 'must be an array of [column, row] pairs');
          layer.cells.forEach((cell, ci) => {
            if (!Array.isArray(cell) || cell.length !== 2 || !Number.isInteger(cell[0]) || !Number.isInteger(cell[1])) {
              fail(`${path}.cells[${ci}]`, 'must be an [column, row] pair of integers');
            }
          });
        }
      });
    }

    return { ...data, layers };
  }

  // === UI scenes ===

  #loadUI(data, fail) {
    if (data.assets) this.#checkKeys(fail, 'assets', data.assets, ['spritesheets']);
    if (!Array.isArray(data.elements)) fail('elements', 'must be an array');

    const elements = data.elements.map((element, i) => {
      const path = `elements[${i}]`;
      const type = element.type;
      if (!(type in ELEMENT_PROPERTY_KEYS)) {
        fail(`${path}.type`, `unknown element type ${JSON.stringify(type)} ` +
          `(known: ${Object.keys(ELEMENT_PROPERTY_KEYS).join(', ')})`);
      }

      this.#checkKeys(fail, path, element, [...ELEMENT_KEYS.common, ...ELEMENT_KEYS[type]]);
      this.#checkKeys(fail, `${path}.properties`, element.properties ?? {},
        ELEMENT_PROPERTY_KEYS[type]);

      if (element.anchor !== undefined && !(element.anchor in ANCHOR_ORIGINS)) {
        fail(`${path}.anchor`, `unknown anchor ${JSON.stringify(element.anchor)} ` +
          `(known: ${Object.keys(ANCHOR_ORIGINS).join(', ')})`);
      }
      // A fill rect ignores position and size, so it needs neither; every
      // other element is placed by x/y.
      if (!element.fill && (!Number.isFinite(element.x) || !Number.isFinite(element.y))) {
        fail(path, 'x and y must be numbers');
      }

      if (type === 'button') this.#checkButton(fail, path, element.properties ?? {});
      if (type === 'image' && typeof element.sprite !== 'string') {
        fail(`${path}.sprite`, 'missing or non-string sprite');
      }

      return element;
    });

    return { ...data, elements };
  }

  /** A button must do exactly one thing, and the thing must exist. */
  #checkButton(fail, path, properties) {
    const { action, onClick, variant } = properties;
    if (variant !== undefined && !BUTTON_VARIANTS.includes(variant)) {
      fail(`${path}.properties.variant`, `unknown variant ${JSON.stringify(variant)} ` +
        `(known: ${BUTTON_VARIANTS.join(', ')})`);
    }
    if (action && onClick) {
      fail(path, `has both action '${action}' and onClick '${onClick}'; ` +
        'a button does one or the other');
    }
    if (!action && !onClick) {
      fail(path, 'has neither action nor onClick, so clicking it does nothing');
    }
    // Cross-reference the scene a button switches to. This is the check that
    // would have caught the platformer's Settings button, which pointed at a
    // 'settings' scene that was never registered and failed only on click.
    if (onClick) {
      const known = this.#knownSceneNames();
      if (known && !known.includes(onClick)) {
        fail(`${path}.properties.onClick`, `no scene named '${onClick}' is registered ` +
          `(registered: ${known.join(', ') || 'none'})`);
      }
    }
  }

  /** Every scene name registered with the manager, loaded or pending. */
  #knownSceneNames() {
    const manager = this.game?.sceneManager;
    if (!manager) return null;
    return [...manager.scenes.keys(), ...manager.scenesToLoad.map(s => s.name)];
  }
}
