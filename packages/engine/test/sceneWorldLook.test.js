import { describe, it, expect, vi } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from './helpers/environment.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * `world.camera`, `world.lighting`, `world.post`, `world.player` and
 * `world.music`: what a scene says about how it is seen, applied by the
 * engine when the scene shows and cleared when it leaves — so a level's
 * look lives in the document the editor edits, not in a hook.
 */

class Dot extends Entity {}

installWindowStub();
stubDocumentListeners();

function level(world) {
  return {
    version: SCENE_VERSION, type: 'level', name: 'look',
    world: { width: 640, height: 360, gravity: { x: 0, y: 0 }, ...world },
    prefabs: { dot: { actor: 'Dot', physics: { bodyType: 'static' } } },
    layers: [{ name: 'main', objects: [{ id: 'hero', prefab: 'dot', x: 100, y: 50, width: 8, height: 8 }, { id: 'rock', prefab: 'dot', x: 300, y: 50 }] }]
  };
}

async function show(world, options = {}) {
  const renderer = new RecordingRenderer();
  const game = new M2D(displayCanvas(320, 180), { width: 320, height: 180, worldWidth: 999, worldHeight: 999, renderer, devConsole: false, performanceStats: false, ...options });
  game.registerActor('Dot', Dot);
  const ambient = vi.spyOn(renderer, 'setAmbientLight');
  const post = vi.spyOn(renderer, 'setPostEffects');
  const music = vi.spyOn(game.soundManager, 'playMusic').mockImplementation(() => {});
  const stop = vi.spyOn(game.soundManager, 'stopMusic').mockImplementation(() => {});
  game.sceneManager.addScene('look', { fetch: async () => level(world) });
  game.sceneManager.addScene('other', { fetch: async () => level({}) });
  await game.sceneManager.switchTo('look');
  return { game, ambient, post, music, stop };
}

describe('the world\'s presentation fields', () => {
  it('configure the camera, with "world" bounds from the scene\'s own size, and follow the player', async () => {
    const { game } = await show({ player: 'hero', camera: { bounds: 'world', lerp: 0.3, zoom: 2, followAxes: { y: false } } });
    const camera = game.camera;
    expect(camera.bounds).toEqual({ left: 0, top: 0, right: 640, bottom: 360 });
    expect(camera.lerp).toBe(0.3);
    expect(camera.zoom).toBe(2);
    expect(camera.followAxes).toEqual({ x: true, y: false });     // merged over the camera's own
    expect(game.player?.sceneId ?? game.sceneManager.getCurrentScene().entitiesById.get('hero')).toBeTruthy();
    expect(camera.target).toBe(game.sceneManager.getCurrentScene().entitiesById.get('hero'));
    game.destroy();
  });

  it('follows another object when told, and leaves the camera alone without a block', async () => {
    const { game } = await show({ player: 'hero', camera: { follow: 'rock' } });
    expect(game.camera.target).toBe(game.sceneManager.getCurrentScene().entitiesById.get('rock'));
    game.destroy();
    const bare = await show({});
    expect(bare.game.camera.bounds).toBeNull();
    expect(bare.game.camera.target).toBeNull();
    bare.game.destroy();
  });

  it('sets the 2D ambient and post pass on show and clears them on leaving', async () => {
    const effects = { bloom: { threshold: 0.7, strength: 0.6, blur: 32 }, grain: { strength: 0.03 } };
    const { game, ambient, post } = await show({ lighting: { ambient: '#ded9e4' }, post: effects });
    expect(ambient).toHaveBeenCalledWith('#ded9e4');
    expect(post).toHaveBeenCalledWith(effects);
    await game.sceneManager.switchTo('other');
    expect(ambient).toHaveBeenLastCalledWith(null);
    expect(post).toHaveBeenLastCalledWith(null);
    game.destroy();
  });

  it('plays the world\'s music on show and stops it on leaving', async () => {
    const { game, music, stop } = await show({ music: { track: 'theme' } });
    expect(music).toHaveBeenCalledWith('theme');
    await game.sceneManager.switchTo('other');
    expect(stop).toHaveBeenCalled();
    game.destroy();
  });

  it('in edit mode applies the look but not the camera or the music', async () => {
    const { game, ambient, music } = await show({ player: 'hero', camera: { zoom: 3 }, lighting: { ambient: '#fff' }, music: { track: 'theme' } }, { editMode: true });
    expect(ambient).toHaveBeenCalledWith('#fff');
    expect(game.camera.zoom).toBe(1);
    expect(music).not.toHaveBeenCalled();
    // The player is still known, so the editor can frame it.
    expect(game.player).toBe(game.sceneManager.getCurrentScene().entitiesById.get('hero'));
    game.destroy();
  });
});

describe('the look in edit mode, in place', () => {
  const cycle = {
    states: [{ name: 'day', lighting: { ambient: '#ffffff' } }, { name: 'night', lighting: { ambient: '#000000' } }],
    phase: 0
  };

  it('previews a phase of the cycle without touching the document', async () => {
    const { game, ambient } = await show({ cycle }, { editMode: true });
    const scene = game.sceneManager.getCurrentScene();
    scene.previewCycle(0.5);
    expect(ambient).toHaveBeenLastCalledWith('rgb(128, 128, 128)');
    expect(scene.config.world.cycle.phase).toBe(0);
    game.destroy();
  });

  it('rebuilds from an edited config, and clears what an edit took away', async () => {
    const { game, ambient, post } = await show({ lighting: { ambient: '#336699' }, post: { grain: { strength: 0.2 } } }, { editMode: true });
    const scene = game.sceneManager.getCurrentScene();
    scene.config.world = { ...scene.config.world, lighting: undefined, post: undefined, cycle };
    scene.rebuildLook();
    expect(ambient).toHaveBeenCalledWith(null);
    expect(post).toHaveBeenLastCalledWith(null);
    expect(ambient).toHaveBeenLastCalledWith('#ffffff');
    expect(scene.cycle).toMatchObject({ phase: 0, count: 2 });
    game.destroy();
  });

  it('is refused outside edit mode', async () => {
    const { game } = await show({ cycle });
    expect(() => game.sceneManager.getCurrentScene().rebuildLook()).toThrow(/edit-mode/);
    expect(() => game.sceneManager.getCurrentScene().previewCycle(1)).toThrow(/edit-mode/);
    game.destroy();
  });
});
