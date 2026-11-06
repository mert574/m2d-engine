/**
 * Scene format migrations: how a document written for an older version of
 * the format is brought up to the current one.
 *
 * The scene format is versioned and validated strictly, which is right for
 * a format people hand-author — and on its own it means every format change
 * invalidates every file ever written. That is survivable while scenes are
 * written by hand in a repository that changes with the engine. It stops
 * being survivable the moment an editor exists: a project is then a body of
 * files the user owns, and opening one written last month must not fail
 * because the engine moved on.
 *
 * So the loader does not reject an old document, it upgrades one. Each
 * migration takes a document at version N and returns the equivalent at
 * N+1; the loader chains them and validates the result against the current
 * schema only. A migration never has to know about any version but its own,
 * and validation never has to know that older versions existed.
 *
 * Rules a migration keeps:
 *
 * - **It does not mutate its input.** The caller may still hold the
 *   original, and a cached scene config must not change under it.
 * - **It migrates, it does not validate.** Garbage in an old document is
 *   the current schema's business to reject, with its usual message and
 *   path. A migration that also validated would duplicate those checks once
 *   per version.
 * - **It is deterministic.** The same old document always migrates to the
 *   same new one, so a scene that is migrated and saved does not differ
 *   between two machines.
 *
 * A document from a *newer* version than this engine knows cannot be
 * migrated — there is no forward migration to run — and the loader says so
 * rather than failing field by field.
 *
 * The engine's own scenes are always written at the current version;
 * `examples/test/scenes.test.js` asserts it. Migrations exist for documents
 * the engine does not own.
 */

/**
 * Version 1 to 2: every object and UI element carries a unique string `id`.
 *
 * Version 1 had an optional `id` that nothing read, and the demos numbered
 * theirs. Identity you cannot rely on is not identity — an editor needs to
 * name a selection, an undo entry and a cross-reference, and all three need
 * every object to have an id that survives reordering and re-saving. So the
 * field became required, unique and a string.
 *
 * Numbers become their decimal strings. An object with no id at all gets
 * one from its prefab and its position in the layer, which is stable for a
 * document that is not being edited — the only kind that needs migrating.
 * Collisions are suffixed, because a v1 document was never checked for
 * uniqueness and may genuinely contain two of the same id.
 */
function v1ToV2(data) {
  if (data.type === 'ui') {
    const taken = new Set();
    return {
      ...data,
      version: 2,
      elements: (data.elements ?? []).map((element, i) =>
        ({ ...element, id: unique(element.id ?? `${element.type ?? 'element'}-${i}`, taken) }))
    };
  }

  const taken = new Set();
  return {
    ...data,
    version: 2,
    layers: (data.layers ?? []).map(layer => ({
      ...layer,
      objects: (layer.objects ?? []).map((object, i) =>
        ({ ...object, id: unique(object.id ?? `${object.prefab ?? 'object'}-${i}`, taken) }))
    }))
  };
}

/** `candidate` as a string, suffixed until it is not already in `taken`. */
function unique(candidate, taken) {
  const base = String(candidate);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * Migrations by the version they upgrade *from*. Adding a format version
 * means bumping `SCENE_VERSION` and adding its predecessor here.
 * @type {Object<number, (data: object) => object>}
 */
export const MIGRATIONS = { 1: v1ToV2 };

/**
 * Bring `data` up to `target`, applying one migration per version step.
 *
 * @param {object} data - A scene document at some version.
 * @param {number} target - The version to reach (`SCENE_VERSION`).
 * @param {(path: string, message: string) => never} fail
 * @returns {object} A new document at `target`.
 */
export function migrate(data, target, fail) {
  let current = data;
  for (let version = current.version; version < target; version++) {
    const step = MIGRATIONS[version];
    if (!step) {
      fail('version', `no migration from scene format ${version} to ${version + 1}`);
    }
    current = step(current);
  }
  return current;
}
