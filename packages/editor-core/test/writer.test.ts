import { describe, it, expect } from 'vitest';
import { writeScene, writeManifest, WriteError } from '../src/writer.ts';
import { SceneLoader, SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { MANIFEST_VERSION } from 'm2d-engine/core/assetSchema.js';

/**
 * The canonical writer. The contract under test, in order: the text is
 * canonical (schema key order, defaults omitted, stable layout), writing
 * is idempotent, and nothing is lost — loading what was written gives the
 * same scene as loading the original. The round-trip over every *shipped*
 * scene and manifest lives beside them, in examples/test.
 */

const loader = new SceneLoader(null);

/** A level with its keys deliberately shuffled against the schema. */
const level = {
  layers: [{ name: 'main', objects: [{ x: 320, y: 350, width: 640, height: 20, id: 'floor', prefab: 'wall' }] }],
  type: 'level',
  world: { gravity: { y: 900, x: 0 } },
  prefabs: { wall: { physics: { bodyType: 'static' }, actor: 'Block' } },
  name: 'demo',
  version: SCENE_VERSION
};

describe('writeScene', () => {
  it('orders keys as the schema declares them', () => {
    const written = writeScene(level);
    const keys = [...written.matchAll(/"(\w+)":/g)].map(match => match[1]);
    // Top-level order is the schema's: version, name, type, then the body.
    expect(keys.slice(0, 3)).toEqual(['version', 'name', 'type']);
    expect(written.indexOf('"prefabs"')).toBeLessThan(written.indexOf('"layers"'));
    // Inside an object too: id leads, x before y.
    expect(written).toContain('"id": "floor", "prefab": "wall", "x": 320, "y": 350');
  });

  it('keeps keys the schema cannot know in document order', () => {
    const written = writeScene({
      ...level,
      layers: [{
        name: 'main',
        objects: [{ id: 'w', prefab: 'wall', x: 0, y: 0, properties: { zebra: 1, apple: 2 } }]
      }]
    });
    expect(written.indexOf('"zebra"')).toBeLessThan(written.indexOf('"apple"'));
  });

  it('omits a field equal to its schema default, losslessly', () => {
    const doc = {
      version: SCENE_VERSION, type: 'level', name: 'mesh',
      world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
      prefabs: { crate: { actor: 'Crate', mesh: { shape: 'box', castShadow: true } } },
      layers: []
    };
    const written = writeScene(doc);
    expect(written).not.toContain('castShadow');
    expect(loader.load(JSON.parse(written))).toEqual(loader.load(doc));
  });

  it('keeps a field that differs from its default', () => {
    const doc = {
      version: SCENE_VERSION, type: 'level', name: 'mesh',
      world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
      prefabs: { shell: { actor: 'Shell', mesh: { shape: 'sphere', castShadow: false } } },
      layers: []
    };
    expect(writeScene(doc)).toContain('"castShadow": false');
  });

  it('is idempotent', () => {
    const written = writeScene(level);
    expect(writeScene(JSON.parse(written))).toBe(written);
  });

  it('loses nothing through a load', () => {
    expect(loader.load(JSON.parse(writeScene(level)))).toEqual(loader.load(level));
  });

  it('writes a ui scene through the ui schema', () => {
    const ui = {
      version: SCENE_VERSION, type: 'ui', name: 'menu',
      elements: [{ type: 'rect', id: 'background', fill: true, color: '#1b2a38' }]
    };
    const written = writeScene(ui);
    expect(written).toContain('"type": "rect", "id": "background"');
    expect(loader.load(JSON.parse(written))).toEqual(loader.load(ui));
  });

  it('packs a long array of short tuples one per line', () => {
    const doc = {
      version: SCENE_VERSION, type: 'level', name: 'lot',
      world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
      prefabs: { tree: { actor: 'Tree', mesh: { shape: 'box' } } },
      layers: [{
        name: 'main',
        objects: [],
        props: [{
          id: 'trees', prefab: 'tree',
          at: Array.from({ length: 40 }, (_, i) => [i * 13.5, 0, i * 7.25, 1.57, 1])
        }]
      }]
    };
    const written = writeScene(doc);
    expect(written).toContain('[0, 0, 0, 1.57, 1],\n');
    expect(written).toContain('[13.5, 0, 7.25, 1.57, 1],\n');
  });

  it('refuses a value JSON cannot carry, naming the path', () => {
    const doc = { ...level, world: { gravity: { x: 0, y: NaN } } };
    expect(() => writeScene(doc)).toThrow(WriteError);
    expect(() => writeScene(doc)).toThrow(/world\.gravity\.y/);
  });

  it('refuses a document with no usable type', () => {
    expect(() => writeScene({ version: SCENE_VERSION, type: 'cutscene' })).toThrow(/level.*ui/s);
    expect(() => writeScene(null)).toThrow(WriteError);
  });

  it('round-trips the generator marker', () => {
    const doc = { ...level, generator: 'scripts/buildDemoScene.mjs' };
    const written = writeScene(doc);
    expect(written).toContain('"generator": "scripts/buildDemoScene.mjs"');
    expect(JSON.parse(written).generator).toBe('scripts/buildDemoScene.mjs');
  });
});

describe('writeManifest', () => {
  const manifest = {
    assets: {
      'prefab-guard': {
        data: { physics: { bodyType: 'static' }, actor: 'Guard', spritesheet: 'sheet-hero' },
        name: 'guard',
        type: 'prefab'
      },
      'sheet-hero': {
        import: { animations: { idle: { frames: [[0, 0]] } }, frameHeight: 48, frameWidth: 32 },
        source: 'textures/hero.png',
        type: 'spritesheet',
        name: 'hero'
      }
    },
    basePath: 'assets/',
    version: MANIFEST_VERSION
  };

  it('orders keys as the manifest schema declares them, and is idempotent', () => {
    const written = writeManifest(manifest);
    const keys = [...written.matchAll(/"(\w+)":/g)].map(match => match[1]);
    expect(keys.slice(0, 2)).toEqual(['version', 'basePath']);
    // Inside a tagged asset entry, the variant's order holds: type leads.
    expect(written).toMatch(/"sheet-hero": \{\s*"type": "spritesheet",\s*"name": "hero"/);
    expect(writeManifest(JSON.parse(written))).toBe(written);
  });

  it('keeps asset uids in document order', () => {
    const written = writeManifest(manifest);
    expect(written.indexOf('"prefab-guard"')).toBeLessThan(written.indexOf('"sheet-hero"'));
  });
});
