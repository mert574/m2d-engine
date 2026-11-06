/**
 * Ids for a scene built in code.
 *
 * Every object in a scene carries a unique `id` (see the scene format
 * reference). A scene written to a file gets its ids from whoever wrote the
 * file — an author, a build script, later an editor. A scene assembled at
 * runtime from a generated layout has no such author, so it numbers its own
 * objects here, by prefab, in the order they were placed.
 *
 * The result is stable for a given layout, which is what matters: the same
 * generated level produces the same ids on every machine and every run, so
 * a saved reference to `hedge-42` still means the same hedge.
 *
 * @param {Array<{prefab: string, id?: string}>} objects
 * @returns {Array<object>} The same objects, each with an `id`.
 */
export function withIds(objects) {
  const counts = new Map();
  return objects.map(object => {
    if (object.id !== undefined) return object;
    const n = (counts.get(object.prefab) ?? 0) + 1;
    counts.set(object.prefab, n);
    return { id: `${object.prefab}-${n}`, ...object };
  });
}
