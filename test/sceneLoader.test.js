import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
    version: 1,
    name: 'level1',
    type: 'level',
    assets: {
      spritesheets: {
        hero: { url: 'hero.png', frameWidth: 32, frameHeight: 32, animations: { idle: { frames: [[0, 0]] } } }
      }
    },
    prefabs: { player: { actor: 'Player', spritesheet: 'hero', defaultAnimation: 'idle' } },
    layers: [{ name: 'main', objects: [{ prefab: 'player', x: 10, y: 20 }] }],
    ...overrides
  };
}

/** A minimal valid UI scene. */
function ui(elements) {
  return { version: 1, name: 'menu', type: 'ui', elements };
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

    it('rejects a wrong or missing version', () => {
      expectError(level({ version: 2 }), 'version', `expected ${SCENE_VERSION}`);
      expectError(level({ version: '1.0' }), 'version', '"1.0"');
      expectError(level({ version: undefined }), 'version');
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
      const data = level({ layers: [{ name: 'main', objects: [{ prefab: 'enemy', x: 0, y: 0 }] }] });
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

    it('rejects an object with non-numeric coordinates', () => {
      const data = level({ layers: [{ name: 'main', objects: [{ prefab: 'player', x: '10', y: 20 }] }] });
      expectError(data, 'layers[0].objects[0]', /x and y must be numbers/);
    });

    it('applies the default object size without touching explicit ones', () => {
      const data = level({
        layers: [{ name: 'main', objects: [{ prefab: 'player', x: 0, y: 0 }, { prefab: 'player', x: 1, y: 1, width: 96, height: 8 }] }]
      });
      const [sized, explicit] = loader.load(data).layers[0].objects;

      expect(sized).toMatchObject({ width: 32, height: 32 });
      expect(explicit).toMatchObject({ width: 96, height: 8 });
    });

    it('accepts an empty level, as the showcase and doner use', () => {
      expect(() => loader.load(level({ assets: {}, prefabs: {}, layers: [] }))).not.toThrow();
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
      expectError(ui([{ type: 'text', properties: { text: 'hi' } }]), 'elements[0]', /x and y must be numbers/);
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

  describe('shipped example scenes', () => {
    // Every scene the repo ships must satisfy the schema, so tightening the
    // validator or editing a scene cannot quietly break an example.
    const examples = join(import.meta.dirname, '..', 'src', 'examples');
    const actors = {
      platformer: ['Player', 'Bee', 'Platform', 'MovingPlatform', 'Coin', 'Trigger'],
      topdown: ['TopDownPlayer', 'Ghost', 'Platform', 'Coin', 'Trigger', 'Turret'],
      doner: []
    };
    const scenes = {
      platformer: ['mainMenu', 'level1'],
      topdown: ['mainMenu', 'level1'],
      doner: ['mainMenu', 'gameplay']
    };

    const files = readdirSync(examples)
      .flatMap(example => {
        const dir = join(examples, example, 'scenes');
        if (!existsSync(dir)) return [];
        return readdirSync(dir)
          .filter(f => f.endsWith('.json'))
          .map(f => ({ example, name: `${example}/${f}`, path: join(dir, f) }));
      });

    it('finds the scene files to check', () => {
      expect(files.length).toBeGreaterThan(0);
    });

    it.each(files)('$name validates', ({ example, path }) => {
      const game = makeGame({ actors: actors[example], scenes: scenes[example] });
      const data = JSON.parse(readFileSync(path, 'utf8'));
      expect(() => new SceneLoader(game).load(data)).not.toThrow();
    });
  });
});
