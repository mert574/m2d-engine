import { describe, it, expect, vi } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { UIElement } from '../src/core/ui/uiElement.js';
import { SCENE_VERSION, SceneLoader } from '../src/core/sceneLoader.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from './helpers/environment.js';

/**
 * What a UI scene draws of the game's own: painted backdrop layers the
 * game registers by name (a menu's skyline, a lap running behind the
 * type), the wash that keeps the type legible over them, and components
 * — widgets of the game's own placed by the scene, as a HUD places them.
 */

installWindowStub();
stubDocumentListeners();

const menu = (elements) => ({ version: SCENE_VERSION, type: 'ui', name: 'menu', elements });

function game() {
  const made = new M2D(displayCanvas(320, 180), { width: 320, height: 180, renderer: new RecordingRenderer(), devConsole: false, performanceStats: false });
  vi.spyOn(made.soundManager, 'playMusic').mockImplementation(() => {});
  return made;
}

async function show(made, scene) {
  made.sceneManager.addScene(scene.name, { fetch: async () => scene });
  await made.sceneManager.switchTo(scene.name);
  return made.sceneManager.getCurrentScene();
}

/** A painted layer that records what it is asked to do. */
function recordingLayer() {
  return { draws: [], updates: [], draw(paint, frame) { this.draws.push(frame); }, update(dt) { this.updates.push(dt); } };
}

describe('a backdrop\'s painted layers', () => {
  it('draws each named layer, fresh per scene, and ticks it', async () => {
    const made = game();
    const layers = [];
    made.registerBackdropLayer('lap', () => { const layer = recordingLayer(); layers.push(layer); return layer; });
    const scene = await show(made, menu([{ type: 'backdrop', id: 'sky', properties: { from: '#000', layers: ['lap'] } }]));
    const backdrop = scene.uiById.get('sky');
    backdrop.update(0.5);
    backdrop.draw();
    expect(layers).toHaveLength(1);
    expect(layers[0].updates).toEqual([0.5]);
    expect(layers[0].draws[0]).toMatchObject({ width: 320, height: 180 });

    await show(made, { ...menu([{ type: 'backdrop', id: 'sky', properties: { layers: ['lap'] } }]), name: 'again' });
    expect(layers).toHaveLength(2);
    made.destroy();
  });

  it('refuses at load a layer nobody registered, naming where', () => {
    const made = game();
    made.registerBackdropLayer('lap', recordingLayer);
    expect(() => new SceneLoader(made).load(menu([{ type: 'backdrop', id: 'sky', properties: { layers: ['lap', 'lapp'] } }])))
      .toThrow(/elements\[0\]\.properties\.layers\[1\]: backdrop layer 'lapp' is not registered/);
    made.destroy();
  });
});

describe('a backdrop\'s wash', () => {
  const washOf = async (wash) => {
    const made = game();
    const scene = await show(made, menu([{ type: 'backdrop', id: 'sky', properties: { from: '#123', wash } }]));
    const backdrop = scene.uiById.get('sky');
    const rects = [];
    vi.spyOn(backdrop.paint, 'drawRect').mockImplementation((rect) => rects.push(rect));
    backdrop.draw();
    made.destroy();
    return rects.map((rect) => rect.fillStyle).find((style) => style?.stops?.[0]?.color?.startsWith('rgba(3, 5, 9'));
  };

  it('darkens from the side the type sits against, at its strength', async () => {
    const left = await washOf({ side: 'left', strength: 0.6 });
    expect(left).toMatchObject({ type: 'linear', x0: 0, y0: 0 });
    expect(left.x1).toBeGreaterThan(0);
    expect(left.stops[0].color).toBe('rgba(3, 5, 9, 0.6)');

    const right = await washOf({ side: 'right' });
    expect(right.x0).toBe(320);
    expect(right.x1).toBeLessThan(320);
    expect(right.stops[0].color).toBe('rgba(3, 5, 9, 0.8)');

    const bottom = await washOf({ side: 'bottom', strength: 1 });
    expect(bottom).toMatchObject({ x0: 0, y0: 180 });
    expect(bottom.y1).toBeLessThan(180);
  });

  it('is not there unless asked for', async () => {
    expect(await washOf(undefined)).toBeUndefined();
  });
});

describe('a UI scene\'s components', () => {
  class Badge extends UIElement {
    constructor(options) {
      super({ width: 40, height: 10, ...options });
      this.label = options.properties.label;
    }
  }

  it('places a widget the game registered, where the scene says, with its properties', async () => {
    const made = game();
    const make = vi.fn((scene, element) => new Badge(element));
    made.registerUIComponent('badge', make);
    const scene = await show(made, menu([{ type: 'component', id: 'best', component: 'badge', x: 12, y: -4, anchor: 'right', properties: { label: '1:02.30' } }]));
    expect(make).toHaveBeenCalledWith(scene, expect.objectContaining({ x: 12, y: -4, anchor: 'right', properties: { label: '1:02.30' } }));
    const badge = scene.uiById.get('best');
    expect(badge).toBeInstanceOf(Badge);
    expect(badge.label).toBe('1:02.30');
    expect(scene.ui.children).toContain(badge);
    made.destroy();
  });

  it('refuses at load a component nobody registered, in a UI scene and in a HUD', () => {
    const made = game();
    made.registerUIComponent('badge', (scene, element) => new Badge(element));
    expect(() => new SceneLoader(made).load(menu([{ type: 'component', id: 'best', component: 'bagde', x: 0, y: 0 }])))
      .toThrow(/elements\[0\]\.component: UI component 'bagde' is not registered/);
    const level = {
      version: SCENE_VERSION, type: 'level', name: 'room', world: { width: 100, height: 100 },
      prefabs: {}, layers: [{ name: 'main', objects: [] }],
      hud: [{ type: 'component', id: 'status', component: 'statsu', x: 0, y: 0 }]
    };
    expect(() => new SceneLoader(made).load(level)).toThrow(/hud\[0\]\.component: UI component 'statsu' is not registered/);
    made.destroy();
  });

  it('is one registry under both names', () => {
    const made = game();
    const make = () => null;
    made.registerHudComponent('old', make);
    expect(made.uiComponents.get('old')).toBe(make);
    expect(made.hudComponents).toBe(made.uiComponents);
    made.destroy();
  });
});
