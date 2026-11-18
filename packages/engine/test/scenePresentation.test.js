import { describe, it, expect, vi } from 'vitest';
import { M2D } from '../src/core/m2d.js';
import { Entity } from '../src/core/entity.js';
import { s } from '../src/core/schema.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { displayCanvas, installWindowStub, stubDocumentListeners } from './helpers/environment.js';
import { scroll, keyDown } from './helpers/input.js';
import { SCENE_VERSION, SceneLoader } from '../src/core/sceneLoader.js';
import { PROJECT_SCHEMA, projectIssues, projectOptions, bootProject, sceneNameOf, combineSceneHooks } from '../src/core/project.js';

/**
 * What a scene says about how it looks, sounds and moves, applied by the
 * engine instead of a hook: the clear colour, camera controls, post bound
 * to a value, asset-reference actor properties, what an actor declares of
 * itself, the world size, and a UI scene's menu items, backdrop and
 * effects. And the project file that boots it all. (The sky, scatter,
 * particles and ambient sound are the kit's actors, tested there.)
 */

installWindowStub();
stubDocumentListeners();

class Dot extends Entity {}
class Plane extends Entity {
  static properties = {
    silhouettes: s.array(s.ref('image')),
    byRole: s.record(s.ref('image'))
  };
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.silhouettes = options.silhouettes;
    this.byRole = options.byRole;
  }
}
class Ship extends Entity {
  static properties = { flame: s.ref('spritesheet'), hull: s.number({ initial: 3 }) };
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.flame = options.flame;
  }
}

function level(world = {}, extra = {}) {
  return {
    version: SCENE_VERSION, type: 'level', name: 'look',
    world: { width: 640, height: 360, gravity: { x: 0, y: 0 }, player: 'hero', ...world },
    prefabs: { dot: { actor: 'Dot', physics: { bodyType: 'dynamic' } } },
    layers: [{ name: 'main', objects: [{ id: 'hero', prefab: 'dot', x: 300, y: 200, width: 8, height: 8 }] }],
    ...extra
  };
}

async function show(scene, options = {}) {
  const renderer = new RecordingRenderer();
  const game = new M2D(displayCanvas(320, 180), { width: 320, height: 180, worldWidth: 999, worldHeight: 999, renderer, devConsole: false, performanceStats: false, ...options });
  game.registerActor('Dot', Dot);
  game.registerActor('Ship', Ship);
  game.registerActor('Plane', Plane);
  vi.spyOn(game.soundManager, 'playMusic').mockImplementation(() => {});
  game.sceneManager.addScene(scene.name, { fetch: async () => scene });
  game.sceneManager.addScene('other', { fetch: async () => level({}, { name: 'other' }) });
  await game.sceneManager.switchTo(scene.name);
  return { game, renderer, scene: game.sceneManager.getCurrentScene() };
}

describe('a 2D level\'s backdrop', () => {
  it('clears to the scene\'s colour, and the game\'s once it leaves', async () => {
    const { game } = await show(level({ clearColor: '#102030' }), { clearColor: '#000001' });
    expect(game.clearColor).toBe('#102030');
    await game.sceneManager.switchTo('other');
    expect(game.clearColor).toBe('#000001');
    game.destroy();
  });

});

/** Drawn in 2D only; its `kind` must be one of `knownKinds[dimensions]`. */
class Haze extends Entity {
  static dimensions = 2;
}
class Field extends Entity {
  static properties = { kind: s.string() };
  static refineProperties(properties, { dimensions, fail }) {
    if (properties.kind !== `flat${dimensions}`) fail('kind', `wants flat${dimensions}, got ${properties.kind}`);
  }
}

describe('what an actor declares of itself', () => {
  const loader = () => new SceneLoader({ actors: new Map([['Dot', Dot], ['Haze', Haze], ['Field', Field]]) });

  it('refuses an actor for one dimension in a level of the other, naming the prefab', () => {
    const deep = { ...level({ dimensions: 3, gravity: { x: 0, y: 0, z: 0 }, player: undefined }), prefabs: { haze: { actor: 'Haze' } }, layers: [{ name: 'main', objects: [] }] };
    expect(() => loader().load(deep, 'look')).toThrow(/prefabs\.haze\.actor: Haze is for a 2D level, and this level is 3D/);
    const flat = level();
    expect(() => loader().load({ ...flat, prefabs: { ...flat.prefabs, haze: { actor: 'Haze' } } }, 'look')).not.toThrow();
  });

  it('refuses the properties its refine fails, with the object\'s over its prefab\'s, naming the property', () => {
    const scene = (prefab, object) => level({}, {
      prefabs: { dot: { actor: 'Dot' }, field: { actor: 'Field', ...(prefab && { properties: prefab }) } },
      layers: [{ name: 'main', objects: [
        { id: 'hero', prefab: 'dot', x: 0, y: 0, width: 8, height: 8 },
        { id: 'f', prefab: 'field', x: 0, y: 0, width: 8, height: 8, ...(object && { properties: object }) }
      ] }]
    });
    expect(() => loader().load(scene({ kind: 'flat3' }), 'look')).toThrow(/layers\[0\]\.objects\[1\]\.properties\.kind: wants flat2, got flat3/);
    expect(() => loader().load(scene({ kind: 'flat3' }, { kind: 'flat2' }), 'look')).not.toThrow();
    expect(() => loader().load(scene(null, { kind: 'flat2' }), 'look')).not.toThrow();
  });
});

describe('the camera\'s controls', () => {
  it('opens on its target rather than easing to it', async () => {
    const { game } = await show(level({ camera: { lerp: 0.05 } }));
    expect(game.camera.x).toBeCloseTo(300);
    expect(game.camera.y).toBeCloseTo(200);
    game.destroy();
  });

  it('zoom with the wheel within limits, and are not set on the camera itself', async () => {
    const { game } = await show(level({ camera: { wheelZoom: { min: 0.5, max: 1.5, speed: 0.01 } } }));
    expect(game.camera.wheelZoom).toBeUndefined();
    scroll(game, 100, 100, { dy: -1000 });
    game.input.flush();
    expect(game.camera.zoom).toBe(1.5);
    scroll(game, 100, 100, { dy: 1000 });
    game.input.flush();
    expect(game.camera.zoom).toBe(0.5);
    game.destroy();
  });

  it('pull the view out as the target speeds up', async () => {
    const { game, scene } = await show(level({ camera: { speedZoom: { out: 0.2, at: 100, ease: 1 } } }));
    scene.entitiesById.get('hero').body.setVelocity({ x: 400, y: 0 });
    scene.update(1 / 60);
    expect(game.camera.zoom).toBeCloseTo(0.8);
    game.destroy();
  });
});

/** Counts what it started and let go of, as a looping sound or an input registration would. */
class Holder extends Entity {
  static live = 0;
  constructor(...args) { super(...args); Holder.live++; }
  destroy() { Holder.live--; super.destroy(); }
}

describe('an entity that goes', () => {
  it('is destroyed when its scene leaves, when a rule removes it and when Health removes it', async () => {
    const { Health } = await import('../src/constraints/health.js');
    const renderer = new RecordingRenderer();
    const game = new M2D(displayCanvas(320, 180), { width: 320, height: 180, renderer, devConsole: false, performanceStats: false });
    game.registerActor('Dot', Dot);
    game.registerActor('Holder', Holder);
    const held = (id) => ({ id, prefab: 'holder', x: 10, y: 10, width: 8, height: 8 });
    game.sceneManager.addScene('look', { fetch: async () => level({
      rules: [{ when: { event: 'emit', name: 'clear' }, then: [{ do: 'remove', object: 'a' }] }]
    }, {
      prefabs: { dot: { actor: 'Dot', physics: { bodyType: 'dynamic' } }, holder: { actor: 'Holder', physics: { bodyType: 'static' } } },
      layers: [{ name: 'main', objects: [{ id: 'hero', prefab: 'dot', x: 300, y: 200, width: 8, height: 8 }, held('a'), held('b'), held('c')] }]
    }) });
    game.sceneManager.addScene('other', { fetch: async () => level({}, { name: 'other' }) });
    Holder.live = 0;
    await game.sceneManager.switchTo('look');
    const scene = game.sceneManager.getCurrentScene();
    expect(Holder.live).toBe(3);

    scene.entitiesById.get('hero').fixedUpdate = function () { this.game.events.emit('clear'); };
    game.step(1);
    expect(Holder.live).toBe(2);
    expect(game.entities.has(scene.entitiesById.get('a'))).toBe(false);

    const b = scene.entitiesById.get('b');
    const health = new Health(b, { maxHealth: 1, whenDead: 'remove' });
    b.addConstraint('health', health);
    health.takeDamage(5);
    expect(Holder.live).toBe(1);
    expect(game.entities.has(b)).toBe(false);
    // Gone already: a second removal is nothing.
    game.removeEntity(b);
    expect(Holder.live).toBe(1);

    await game.sceneManager.switchTo('other');
    expect(Holder.live).toBe(0);
    game.destroy();
  });
});

describe('post bound to a value', () => {
  it('moves a post field with the reading, between its empty and full values', async () => {
    const { game, scene, renderer } = await show(level({
      post: { glitch: { strength: 0 }, vignette: { strength: 0.3 } },
      postBind: [{ effect: 'glitch', bind: { constraint: 'hull', current: 'now', max: 'top' }, empty: 0.8, full: 0 }]
    }));
    const post = vi.spyOn(renderer, 'setPostEffects');
    const hull = { now: 5, top: 10 };
    scene.entitiesById.get('hero').getConstraint = () => hull;
    scene.update(1 / 60);
    expect(post.mock.calls.at(-1)[0].glitch.strength).toBeCloseTo(0.4);
    expect(post.mock.calls.at(-1)[0].vignette).toEqual({ strength: 0.3 });
    const sent = post.mock.calls.length;
    scene.update(1 / 60);
    expect(post.mock.calls).toHaveLength(sent);
    hull.now = 10;
    scene.update(1 / 60);
    expect(post.mock.calls.at(-1)[0].glitch.strength).toBeCloseTo(0);
    game.destroy();
  });
});

describe('the world size', () => {
  it('is each level\'s own, with the game\'s for a level that gives none', async () => {
    const { game } = await show(level({ width: 2400, height: 800 }));
    expect(game.options.worldWidth).toBe(2400);
    const bare = level({}, { name: 'other' });
    delete bare.world.width;
    delete bare.world.height;
    game.sceneManager.addScene('bare', { fetch: async () => ({ ...bare, name: 'bare' }) });
    await game.sceneManager.switchTo('bare');
    expect(game.options.worldWidth).toBe(999);
    game.destroy();
  });
});

describe('asset-reference properties', () => {
  it('hand an actor the loaded sprite sheet a property names, and null headless', async () => {
    const data = level({}, {
      name: 'ships',
      assets: { spritesheets: { flame: { url: 'flame.png', frameWidth: 8, frameHeight: 8 } } },
      prefabs: { ship: { actor: 'Ship', physics: { bodyType: 'dynamic' } } },
      layers: [{ name: 'main', objects: [{ id: 'hero', prefab: 'ship', x: 10, y: 10, properties: { flame: 'flame' } }] }]
    });
    const game = new M2D(null, { headless: true });
    game.registerActor('Ship', Ship);
    game.sceneManager.addScene('ships', { fetch: async () => data });
    await game.sceneManager.switchTo('ships');
    expect(game.sceneManager.getCurrentScene().entitiesById.get('hero').flame).toBeNull();
    game.destroy();

    const bad = structuredClone(data);
    bad.layers[0].objects[0].properties.flame = 'smoke';
    const loader = new SceneLoader(game);
    game.registerActor('Ship', Ship);
    expect(() => loader.load(bad, 'ships')).toThrow(/no spritesheet named 'smoke'/);
  });

  it('resolve a list and a record of refs entry by entry', async () => {
    // The one test here that loads images: a stub that is "decoded" at once.
    const Image = window.Image;
    window.Image = class { set src(url) { this._src = url; queueMicrotask(() => this.onload?.()); } get src() { return this._src; } };
    const data = level({}, {
      name: 'planes',
      assets: { images: { near: { url: 'near.png' }, far: { url: 'far.png' } } },
      prefabs: { plane: { actor: 'Plane', physics: { bodyType: 'static', isSensor: true } } },
      layers: [{ name: 'main', objects: [
        { id: 'strip', prefab: 'plane', x: 10, y: 10, properties: { silhouettes: ['near', 'far'], byRole: { front: 'near' } } }
      ] }]
    });
    const { game, scene } = await show(data);
    const strip = scene.entitiesById.get('strip');
    // The loaded images, in the order the scene named them.
    expect(strip.silhouettes).toEqual([scene.sprites.get('near'), scene.sprites.get('far')]);
    expect(strip.byRole).toEqual({ front: scene.sprites.get('near') });
    game.destroy();
    window.Image = Image;
  });

  it('refuse a list entry naming an image the scene does not have', () => {
    const data = level({}, {
      name: 'planes',
      assets: { images: { near: { url: 'near.png' } } },
      prefabs: { plane: { actor: 'Plane', physics: { bodyType: 'static', isSensor: true } } },
      layers: [{ name: 'main', objects: [{ id: 'strip', prefab: 'plane', x: 10, y: 10, properties: { silhouettes: ['near', 'gone'] } }] }]
    });
    const game = new M2D(null, { headless: true });
    game.registerActor('Plane', Plane);
    expect(() => new SceneLoader(game).load(data, 'planes')).toThrow(/no image named 'gone'/);
    game.destroy();
  });
});

describe('the settings menu a project mounts', () => {
  it('takes its options from the project file, and is left out by false', () => {
    expect(projectIssues({ name: 'g', settings: { pauseWhenOpen: true } })).toEqual([]);
    expect(projectIssues({ name: 'g', settings: false })).toEqual([]);
    expect(projectIssues({ name: 'g', settings: 'yes' })[0].message).toMatch(/must be true, false or/);
    // A choice takes names, numbers or flags; its initial must be one of them.
    expect(projectIssues({ name: 'g', choices: { car: { values: ['sprint', 'tourer'], initial: 'tourer' }, laps: { values: [1, 3, 5], initial: 3 }, ghost: { values: [true, false], initial: true } } })).toEqual([]);
    expect(projectIssues({ name: 'g', choices: { laps: { values: [1, 3], initial: 5 } } })[0]).toMatchObject({ path: 'choices.laps.initial', message: expect.stringMatching(/5 is not among the values offered/) });
    expect(projectIssues({ name: 'g', choices: { laps: { values: [1, null], initial: 1 } } })[0].message).toMatch(/must be a string, a number or a boolean/);
    expect(projectIssues({ name: 'g', choices: JSON.parse('{"__proto__": {"values": [1], "initial": 1}}') })[0]).toMatchObject({ path: 'choices.__proto__', message: "'__proto__' cannot be a key" });
  });
});

describe('a UI scene\'s menu', () => {
  const menu = (extra = {}) => ({
    version: SCENE_VERSION, type: 'ui', name: 'menu',
    transition: { enter: 'fade', exit: 'fade', duration: 0.2 },
    stagger: 0.1,
    elements: [
      { type: 'backdrop', id: 'sky', properties: { from: '#102', to: '#204', motes: 20, vignette: 0.5 } },
      { type: 'menuItem', id: 'start', x: 80, y: 0, anchor: 'left', properties: { text: 'Start', onClick: 'other', variant: 'bracket' },
        effects: { enter: { motion: 'slide-left', duration: 0.3 }, select: 'shake', exit: { motion: 'fade', duration: 0.2 } } },
      { type: 'menuItem', id: 'quit', x: 80, y: 50, anchor: 'left', properties: { text: 'Settings', action: 'settings', variant: 'underline' },
        effects: { enter: { motion: 'type', duration: 0.2 }, select: 'glow' } }
    ],
    ...extra
  });

  it('builds menu items and a backdrop, and plays the entrances staggered', async () => {
    const { game, scene } = await show(menu());
    const start = scene.uiById.get('start');
    expect(start.constructor.name).toBe('UIMenuItem');
    expect(start.variant).toBe('bracket');
    expect(scene.uiById.get('sky').constructor.name).toBe('UIBackdrop');
    expect(start.offsetX).toBeGreaterThan(80);
    expect(scene.uiById.get('quit').text).toBe('');
    game.motion.update(1);
    expect(start.offsetX).toBeCloseTo(80);
    expect(scene.uiById.get('quit').text).toBe('Settings');
    game.destroy();
  });

  it('runs a select effect while an item is selected, at rest otherwise', async () => {
    const { game, scene } = await show(menu());
    game.motion.update(1);
    const quit = scene.uiById.get('quit');
    scene.focus.focus(quit);
    for (let i = 0; i < 30; i++) scene.updateUI(1 / 60);
    expect(quit.glow).toBeGreaterThan(0.5);
    scene.focus.focus(scene.uiById.get('start'));
    for (let i = 0; i < 60; i++) scene.updateUI(1 / 60);
    expect(quit.glow).toBeLessThan(0.1);
    game.destroy();
  });

  it('switches on Enter only after its exits have played', async () => {
    const { game, scene } = await show(menu());
    game.motion.update(1);
    scene.focus.focus(scene.uiById.get('start'));
    keyDown(game, 'Enter');
    game.input.flush();
    expect(game.sceneManager.getCurrentScene()).toBe(scene);
    expect(game.sceneManager.loading).toBe(false);
    game.motion.update(0.5);
    await vi.waitFor(() => expect(game.sceneManager.getCurrentScene().config.name).toBe('other'));
    game.destroy();
  });

  it('fades in again on a second visit, not from where its last exit left it', async () => {
    const { game, scene } = await show(menu());
    game.motion.update(1);
    const away = game.sceneManager.switchTo('other');
    game.motion.update(1);
    await away;
    expect(scene.ui.opacity).toBe(0);
    await game.sceneManager.switchTo('menu');
    expect(game.sceneManager.getCurrentScene()).toBe(scene);
    game.motion.update(1);
    expect(scene.ui.opacity).toBe(1);
    game.destroy();
  });

  it('refuses a menu item that does nothing', () => {
    const bad = menu();
    bad.elements[1].properties = { text: 'Nothing' };
    expect(() => new SceneLoader(null).load(bad, 'menu')).toThrow(/none of onClick, action and set/);
  });
});

describe('a project file', () => {
  const project = {
    name: 'Test Game', definition: 'game.js', initialScene: 'level',
    display: { width: 960, height: 540, textureFilter: 'nearest', clearColor: '#111' },
    input: { actions: { menu: ['Escape'], interact: ['KeyE'] } },
    music: { theme: { url: 'music/theme.ogg', volume: 0.5 } }
  };

  it('is checked against its schema, naming the field', () => {
    expect(projectIssues(project)).toEqual([]);
    expect(projectIssues({ ...project, input: { actions: { menu: 'Escape' } } })[0].path).toBe('input.actions.menu');
    expect(projectIssues({ definition: 'game.js' })[0].path).toBe('name');
    expect(PROJECT_SCHEMA.fields.display.fields.aspectMode.values).toEqual(['letterbox', 'expand']);
  });

  it('becomes the game\'s options', () => {
    expect(projectOptions(project, { basePath: '/g/' })).toEqual({
      width: 960, height: 540, textureFilter: 'nearest', clearColor: '#111',
      actions: { menu: ['Escape'], interact: ['KeyE'] }, initialScene: 'level',
      music: { theme: { src: '/g/music/theme.ogg', volume: 0.5 } }
    });
    expect(sceneNameOf('./scenes/level1.json')).toBe('level1');
  });

  it('boots: definition registered, every scene added with its hooks, the opening scene shown', async () => {
    const onEnter = vi.fn();
    const game = await bootProject(null, {
      project: { name: 'Boot', initialScene: 'level' },
      definition: { register: (g) => g.registerActor('Dot', Dot), GAME: { seed: 3 } },
      hooks: { sceneHooks: () => ({ level: { onEnter } }) },
      scenes: { './scenes/level.json': async () => ({ default: level({}, { name: 'level' }) }), './scenes/other.json': level({}, { name: 'other' }) },
      options: { headless: true }
    });
    expect(game.sceneManager.getCurrentScene().config.name).toBe('level');
    expect(onEnter).toHaveBeenCalled();
    expect(game.sceneManager.has('other')).toBe(true);
    expect(game.options.seed).toBe(3);
    game.destroy();
  });

  it('refuses to boot a project its schema rejects', async () => {
    await expect(bootProject(null, { project: { name: '' }, definition: { register() {} }, options: { headless: true } }))
      .rejects.toThrow(/M2D project: name/);
  });
});

describe('a level\'s own HUD widgets and its lighting fallback', () => {
  it('places a HUD component the game registers, with the element\'s position and properties', async () => {
    const made = [];
    const renderer = new RecordingRenderer();
    const game = new M2D(displayCanvas(320, 180), { width: 320, height: 180, renderer, devConsole: false, performanceStats: false });
    game.registerActor('Dot', Dot);
    const { UIText } = await import('../src/core/ui/text.js');
    game.registerHudComponent('purse', (scene, element) => { made.push(element); return new UIText({ ...element, text: `${element.properties.label} 3` }); });
    game.sceneManager.addScene('look', { fetch: async () => level({}, { hud: [{ type: 'component', id: 'purse', component: 'purse', x: 20, y: -40, anchor: 'bottom-left', properties: { label: 'EMBERS' } }] }) });
    await game.sceneManager.switchTo('look');
    const purse = game.sceneManager.getCurrentScene().hud.elements.get('purse');
    expect(purse.text).toBe('EMBERS 3');
    expect(made[0]).toMatchObject({ x: 20, y: -40, anchor: 'bottom-left' });
    game.destroy();
  });

  it('places a HUD button whose action reaches the scene\'s onAction, and whose onClick switches scenes', async () => {
    const actions = [];
    const renderer = new RecordingRenderer();
    const game = new M2D(displayCanvas(320, 180), { width: 320, height: 180, renderer, devConsole: false, performanceStats: false });
    game.registerActor('Dot', Dot);
    const hud = [
      { type: 'button', id: 'pause', x: 0, y: -30, anchor: 'bottom', properties: { text: 'pause', action: 'pause', width: 100, height: 36 } },
      { type: 'button', id: 'menu', x: -60, y: 30, anchor: 'top-right', properties: { text: 'Menu', onClick: 'other' } }
    ];
    game.sceneManager.addScene('look', { fetch: async () => level({}, { hud }), onAction: (name) => actions.push(name) });
    game.sceneManager.addScene('other', { fetch: async () => level({}, { name: 'other' }) });
    await game.sceneManager.switchTo('look');
    const scene = game.sceneManager.getCurrentScene();
    const pause = scene.hud.elements.get('pause');
    expect(pause.text).toBe('pause');
    pause.onClick();
    expect(actions).toEqual(['pause']);
    scene.hud.elements.get('menu').onClick();
    await vi.waitFor(() => expect(game.sceneManager.getCurrentScene().config.name).toBe('other'));
    game.destroy();
  });

  it('refuses a HUD button that does nothing or two things', () => {
    const loader = new SceneLoader({ actors: new Map([['Dot', Dot]]), sceneManager: { scenes: new Map([['other', {}]]), scenesToLoad: [] } });
    const withButton = (properties) => level({}, { hud: [{ type: 'button', id: 'b', x: 0, y: 0, properties }] });
    expect(() => loader.load(withButton({ text: 'idle' }), 'look')).toThrow(/none of onClick, action and set/);
    expect(() => loader.load(withButton({ text: 'both', action: 'a', onClick: 'other' }), 'look')).toThrow(/both action/);
    expect(() => loader.load(withButton({ text: 'lost', onClick: 'nowhere' }), 'look')).toThrow(/no scene named 'nowhere'/);
    expect(() => loader.load(withButton({ text: 'ok', onClick: 'other' }), 'look')).not.toThrow();
  });

  it('lays the fallback wash over the view only where the renderer has no lights', async () => {
    const { game, renderer, scene } = await show(level({ lighting: { ambient: '#334', fallback: 'rgba(0, 0, 40, 0.3)' } }));
    const washes = () => renderer.optionsFor('drawRect').filter((rect) => rect.fillStyle === 'rgba(0, 0, 40, 0.3)');
    vi.spyOn(renderer, 'supports').mockImplementation((what) => what !== 'lights');
    renderer.reset();
    scene.draw(0.016);
    expect(washes()).toHaveLength(1);
    renderer.supports.mockImplementation(() => true);
    renderer.reset();
    scene.draw(0.016);
    expect(washes()).toHaveLength(0);
    game.destroy();
  });
});

describe('scene hooks from both modules', () => {
  it('run the definition\'s simulation hooks first, then the hooks module\'s', () => {
    const order = [];
    const combined = combineSceneHooks(
      { level: { onEnter: () => order.push('simulation'), onFixedUpdate: () => order.push('tick') } },
      { level: { onEnter: () => order.push('presentation'), onShow: () => order.push('show') }, menu: { onShow() {} } }
    );
    combined.level.onEnter();
    combined.level.onFixedUpdate();
    combined.level.onShow();
    expect(order).toEqual(['simulation', 'presentation', 'tick', 'show']);
    expect(Object.keys(combined).sort()).toEqual(['level', 'menu']);
  });

  it('boot with a definition that has simulation hooks of its own', async () => {
    const onEnter = vi.fn();
    const game = await bootProject(null, {
      project: { name: 'Boot', initialScene: 'level' },
      definition: { register: (g) => g.registerActor('Dot', Dot), sceneHooks: () => ({ level: { onEnter } }) },
      scenes: { './scenes/level.json': level({}, { name: 'level' }) },
      options: { headless: true }
    });
    expect(onEnter).toHaveBeenCalledOnce();
    game.destroy();
  });
});

describe('a level loaded again after a game over', () => {
  it('runs one set of its camera controls and rule listeners, not two', async () => {
    const renderer = new RecordingRenderer();
    const game = new M2D(displayCanvas(320, 180), { width: 320, height: 180, renderer, devConsole: false, performanceStats: false });
    game.registerActor('Dot', Dot);
    const notice = vi.fn();
    game.sceneManager.addScene('look', { fetch: async () => level({
      camera: { wheelZoom: { min: 0.1, max: 10, speed: 0.001 } },
      rules: [{ when: { event: 'notify', name: 'ping' }, then: [{ do: 'sound', key: 'ping' }], once: false }]
    }) });
    await game.sceneManager.switchTo('look');
    game.reset();
    await game.sceneManager.reload();
    scroll(game, 100, 100, { dy: -100 });
    game.input.flush();
    expect(game.camera.zoom).toBeCloseTo(Math.exp(0.1));
    const play = vi.spyOn(game.soundManager, 'playSound').mockImplementation(notice);
    game.players.local.notify('ping');
    game.players.local.dispatch(game.players.local.drainEvents());
    expect(play).toHaveBeenCalledTimes(1);
    game.destroy();
  });
});

describe('review fixes', () => {
  it('switch away even when an exit has nothing to animate, to the scene asked for last', async () => {
    const { game } = await show({
      version: SCENE_VERSION, type: 'ui', name: 'menu',
      elements: [{ type: 'rect', id: 'bar', x: 0, y: 0, width: 10, height: 10, color: '#fff', effects: { exit: { motion: 'type' } } },
        { type: 'text', id: 'title', x: 0, y: 0, properties: { text: 'Hi' }, effects: { exit: { motion: 'fade', duration: 0.1 } } }]
    });
    game.sceneManager.addScene('third', { fetch: async () => level({}, { name: 'third' }) });
    const first = game.sceneManager.switchTo('other');
    game.sceneManager.switchTo('third');
    game.motion.update(1);
    await first;
    expect(game.sceneManager.getCurrentScene().config.name).toBe('third');
    game.destroy();
  });

  it('carry plain counters in a snapshot', async () => {
    const game = new M2D(null, { headless: true });
    game.registerActor('Dot', Dot);
    game.sceneManager.addScene('look', { fetch: async () => level({ counters: { score: { initial: 1 } } }) });
    await game.sceneManager.switchTo('look');
    const scene = game.sceneManager.getCurrentScene();
    const snapshot = game.snapshot();
    scene.counters.add('score', 5);
    game.restore(snapshot);
    expect(scene.counters.get('score')).toBe(1);
    game.destroy();
  });

  it('refuse a notify rule that waits on a rule only the simulation runs', () => {
    expect(() => new SceneLoader(null).load(level({ rules: [
      { id: 'boss', when: { event: 'start' }, then: [] },
      { when: { event: 'notify', name: 'x' }, after: ['boss'], then: [{ do: 'notice', text: 'X' }] }
    ] }), 'look')).toThrow(/notify rule can only follow other notify rules/);
  });

  it('let a rule give a plain text counter holes later', async () => {
    const { game, scene } = await show(level({ counters: { keys: { initial: 2 } } }, { hud: [{ type: 'text', id: 'line', x: 0, y: 0, properties: { text: 'Find the keys' } }] }));
    scene.hud.setText('line', 'Keys {keys}');
    scene.counters.add('keys', 1);
    scene.hud.elements.get('line').update(0.016);
    expect(scene.hud.elements.get('line').text).toBe('Keys 3');
    game.destroy();
  });

  it('leave a game\'s own actions alone when the project declares none', () => {
    expect(projectOptions({ name: 'x' })).not.toHaveProperty('actions');
  });
});
