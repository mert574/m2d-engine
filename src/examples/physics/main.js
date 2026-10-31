import { M2D } from '../../core/m2d.js';
import { initPhysics } from '../../core/physics/index.js';
import { SettingsMenu } from '../../core/ui/settingsMenu.js';
import { Entity } from '../../core/entity.js';
import ballSprite from './assets/ball.png';
import boxSprite from './assets/box.png';
import platformSprite from './assets/platform.png';

// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(document.getElementById('screen'), {
  initialScene: 'mainMenu', width: 960, height: 720, worldWidth: 960, worldHeight: 720
});
game.camera.x = 480;
game.camera.y = 360;
game.registerActor('Ball', Entity);
game.registerActor('Box', Entity);
game.registerActor('Ramp', Entity);
game.sceneManager.addScene('mainMenu', {
  fetch: async () => ({
    version: 1, name: 'mainMenu', type: 'ui', title: 'Main Menu', assets: {},
    elements: [
      { type: 'rect', id: 'background', x: 0, y: 0, fill: true, color: '#333333' },
      { type: 'text', id: 'title', anchor: 'center', x: 0, y: -220,
        properties: { text: 'Physics Playground', fontSize: '64px', align: 'center', color: '#ffffff' } },
      { type: 'button', id: 'startGame', anchor: 'center', x: 0, y: -40,
        properties: { text: 'Start Game', onClick: 'physics', width: 200, height: 50, fontSize: '20px',
          backgroundColor: '#2E7D32', hoverColor: '#4CAF50', textColor: '#ffffff' } },
      { type: 'button', id: 'settings', anchor: 'center', x: 0, y: 24,
        properties: { text: 'Settings', action: 'settings', width: 200, height: 50, fontSize: '20px',
          backgroundColor: '#2E7D32', hoverColor: '#4CAF50', textColor: '#ffffff' } },
      { type: 'text', id: 'controls', anchor: 'center', x: 0, y: 90,
        properties: { text: 'Space: Spawn object · O: Settings', fontSize: '18px', align: 'center', color: '#bbbbbb' } }
    ]
  })
});

// A funnel into a splitter into a peg field: everything spawned at the top
// bounces through three stages before settling, so the scene stays
// interesting rather than piling up in one corner.
const ANGLE = Math.PI * 0.12;
const pegRow = (y, xs) => xs.map(x =>
  ({ prefab: 'peg', x, y, width: 32, height: 32, angle: Math.PI / 4 }));

game.sceneManager.addScene('physics', {
  fetch: async () => ({
    version: 1, name: 'physics', type: 'level', gameType: 'sideScroll',
    world: { width: 960, height: 720, gravity: { x: 0, y: 1000 } },
    assets: { spritesheets: {
      ball: { url: ballSprite, frameWidth: 32, frameHeight: 32 },
      box: { url: boxSprite, frameWidth: 32, frameHeight: 32 },
      platform: { url: platformSprite, frameWidth: 32, frameHeight: 32 }
    } },
    prefabs: {
      ball: {
        actor: 'Ball',
        spritesheet: 'ball',
        physics: {
          bodyType: 'dynamic', shape: 'circle',
          restitution: 0.8, friction: 0.005, frictionAir: 0.001
        }
      },
      box: { actor: 'Box', spritesheet: 'box', physics: { bodyType: 'dynamic', restitution: 0.4 } },
      platform: { actor: 'Ramp', spritesheet: 'platform', physics: { bodyType: 'static' } },
      peg: { actor: 'Ramp', spritesheet: 'platform', physics: { bodyType: 'static' } }
    },
    layers: [{ name: 'playground', objects: [
      // Bounds
      { prefab: 'platform', x: 480, y: 704, width: 960, height: 32 },
      { prefab: 'platform', x: 16, y: 360, width: 32, height: 720 },
      { prefab: 'platform', x: 944, y: 360, width: 32, height: 720 },
      // Funnel: two ramps sloping from the walls toward a centre gap.
      { prefab: 'platform', x: 192, y: 176, width: 288, height: 32, angle: ANGLE },
      { prefab: 'platform', x: 768, y: 176, width: 288, height: 32, angle: -ANGLE },
      // Splitter: an A-frame under the gap, deflecting the stream outward.
      { prefab: 'platform', x: 384, y: 368, width: 224, height: 32, angle: -ANGLE },
      { prefab: 'platform', x: 576, y: 368, width: 224, height: 32, angle: ANGLE },
      // Peg field: offset rows of diamonds for a plinko finish.
      ...pegRow(512, [160, 320, 480, 640, 800]),
      ...pegRow(608, [240, 400, 560, 720]),
      // Starters, dropped into the funnel.
      { prefab: 'ball', x: 300, y: 40, width: 32, height: 32 },
      { prefab: 'ball', x: 480, y: 80, width: 32, height: 32 },
      { prefab: 'ball', x: 660, y: 40, width: 32, height: 32 },
      { prefab: 'box', x: 400, y: 120, width: 64, height: 64 },
      { prefab: 'box', x: 560, y: 120, width: 64, height: 64 }
    ] }]
  })
});

game.keys.addKey(' ', (pressed) => {
  const scene = game.sceneManager.getCurrentScene();
  if (!pressed || game.sceneManager.loading || !scene) return;
  if (scene.config.name !== 'physics') return;
  const isBox = Math.random() > 0.5;
  const size = isBox ? 64 : 32;
  const sprite = scene.spriteSheets.get(isBox ? 'box' : 'ball');
  // Spawning goes straight to createEntity rather than through a prefab, so
  // the body spec has to be spelled out here to match the prefabs above.
  const entity = game.createEntity(isBox ? 'Box' : 'Ball', 120 + Math.random() * 720, 40,
    size, size, sprite, {}, isBox
      ? { restitution: 0.4 }
      : { shape: 'circle', restitution: 0.8, friction: 0.005, frictionAir: 0.001 });
  entity.setAnimation('default');
  game.entities.add(entity);
  game.physics.add(entity.body);
});
// Settings overlay (O): resolution, fullscreen, aspect mode, debug, backend.
new SettingsMenu(game);

game.start();
