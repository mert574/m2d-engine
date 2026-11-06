/**
 * The asset manifest format, written as schema descriptors.
 *
 * Beside each asset's uid sit the things an engine cannot infer from the
 * bytes: where the source file is, and the **import settings** that say
 * how to read it — the frame size that turns one PNG into a sprite sheet.
 * Unity keeps this per file in `.meta`, Godot in `.import`; in a browser
 * the equivalent is one document the game fetches, which is what this is.
 *
 * Two kinds of asset, by what they are made of:
 *
 * - **Imported** — there is a source file. `source` is its path, `import`
 *   holds the settings for reading it. A sprite sheet is this.
 * - **Authored** — there is no file, the asset *is* data, in `data`. A
 *   prefab is this.
 *
 * References between assets are by uid, the identity that survives a
 * rename. References from a scene are by local name, bound in its `uses`
 * block, so scene files stay legible — Godot's `ext_resource` does the
 * same. See `assets.js` for the database and `sceneSchema.js` for `uses`.
 */

import { s } from './schema.js';

/** The only asset manifest version this engine understands. */
export const MANIFEST_VERSION = 1;

/** Asset types the engine knows how to resolve. */
export const ASSET_TYPES = ['spritesheet', 'prefab'];

/**
 * What a UID may look like. Deliberately the same spelling as a scene
 * object's id: an editor generates these, but a person writing a manifest
 * by hand should be able to type `hero-sheet` and have it work.
 */
const UID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

const uid = (options = {}) => s.string({
  pattern: UID_PATTERN,
  nonEmpty: true,
  editor: 'asset',
  ...options,
  message: value => (typeof value === 'string' && value
    ? `'${value}' is not a valid uid: letters, digits, '-', '_' and '.', starting with a letter or digit`
    : 'missing or non-string uid')
});

/**
 * Import settings for a sprite sheet: how to read one image as a grid of
 * frames. The same fields a scene's inline `assets.spritesheets` entry
 * carries, minus the url, which is the asset's `source`.
 */
const SPRITESHEET_IMPORT = s.object({
  frameWidth: s.number({ required: true, positive: true, unit: 'px' }),
  frameHeight: s.number({ required: true, positive: true, unit: 'px' }),
  animations: s.record(s.object({
    frames: s.array(
      s.tuple([s.number(), s.number()], { message: 'must be a [tileX, tileY] pair' }),
      { required: true, minLength: 1, message: 'must be a non-empty array of [tileX, tileY] pairs' }),
    fps: s.number({ min: 0 }),
    loop: s.boolean()
  }))
}, { required: true });

/**
 * A prefab as an asset: the same shape a scene's inline prefab has, except
 * that its sprite sheet is named by UID rather than by a scene-local name.
 * An asset cannot see a scene's names, and the sheet has to come along
 * with the prefab wherever it is used.
 */
const PREFAB_DATA = s.object({
  actor: s.ref('actor', { required: true }),
  spritesheet: uid({ label: 'Sprite sheet' }),
  defaultAnimation: s.string(),
  physics: s.any({ description: 'Validated as part of the scene that uses it' }),
  constraints: s.any({ description: 'Validated as part of the scene that uses it' })
}, { required: true });

const ASSET = s.tagged('type', {
  spritesheet: s.object({
    type: s.string(),
    name: s.string({ nonEmpty: true, label: 'Name', description: 'For the editor and error messages' }),
    source: s.string({ required: true, nonEmpty: true, editor: 'file', label: 'Source file' }),
    import: SPRITESHEET_IMPORT
  }),
  prefab: s.object({
    type: s.string(),
    name: s.string({ nonEmpty: true, label: 'Name' }),
    data: PREFAB_DATA
  })
}, {
  message: value => `unknown asset type ${JSON.stringify(value)} (known: ${ASSET_TYPES.join(', ')})`
});

export const MANIFEST_SCHEMA = s.object({
  version: s.integer({ required: true }),
  name: s.string({ label: 'Project name' }),
  /**
   * Prefixed onto every `source` when it is fetched, so a manifest can be
   * written with paths relative to the project rather than to the page.
   */
  basePath: s.string({ label: 'Base path' }),
  assets: s.record(ASSET, { required: true })
}, {
  refine(manifest, { fail }) {
    for (const [id, asset] of Object.entries(manifest.assets)) {
      if (!UID_PATTERN.test(id)) {
        fail(`assets.${id}`, `'${id}' is not a valid uid: letters, digits, '-', '_' and '.', ` +
          'starting with a letter or digit');
      }
      // A prefab's sheet has to exist, or using the prefab fails later with
      // nothing to point at.
      const sheet = asset.type === 'prefab' ? asset.data.spritesheet : null;
      if (sheet && !(sheet in manifest.assets)) {
        fail(`assets.${id}.data.spritesheet`, `no asset with uid '${sheet}'`);
      }
      if (sheet && manifest.assets[sheet].type !== 'spritesheet') {
        fail(`assets.${id}.data.spritesheet`,
          `asset '${sheet}' is a ${manifest.assets[sheet].type}, not a spritesheet`);
      }
    }
  }
});
