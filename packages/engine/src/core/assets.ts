/**
 * The asset database: every asset the game owns, by uid.
 *
 * A scene that declares its sprite sheets and prefabs inline is
 * self-contained, which is the right trade for a small game. This is the
 * other trade, the one a project needs once assets are shared: one prefab
 * placed by four levels and edited once, a texture renamed without
 * breaking the scenes that draw it.
 *
 * The uid is what makes that work. A scene refers to an asset by neither
 * its name nor its path — both of which a person will change — but by an
 * identity that does not. The name is a label; the path is where the
 * bytes happen to live today.
 *
 * Both styles coexist: `SceneLoader` expands a scene's `uses` block into
 * the inline shape, so nothing downstream knows which way an asset
 * arrived. The format is `assetSchema.js`.
 */

import { validate } from './schema.ts';
import { MANIFEST_SCHEMA, MANIFEST_VERSION } from './assetSchema.ts';
import type { Infer } from './schema.ts';

/** One validated manifest entry; the manifest schema is the source of truth. */
type AssetEntry = Infer<typeof MANIFEST_SCHEMA>['assets'][string];

/** An error carrying the path of the manifest field that caused it. */
export class AssetManifestError extends Error {
  path: string;

  constructor(path: string, message: string) {
    super(`Asset manifest${path ? ` at ${path}` : ''}: ${message}`);
    this.name = 'AssetManifestError';
    this.path = path;
  }
}

export class AssetDatabase {
  /** Uid to validated asset entry. */
  assets: Map<string, AssetEntry>;
  /** Prefixed onto every asset `source`. */
  basePath: string;

  constructor() {
    this.assets = new Map();
    this.basePath = '';
  }

  /**
   * Validate a manifest and index it, replacing anything loaded before.
   * `data` is a parsed manifest document; `actors` is for checking that a
   * prefab asset names a registered actor, the same cross-reference a
   * scene's inline prefab gets — omitted, the check is skipped.
   */
  load(data: unknown, { actors = null }: { actors?: Map<string, unknown> | null } = {}): this {
    const fail = (path: string, message: string): never => { throw new AssetManifestError(path, message); };

    if (!data || typeof data !== 'object') fail('', 'manifest is not an object');
    const document = data as Record<string, unknown>;
    if (document.version !== MANIFEST_VERSION) {
      fail('version', `expected ${MANIFEST_VERSION}, got ${JSON.stringify(document.version)}`);
    }

    const refs: Record<string, { has(name: string): boolean; describe(name: string): string }> = {};
    if (actors) {
      refs.actor = {
        has: (name) => actors.has(name),
        describe: (name) => `actor '${name}' is not registered ` +
          `(registered: ${[...actors.keys()].join(', ') || 'none'})`
      };
    }

    const manifest = validate(MANIFEST_SCHEMA, data, { fail, refs }) as Infer<typeof MANIFEST_SCHEMA>;

    this.assets = new Map(Object.entries(manifest.assets));
    this.basePath = manifest.basePath ?? '';
    return this;
  }

  /** Whether an asset with this uid is loaded. */
  has(uid: string): boolean {
    return this.assets.has(uid);
  }

  /** The raw asset entry, or null. */
  get(uid: string): AssetEntry | null {
    return this.assets.get(uid) ?? null;
  }

  /** Every uid, for error messages and an editor's browser. */
  get uids(): string[] {
    return [...this.assets.keys()];
  }

  /**
   * A sprite-sheet asset in the shape a scene's inline `assets.spritesheets`
   * entry has, so everything downstream — validation, `SpriteSheet`, the
   * renderer — sees one kind of sprite sheet and not two.
   */
  spritesheet(uid: string): Record<string, unknown> | null {
    const asset = this.get(uid);
    if (asset?.type !== 'spritesheet') return null;
    return { url: this.basePath + asset.source, ...(asset.import as Record<string, unknown>) };
  }

  /**
   * A model asset in the shape a scene's inline `assets.models` entry has.
   */
  model(uid: string): { url: string } | null {
    const asset = this.get(uid);
    if (asset?.type !== 'model') return null;
    return { url: this.basePath + asset.source };
  }

  /**
   * An environment asset in the shape a scene's inline
   * `assets.environments` entry has. The import's `intensity` is part of
   * the entry, so a scene that binds the asset lights the same way the
   * manifest says it should.
   */
  environment(uid: string): Record<string, unknown> | null {
    const asset = this.get(uid);
    if (asset?.type !== 'environment') return null;
    return { url: this.basePath + asset.source, ...(asset.import as Record<string, unknown>) };
  }

  /**
   * A prefab asset in the shape a scene's inline prefab has.
   *
   * The difference between the two is how assets are named: an asset names
   * its sprite sheet and its mesh's model by uid, because an asset cannot
   * see a scene's local names, and a scene's prefab names them locally.
   * `sheetName` and `modelName` map the one to the other — the caller has
   * just bound that sheet or model into the scene.
   *
   */
  prefab(uid: string, sheetName: (sheetUid: string) => string, modelName?: (modelUid: string) => string): Record<string, unknown> | null {
    const asset = this.get(uid);
    if (asset?.type !== 'prefab') return null;
    const prefab = { ...(asset.data as Record<string, unknown> & { spritesheet?: string; mesh?: { model?: string } }) };
    if (prefab.spritesheet) prefab.spritesheet = sheetName(prefab.spritesheet);
    if (prefab.mesh?.model && modelName) {
      prefab.mesh = { ...prefab.mesh, model: modelName(prefab.mesh.model) };
    }
    return prefab;
  }
}
