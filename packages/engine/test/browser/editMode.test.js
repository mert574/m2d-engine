import { describe, it, expect, afterEach, vi } from 'vitest';
import { M2D } from '../../src/core/m2d.js';
import { Entity } from '../../src/core/entity.js';
import { initPhysics } from '../../src/core/physics/index.js';
import { SCENE_VERSION } from '../../src/core/sceneLoader.js';
import { readCanvas2DPixels } from '../helpers/environment.js';

/**
 * Edit mode at the DOM boundary: the half the node suite cannot answer
 * for. A materialized scene draws its document; input reaches the engine
 * but never the scene's UI or the simulation; cvars have no storage so an
 * editing session cannot overwrite a player's settings; and the
 * edit → play → stop → edit cycle leaves nothing behind on the page.
 */

class Block extends Entity {
  name = 'Block';

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawRect({
      x: x - this.size.x / 2, y: y - this.size.y / 2,
      width: this.size.x, height: this.size.y, fillStyle: '#ff6600'
    });
  }
}

const LEVEL = {
  version: SCENE_VERSION, type: 'level', name: 'room',
  world: { gravity: { x: 0, y: 1000 } },
  prefabs: { block: { actor: 'Block', physics: { bodyType: 'dynamic' } } },
  layers: [{ name: 'main', objects: [
    { id: 'block-1', prefab: 'block', x: 320, y: 180, width: 120, height: 120 }
  ] }]
};

const MENU = {
  version: SCENE_VERSION, type: 'ui', name: 'menu',
  elements: [
    { type: 'button', id: 'start', anchor: 'center', x: 0, y: 0,
      properties: { text: 'Start', action: 'start-game', width: 240, height: 80 } }
  ]
};

function mountCanvas() {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'fixed', left: '0px', top: '0px', width: '640px', height: '360px'
  });
  document.body.appendChild(canvas);
  return canvas;
}

function click(canvas, clientX, clientY) {
  for (const type of ['pointerdown', 'pointerup']) {
    canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true,
      cancelable: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
      clientX, clientY
    }));
  }
}

describe('edit mode in a real browser', () => {
  const cleanup = [];
  afterEach(() => {
    for (const fn of cleanup.splice(0)) fn();
  });

  async function makeGame(scene, { editMode = true, hooks = {}, name = scene.name } = {}) {
    await initPhysics();
    const canvas = mountCanvas();
    const game = new M2D(canvas, {
      width: 640, height: 360, renderer: 'canvas', pointerLock: false,
      performanceStats: false, editMode
    });
    game.registerActor('Block', Block);
    game.sceneManager.addScene(name, { fetch: async () => scene, ...hooks });
    cleanup.push(() => { game.destroy(); canvas.remove(); });
    await game.sceneManager.switchTo(name);
    return { game, canvas };
  }

  it('draws the materialized document with no hook run', async () => {
    const hooks = { onEnter: vi.fn(), onShow: vi.fn(), onDraw: vi.fn(), onDrawBackground: vi.fn() };
    const { game, canvas } = await makeGame(LEVEL, { hooks });

    // The editor owns the camera in edit mode; aim it at the block.
    game.camera.x = 320;
    game.camera.y = 180;
    game.renderer.clear('#000');
    game.drawWorld(game.sceneManager.getCurrentScene(), 0);

    // The block's own draw ran — the document is visible…
    const { width, height, data } = readCanvas2DPixels(canvas);
    const at = (x, y) => data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3);
    const centre = at(Math.round(width / 2), Math.round(height / 2));
    expect(centre[0]).toBeGreaterThan(180);        // #ff6600
    expect(centre[2]).toBeLessThan(60);

    // …and none of the scene's own hooks were.
    for (const [name, spy] of Object.entries(hooks)) {
      expect(spy, name).not.toHaveBeenCalled();
    }
  });

  it('shows a UI scene whose buttons cannot fire', async () => {
    const onAction = vi.fn();
    const { game, canvas } = await makeGame(MENU, { hooks: { onAction } });

    // Dead centre of the canvas, where the button is anchored.
    click(canvas, 320, 180);

    expect(onAction).not.toHaveBeenCalled();
    expect(game.sceneManager.getCurrentScene().config.name).toBe('menu');
  });

  it('still hands input to the engine itself, for the editor to use', async () => {
    const { game, canvas } = await makeGame(LEVEL);
    let heard = null;
    game.input.on('pointerdown', event => { heard = event; });

    click(canvas, 100, 100);

    expect(heard).not.toBeNull();
  });

  it('gives cvars no storage, so nothing an editor does persists', async () => {
    const { game } = await makeGame(LEVEL);
    expect(game.cvars.storage).toBeNull();

    const played = new M2D(mountCanvas(), {
      width: 64, height: 64, renderer: 'canvas', performanceStats: false
    });
    cleanup.push(() => played.destroy());
    expect(played.cvars.storage).not.toBeNull();
  });

  it('draws on demand: when invalidated, otherwise at the idle rate', async () => {
    const { game } = await makeGame(LEVEL);
    // Drive the loop by hand with chosen timestamps; the real one stops.
    cancelAnimationFrame(game.frameHandle);
    const draws = vi.spyOn(game, 'drawWorld');
    const frame = (time) => { game.update(time); cancelAnimationFrame(game.frameHandle); };

    const idle = 1000 / M2D.EDIT_IDLE_FPS;
    frame(1000);                       // first frame only sets the clock
    frame(1004);                       // the switch invalidated: drawn
    expect(draws).toHaveBeenCalledTimes(1);
    for (let t = 1008; t < 1004 + idle; t += 4) frame(t);
    expect(draws).toHaveBeenCalledTimes(1);   // idle, under one idle period: nothing

    frame(1004 + idle);                // the idle frame
    expect(draws).toHaveBeenCalledTimes(2);

    game.invalidate();
    frame(1008 + idle);                // asked for: drawn at once
    expect(draws).toHaveBeenCalledTimes(3);
    frame(1012 + idle);
    expect(draws).toHaveBeenCalledTimes(3);

    game.drawOnDemand = false;         // the editor's power saving, off
    for (let t = 1016 + idle; t < 1056 + idle; t += 4) frame(t);
    expect(draws).toHaveBeenCalledTimes(13);
  });

  it('draws every frame when played', async () => {
    const { game } = await makeGame(LEVEL, { editMode: false });
    cancelAnimationFrame(game.frameHandle);
    const draws = vi.spyOn(game, 'drawWorld');
    for (let t = 1000; t <= 1160; t += 16) { game.update(t); cancelAnimationFrame(game.frameHandle); }
    expect(draws.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it('leaves nothing behind across edit, play, stop, edit', async () => {
    // Edit.
    const first = await makeGame(LEVEL);
    first.game.destroy();
    first.canvas.remove();
    cleanup.length = 0;

    // The destroyed game's input is gone from the page.
    let heard = false;
    first.game.input?.on?.('pointerdown', () => { heard = true; });
    click(first.canvas, 100, 100);
    expect(heard).toBe(false);

    // Play: the same document in a fresh, unflagged game simulates.
    const play = await makeGame(LEVEL, { editMode: false });
    const crate = play.game.sceneManager.getCurrentScene().entitiesById.get('block-1');
    const before = crate.position.y;
    play.game.step(30);
    expect(crate.position.y).toBeGreaterThan(before);
    play.game.destroy();
    play.canvas.remove();
    cleanup.length = 0;

    // Edit again: the document's position, not the played one.
    const second = await makeGame(LEVEL);
    const again = second.game.sceneManager.getCurrentScene().entitiesById.get('block-1');
    expect(again.position.y).toBe(before);
    expect(second.game.time.steps).toBe(0);
  });
});
