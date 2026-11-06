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
 *
 * **The format itself lives in `sceneSchema.js`, as data.** This file is only
 * the part that cannot be: picking the schema for a scene's `type`, building
 * the namespaces that cross-references resolve against, and turning a
 * validation failure into a `SceneValidationError`. A new scene field is
 * added to `sceneSchema.js` and to `docs/reference/scene-format.md`.
 */

import { validate } from './schema.js';
import { SCENE_VERSION, schemaForType } from './sceneSchema.js';

export { SCENE_VERSION };

/** An error carrying the scene and the field path that caused it. */
export class SceneValidationError extends Error {
  constructor(scene, path, message) {
    super(`Scene '${scene}'${path ? ` at ${path}` : ''}: ${message}`);
    this.name = 'SceneValidationError';
    this.scene = scene;
    this.path = path;
  }
}

/**
 * A namespace an `s.ref` field resolves against.
 * @param {Iterable<string>} names
 * @param {(name: string, known: string[]) => string} describe - The error
 *   for a name that is not in the set.
 */
function scope(names, describe) {
  const known = [...names];
  return { has: name => known.includes(name), describe: name => describe(name, known) };
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

    // Version and type are checked before the schema, not by it: the version
    // decides whether this engine understands the document at all, and the
    // type decides which schema to apply. Neither can be expressed inside a
    // schema that has not been chosen yet.
    if (data.version !== SCENE_VERSION) {
      fail('version', `expected ${SCENE_VERSION}, got ${JSON.stringify(data.version)}`);
    }
    const schema = schemaForType(data.type);
    if (!schema) {
      fail('type', `expected 'level' or 'ui', got ${JSON.stringify(data.type)}`);
    }

    return validate(schema, data, {
      fail,
      refs: this.#refs(data),
      context: { spritesheets: data.assets?.spritesheets ?? {} }
    });
  }

  /**
   * The namespaces this document's cross-references resolve against.
   *
   * Two come from the document (its own spritesheets and prefabs) and two
   * from the game (registered actors and scenes). A scope the game cannot
   * supply is left out rather than left empty, and `validate` then skips the
   * existence check — which is how a loader constructed without a game still
   * validates structure.
   */
  #refs(data) {
    const refs = {
      spritesheet: scope(Object.keys(data.assets?.spritesheets ?? {}),
        (name, known) => `no spritesheet named '${name}' (declared: ${known.join(', ') || 'none'})`),
      prefab: scope(Object.keys(data.prefabs ?? {}),
        (name, known) => `no prefab named '${name}' (declared: ${known.join(', ') || 'none'})`)
    };

    if (this.game?.actors) {
      refs.actor = scope(this.game.actors.keys(),
        (name, known) => `actor '${name}' is not registered (registered: ${known.join(', ') || 'none'})`);
    }
    const scenes = this.#knownSceneNames();
    if (scenes) {
      refs.scene = scope(scenes,
        (name, known) => `no scene named '${name}' is registered (registered: ${known.join(', ') || 'none'})`);
    }
    return refs;
  }

  /** Every scene name registered with the manager, loaded or pending. */
  #knownSceneNames() {
    const manager = this.game?.sceneManager;
    if (!manager) return null;
    return [...manager.scenes.keys(), ...manager.scenesToLoad.map(s => s.name)];
  }
}
