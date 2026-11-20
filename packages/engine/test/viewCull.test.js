import { describe, it, expect, vi } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { Trigger } from '../src/actors/trigger.js';
import { RecordingRenderer } from '../src/testing/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from '../src/testing/environment.js';
import { SCENE_VERSION } from '../src/core/sceneLoader.js';

/**
 * The view cull (core/viewCull.js): an entity whose drawing falls outside
 * the view issues no draw calls, at any zoom and any rotation, while one
 * that paints the view itself is never skipped — and nothing the
 * simulation sees changes either way.
 */

installWindowStub();
stubDocumentListeners();
// `game.update` schedules the next frame; the tests drive it by hand.
globalThis.requestAnimationFrame = () => 1;

/** Paints the whole view rather than its body, as a sky or a ground wash does. */
class Wash extends Entity {
  get drawBounds() {
    return null;
  }

  draw() {
    const area = this.game.camera.getVisibleArea();
    this.game.renderer.drawRect({ x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fillStyle: '#123456' });
  }
}

/** Counts its ticks, so a culled entity can be shown to tick on. */
class Ticker extends Entity {
  ticks = 0;

  fixedUpdate() {
    this.ticks++;
  }
}

const VIEW = { width: 320, height: 180 };

function level(objects) {
  return {
    version: SCENE_VERSION, type: 'level', name: 'cull',
    world: { width: 4000, height: 2000, gravity: { x: 0, y: 0 } },
    prefabs: {
      box: { actor: 'Ticker', physics: { bodyType: 'static' } },
      wash: { actor: 'Wash', physics: { bodyType: 'static', isSensor: true } },
      lamp: { actor: 'Entity', physics: { bodyType: 'static' }, light: { type: 'point', color: '#ffc877', range: 60, intensity: 1 } },
      marker: { actor: 'Trigger', physics: { bodyType: 'static', isSensor: true } }
    },
    layers: [{ name: 'main', objects }]
  };
}

async function make(objects) {
  const renderer = new RecordingRenderer();
  const game = new M2D(displayCanvas(VIEW.width, VIEW.height), {
    ...VIEW, renderer, devConsole: false, performanceStats: false,
    worldWidth: 4000, worldHeight: 2000, seed: 1
  });
  game.registerActor('Ticker', Ticker);
  game.registerActor('Wash', Wash);
  game.registerActor('Entity', Entity);
  game.registerActor('Trigger', Trigger);
  vi.spyOn(game.soundManager, 'playMusic').mockImplementation(() => {});
  game.sceneManager.addScene('cull', { fetch: async () => level(objects) });
  await game.sceneManager.switchTo('cull');
  const scene = game.sceneManager.getCurrentScene();
  // The view on the near box; the far one is a world away.
  game.camera.x = 100;
  game.camera.y = 100;
  return { game, renderer, scene };
}

/** Draw calls made while the scene's world pass runs, by the entity they came from. */
function drawPass(game, renderer, scene) {
  renderer.resetStats();
  renderer.reset();
  scene.drawWorld(1 / 60);
  return renderer;
}

const near = { id: 'near', prefab: 'box', x: 100, y: 100, width: 20, height: 20 };
const far = { id: 'far', prefab: 'box', x: 3000, y: 1500, width: 20, height: 20 };

describe('the view cull', () => {
  it('draws an entity on the view and none of an entity off it, and counts what it skipped', async () => {
    const { game, renderer, scene } = await make([near, far]);
    drawPass(game, renderer, scene);

    const rects = renderer.optionsFor('drawRect');
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeCloseTo(90, 5);
    expect(renderer.stats.culled).toBe(1);
    game.destroy();
  });

  it('draws the off-view entity again when r_cull is off', async () => {
    const { game, renderer, scene } = await make([near, far]);
    game.cvars.set('r_cull', false);
    drawPass(game, renderer, scene);

    expect(renderer.optionsFor('drawRect')).toHaveLength(2);
    expect(renderer.stats.culled).toBe(0);
    game.destroy();
  });

  it('keeps ticking and colliding for a culled entity', async () => {
    const { game, renderer, scene } = await make([near, far]);
    const offView = scene.entitiesById.get('far');
    for (let i = 1; i <= 5; i++) {
      game.update(i * 16);
      drawPass(game, renderer, scene);
    }

    expect(renderer.stats.culled).toBe(1);
    expect(offView.ticks).toBeGreaterThan(0);
    expect(game.entities.has(offView)).toBe(true);
    game.destroy();
  });

  it('never culls an entity that paints the view rather than its body', async () => {
    // Its body sits a world away from the camera; its drawing is the view.
    const { game, renderer, scene } = await make([{ id: 'wash', prefab: 'wash', x: 3000, y: 1500, width: 10, height: 10 }]);
    drawPass(game, renderer, scene);

    expect(renderer.optionsFor('drawRect')).toHaveLength(1);
    expect(renderer.stats.culled).toBe(0);
    game.destroy();
  });

  it('keeps a zoomed-out or turned view honest: what the camera shows is drawn', async () => {
    const { game, renderer, scene } = await make([near, far]);
    // Zoomed far out, both are on screen.
    game.camera.x = 1550;
    game.camera.y = 800;
    game.camera.zoom = 0.05;
    drawPass(game, renderer, scene);
    expect(renderer.optionsFor('drawRect')).toHaveLength(2);
    expect(renderer.stats.culled).toBe(0);

    // Turned, the corner the box sits in is still inside the view's box.
    game.camera.zoom = 1;
    game.camera.x = 100;
    game.camera.y = 100;
    game.camera.rotation = Math.PI / 4;
    drawPass(game, renderer, scene);
    expect(renderer.optionsFor('drawRect')).toHaveLength(1);
    game.destroy();
  });

  it('draws a light whose reach is on the view from a body that is not', async () => {
    // The lamp's body is off the left edge; its 60-unit light still falls on it.
    const { game, renderer, scene } = await make([{ id: 'lamp', prefab: 'lamp', x: -120, y: 100, width: 10, height: 10 }]);
    const light = vi.spyOn(renderer, 'drawLight');
    drawPass(game, renderer, scene);
    expect(light).toHaveBeenCalled();

    // Far enough that neither the body nor the light reaches the view.
    scene.entitiesById.get('lamp').body.setPosition({ x: -3000, y: 100 });
    light.mockClear();
    drawPass(game, renderer, scene);
    expect(light).not.toHaveBeenCalled();
    game.destroy();
  });

  it('skips the tool box of an off-view tool entity and keeps the one on it', async () => {
    const { game, renderer, scene } = await make([
      { id: 'here', prefab: 'marker', x: 100, y: 100, width: 20, height: 20 },
      { id: 'there', prefab: 'marker', x: 3000, y: 1500, width: 20, height: 20 }
    ]);
    game.showTools = true;
    game.worldOverlay.clear();
    scene.draw(1 / 60);
    renderer.reset();
    game.drawOverlays();

    // One box: the marker on the view. The other is a world away.
    expect(renderer.callsTo('drawPath')).toHaveLength(1);
    game.destroy();
  });
});
