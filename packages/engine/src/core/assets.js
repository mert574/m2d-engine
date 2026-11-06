/**
 * The asset database: every asset the game owns, by UID.
 *
 * A scene that declares its sprite sheets and prefabs inline is
 * self-contained, which is the right trade for a small game written by
 * hand. This is the other trade, the one a project needs once assets are
 * shared: one prefab used by four levels, edited once; a texture renamed
 * without breaking the scenes that draw it; a model dropped in by someone
 * who will not hand-edit JSON afterwards.
 *
 * What makes that work is the UID. A scene does not refer to an asset by
 * its path or its name — both of which a person will change — but by an
 * identity that never changes. The name is a label for the editor and for
 * error messages; the path is where the bytes happen to live today.
 *
 * Both styles coexist, and the loader merges them. A scene's `uses` block
 * binds UIDs to short local names, and the rest of the scene reads as it
 * always did (`"prefab": "guard"`). Declaring a prefab inline still works
 * and means what it always meant. What a scene cannot do is both, under
 * one name: that is an error rather than a silent precedence rule.
 *
 * The format is `assetSchema.js`. In a project with an editor, this
 * document is what the editor compiles from its per-file import settings —
 * the browser-side equivalent of Unity's `.meta` files or Godot's
 * `.import` files, gathered into one thing a game can fetch.
 */

import { validate } from './schema.js';
import { MANIFEST_SCHEMA, MANIFEST_VERSION } from './assetSchema.js';

/** An error carrying the path of the manifest field that caused it. */
export class AssetManifestError extends Error {
  constructor(path, message) {
    super(`Asset manifest${path ? ` at ${path}` : ''}: ${message}`);
    this.name = 'AssetManifestError';
    this.path = path;
  }
}

export class AssetDatabase {
  constructor() {
    /** @type {Map<string, object>} uid to validated asset entry. */
    this.assets = new Map();
    /** Prefixed onto every asset `source`. */
    this.basePath = '';
  }

  /**
   * Validate a manifest and index it, replacing anything loaded before.
   *
   * @param {object} data - A parsed manifest document.
   * @param {object} [options]
   * @param {Map<string, Function>} [options.actors] - For checking that a
   *   prefab asset names a registered actor, the same cross-reference a
   *   scene's inline prefab gets. Omitted, the check is skipped.
   * @returns {this}
   */
  load(data, { actors = null } = {}) {
    const fail = (path, message) => { throw new AssetManifestError(path, message); };

    if (!data || typeof data !== 'object') fail('', 'manifest is not an object');
    if (data.version !== MANIFEST_VERSION) {
      fail('version', `expected ${MANIFEST_VERSION}, got ${JSON.stringify(data.version)}`);
    }

    const refs = {};
    if (actors) {
      refs.actor = {
        has: name => actors.has(name),
        describe: name => `actor '${name}' is not registered ` +
          `(registered: ${[...actors.keys()].join(', ') || 'none'})`
      };
    }

    const manifest = validate(MANIFEST_SCHEMA, data, { fail, refs });

    this.assets = new Map(Object.entries(manifest.assets));
    this.basePath = manifest.basePath ?? '';
    return this;
  }

  /** Whether an asset with this uid is loaded. */
  has(uid) {
    return this.assets.has(uid);
  }

  /** The raw asset entry, or null. */
  get(uid) {
    return this.assets.get(uid) ?? null;
  }

  /** Every uid, for error messages and an editor's browser. */
  get uids() {
    return [...this.assets.keys()];
  }

  /** Every uid of a given type. */
  ofType(type) {
    return this.uids.filter(uid => this.assets.get(uid).type === type);
  }

  /**
   * A sprite-sheet asset in the shape a scene's inline `assets.spritesheets`
   * entry has, so everything downstream — validation, `SpriteSheet`, the
   * renderer — sees one kind of sprite sheet and not two.
   */
  spritesheet(uid) {
    const asset = this.get(uid);
    if (asset?.type !== 'spritesheet') return null;
    return { url: this.basePath + asset.source, ...asset.import };
  }

  /**
   * A prefab asset in the shape a scene's inline prefab has.
   *
   * The one difference between the two is the sprite sheet: an asset names
   * it by uid, because an asset cannot see a scene's local names, and a
   * scene's prefab names it locally. `sheetName` maps the one to the
   * other — the caller has just bound that sheet into the scene.
   *
   * @param {string} uid
   * @param {(sheetUid: string) => string} sheetName
   */
  prefab(uid, sheetName) {
    const asset = this.get(uid);
    if (asset?.type !== 'prefab') return null;
    const prefab = { ...asset.data };
    if (prefab.spritesheet) prefab.spritesheet = sheetName(prefab.spritesheet);
    return prefab;
  }

  /** Forget everything. */
  clear() {
    this.assets.clear();
    this.basePath = '';
  }
}
