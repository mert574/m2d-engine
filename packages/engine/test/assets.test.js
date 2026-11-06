import { describe, it, expect } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { AssetDatabase, AssetManifestError } from '../src/core/assets.js';
import { MANIFEST_VERSION } from '../src/core/assetSchema.js';
import { SceneLoader, SCENE_VERSION } from '../src/core/sceneLoader.js';
import { Hover } from '../src/constraints/hover.js';

/**
 * The asset database, and the `uses` block that reaches into it.
 *
 * The thing being bought here is identity that survives being renamed. A
 * scene refers to an asset by uid, never by its path and never by the name
 * a person will change next week; the name is a label and the path is
 * where the bytes happen to live today. The second thing is sharing: one
 * prefab, edited once, placed by four levels.
 *
 * Inline sprite sheets and prefabs still work and still mean what they
 * meant. These two styles meet in the loader, which expands `uses` into
 * the inline shape so nothing downstream has to know which was used.
 */

class Guard extends Entity { name = 'Guard'; }

const manifest = (overrides = {}) => ({
  version: MANIFEST_VERSION,
  basePath: 'assets/',
  assets: {
    'sheet-hero': {
      type: 'spritesheet',
      name: 'hero',
      source: 'textures/hero.png',
      import: { frameWidth: 32, frameHeight: 48, animations: { idle: { frames: [[0, 0]] } } }
    },
    'prefab-guard': {
      type: 'prefab',
      name: 'guard',
      data: {
        actor: 'Guard',
        spritesheet: 'sheet-hero',
        defaultAnimation: 'idle',
        physics: { bodyType: 'static', friction: 0.3 }
      }
    }
  },
  ...overrides
});

function makeGame() {
  const game = new M2D(null, { headless: true, worldWidth: 640, worldHeight: 480, seed: 1 });
  game.registerActor('Guard', Guard);
  game.registerConstraint('Hover', Hover);
  return game;
}

const level = (fields = {}) => ({
  version: SCENE_VERSION, type: 'level', name: 'level1', ...fields
});

describe('the asset manifest', () => {
  it('indexes assets by uid', () => {
    const db = new AssetDatabase().load(manifest());
    expect(db.has('sheet-hero')).toBe(true);
    expect(db.uids.sort()).toEqual(['prefab-guard', 'sheet-hero']);
  });

  it('resolves a sprite sheet into the shape a scene declares inline', () => {
    // One kind of sprite sheet downstream, not two.
    const db = new AssetDatabase().load(manifest());
    expect(db.spritesheet('sheet-hero')).toEqual({
      url: 'assets/textures/hero.png',
      frameWidth: 32,
      frameHeight: 48,
      animations: { idle: { frames: [[0, 0]] } }
    });
  });

  it('rejects a manifest of the wrong version', () => {
    expect(() => new AssetDatabase().load(manifest({ version: 99 })))
      .toThrow(/expected 1, got 99/);
  });

  it('rejects an unknown asset type', () => {
    const data = manifest();
    data.assets.mystery = { type: 'mesh', source: 'x.glb' };
    expect(() => new AssetDatabase().load(data)).toThrow(/unknown asset type "mesh"/);
  });

  it('rejects an imported asset with no source', () => {
    const data = manifest();
    delete data.assets['sheet-hero'].source;
    expect(() => new AssetDatabase().load(data)).toThrow(/assets.sheet-hero.source/);
  });

  it('rejects a uid that is not a usable name', () => {
    const data = manifest();
    data.assets['two words'] = data.assets['sheet-hero'];
    expect(() => new AssetDatabase().load(data)).toThrow(/is not a valid uid/);
  });

  it('rejects a prefab pointing at an asset that is not there', () => {
    const data = manifest();
    data.assets['prefab-guard'].data.spritesheet = 'sheet-missing';
    expect(() => new AssetDatabase().load(data))
      .toThrow(/prefab-guard.data.spritesheet: no asset with uid 'sheet-missing'/);
  });

  it('rejects a prefab whose sprite sheet is not a sprite sheet', () => {
    const data = manifest();
    data.assets['prefab-guard'].data.spritesheet = 'prefab-guard';
    expect(() => new AssetDatabase().load(data)).toThrow(/is a prefab, not a spritesheet/);
  });

  it('checks a prefab asset names a registered actor', () => {
    const game = makeGame();
    const data = manifest();
    data.assets['prefab-guard'].data.actor = 'Wizard';
    expect(() => game.loadAssets(data)).toThrow(/actor 'Wizard' is not registered/);
    game.destroy();
  });

  it('carries a path and a label that may both change without breaking a uid', () => {
    // The point of the uid: this is a rename, and nothing that refers to
    // the asset has to know.
    const moved = manifest();
    moved.assets['sheet-hero'].source = 'art/characters/protagonist.png';
    moved.assets['sheet-hero'].name = 'protagonist';
    const db = new AssetDatabase().load(moved);
    expect(db.spritesheet('sheet-hero').url).toBe('assets/art/characters/protagonist.png');
  });

  it('throws a typed error carrying the field path', () => {
    let thrown;
    try { new AssetDatabase().load(manifest({ assets: { x: { type: 'spritesheet' } } })); }
    catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AssetManifestError);
    expect(thrown.path).toBe('assets.x.source');
  });
});

describe('a scene using assets', () => {
  const load = (scene, game = makeGame()) => {
    game.loadAssets(manifest());
    return new SceneLoader(game).load(scene);
  };

  it('binds a sprite sheet to a local name', () => {
    const loaded = load(level({
      uses: { hero: 'sheet-hero' },
      prefabs: { guard: { actor: 'Guard', spritesheet: 'hero' } },
      layers: [{ name: 'main', objects: [{ id: 'g1', prefab: 'guard', x: 0, y: 0 }] }]
    }));

    expect(loaded.assets.spritesheets.hero.url).toBe('assets/textures/hero.png');
  });

  it('brings a used prefab in under its local name', () => {
    const loaded = load(level({
      uses: { sentry: 'prefab-guard' },
      layers: [{ name: 'main', objects: [{ id: 'g1', prefab: 'sentry', x: 0, y: 0 }] }]
    }));

    expect(loaded.prefabs.sentry.actor).toBe('Guard');
    expect(loaded.prefabs.sentry.physics.friction).toBe(0.3);
  });

  it("pulls in a used prefab's sprite sheet, under the asset's own name", () => {
    // A prefab names its sheet by uid, which no scene can see. The sheet
    // has to come along, bound to something the scene can refer to.
    const loaded = load(level({
      uses: { sentry: 'prefab-guard' },
      layers: [{ name: 'main', objects: [{ id: 'g1', prefab: 'sentry', x: 0, y: 0 }] }]
    }));

    expect(loaded.prefabs.sentry.spritesheet).toBe('hero');
    expect(loaded.assets.spritesheets.hero.frameWidth).toBe(32);
  });

  it('falls back to the uid when the sheet name is taken', () => {
    const loaded = load(level({
      uses: { sentry: 'prefab-guard' },
      assets: { spritesheets: { hero: { url: 'other.png', frameWidth: 8, frameHeight: 8 } } },
      layers: [{ name: 'main', objects: [{ id: 'g1', prefab: 'sentry', x: 0, y: 0 }] }]
    }));

    expect(loaded.assets.spritesheets.hero.url).toBe('other.png');
    expect(loaded.prefabs.sentry.spritesheet).toBe('sheet-hero');
    expect(loaded.assets.spritesheets['sheet-hero'].frameWidth).toBe(32);
  });

  it('mixes used and inline prefabs in one scene', () => {
    const loaded = load(level({
      uses: { sentry: 'prefab-guard' },
      prefabs: { marker: { actor: 'Guard' } },
      layers: [{
        name: 'main',
        objects: [
          { id: 'g1', prefab: 'sentry', x: 0, y: 0 },
          { id: 'm1', prefab: 'marker', x: 10, y: 10 }
        ]
      }]
    }));

    expect(Object.keys(loaded.prefabs).sort()).toEqual(['marker', 'sentry']);
  });

  it('refuses a name that is both used and declared', () => {
    // A precedence rule here would mean one of the two silently losing.
    expect(() => load(level({
      uses: { guard: 'prefab-guard' },
      prefabs: { guard: { actor: 'Guard' } },
      layers: []
    }))).toThrow(/uses.guard: 'guard' is already a prefab declared by this scene/);
  });

  it('refuses a uid that is not loaded, listing what is', () => {
    expect(() => load(level({ uses: { x: 'prefab-ghost' }, layers: [] })))
      .toThrow(/no asset with uid 'prefab-ghost'.*loaded: sheet-hero, prefab-guard/);
  });

  it('says so when there is no database to resolve against', () => {
    // A loader built without a game — scene-validation tooling — cannot
    // resolve a uid, and should say that rather than report every
    // reference in the scene as missing.
    const bare = new SceneLoader({});
    expect(() => bare.load(level({ uses: { hero: 'sheet-hero' }, layers: [] })))
      .toThrow(/the scene uses assets, but the game has no asset database loaded/);
  });

  it('says so when the game has loaded no manifest', () => {
    const game = makeGame();
    expect(() => new SceneLoader(game).load(level({ uses: { x: 'sheet-hero' }, layers: [] })))
      .toThrow(/no asset with uid 'sheet-hero'/);
    game.destroy();
  });

  it('leaves a scene with no uses block exactly as it was', () => {
    const scene = level({
      assets: { spritesheets: { tile: { url: 't.png', frameWidth: 8, frameHeight: 8 } } },
      prefabs: { marker: { actor: 'Guard' } },
      layers: [{ name: 'main', objects: [{ id: 'm1', prefab: 'marker', x: 0, y: 0 }] }]
    });
    const loaded = load(scene);
    expect(loaded.assets.spritesheets).toEqual(scene.assets.spritesheets);
    expect(loaded.prefabs.marker).toEqual({ actor: 'Guard' });
  });
});

describe('per-instance overrides', () => {
  async function build(objectFields) {
    const game = makeGame();
    game.loadAssets(manifest());
    game.sceneManager.addScene('level1', {
      fetch: async () => level({
        uses: { sentry: 'prefab-guard' },
        layers: [{
          name: 'main',
          objects: [
            { id: 'plain', prefab: 'sentry', x: 0, y: 0, width: 16, height: 16 },
            { id: 'special', prefab: 'sentry', x: 50, y: 0, width: 16, height: 16, ...objectFields }
          ]
        }]
      })
    });
    await game.sceneManager.switchTo('level1');
    const scene = game.sceneManager.getCurrentScene();
    return { game, plain: scene.entitiesById.get('plain'), special: scene.entitiesById.get('special') };
  }

  it('changes one object without a prefab of its own', async () => {
    const { game, plain, special } = await build({ overrides: { physics: { friction: 0.9 } } });
    expect(special.body.friction).toBeCloseTo(0.9);
    expect(plain.body.friction).toBeCloseTo(0.3);
    game.destroy();
  });

  it('merges physics field by field, keeping the rest of the prefab', async () => {
    // An override of friction must not have to restate the body type.
    const { game, special } = await build({ overrides: { physics: { friction: 0.9 } } });
    expect(special.body.bodyType).toBe('static');
    game.destroy();
  });

  it('rejects an override of a field a prefab does not have', () => {
    const game = makeGame();
    game.loadAssets(manifest());
    const scene = level({
      uses: { sentry: 'prefab-guard' },
      layers: [{ name: 'main', objects: [{ id: 'g1', prefab: 'sentry', x: 0, y: 0, overrides: { actor: 'Guard' } }] }]
    });
    expect(() => new SceneLoader(game).load(scene))
      .toThrow(/overrides.actor: unknown field 'actor'/);
    game.destroy();
  });

  it('rejects an override naming a sprite sheet the scene does not have', () => {
    const game = makeGame();
    game.loadAssets(manifest());
    const scene = level({
      uses: { sentry: 'prefab-guard' },
      layers: [{ name: 'main', objects: [{ id: 'g1', prefab: 'sentry', x: 0, y: 0, overrides: { spritesheet: 'ghost' } }] }]
    });
    expect(() => new SceneLoader(game).load(scene)).toThrow(/no spritesheet named 'ghost'/);
    game.destroy();
  });
});
