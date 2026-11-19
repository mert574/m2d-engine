import { describe, it, expect, vi, beforeAll } from 'vitest';
import { M2D } from 'm2d-engine/core/m2d.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { RecordingRenderer } from 'm2d-engine/test/helpers/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from 'm2d-engine/test/helpers/environment.js';
import { registerKitScenery, SCENERY_TEMPLATES } from '../src/scenery.ts';
import { PREFAB_TEMPLATES } from '../src/actors.ts';

/**
 * The scenery actors in a running level: what they draw and where in the
 * order, what the loader refuses, and the ambient sound's whole life —
 * faded in, carried by its radius, silent in the editor, stopped when its
 * entity goes or its scene leaves.
 */

installWindowStub();
stubDocumentListeners();

beforeAll(async () => {
  await initPhysics({ dimensions: 3 });
});

/** A marker the order checks find: one rect of its own colour. Placed inside the view, or the engine's cull would skip it. */
class Dot extends Entity {
  draw() { this.game.renderer.drawRect({ x: 0, y: 0, width: 1, height: 1, fillStyle: '#d07' }); }
}

const SCENERY = { bodyType: 'static', isSensor: true, layer: 'none' };

function level({ world = {}, prefabs = {}, objects = [], ...extra } = {}) {
  return {
    version: SCENE_VERSION, type: 'level', name: 'look',
    world: { width: 640, height: 360, gravity: { x: 0, y: 0 }, ...world },
    prefabs: { dot: { actor: 'Dot', physics: { bodyType: 'static' } }, ...prefabs },
    layers: [{ name: 'main', objects: [{ id: 'dot-1', prefab: 'dot', x: 160, y: 90, width: 8, height: 8 }, ...objects] }],
    ...extra
  };
}

const placed = (id, prefab, at = { x: 320, y: 180 }, extra = {}) => ({ id, prefab, ...at, width: 16, height: 16, ...extra });

/** A displayed 2D game drawing into a recording renderer, or a headless one (`{ headless: true, dimensions: 3 }`). */
function makeGame(options = {}) {
  const renderer = options.headless ? null : new RecordingRenderer();
  const game = options.headless
    ? new M2D(null, options)
    : new M2D(displayCanvas(320, 180), { width: 320, height: 180, renderer, devConsole: false, performanceStats: false, ...options });
  registerKitScenery(game);
  game.registerActor('Dot', Dot);
  return { game, renderer };
}

async function show(scene, options) {
  const { game, renderer } = makeGame(options);
  game.sceneManager.addScene(scene.name, { fetch: async () => scene });
  game.sceneManager.addScene('other', { fetch: async () => level({ name: 'other' }) });
  await game.sceneManager.switchTo(scene.name);
  return { game, renderer, scene: game.sceneManager.getCurrentScene() };
}

/** The index of the first call matching `test`, in the order they were made. */
const firstIndex = (renderer, method, test = () => true) => renderer.calls.findIndex((call) => call.method === method && test(call.args[0]));
const isDot = (options) => options.fillStyle === '#d07';

describe('the backdrops', () => {
  it('draw the sky as a gradient over the view, and stars and fireflies, under the entities', async () => {
    const { game, renderer, scene } = await show(level({
      prefabs: {
        sky: { actor: 'Sky', physics: SCENERY, properties: { top: '#123', middle: '#456', bottom: '#789', horizon: 0.6 } },
        stars: { actor: 'Scatter', physics: SCENERY, properties: { kind: 'stars', count: 12, seed: 3 } },
        fireflies: { actor: 'ParticleField', physics: SCENERY, properties: { kind: 'fireflies', count: 5, opacity: 1 } }
      },
      objects: [placed('sky-1', 'sky'), placed('stars-1', 'stars'), placed('fireflies-1', 'fireflies')]
    }));
    renderer.reset();
    scene.draw(0.016);
    const rects = renderer.optionsFor('drawRect');
    const area = game.camera.getVisibleArea();
    expect(rects[0].fillStyle.stops.map((stop) => stop.color)).toEqual(['#123', '#456', '#789']);
    expect(rects[0].x).toBeCloseTo(area.left);
    expect(rects[0].width).toBeCloseTo(area.right - area.left);
    // 12 stars and two arcs a firefly, all before the entity placed first.
    expect(renderer.callsTo('drawArc')).toHaveLength(12 + 5 * 2);
    const dot = firstIndex(renderer, 'drawRect', isDot);
    expect(dot).toBeGreaterThan(renderer.calls.findLastIndex((call) => call.method === 'drawArc'));
    game.destroy();
  });

  it('light the fireflies\' glow in a lit level and leave it unlit where no ambient is set', async () => {
    const fireflies = { actor: 'ParticleField', physics: SCENERY, properties: { kind: 'fireflies', count: 40 } };
    const lightsDrawn = async (world) => {
      const { game, renderer, scene } = await show(level({ world, prefabs: { fireflies }, objects: [placed('fireflies-1', 'fireflies')] }));
      renderer.reset();
      scene.draw(0.016);
      const lights = renderer.optionsFor('drawLight');
      game.destroy();
      return lights;
    };
    const lit = await lightsDrawn({ lighting: { ambient: '#334' } });
    expect(lit.length).toBeGreaterThan(0);
    expect(lit[0].color).toBe('#ffe48a');
    expect(await lightsDrawn({})).toHaveLength(0);
  });

  it('draw leaves, rain and sparks over the entities unless the object says otherwise', async () => {
    const rain = { actor: 'ParticleField', physics: SCENERY, properties: { kind: 'rain', count: 5 } };
    const { game, renderer, scene } = await show(level({
      prefabs: { rain },
      objects: [placed('rain-1', 'rain'), placed('rain-2', 'rain', undefined, { zIndex: -1000 })]
    }));
    renderer.reset();
    scene.draw(0.016);
    const lines = renderer.calls.map((call, i) => (call.method === 'drawLine' ? i : -1)).filter((i) => i >= 0);
    const dot = firstIndex(renderer, 'drawRect', isDot);
    expect(lines).toHaveLength(10);
    expect(lines.filter((i) => i < dot)).toHaveLength(5);
    expect(lines.filter((i) => i > dot)).toHaveLength(5);
    game.destroy();
  });

  it('lay scatter out from its seed, the same each time, and draw still rain without a NaN', async () => {
    const draw = async () => {
      const { game, renderer, scene } = await show(level({
        prefabs: {
          stars: { actor: 'Scatter', physics: SCENERY, properties: { kind: 'stars', count: 6, seed: 9 } },
          still: { actor: 'ParticleField', physics: SCENERY, properties: { kind: 'rain', count: 3, speed: 0 } }
        },
        objects: [placed('stars-1', 'stars'), placed('still-1', 'still')]
      }));
      renderer.reset();
      scene.draw(0.016);
      const points = renderer.optionsFor('drawArc').map(({ x, y }) => [x, y]);
      for (const line of renderer.optionsFor('drawLine')) expect(Number.isFinite(line.x2)).toBe(true);
      game.destroy();
      return points;
    };
    expect(await draw()).toEqual(await draw());
  });

  it('fill a box of the world around a field that does not follow the camera', async () => {
    const { game, renderer, scene } = await show(level({
      prefabs: { leaves: { actor: 'ParticleField', physics: SCENERY, properties: { kind: 'leaves', count: 20, follow: false, extent: { x: 10, y: 10 } } } },
      objects: [placed('leaves-1', 'leaves', { x: 100, y: 50 })]
    }));
    renderer.reset();
    scene.draw(0.016);
    const points = renderer.optionsFor('drawPath').flatMap((path) => path.points);
    expect(points).toHaveLength(80);
    for (const point of points) {
      expect(Math.abs(point.x - 100)).toBeLessThan(10 + 6 * 1.3 + 1);
      expect(Math.abs(point.y - 50)).toBeLessThan(10 + 6 * 1.3 + 1);
    }
    game.destroy();
  });

  it('collide with nothing', async () => {
    const { game, scene } = await show(level({
      prefabs: { sky: { actor: 'Sky', physics: { bodyType: 'static' } } },
      objects: [placed('sky-1', 'sky')]
    }));
    expect(scene.entitiesById.get('sky-1').body.collisionFilter).toMatchObject({ category: 0, mask: 0 });
    game.destroy();
  });
});

describe('what the loader refuses', () => {
  const refusal = async (scene, options) => {
    const { game } = makeGame(options);
    game.sceneManager.addScene(scene.name, { fetch: async () => scene });
    const error = await game.sceneManager.switchTo(scene.name).then(() => null, (e) => e);
    game.destroy();
    return error?.message ?? '';
  };

  it('a 2D backdrop in a 3D level, naming the prefab', async () => {
    const message = await refusal({
      version: SCENE_VERSION, type: 'level', name: 'deep', world: { dimensions: 3 },
      prefabs: { sky: { actor: 'Sky', physics: SCENERY } }, layers: [{ name: 'main', objects: [] }]
    }, { headless: true, dimensions: 3 });
    expect(message).toMatch(/prefabs\.sky\.actor.*Sky is for a 2D level, and this level is 3D/);
  });

  it('a particle kind of the other dimension, or none, naming the object\'s property', async () => {
    const smoke = { actor: 'ParticleField', physics: SCENERY, properties: { kind: 'smoke' } };
    expect(await refusal(level({ prefabs: { smoke }, objects: [placed('smoke-1', 'smoke')] })))
      .toMatch(/layers\[0\]\.objects\[1\]\.properties\.kind.*'smoke' particles are drawn in 3D, and this level is 2D/);
    const bare = { actor: 'ParticleField', physics: SCENERY };
    expect(await refusal(level({ prefabs: { bare }, objects: [placed('bare-1', 'bare')] }))).toMatch(/names its kind/);
    // An object may supply the kind its prefab leaves out.
    const { game } = await show(level({ prefabs: { bare }, objects: [placed('bare-1', 'bare', undefined, { properties: { kind: 'rain' } })] }));
    expect(game.sceneManager.getCurrentScene().entitiesById.get('bare-1').field.kind).toBe('rain');
    game.destroy();
  });
});

describe('a 3D particle field', () => {
  it('declares its field as the entity\'s record, for the frame to collect at its body', async () => {
    const { game } = makeGame({ headless: true, dimensions: 3 });
    game.sceneManager.addScene('deep', { fetch: async () => ({
      version: SCENE_VERSION, type: 'level', name: 'deep', world: { dimensions: 3, gravity: { x: 0, y: 0, z: 0 } },
      prefabs: { smoke: SCENERY_TEMPLATES.smoke.prefab },
      layers: [{ name: 'main', objects: [{ id: 'smoke-1', prefab: 'smoke', x: 4, y: 1, z: -2, width: 1, height: 1, depth: 1, properties: { radius: 0.6 } }] }]
    }) });
    await game.sceneManager.switchTo('deep');
    const field = game.sceneManager.getCurrentScene().entitiesById.get('smoke-1');
    expect(field.particles).toEqual({ kind: 'smoke', count: 120, radius: 0.6 });
    expect(field.body.position).toMatchObject({ x: 4, y: 1, z: -2 });
    // Not the grey box the engine draws a meshless 3D entity as.
    expect(field.mesh).toBeNull();
    game.destroy();
  });
});

describe('ambient sound', () => {
  function withLoops(options) {
    const made = makeGame(options);
    const handles = [];
    vi.spyOn(made.game.soundManager, 'loop').mockImplementation((key, given) => {
      const handle = { key, given, volume: null, setVolume: vi.fn((v) => { handle.volume = v; }), stop: vi.fn() };
      handles.push(handle);
      return handle;
    });
    return { ...made, handles };
  }

  const wind = (properties = {}) => ({ wind: { actor: 'AmbientSound', physics: SCENERY, properties: { sound: 'wind', ...properties } } });

  it('loops from silence up to its volume, and stops when its scene leaves', async () => {
    const { game, handles } = withLoops();
    game.sceneManager.addScene('look', { fetch: async () => level({ prefabs: wind({ volume: 0.6, fadeIn: 2 }), objects: [placed('wind-1', 'wind')] }) });
    game.sceneManager.addScene('other', { fetch: async () => level({ name: 'other' }) });
    await game.sceneManager.switchTo('look');
    const scene = game.sceneManager.getCurrentScene();
    scene.update(1);
    expect(handles).toHaveLength(1);
    expect(handles[0].given).toEqual({ volume: 0, rate: 1 });
    expect(handles[0].volume).toBeCloseTo(0.3);
    scene.update(5);
    expect(handles[0].volume).toBeCloseTo(0.6);
    await game.sceneManager.switchTo('other');
    expect(handles[0].stop).toHaveBeenCalled();
    game.destroy();
  });

  it('stops when a rule removes its entity', async () => {
    const { game, handles } = withLoops();
    game.sceneManager.addScene('look', { fetch: async () => level({
      prefabs: wind({ fadeIn: 0 }), objects: [placed('wind-1', 'wind')],
      world: { rules: [{ when: { event: 'emit', name: 'hush' }, then: [{ do: 'remove', object: 'wind-1' }] }] }
    }) });
    await game.sceneManager.switchTo('look');
    const scene = game.sceneManager.getCurrentScene();
    scene.update(1 / 60);
    expect(handles[0].volume).toBe(1);
    scene.entitiesById.get('dot-1').fixedUpdate = function () { this.game.events.emit('hush'); };
    game.step(1);
    expect(scene.entitiesById.get('wind-1').dead).toBe(true);
    expect(handles[0].stop).toHaveBeenCalled();
    game.destroy();
  });

  it('carries as far as its radius from the view, and fills the scene without one', async () => {
    const { game, handles } = withLoops();
    game.sceneManager.addScene('look', { fetch: async () => level({
      prefabs: { ...wind({ fadeIn: 0, radius: 100 }), hum: { actor: 'AmbientSound', physics: SCENERY, properties: { sound: 'hum', fadeIn: 0 } } },
      objects: [placed('wind-1', 'wind', { x: 0, y: 0 }), placed('hum-1', 'hum', { x: 5000, y: 5000 })]
    }) });
    await game.sceneManager.switchTo('look');
    const scene = game.sceneManager.getCurrentScene();
    const near = handles, everywhere = handles;
    game.camera.x = 0; game.camera.y = 0;
    scene.update(1 / 60);
    expect(near.find((h) => h.key === 'wind').volume).toBeCloseTo(1);
    game.camera.x = 50; game.camera.y = 0;
    scene.update(1 / 60);
    expect(near.find((h) => h.key === 'wind').volume).toBeCloseTo(0.25);
    game.camera.x = 400;
    scene.update(1 / 60);
    expect(near.find((h) => h.key === 'wind').volume).toBe(0);
    expect(everywhere.find((h) => h.key === 'hum').volume).toBe(1);
    game.destroy();
  });

  it('is silent in the editor, and says once when its sound is missing', async () => {
    const { game, handles } = withLoops({ editMode: true });
    game.sceneManager.addScene('look', { fetch: async () => level({ prefabs: wind(), objects: [placed('wind-1', 'wind')] }) });
    await game.sceneManager.switchTo('look');
    game.sceneManager.getCurrentScene().update(1);
    expect(handles).toHaveLength(0);
    game.destroy();

    const { game: played } = makeGame();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    played.sceneManager.addScene('look', { fetch: async () => level({ prefabs: wind(), objects: [placed('wind-1', 'wind')] }) });
    await played.sceneManager.switchTo('look');
    played.sceneManager.getCurrentScene().update(1);
    played.sceneManager.getCurrentScene().update(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/no sound 'wind'/);
    warn.mockRestore();
    played.destroy();
  });

  it('plays one voice after a game-over reload, not two', async () => {
    const { game, handles } = withLoops();
    game.sceneManager.addScene('look', { fetch: async () => level({ prefabs: wind(), objects: [placed('wind-1', 'wind')] }) });
    await game.sceneManager.switchTo('look');
    game.sceneManager.getCurrentScene().update(1 / 60);
    game.reset();
    await game.sceneManager.reload();
    game.sceneManager.getCurrentScene().update(1 / 60);
    expect(handles).toHaveLength(2);
    expect(handles[0].stop).toHaveBeenCalled();
    expect(handles[1].stop).not.toHaveBeenCalled();
    game.destroy();
  });
});

describe('the templates', () => {
  it('each load into a level of its dimension and build', async () => {
    const spawn = PREFAB_TEMPLATES.spawnPoint;
    const cases = [...Object.entries(SCENERY_TEMPLATES).map(([name, t]) => [name, t, t.dimensions ?? 2]), ['spawnPoint', spawn, 2], ['spawnPoint', spawn, 3]];
    for (const [name, template, dimensions] of cases) {
      const { game } = makeGame(dimensions === 3 ? { headless: true, dimensions: 3 } : {});
      game.sceneManager.addScene('t', { fetch: async () => ({
        version: SCENE_VERSION, type: 'level', name: 't', world: { dimensions, gravity: { x: 0, y: 0, ...(dimensions === 3 && { z: 0 }) } },
        prefabs: { [name]: template.prefab },
        layers: [{ name: 'main', objects: [{ id: 'one', prefab: name, x: 0, y: 0, ...(dimensions === 3 && { z: 0, depth: 1 }), width: 1, height: 1 }] }]
      }) });
      await game.sceneManager.switchTo('t');
      expect(game.sceneManager.getCurrentScene().entitiesById.get('one'), name).toBeTruthy();
      game.destroy();
    }
  });
});
