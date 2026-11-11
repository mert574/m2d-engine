import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { initPhysics } from '../src/core/physics/index.js';
import { SceneLoader, SceneValidationError, SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * Scene validation.
 *
 * Every check here exists because its absence produced a real, hard-to-trace
 * failure: a mistyped prefab name that loaded half a level, an unregistered
 * actor that logged once per object, a Settings button pointing at a scene
 * that was never registered and failed only when clicked, a `"fil": true`
 * that did nothing at all. Validation is strict — anything the schema does
 * not define is an error, because silently ignoring a field the author
 * believed in is the failure mode worth designing against.
 */

/** A game stub exposing only what the loader cross-references. */
function makeGame({ actors = [], scenes = [] } = {}) {
  return {
    actors: new Map(actors.map(name => [name, class {}])),
    sceneManager: { scenes: new Map(), scenesToLoad: scenes.map(name => ({ name })) }
  };
}

/** A minimal valid level, spread-merged with per-test overrides. */
function level(overrides = {}) {
  return {
    version: SCENE_VERSION,
    name: 'level1',
    type: 'level',
    assets: {
      spritesheets: {
        hero: { url: 'hero.png', frameWidth: 32, frameHeight: 32, animations: { idle: { frames: [[0, 0]] } } }
      }
    },
    prefabs: { player: { actor: 'Player', spritesheet: 'hero', defaultAnimation: 'idle' } },
    layers: [{ name: 'main', objects: [{ id: 'player', prefab: 'player', x: 10, y: 20 }] }],
    ...overrides
  };
}

/** One placed object, with an id these tests have nothing to say about. */
let placed = 0;
const object = (fields) => ({ id: `object-${++placed}`, ...fields });

/**
 * A minimal valid UI scene. Elements are given ids unless the test is
 * about them, so that each test fails for the reason it is testing.
 */
function ui(elements) {
  return {
    version: SCENE_VERSION,
    name: 'menu',
    type: 'ui',
    elements: elements.map((element, i) => ({ id: `element-${i}`, ...element }))
  };
}

describe('SceneLoader', () => {
  let loader;

  beforeEach(() => {
    loader = new SceneLoader(makeGame({ actors: ['Player'], scenes: ['menu', 'level1'] }));
  });

  /** Assert loading throws, and that the message points at `path`. */
  const expectError = (data, path, match) => {
    let thrown;
    try { loader.load(data); } catch (error) { thrown = error; }
    expect(thrown, 'expected a SceneValidationError').toBeInstanceOf(SceneValidationError);
    expect(thrown.path).toBe(path);
    if (match) expect(thrown.message).toMatch(match);
  };

  describe('format', () => {
    it('accepts a well-formed level and UI scene', () => {
      expect(() => loader.load(level())).not.toThrow();
      expect(() => loader.load(ui([]))).not.toThrow();
    });

    it('accepts the world\'s presentation fields and names a bad one', () => {
      const world = {
        width: 640, height: 360, player: 'p1',
        camera: { bounds: 'world', lerp: 0.1, followAxes: { x: true, y: false }, zoom: 1.5 },
        lighting: { ambient: '#ded9e4', sun: { direction: { x: 0, y: -1, z: 0 }, color: '#fff', intensity: 3 }, fog: { color: '#aab', density: 0.01 } },
        post: { bloom: { threshold: 0.7, strength: 0.6, blur: 32 }, grain: { strength: 0.03 } },
        music: { track: 'theme', volume: 0.6 }
      };
      expect(() => loader.load(level({ world, assets: { ...level().assets, music: { theme: { url: 'theme.mp3' } } } }))).not.toThrow();
      expect(() => loader.load(level({ world: { camera: { bounds: 'screen' } } }))).toThrow(/world.camera.bounds: expected one of world/);
      expect(() => loader.load(level({ world: { camera: { bounds: { left: 0 } } } }))).toThrow(/world.camera.bounds/);
      expect(() => loader.load(level({ world: { lighting: { ambient: 7 } } }))).toThrow(/world.lighting.ambient/);
      expect(() => loader.load(level({ world: { music: { volume: 1 } } }))).toThrow(/world.music.track/);
    });

    it('rejects a version that is not this engine\'s', () => {
      expectError(level({ version: SCENE_VERSION - 1 }), 'version', `expected scene format ${SCENE_VERSION}`);
      expectError(level({ version: '1.0' }), 'version', '"1.0"');
      expectError(level({ version: undefined }), 'version');
    });

    it('rejects a version newer than the engine, saying so', () => {
      // Field-by-field errors from a format we do not know would be noise;
      // the useful message is "upgrade the engine".
      expectError(level({ version: SCENE_VERSION + 1 }), 'version',
        /newer than this engine understands.*upgrade m2d-engine/);
    });

    it('rejects an unknown scene type', () => {
      expectError(level({ type: 'cutscene' }), 'type', "expected 'level' or 'ui'");
    });

    it('names the scene in the error', () => {
      expect(() => loader.load(level({ version: 9 }), 'level1'))
        .toThrow(/^Scene 'level1' at version:/);
    });

    it('rejects unknown top-level fields, listing what was allowed', () => {
      expectError(level({ layres: [] }), 'layres', /unknown field 'layres'.*allowed:/);
    });
  });

  describe('level cross-references', () => {
    it('rejects an object naming a prefab that does not exist', () => {
      const data = level({ layers: [{ name: 'main', objects: [object({ prefab: 'enemy', x: 0, y: 0 })] }] });
      expectError(data, 'layers[0].objects[0].prefab', /no prefab named 'enemy'.*declared: player/);
    });

    it('rejects a prefab naming an unregistered actor', () => {
      const data = level({ prefabs: { player: { actor: 'Wizard', spritesheet: 'hero' } } });
      expectError(data, 'prefabs.player.actor', /'Wizard' is not registered.*registered: Player/);
    });

    it('rejects a prefab naming a spritesheet that was not declared', () => {
      const data = level({ prefabs: { player: { actor: 'Player', spritesheet: 'villain' } } });
      expectError(data, 'prefabs.player.spritesheet', /no spritesheet named 'villain'/);
    });

    it('rejects a defaultAnimation the spritesheet does not define', () => {
      const data = level({ prefabs: { player: { actor: 'Player', spritesheet: 'hero', defaultAnimation: 'fly' } } });
      expectError(data, 'prefabs.player.defaultAnimation', /no animation 'fly'.*has: idle/);
    });

    it('allows a defaultAnimation on a spritesheet with no animations at all', () => {
      // Sheets without an `animations` block get a single 'default' frame at
      // load time, so there is nothing to check against.
      const data = level({
        assets: { spritesheets: { hero: { url: 'h.png', frameWidth: 32, frameHeight: 32 } } },
        prefabs: { player: { actor: 'Player', spritesheet: 'hero', defaultAnimation: 'default' } }
      });
      expect(() => loader.load(data)).not.toThrow();
    });

    it('rejects an unknown physics body type', () => {
      const data = level({ prefabs: { player: { actor: 'Player', physics: { bodyType: 'floaty' } } } });
      expectError(data, 'prefabs.player.physics.bodyType', /expected one of static, dynamic, kinematic/);
    });

    it('rejects a background naming a spritesheet that was not declared', () => {
      expectError(level({ background: { spritesheet: 'grass' } }),
        'background.spritesheet', /no spritesheet named 'grass'/);
    });
  });

  describe('level structure', () => {
    it('rejects a malformed spritesheet', () => {
      const bad = (sheet, path) => expectError(
        level({ assets: { spritesheets: { hero: sheet } }, prefabs: {}, layers: [] }), path);

      bad({ frameWidth: 32, frameHeight: 32 }, 'assets.spritesheets.hero.url');
      bad({ url: 'h.png', frameHeight: 32 }, 'assets.spritesheets.hero.frameWidth');
      bad({ url: 'h.png', frameWidth: 0, frameHeight: 32 }, 'assets.spritesheets.hero.frameWidth');
    });

    it('rejects malformed animation frames', () => {
      const sheets = frames => ({
        spritesheets: { hero: { url: 'h.png', frameWidth: 32, frameHeight: 32, animations: { idle: { frames } } } }
      });
      expectError(level({ assets: sheets([]), prefabs: {}, layers: [] }),
        'assets.spritesheets.hero.animations.idle.frames', /non-empty array/);
      expectError(level({ assets: sheets([[0]]), prefabs: {}, layers: [] }),
        'assets.spritesheets.hero.animations.idle.frames[0]', /\[tileX, tileY\] pair/);
    });

    it('rejects an object with non-numeric coordinates, naming the field', () => {
      const data = level({ layers: [{ name: 'main', objects: [object({ prefab: 'player', x: '10', y: 20 })] }] });
      expectError(data, 'layers[0].objects[0].x', /must be a number, got "10"/);

      const missing = level({ layers: [{ name: 'main', objects: [object({ prefab: 'player', x: 10 })] }] });
      expectError(missing, 'layers[0].objects[0].y', /must be a number/);
    });

    it('applies the default object size without touching explicit ones', () => {
      const data = level({
        layers: [{ name: 'main', objects: [object({ prefab: 'player', x: 0, y: 0 }), object({ prefab: 'player', x: 1, y: 1, width: 96, height: 8 })] }]
      });
      const [sized, explicit] = loader.load(data).layers[0].objects;

      expect(sized).toMatchObject({ width: 32, height: 32 });
      expect(explicit).toMatchObject({ width: 96, height: 8 });
    });

    it('accepts an empty level, as the showcase uses', () => {
      expect(() => loader.load(level({ assets: {}, prefabs: {}, layers: [] }))).not.toThrow();
    });
  });

  /**
   * Identity has to be reliable to be worth anything: an editor names a
   * selection, an undo entry and a cross-reference by it, and all three
   * break if an object might not have one or might share it.
   */
  describe('object identity', () => {
    const withObjects = objects => level({ layers: [{ name: 'main', objects }] });

    it('requires every object to have an id', () => {
      expectError(withObjects([{ prefab: 'player', x: 0, y: 0 }]),
        'layers[0].objects[0].id', /missing or non-string id/);
    });

    it('rejects an id that is not a usable name', () => {
      const bad = id => expectError(withObjects([{ id, prefab: 'player', x: 0, y: 0 }]),
        'layers[0].objects[0].id', /is not a valid id/);
      bad('two words');
      bad('-leading-dash');
      bad(' ');
    });

    it('rejects a duplicate id, across layers as well as within one', () => {
      expectError(withObjects([
        { id: 'gate', prefab: 'player', x: 0, y: 0 },
        { id: 'gate', prefab: 'player', x: 1, y: 1 }
      ]), 'layers[0].objects[1].id', /duplicate id 'gate'/);

      const across = level({
        layers: [
          { name: 'a', objects: [{ id: 'gate', prefab: 'player', x: 0, y: 0 }] },
          { name: 'b', objects: [{ id: 'gate', prefab: 'player', x: 1, y: 1 }] }
        ]
      });
      expectError(across, 'layers[1].objects[0].id', /duplicate id 'gate'/);
    });

    it('requires unique ids on UI elements too', () => {
      const elements = [
        { id: 'play', type: 'button', x: 0, y: 0, properties: { text: 'A', action: 'a' } },
        { id: 'play', type: 'button', x: 0, y: 8, properties: { text: 'B', action: 'b' } }
      ];
      expectError({ version: SCENE_VERSION, name: 'menu', type: 'ui', elements },
        'elements[1].id', /duplicate id 'play'/);
    });
  });

  describe('UI elements', () => {
    it('rejects an unknown element type', () => {
      expectError(ui([{ type: 'slider', x: 0, y: 0 }]), 'elements[0].type', /unknown element type/);
    });

    it('rejects an unknown anchor, which would silently do nothing', () => {
      expectError(ui([{ type: 'rect', x: 0, y: 0, anchor: 'centre', width: 1, height: 1, color: '#fff' }]),
        'elements[0].anchor', /unknown anchor "centre".*known: top-left/);
    });

    it('rejects a misspelled element field', () => {
      expectError(ui([{ type: 'rect', x: 0, y: 0, fil: true, color: '#fff' }]),
        'elements[0].fil', /unknown field 'fil'/);
    });

    it('rejects a misspelled property', () => {
      expectError(ui([{ type: 'text', x: 0, y: 0, properties: { text: 'hi', fontsize: '12px' } }]),
        'elements[0].properties.fontsize', /unknown field 'fontsize'/);
    });

    it('requires x and y unless the element fills the screen', () => {
      expectError(ui([{ type: 'text', properties: { text: 'hi' } }]), 'elements[0].x', /must be a number/);
      expect(() => loader.load(ui([{ type: 'rect', fill: true, color: '#fff' }]))).not.toThrow();
    });

    it('requires an image element to name a sprite', () => {
      expectError(ui([{ type: 'image', x: 0, y: 0 }]), 'elements[0].sprite', /missing or non-string/);
    });
  });

  describe('UI buttons', () => {
    const button = properties => ui([{ type: 'button', x: 0, y: 0, properties }]);

    it('accepts a scene switch and an action', () => {
      expect(() => loader.load(button({ text: 'Play', onClick: 'level1' }))).not.toThrow();
      expect(() => loader.load(button({ text: 'Settings', action: 'settings' }))).not.toThrow();
    });

    it('rejects a button that does nothing', () => {
      expectError(button({ text: 'Play' }), 'elements[0]', /neither action nor onClick/);
    });

    it('rejects a button that tries to do both', () => {
      expectError(button({ text: 'Play', action: 'settings', onClick: 'level1' }),
        'elements[0]', /both action .* and onClick/);
    });

    // The platformer shipped exactly this: a Settings button pointing at a
    // 'settings' scene nobody registered, which failed only on click.
    it('rejects a scene switch to a scene that is not registered', () => {
      expectError(button({ text: 'Settings', onClick: 'settings' }),
        'elements[0].properties.onClick', /no scene named 'settings'.*registered: menu, level1/);
    });

    it('skips the scene check when there is no scene manager to ask', () => {
      const bare = new SceneLoader({});
      expect(() => bare.load(button({ text: 'Play', onClick: 'anything' }))).not.toThrow();
    });
  });
});

describe('SceneLoader.check: every problem, not the first', () => {
  const scene = () => ({
    version: SCENE_VERSION, type: 'level', name: 'many',
    prefabs: { wall: { actor: 'Wall', physics: { bodyType: 'static' } } },
    layers: [{ name: 'main', objects: [
      { id: 'a', prefab: 'wall', x: 'left', y: 0 },
      { id: 'b', prefab: 'nowhere', x: 0, y: 0 },
      { prefab: 'wall', x: 0, y: 0, colour: 'red' },
      { id: 'd', prefab: 'wall', x: 0, y: 0 }
    ] }]
  });

  it('reports each problem with its path, and loads nothing', () => {
    const { loaded, issues } = new SceneLoader(null).check(scene());
    expect(loaded).toBeNull();
    const paths = issues.map(issue => issue.path);
    expect(paths).toEqual(expect.arrayContaining([
      'layers[0].objects[0].x', 'layers[0].objects[1].prefab',
      'layers[0].objects[2].colour', 'layers[0].objects[2].id'
    ]));
    expect(paths.some(path => path.startsWith('layers[0].objects[3]'))).toBe(false);
    for (const issue of issues) expect(issue.detail).not.toContain('Scene ');
  });

  it('returns the loaded scene when there is nothing to report, as load does', () => {
    const good = scene();
    good.layers[0].objects = [good.layers[0].objects[3]];
    const { loaded, issues } = new SceneLoader(null).check(good);
    expect(issues).toEqual([]);
    expect(loaded).toEqual(new SceneLoader(null).load(good));
  });

  it('leaves load throwing at the first problem', () => {
    expect(() => new SceneLoader(null).load(scene())).toThrow(/objects\[0\]\.x/);
  });

  it('stops at what precedes the schema: the version', () => {
    const { issues } = new SceneLoader(null).check({ ...scene(), version: 0 });
    expect(issues.map(issue => issue.path)).toEqual(['version']);
  });
});

describe('composition: a level instances other levels', () => {
  const room = {
    version: SCENE_VERSION, type: 'level', name: 'room',
    world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
    assets: { models: { crate: { url: 'crate.glb' } } },
    prefabs: {
      wall: { actor: 'Ground', physics: { bodyType: 'static' }, mesh: { color: '#888' } },
      crate: { actor: 'Ground', physics: { bodyType: 'static' }, mesh: { model: 'crate' } }
    },
    layers: [{
      name: 'main',
      objects: [
        { id: 'floor', prefab: 'wall', x: 0, y: -0.5, z: 0, width: 4, height: 1, depth: 4 },
        { id: 'crate', prefab: 'crate', x: 1, y: 0.5, z: 0, width: 1, height: 1, depth: 1 }
      ],
      props: [{ id: 'grass', prefab: 'wall', collider: 'none', instances: [[2, 0, 0, 0, 1]] }]
    }]
  };
  const composedLevel = (instances) => ({
    version: SCENE_VERSION, type: 'level', name: 'level',
    world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
    prefabs: { ground: { actor: 'Ground', physics: { bodyType: 'static' }, mesh: { color: '#9fc' } } },
    layers: [{ name: 'main', objects: [{ id: 'ground', prefab: 'ground', x: 0, y: -1, z: 0, width: 40, height: 1, depth: 40 }], scenes: instances }]
  });
  class Ground extends Entity { name = 'Ground'; }
  beforeAll(async () => { await initPhysics({ dimensions: 3 }); });
  const loader3D = () => {
    const game = new M2D(null, { headless: true, dimensions: 3, worldWidth: 40, worldHeight: 40, seed: 1 });
    game.registerActor('Ground', Ground);
    game.sceneManager.addScene('room', { fetch: async () => room });
    game.sceneManager.addScene('level', { fetch: async () => ({}) });
    return { game, loader: new SceneLoader(game) };
  };

  it('expands an instance under its id, placed and turned, with overrides applied first', () => {
    const { loader } = loader3D();
    const loaded = loader.load(composedLevel([
      { id: 'room-1', scene: 'room', x: 10, y: 0, z: 0 },
      { id: 'room-2', scene: 'room', x: 0, y: 0, z: 10, yaw: Math.PI / 2, overrides: { crate: { y: 2.5, width: 2 } } }
    ]), 'level', { scenes: { room } });
    const objects = loaded.layers[0].objects;
    expect(objects.map((o) => o.id)).toEqual(['ground', 'room-1/floor', 'room-1/crate', 'room-2/floor', 'room-2/crate']);
    // Placed: the crate at local (1, 0.5, 0) lands at (11, 0.5, 0) in room-1.
    const crate1 = objects.find((o) => o.id === 'room-1/crate');
    expect([crate1.x, crate1.y, crate1.z]).toEqual([11, 0.5, 0]);
    expect(crate1.prefab).toBe('room-1/crate');
    expect(crate1.composed).toBe('room-1');
    // Turned a quarter about the up axis: local x becomes world -z, around the instance's origin.
    const crate2 = objects.find((o) => o.id === 'room-2/crate');
    expect(crate2.x).toBeCloseTo(0, 6);
    expect(crate2.z).toBeCloseTo(9, 6);
    // The override wrote over the inner object before placement; the yaw became its rotation.
    expect(crate2.y).toBe(2.5);
    expect(crate2.width).toBe(2);
    expect(crate2.rotation[1]).toBeCloseTo(Math.SQRT1_2, 5);
    // Prefabs and assets come along under the prefix, the model renamed with them.
    expect(loaded.prefabs['room-2/crate'].mesh.model).toBe('room-2/crate');
    expect(loaded.assets.models['room-2/crate'].url).toBe('crate.glb');
    // Props too, their tuples placed and turned.
    const grass = loaded.layers[0].props.find((p) => p.id === 'room-2/grass');
    expect(grass.instances[0][0]).toBeCloseTo(0, 6);
    expect(grass.instances[0][2]).toBeCloseTo(8, 6);
    expect(grass.instances[0][3]).toBeCloseTo(Math.PI / 2, 6);
  });

  it('refuses a cycle, a UI scene, a dimension mismatch and a document not at hand', () => {
    const { loader } = loader3D();
    const selfish = { ...room, layers: [{ ...room.layers[0], scenes: [{ id: 'again', scene: 'room', x: 0, y: 0 }] }] };
    expect(() => loader.load(composedLevel([{ id: 'r', scene: 'room', x: 0, y: 0 }]), 'level', { scenes: { room: selfish } })).toThrow(/would contain itself/);
    expect(() => loader.load(composedLevel([{ id: 'r', scene: 'room', x: 0, y: 0 }]), 'level', { scenes: {} })).toThrow(/not at hand to compose/);
    const flat = { ...room, world: { gravity: { x: 0, y: 900 } }, prefabs: { wall: { actor: 'Ground', physics: { bodyType: 'static' } } }, assets: undefined,
      layers: [{ name: 'main', objects: [{ id: 'floor', prefab: 'wall', x: 0, y: 0 }] }] };
    expect(() => loader.load(composedLevel([{ id: 'r', scene: 'room', x: 0, y: 0 }]), 'level', { scenes: { room: flat } })).toThrow(/2D and this level is 3D/);
    // Without a library the instances are checked, not expanded.
    const bare = loader.load(composedLevel([{ id: 'r', scene: 'room', x: 0, y: 0 }]), 'level');
    expect(bare.layers[0].objects).toHaveLength(1);
    expect(bare.layers[0].scenes[0].scene).toBe('room');
  });

  it('is fetched and built by the scene manager: a room instanced three times stands in the level', async () => {
    const game = new M2D(null, { headless: true, dimensions: 3, worldWidth: 40, worldHeight: 40, seed: 1 });
    game.registerActor('Ground', Ground);
    game.sceneManager.addScene('room', { fetch: async () => room });
    game.sceneManager.addScene('level', { fetch: async () => composedLevel([
      { id: 'a', scene: 'room', x: -8, y: 0, z: -10 },
      { id: 'b', scene: 'room', x: 0, y: 0, z: -10 },
      { id: 'c', scene: 'room', x: 8, y: 0, z: -10, overrides: { crate: { y: 3 } } }
    ]) });
    await game.sceneManager.switchTo('level');
    const scene = game.sceneManager.getCurrentScene();
    expect([...scene.entitiesById.keys()].filter((id) => id.endsWith('/crate'))).toEqual(['a/crate', 'b/crate', 'c/crate']);
    expect(scene.entitiesById.get('c/crate').body.position.y).toBeCloseTo(3, 6);
    expect(scene.entitiesById.get('a/crate').body.position.x).toBeCloseTo(-7, 6);
  });
});
