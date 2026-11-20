import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Quality, qualityVariants, variantFolder, variantUrl } from '../../../src/core/quality.ts';
import { projectIssues } from '../../../src/core/projectSchema.ts';
import { projectOptions } from '../../../src/core/project.js';
import { M2D } from '../../../src/core/m2d.js';
import { SettingsMenu } from '../../../src/core/ui/settingsMenu.js';
import { UIOptionRow } from '../../../src/core/ui/optionRow.js';
import { Scene } from '../../../src/core/scene.js';
import { SceneLoader, SCENE_VERSION } from '../../../src/core/sceneLoader.js';
import { Entity } from '../../../src/core/entity.js';
import { parseGLB } from '../../../src/core/gltf.ts';
import { initPhysics } from '../../../src/core/physics/index.ts';
import { installWindowStub, displayCanvas, stubDocumentListeners } from '../../../src/testing/environment.js';

/**
 * Texture and model quality: the levels a project builds its models at,
 * the file each choice loads, the settings that choose, and a resident
 * model swapped for another level's while the level plays.
 */

/** Levels are declared lowest first, so a settings row steps right into more quality. */
const DECLARATION = {
  textures: { levels: { low: 512, medium: 1024, high: 2048 }, default: 'low' },
  models: { levels: { low: 25000, medium: 40000, high: 70000 }, default: 'medium' }
};

describe('quality levels', () => {
  it('builds every combination, the defaults at the file itself and the rest in a folder named textures first', () => {
    const variants = qualityVariants(DECLARATION);
    expect(variants).toHaveLength(9);
    expect(variants.filter((v) => v.folder === null)).toHaveLength(1);
    expect(variants.find((v) => v.folder === null).levels).toEqual({ textures: { name: 'low', value: 512 }, models: { name: 'medium', value: 40000 } });
    expect(variants.map((v) => v.folder)).toContain('high-high');
    expect(variants.map((v) => v.folder)).toContain('low-low');
    expect(new Set(variants.map((v) => v.folder)).size).toBe(9);
  });

  it('names a folder by the declared axes only', () => {
    const texturesOnly = { textures: DECLARATION.textures };
    expect(qualityVariants(texturesOnly).map((v) => v.folder)).toEqual([null, 'medium', 'high']);
    expect(qualityVariants(null)).toEqual([{ folder: null, levels: {} }]);
  });

  it('puts a variant beside its file, and leaves the defaults where they are', () => {
    expect(variantUrl('models/ph/tree.glb', 'medium-high')).toBe('models/ph/medium-high/tree.glb');
    expect(variantUrl('tree.glb', 'medium-high')).toBe('medium-high/tree.glb');
    expect(variantUrl('models/ph/tree.glb', null)).toBe('models/ph/tree.glb');
    expect(variantFolder(DECLARATION, { textures: 'low', models: 'medium' })).toBeNull();
    expect(variantFolder(DECLARATION, { textures: 'low', models: 'high' })).toBe('low-high');
  });

  it('loads a marked model at the chosen levels and any other model as it is named', () => {
    const quality = new Quality(DECLARATION);
    const tree = { url: 'models/ph/tree.glb', quality: true };
    const truck = { url: 'models/truck.glb' };
    expect(quality.url(tree)).toBe('models/ph/tree.glb');
    quality.set('textures', 'high');
    expect(quality.url(tree)).toBe('models/ph/high-medium/tree.glb');
    expect(quality.url(truck)).toBe('models/truck.glb');
    // The levels' own numbers, for a row's footer: lowest first, so right is better.
    expect(quality.levels('models').map((level) => quality.sizeOf('models', level))).toEqual([25000, 40000, 70000]);
    expect(() => quality.set('models', 'ultra')).toThrow(/'ultra' is not a models level \(low, medium, high\)/);
  });

  it('is checked in the project: a default must name one of its levels', () => {
    expect(projectIssues({ name: 'lot', quality: DECLARATION })).toEqual([]);
    expect(projectIssues({ name: 'lot', quality: { ...DECLARATION, models: { ...DECLARATION.models, default: '30k' } } }))
      .toEqual([{ path: 'quality.models.default', message: 'names no level of quality.models.levels (low, medium, high)' }]);
    expect(projectIssues({ name: 'lot', quality: { textures: { levels: { low: 0 }, default: 'low' } } })[0].path).toBe('quality.textures.levels.low');
    expect(projectOptions({ name: 'lot', quality: DECLARATION }).quality).toBe(DECLARATION);
  });
});

describe('quality settings', () => {
  beforeAll(stubDocumentListeners);
  beforeEach(() => installWindowStub());

  const makeGame = (options) => new M2D(displayCanvas(1280, 720), { width: 1280, height: 720, performanceStats: false, ...options });
  const labels = (menu) => {
    menu.open();
    const out = [];
    (function walk(element) { for (const child of element.children) { if (child instanceof UIOptionRow) out.push(child); walk(child); } })(menu.screen);
    return out;
  };

  it('offers each declared axis as a persisted cvar and a settings row that cycles its levels', () => {
    const game = makeGame({ quality: DECLARATION });
    expect(game.cvars.get('r_textures')).toBe('low');
    expect(game.cvars.get('r_models')).toBe('medium');
    const rows = labels(new SettingsMenu(game));
    const textures = rows.find((row) => row.label === 'Texture quality');
    expect(rows.find((row) => row.label === 'Model quality')).toBeTruthy();
    // A row reads its level, not its numbers, and the numbers are in the footer.
    expect(textures.valueText).toBe('Low');
    expect(textures.description).toContain('Low 512 px, Medium 1024 px, High 2048 px');
    // Stepping right raises the quality, and the track says where it sits.
    textures.onStep(1);
    expect(game.quality.choice.textures).toBe('medium');
    expect(textures.valueText).toBe('Medium');
    expect(textures.readChoices()).toEqual({ index: 1, count: 3 });
    textures.onStep(1);
    expect(game.quality.choice.textures).toBe('high');
    expect(textures.readChoices()).toEqual({ index: 2, count: 3 });
    textures.onStep(-2);
    expect(game.cvars.get('r_textures')).toBe('low');
  });

  it('offers nothing when the game pins the defaults, or declares no levels', () => {
    for (const options of [{ quality: DECLARATION, offerQuality: false }, {}]) {
      const game = makeGame(options);
      expect(game.cvars.has('r_textures')).toBe(false);
      expect(labels(new SettingsMenu(game)).map((row) => row.label)).not.toContain('Texture quality');
    }
    const pinned = makeGame({ quality: DECLARATION, offerQuality: false });
    expect(pinned.quality.url({ url: 'models/ph/tree.glb', quality: true })).toBe('models/ph/tree.glb');
  });
});

describe('a resident model swapped for another level', () => {
  beforeAll(() => initPhysics({ dimensions: 3 }));
  class Ground extends Entity { name = 'Ground'; }

  const box = async () => {
    const buf = readFileSync(new URL('../../fixtures/models/BoxTextured.glb', import.meta.url));
    return parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { decodeImage: async () => ({ width: 0, height: 0 }) });
  };

  /** A level with one prop model built at levels and one that is not, both resident. */
  async function level() {
    const loaderGame = new M2D(null, { headless: true, dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 1 });
    loaderGame.registerActor('Ground', Ground);
    const config = new SceneLoader(loaderGame).load({
      version: SCENE_VERSION, type: 'level', name: 'lot', world: { dimensions: 3 },
      assets: { models: { tree: { url: 'models/ph/tree.glb', quality: true }, truck: { url: 'models/truck.glb' } } },
      prefabs: { tree: { actor: 'Ground', mesh: { model: 'tree' } }, truck: { actor: 'Ground', mesh: { model: 'truck' } } },
      layers: [{
        name: 'main', objects: [],
        props: [
          { id: 'trees', prefab: 'tree', collider: 'none', instances: [[0, 0, 0, 0, 1], [3, 0, 0, 0, 1]] },
          { id: 'trucks', prefab: 'truck', collider: 'none', instances: [[6, 0, 0, 0, 1]] }
        ]
      }]
    });
    const released = [];
    const scene = new Scene({
      headless: false, physics: { dimensions: 3 }, quality: new Quality(DECLARATION),
      renderer: { unloadModel: (model) => released.push(model) }
    }, config);
    const fetched = [];
    const files = new Map();
    scene.props.fetchModel = async (key) => {
      const url = scene.game.quality.url(scene.config.assets.models[key]);
      fetched.push(url);
      if (files.get(url) instanceof Error) throw files.get(url);
      const model = await box();
      files.set(url, model);
      return model;
    };
    scene.indexProps();
    const tree = await box(), truck = await box();
    scene.models.set('tree', tree);
    scene.models.set('truck', truck);
    scene.setupProps();
    return { scene, released, fetched, files, tree, truck };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const batchesOf = (scene, key) => scene.batches.filter((batch) => batch.modelKey === key).length;

  it('fetches the new level\'s file, swaps it in with its batches rebuilt, and releases the old', async () => {
    const { scene, released, fetched, files, tree, truck } = await level();
    const treeBatches = batchesOf(scene, 'tree');
    expect(treeBatches).toBeGreaterThan(0);

    scene.game.quality.set('textures', 'medium');
    scene.props.requality();
    // The old one draws until the new one is in.
    expect(scene.models.get('tree')).toBe(tree);
    await settle();

    expect(fetched).toEqual(['models/ph/medium-medium/tree.glb']);
    expect(scene.models.get('tree')).toBe(files.get('models/ph/medium-medium/tree.glb'));
    expect(scene.models.get('truck')).toBe(truck);
    expect(released).toEqual([tree]);
    expect(batchesOf(scene, 'tree')).toBe(treeBatches);
  });

  it('keeps the old model when the new level\'s file fails', async () => {
    const { scene, released, files, tree } = await level();
    files.set('models/ph/high-medium/tree.glb', new Error('404'));
    scene.game.quality.set('textures', 'high');
    const warn = console.warn;
    console.warn = () => {};
    try {
      scene.props.requality();
      await settle();
    } finally { console.warn = warn; }
    expect(scene.models.get('tree')).toBe(tree);
    expect(released).toEqual([]);
  });

  it('lands only the latest of two quick changes', async () => {
    const { scene, released, files, tree } = await level();
    scene.game.quality.set('models', 'high');
    scene.props.requality();
    scene.game.quality.set('models', 'low');
    scene.props.requality();
    await settle();
    expect(scene.models.get('tree')).toBe(files.get('models/ph/low-low/tree.glb'));
    expect(released).toEqual([tree]);
  });

  it('fetches again a load that was in the air when the levels changed', async () => {
    const { scene, fetched, files } = await level();
    scene.models.delete('tree');
    scene.props.wanted.add('tree');
    const loading = scene.props.loadModel('tree');
    scene.game.quality.set('models', 'low');
    scene.props.requality();
    await loading;
    expect(fetched).toEqual(['models/ph/tree.glb', 'models/ph/low-low/tree.glb']);
    expect(scene.models.get('tree')).toBe(files.get('models/ph/low-low/tree.glb'));
  });
});
