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

    // Version and type are settled before the schema, not by it: the
    // version says which format this document is in, and the type says
    // which schema to apply. Neither can be expressed inside a schema that
    // has not been chosen yet.
    if (data.version !== SCENE_VERSION) {
      fail('version', data.version > SCENE_VERSION
        ? `scene format ${data.version} is newer than this engine understands ` +
          `(${SCENE_VERSION}); upgrade m2d-engine`
        : `expected scene format ${SCENE_VERSION}, got ${JSON.stringify(data.version)}`);
    }

    let scene = data;
    const schema = schemaForType(scene.type);
    if (!schema) {
      fail('type', `expected 'level' or 'ui', got ${JSON.stringify(scene.type)}`);
    }

    // `uses` expands into the sprite sheets and prefabs the scene would
    // otherwise have declared inline, so everything after this — the
    // schema, `Scene`, the sprite loader — sees one kind of scene.
    scene = this.#resolveUses(scene, fail);

    return validate(schema, scene, {
      fail,
      refs: this.#refs(scene),
      context: {
        spritesheets: scene.assets?.spritesheets ?? {},
        prefabs: scene.prefabs ?? {},
        constraintTypes: this.game?.constraintTypes ?? null
      }
    });
  }

  /**
   * Expand `uses` into the inline shape: an asset bound to a local name
   * becomes a sprite sheet in `assets.spritesheets` or a prefab in
   * `prefabs`, exactly as if the scene had written it out. A scene that
   * uses assets and one that declares everything itself are then the same
   * document, so there is one format to understand and one path to test.
   *
   * A used prefab brings its sheet with it, since the asset names that
   * sheet by uid and nothing downstream resolves uids.
   */
  #resolveUses(scene, fail) {
    if (!scene.uses || typeof scene.uses !== 'object') return scene;

    const database = this.game?.assets;
    if (!database) {
      fail('uses', 'the scene uses assets, but the game has no asset database loaded');
    }

    const spritesheets = { ...scene.assets?.spritesheets };
    const prefabs = { ...scene.prefabs };
    const declaredSheets = new Set(Object.keys(spritesheets));
    const declaredPrefabs = new Set(Object.keys(prefabs));
    /** Local name each sheet uid was bound to, so one is bound once. */
    const sheetNames = new Map();

    /**
     * Add a sheet under `name`, refusing to shadow one the scene wrote
     * itself: a precedence rule there would mean one of the two silently
     * losing.
     */
    const addSheet = (name, uid, path) => {
      if (declaredSheets.has(name)) {
        fail(path, `'${name}' is already a sprite sheet declared by this scene`);
      }
      spritesheets[name] = database.spritesheet(uid);
      sheetNames.set(uid, name);
      return name;
    };

    /** The local name for a prefab's sheet, binding it on first use. */
    const sheetFor = (uid, path) => {
      if (sheetNames.has(uid)) return sheetNames.get(uid);
      // Its own name, or its uid when the scene already has that name —
      // the uid being the one name that cannot collide.
      const preferred = database.get(uid)?.name ?? uid;
      return addSheet(declaredSheets.has(preferred) ? uid : preferred, uid, path);
    };

    for (const [local, uid] of Object.entries(scene.uses)) {
      const path = `uses.${local}`;
      if (typeof uid !== 'string') fail(path, 'must be an asset uid');
      const asset = database.get(uid);
      if (!asset) {
        fail(path, `no asset with uid '${uid}' (loaded: ${database.uids.join(', ') || 'none'})`);
      }

      if (asset.type === 'spritesheet') {
        addSheet(local, uid, path);
      } else if (asset.type === 'prefab') {
        if (declaredPrefabs.has(local)) {
          fail(path, `'${local}' is already a prefab declared by this scene`);
        }
        prefabs[local] = database.prefab(uid, sheetUid => sheetFor(sheetUid, path));
      } else {
        // A type added to the manifest but not taught to scenes.
        fail(path, `asset '${uid}' is a ${asset.type}, which a scene cannot use directly`);
      }
    }

    return {
      ...scene,
      ...(Object.keys(spritesheets).length && { assets: { ...scene.assets, spritesheets } }),
      ...(Object.keys(prefabs).length && { prefabs })
    };
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

    if (this.game?.assets) {
      refs.asset = scope(this.game.assets.uids,
        (name, known) => `no asset with uid '${name}' (loaded: ${known.join(', ') || 'none'})`);
    }
    if (this.game?.constraintTypes) {
      refs.constraint = scope(this.game.constraintTypes.keys(),
        (name, known) => `constraint '${name}' is not registered (registered: ${known.join(', ') || 'none'})`);
    }
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
