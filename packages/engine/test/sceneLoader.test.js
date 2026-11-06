import { describe, it, expect, beforeEach } from 'vitest';
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

    it('rejects a malformed version', () => {
      expectError(level({ version: '1.0' }), 'version', '"1.0"');
      expectError(level({ version: undefined }), 'version');
      expectError(level({ version: 0 }), 'version');
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

  /**
   * A project is a body of files the user owns. Opening one written for an
   * older format must upgrade it, not reject it — that is the whole reason
   * the format carries a version.
   */
  describe('migration from older formats', () => {
    const v1Level = (objects) => ({
      version: 1,
      name: 'level1',
      type: 'level',
      prefabs: { player: { actor: 'Player' } },
      layers: [{ name: 'main', objects }]
    });

    it('loads a version 1 level, giving every object an id', () => {
      const loaded = loader.load(v1Level([
        { prefab: 'player', x: 0, y: 0 },
        { prefab: 'player', x: 1, y: 1 }
      ]));

      expect(loaded.version).toBe(SCENE_VERSION);
      expect(loaded.layers[0].objects.map(o => o.id)).toEqual(['player-0', 'player-1']);
    });

    it('carries version 1 numeric ids over as strings', () => {
      const loaded = loader.load(v1Level([{ id: 7, prefab: 'player', x: 0, y: 0 }]));
      expect(loaded.layers[0].objects[0].id).toBe('7');
    });

    it('separates ids that version 1 allowed to collide', () => {
      // v1 never checked uniqueness, so a document may genuinely repeat one.
      const loaded = loader.load(v1Level([
        { id: 'gate', prefab: 'player', x: 0, y: 0 },
        { id: 'gate', prefab: 'player', x: 1, y: 1 }
      ]));
      expect(loaded.layers[0].objects.map(o => o.id)).toEqual(['gate', 'gate-2']);
    });

    it('does not modify the document it was given', () => {
      // The caller may still hold it, and a cached scene config must not
      // change under it.
      const data = v1Level([{ prefab: 'player', x: 0, y: 0 }]);
      loader.load(data);
      expect(data.version).toBe(1);
      expect(data.layers[0].objects[0].id).toBeUndefined();
    });

    it('still rejects what the current schema rejects, after migrating', () => {
      // A migration upgrades a format; it does not excuse bad data.
      expectError(v1Level([{ prefab: 'ghost', x: 0, y: 0 }]),
        'layers[0].objects[0].prefab', /no prefab named 'ghost'/);
    });

    it('migrates a version 1 UI scene', () => {
      const loaded = loader.load({
        version: 1, name: 'menu', type: 'ui',
        elements: [{ type: 'button', x: 0, y: 0, properties: { text: 'Play', action: 'start' } }]
      });
      expect(loaded.elements[0].id).toBe('button-0');
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
