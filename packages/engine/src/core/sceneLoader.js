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
import { Quat } from './math.js';

export { SCENE_VERSION };

/** An error carrying the scene and the field path that caused it. */
export class SceneValidationError extends Error {
  constructor(scene, path, message) {
    super(`Scene '${scene}'${path ? ` at ${path}` : ''}: ${message}`);
    this.name = 'SceneValidationError';
    this.scene = scene;
    this.path = path;
    /** The problem alone, without the scene and the path. */
    this.detail = message;
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
  load(data, sceneName = data?.name ?? 'unknown', options = {}) {
    return this.#load(data, sceneName, null, options);
  }

  /**
   * Every problem with a scene, not just the first — what an editor shows.
   * The schema walk checks each object, field and list entry on its own, so
   * one bad object does not hide the next. What has to hold before the
   * schema can even be chosen (an object, the version, the type, `uses`
   * resolving) still stops at its first problem.
   *
   * @param {Object} data - Parsed scene JSON
   * @param {string} [sceneName]
   * @returns {{loaded: Object|null, issues: SceneValidationError[]}}
   *   `loaded` is the normalized scene when there are no issues, else null.
   */
  check(data, sceneName = data?.name ?? 'unknown', options = {}) {
    const issues = [];
    const collect = (error) => {
      if (!(error instanceof SceneValidationError)) return false;
      issues.push(error);
      return true;
    };
    let loaded = null;
    try {
      loaded = this.#load(data, sceneName, collect, options);
    } catch (error) {
      if (!collect(error)) throw error;
    }
    return { loaded: issues.length ? null : loaded, issues };
  }

  /**
   * @param {object} data
   * @param {string} sceneName
   * @param {((error: unknown) => boolean)|null} collect
   * @param {{scenes?: Record<string, object>, chain?: string[]}} [options] -
   *   `scenes`: the raw documents of the scenes this one may instance, by
   *   name (the scene manager fetches them; see `composition`); without it
   *   an instance is checked but not expanded. `chain`: the scenes being
   *   composed above this one, for the cycle check.
   */
  #load(data, sceneName, collect, options = {}) {
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

    const loaded = validate(schema, scene, {
      fail,
      collect: collect ?? undefined,
      onRef: options.onRef,
      refs: this.#refs(scene),
      context: {
        spritesheets: scene.assets?.spritesheets ?? {},
        prefabs: scene.prefabs ?? {},
        constraintTypes: this.game?.constraintTypes ?? null,
        actors: this.game?.actors ?? null
      }
    });
    // Composition expands after the document validates on its own terms,
    // and only when the instanced scenes are at hand; a structural check
    // with no library leaves the instances as entries.
    if (options.scenes && hasInstances(loaded)) {
      return this.#compose(loaded, sceneName, fail, options);
    }
    return loaded;
  }

  /**
   * Expand a level's scene instances (`layers[].scenes[]`): each named
   * scene is loaded through this loader (so it validates, takes its
   * defaults and composes its own instances), then its prefabs, assets, paths,
   * objects and props join this level under the instance's id as a
   * prefix, placed by the instance's position and turn, with the
   * instance's `overrides` written over its objects first. One format
   * comes out: what `Scene` builds is a level with more objects in it.
   */
  #compose(scene, sceneName, fail, options) {
    const chain = options.chain ?? [sceneName];
    const dimensions = scene.world?.dimensions ?? 2;
    const assets = {
      ...scene.assets,
      spritesheets: { ...scene.assets?.spritesheets },
      models: { ...scene.assets?.models },
      environments: { ...scene.assets?.environments }
    };
    const prefabs = { ...scene.prefabs };
    const paths = { ...scene.paths };
    const layers = scene.layers.map((layer) => ({ ...layer, objects: [...layer.objects], ...(layer.props && { props: [...layer.props] }) }));

    layers.forEach((layer, li) => {
      (layer.scenes ?? []).forEach((instance, si) => {
        const where = `layers[${li}].scenes[${si}]`;
        if (chain.includes(instance.scene)) {
          fail(`${where}.scene`, `scene '${instance.scene}' would contain itself (${[...chain, instance.scene].join(' > ')})`);
        }
        const raw = options.scenes[instance.scene];
        if (!raw) {
          fail(`${where}.scene`, `scene '${instance.scene}' is registered but its document is not at hand to compose; ` +
            'register it with a fetch that returns its JSON');
        }
        const inner = this.#load(raw, instance.scene, null, { ...options, chain: [...chain, instance.scene] });
        if (inner.type !== 'level') fail(`${where}.scene`, `'${instance.scene}' is a ${inner.type} scene; only a level can be instanced`);
        if ((inner.world?.dimensions ?? 2) !== dimensions) {
          fail(`${where}.scene`, `'${instance.scene}' is ${inner.world?.dimensions ?? 2}D and this level is ${dimensions}D`);
        }
        const prefix = `${instance.id}/`;
        const turn = dimensions === 3 ? (instance.yaw ?? 0) : (instance.angle ?? 0);
        const place = (x, y, z) => {
          // A 2D angle turns in the plane; a 3D yaw turns about the up axis.
          const c = Math.cos(turn);
          const sn = Math.sin(turn);
          if (dimensions === 3) {
            return { x: instance.x + c * x + sn * (z ?? 0), y: instance.y + y, z: (instance.z ?? 0) - sn * x + c * (z ?? 0) };
          }
          return { x: instance.x + c * x - sn * y, y: instance.y + sn * x + c * y };
        };
        const round = (value) => Math.round(value * 1e6) / 1e6;

        for (const [key, sheet] of Object.entries(inner.assets?.spritesheets ?? {})) assets.spritesheets[prefix + key] = sheet;
        for (const [key, model] of Object.entries(inner.assets?.models ?? {})) assets.models[prefix + key] = model;
        for (const [key, environment] of Object.entries(inner.assets?.environments ?? {})) assets.environments[prefix + key] = environment;
        for (const [key, prefab] of Object.entries(inner.prefabs ?? {})) {
          prefabs[prefix + key] = {
            ...prefab,
            ...(prefab.spritesheet && { spritesheet: prefix + prefab.spritesheet }),
            ...(prefab.mesh?.model && { mesh: { ...prefab.mesh, model: prefix + prefab.mesh.model } })
          };
        }
        for (const [key, path] of Object.entries(inner.paths ?? {})) {
          paths[prefix + key] = {
            ...path,
            points: path.points.map((point) => {
              const at = place(point.x, point.y, point.z);
              return dimensions === 3 ? { x: round(at.x), y: round(at.y), z: round(at.z) } : { x: round(at.x), y: round(at.y) };
            })
          };
        }
        for (const innerLayer of inner.layers ?? []) {
          for (const source of innerLayer.objects) {
            const object = { ...source, ...instance.overrides?.[source.id] };
            const at = place(object.x, object.y, object.z);
            const composed = {
              ...object,
              id: prefix + source.id,
              prefab: prefix + object.prefab,
              x: round(at.x), y: round(at.y),
              ...(dimensions === 3 && { z: round(at.z) }),
              composed: instance.id
            };
            if (composed.overrides?.spritesheet) composed.overrides = { ...composed.overrides, spritesheet: prefix + composed.overrides.spritesheet };
            if (composed.overrides?.mesh?.model) composed.overrides = { ...composed.overrides, mesh: { ...composed.overrides.mesh, model: prefix + composed.overrides.mesh.model } };
            if (turn) {
              if (dimensions === 3) {
                const q = Quat.multiply(Quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, turn), quaternionOf(object.rotation));
                composed.rotation = [round(q.x), round(q.y), round(q.z), round(q.w)];
              } else {
                composed.angle = round((object.angle ?? 0) + turn);
              }
            }
            layer.objects.push(composed);
          }
          for (const prop of innerLayer.props ?? []) {
            layer.props ??= [];
            layer.props.push({
              ...prop,
              id: prefix + prop.id,
              prefab: prefix + prop.prefab,
              composed: instance.id,
              instances: prop.instances.map(([x, y, z, yaw = 0, scale = 1]) => {
                const at = place(x, y, z);
                return [round(at.x), round(at.y), round(at.z), round(yaw + turn), scale];
              })
            });
          }
        }
      });
    });
    return { ...scene, assets, prefabs, layers, ...(Object.keys(paths).length && { paths }) };
  }

  /**
   * Expand `uses` into the inline shape: an asset bound to a local name
   * becomes an entry in `assets.spritesheets`, `assets.models`,
   * `assets.environments` or `prefabs`, exactly as if the scene had
   * written it out. A scene that uses assets and one that declares
   * everything itself are then the same document, so there is one format
   * to understand and one path to test.
   *
   * A used prefab brings its sheet and its mesh's model with it, since the
   * asset names those by uid and nothing downstream resolves uids.
   */
  #resolveUses(scene, fail) {
    if (!scene.uses || typeof scene.uses !== 'object') return scene;

    const database = this.game?.assets;
    if (!database) {
      fail('uses', 'the scene uses assets, but the game has no asset database loaded');
    }

    const spritesheets = { ...scene.assets?.spritesheets };
    const models = { ...scene.assets?.models };
    const environments = { ...scene.assets?.environments };
    const prefabs = { ...scene.prefabs };
    const declaredSheets = new Set(Object.keys(spritesheets));
    const declaredModels = new Set(Object.keys(models));
    const declaredEnvironments = new Set(Object.keys(environments));
    const declaredPrefabs = new Set(Object.keys(prefabs));
    /** Local name each sheet uid was bound to, so one is bound once. */
    const sheetNames = new Map();
    /** The same, for the models a used prefab's mesh names. */
    const modelNames = new Map();

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

    /** Add a model under `name`, on the same terms as a sheet. */
    const addModel = (name, uid, path) => {
      if (declaredModels.has(name)) {
        fail(path, `'${name}' is already a model declared by this scene`);
      }
      models[name] = database.model(uid);
      modelNames.set(uid, name);
      return name;
    };

    /** The local name for a prefab mesh's model, binding it on first use. */
    const modelFor = (uid, path) => {
      if (modelNames.has(uid)) return modelNames.get(uid);
      const asset = database.get(uid);
      if (asset?.type !== 'model') {
        fail(path, `a prefab's mesh.model must be a model asset uid, and '${uid}' is ` +
          (asset ? `a ${asset.type}` : 'not a loaded asset'));
      }
      const preferred = asset.name ?? uid;
      return addModel(declaredModels.has(preferred) ? uid : preferred, uid, path);
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
      } else if (asset.type === 'model') {
        addModel(local, uid, path);
      } else if (asset.type === 'environment') {
        if (declaredEnvironments.has(local)) {
          fail(path, `'${local}' is already an environment declared by this scene`);
        }
        environments[local] = database.environment(uid);
      } else if (asset.type === 'prefab') {
        if (declaredPrefabs.has(local)) {
          fail(path, `'${local}' is already a prefab declared by this scene`);
        }
        prefabs[local] = database.prefab(
          uid,
          sheetUid => sheetFor(sheetUid, path),
          modelUid => modelFor(modelUid, path)
        );
      } else {
        // A type added to the manifest but not taught to scenes.
        fail(path, `asset '${uid}' is a ${asset.type}, which a scene cannot use directly`);
      }
    }

    const assets = { ...scene.assets };
    if (Object.keys(spritesheets).length) assets.spritesheets = spritesheets;
    if (Object.keys(models).length) assets.models = models;
    if (Object.keys(environments).length) assets.environments = environments;
    return {
      ...scene,
      ...(Object.keys(assets).length && { assets }),
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
        (name, known) => `no prefab named '${name}' (declared: ${known.join(', ') || 'none'})`),
      model: scope(Object.keys(data.assets?.models ?? {}),
        (name, known) => `no model named '${name}' (declared: ${known.join(', ') || 'none'})`),
      environment: scope(Object.keys(data.assets?.environments ?? {}),
        (name, known) => `no environment named '${name}' (declared: ${known.join(', ') || 'none'})`),
      path: scope(Object.keys(data.paths ?? {}),
        (name, known) => `no path named '${name}' (declared: ${known.join(', ') || 'none'})`)
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

/** Whether any layer of a level instances another scene. */
function hasInstances(scene) {
  return (scene?.layers ?? []).some((layer) => layer.scenes?.length);
}

/** A scene's `[x, y, z, w]` rotation as a quaternion object, identity when absent. */
function quaternionOf(rotation) {
  return Array.isArray(rotation) ? { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] } : { x: 0, y: 0, z: 0, w: 1 };
}
