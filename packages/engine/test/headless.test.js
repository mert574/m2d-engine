import { describe, it, expect } from 'vitest';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { InputSnapshot } from '../src/core/input/snapshot.js';
import {
  SCENE, OTHER, ARENA_ACTORS, fingerprint, CAPTURE_AT, prepareCoverage
} from './helpers/scenarios.js';

/**
 * A headless game: the simulation and nothing that shows it, in plain
 * Node. This file installs no browser stubs of any kind; the first test
 * checks that none leaked in from elsewhere.
 */

function headless(options = {}) {
  return new M2D(null, { headless: true, worldWidth: 1280, worldHeight: 2000, seed: 7, ...options });
}

/** Held keys every tick, with the press on the first. */
function holding(...codes) {
  let first = true;
  return () => {
    const snapshot = { down: codes, pressed: first ? codes : [] };
    first = false;
    return snapshot;
  };
}

async function arena(options = {}, hooks = {}) {
  const game = headless(options);
  for (const actor of ARENA_ACTORS) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('arena', { fetch: async () => SCENE, ...hooks });
  game.sceneManager.addScene('other', { fetch: async () => OTHER });
  await game.sceneManager.switchTo('arena');
  game.setupCollisionHandlers();
  return game;
}

/** One actor class whose constructor or tick does something to the game. */
function probeScene(game, { construct, fixed } = {}) {
  class Probe extends Entity {
    name = 'Probe';
    constructor(body, sprite, g, options) {
      super(body, sprite, g);
      construct?.(g);
    }
    fixedUpdate(dt) {
      super.fixedUpdate(dt);
      fixed?.(this.game);
    }
  }
  game.registerActor('Probe', Probe);
  game.sceneManager.addScene('probe', {
    fetch: async () => ({
      version: SCENE_VERSION, type: 'level', name: 'probe',
      prefabs: { probe: { actor: 'Probe', physics: { bodyType: 'static' } } },
      layers: [{ name: 'main', objects: [{ id: 'probe', prefab: 'probe', x: 0, y: 0, width: 10, height: 10 }] }]
    })
  });
  return game.sceneManager.switchTo('probe');
}

describe('a headless game', () => {
  it('runs with no browser globals at all', () => {
    for (const name of ['window', 'document', 'requestAnimationFrame', 'Image', 'Audio']) {
      expect(typeof globalThis[name], name).toBe('undefined');
    }
  });

  it('loads a level and ticks it', async () => {
    const game = await arena();
    game.input.setSnapshotSource(holding('ArrowRight', 'Space'));
    expect(game.step(180)).toBe(180);
    const print = fingerprint(game);
    expect(print.steps).toBe(180);
    expect(print.entities.find((e) => e.name === 'Player').x).toBeGreaterThan(200);
    expect(print.entities.some((e) => e.name === 'Rocket')).toBe(true);
    game.destroy();
  });

  /**
   * A scene object's id is how one placed thing refers to another — the
   * gate a lever opens — and how an editor will resolve a selection. It
   * has to survive into the entity and be looked up without searching.
   */
  it('places entities under their scene ids', async () => {
    const game = await arena();
    const scene = game.sceneManager.getCurrentScene();

    const player = scene.entitiesById.get('player');
    expect(player).toBe(game.player);
    expect(player.sceneId).toBe('player');
    expect(scene.entitiesById.get('floor').name).toBe('Platform');
    expect(scene.entitiesById.size).toBe(SCENE.layers[0].objects.length);
    game.destroy();
  });

  it('gives an entity spawned during play no scene id', async () => {
    const game = await arena();
    game.step(180);
    const rocket = [...game.entities].find(e => e.name === 'Rocket');
    expect(rocket.sceneId).toBe(null);
    expect([...game.sceneManager.getCurrentScene().entitiesById.values()]).not.toContain(rocket);
    game.destroy();
  });

  it('forgets the scene ids when the scene unloads', async () => {
    const game = await arena();
    const scene = game.sceneManager.getCurrentScene();
    await game.sceneManager.switchTo('other');
    expect(scene.entitiesById.size).toBe(0);
    game.destroy();
  });

  it('plays the same twice from the same seed and input', async () => {
    const prints = [];
    for (let i = 0; i < 2; i++) {
      const game = await arena({ seed: 11 });
      game.input.setSnapshotSource(holding('ArrowRight', 'Space'));
      game.step(180);
      prints.push(fingerprint(game));
      game.destroy();
    }
    expect(prints[1]).toEqual(prints[0]);
  });

  it('feeds every tick an empty snapshot when nothing is connected', async () => {
    const game = await arena();
    game.step(1);
    expect(game.input.snapshot.down.size).toBe(0);
    expect(game.input.snapshot).toBeInstanceOf(InputSnapshot);
    game.destroy();
  });

  it('start() enters the initial scene and runs no loop', async () => {
    const game = headless({ initialScene: 'arena' });
    for (const actor of ARENA_ACTORS) game.registerActor(actor.name, actor);
    game.sceneManager.addScene('arena', { fetch: async () => SCENE });
    await game.start();
    expect(game.running).toBe(true);
    expect(game.time.steps).toBe(0);
    expect(game.player).not.toBeNull();
    expect(() => game.update(16)).toThrow(/no frame loop.*game\.step/);
    game.destroy();
  });

  it('restarts through reset() and reload() and plays the same again', async () => {
    const game = await arena({ seed: 3 });
    game.step(120);
    const first = fingerprint(game);
    game.reset();
    await game.sceneManager.reload();
    game.step(120);
    expect(fingerprint(game)).toEqual(first);
    game.destroy();
  });

  it('step() stops at a scene switch requested inside a tick, and goes on after it', async () => {
    let switching = null;
    const game = await arena({}, {
      onFixedUpdate() {
        if (!switching && game.time.steps === 30) switching = game.sceneManager.switchTo('other');
      }
    });
    expect(game.step(100)).toBe(30);
    expect(game.step(5)).toBe(0); // still loading
    await switching;
    expect(game.sceneManager.getCurrentScene().config.name).toBe('other');
    expect(game.step(5)).toBe(5);
    expect(() => game.step(-1)).toThrow(/whole number/);
    game.destroy();
  });

  it('loads no assets and builds no tile layers', async () => {
    const game = headless();
    for (const actor of ARENA_ACTORS) game.registerActor(actor.name, actor);
    game.sceneManager.addScene('art', {
      fetch: async () => ({
        version: SCENE_VERSION, type: 'level', name: 'art',
        assets: { spritesheets: { tiles: { url: 'https://nowhere.invalid/tiles.png', frameWidth: 32, frameHeight: 32 } } },
        background: { spritesheet: 'tiles' },
        tileLayers: [{ name: 'floor', spritesheet: 'tiles', parallax: 0.5 }],
        prefabs: { floor: { actor: 'Platform', spritesheet: 'tiles', physics: { bodyType: 'static' } } },
        layers: [{ name: 'main', objects: [{ id: 'floor', prefab: 'floor', x: 100, y: 100, width: 64, height: 16 }] }]
      })
    });
    await game.sceneManager.switchTo('art');
    const [floor] = game.entities;
    expect(game.sceneManager.getCurrentScene().spriteSheets.size).toBe(0);
    expect(floor.sprite ?? null).toBeNull();
    expect(floor.name).toBe('Platform');
    game.step(3);
    game.destroy();
  });

  it('runs onEnter and onExit, and never onShow, onHide or the frame hooks', async () => {
    const calls = [];
    const hook = (name) => () => calls.push(name);
    const game = await arena({}, {
      onEnter: hook('enter'), onShow: hook('show'), onUpdate: hook('update'),
      onDraw: hook('draw'), onDrawBackground: hook('background'), onHide: hook('hide'), onExit: hook('exit'),
      onFixedUpdate: hook('fixed')
    });
    game.step(2);
    await game.sceneManager.switchTo('other');
    expect(calls).toEqual(['enter', 'fixed', 'fixed', 'exit']);
    game.destroy();
  });

  it('runs in a plain node process, and agrees with this one', async () => {
    const script = fileURLToPath(new URL('./fixtures/headlessRun.mjs', import.meta.url));
    const stdout = execFileSync(process.execPath, [script, 'grove'], { encoding: 'utf8', timeout: 60000 });
    const output = JSON.parse(stdout.split('\n').find((line) => line.startsWith('RESULT ')).slice('RESULT '.length));
    expect(output.globals).toEqual({ window: 'undefined', document: 'undefined', requestAnimationFrame: 'undefined' });
    expect(output.ticks).toBe(CAPTURE_AT);

    const game = headless({ seed: 5 });
    const capture = await prepareCoverage(game, 'grove');
    game.step(CAPTURE_AT);
    expect(output.capture).toEqual(JSON.parse(JSON.stringify(capture())));
    game.destroy();
  });
});

describe('presentation in a headless game fails by name', () => {
  it('reading the camera from a tick', async () => {
    const game = headless();
    await probeScene(game, { fixed: (g) => g.camera.x });
    expect(() => game.step(1)).toThrow(/read x on game\.camera, which is presentation/);
    game.destroy();
  });

  it('asking the renderer from a constructor', async () => {
    const game = headless();
    await expect(probeScene(game, { construct: (g) => g.renderer.supports('lights') }))
      .rejects.toThrow(/read supports on game\.renderer/);
  });

  it('reading the live devices instead of the snapshot', async () => {
    const game = headless();
    await probeScene(game, { fixed: (g) => g.input.isDown('Space') });
    expect(() => game.step(1)).toThrow(/game\.input\.isDown.*game\.input\.snapshot/);
    expect(() => game.input.on('keydown', () => {})).toThrow(/game\.input\.on/);
    game.destroy();
  });

  it('the rest of presentation', () => {
    const game = headless();
    for (const [name, use] of [
      ['game.worldOverlay', () => game.worldOverlay.drawRect({})],
      ['game.ui', () => game.ui.push({})],
      ['game.viewport', () => game.viewport.uiScale],
      ['game.layers', () => game.layers.clear()],
      ['game.cvars', () => game.cvars.get('r_aspect')],
      ['game.uiRenderer', () => { game.uiRenderer.cursor = 'grab'; }],
      ['game.camera', () => 'x' in game.camera]
    ]) {
      expect(use, name).toThrow(new RegExp(`${name.replace('.', '\\.')}, which is presentation`));
    }
    game.destroy();
  });

  it('scene UI', async () => {
    const game = headless();
    for (const actor of ARENA_ACTORS) game.registerActor(actor.name, actor);
    game.sceneManager.addScene('arena', { fetch: async () => SCENE });
    await game.sceneManager.switchTo('arena');
    expect(() => game.sceneManager.getCurrentScene().ui.add({})).toThrow(/scene\.ui/);
    game.destroy();
  });

  it('a UI scene', async () => {
    const game = headless();
    game.sceneManager.addScene('menu', { fetch: async () => ({ version: SCENE_VERSION, type: 'ui', name: 'menu', elements: [] }) });
    await expect(game.sceneManager.switchTo('menu')).rejects.toThrow(/UI scene/);
  });

  it('a canvas', () => {
    expect(() => new M2D({}, { headless: true })).toThrow(/pass null for the canvas/);
  });

  it('but inspecting a guard is not a use', () => {
    const game = headless();
    expect(() => inspect(game.camera)).not.toThrow();
    expect(() => inspect(game)).not.toThrow();
    game.destroy();
  });

  it('and sound is silent rather than an error', () => {
    const game = headless();
    expect(() => {
      game.soundManager.playSound('hit');
      game.soundManager.playMusic('theme');
      game.soundManager.stopMusic();
      game.soundManager.setSoundVolume(0.5);
    }).not.toThrow();
    expect(game.soundManager.loop('engine')).toBeNull();
    game.destroy();
  });
});
