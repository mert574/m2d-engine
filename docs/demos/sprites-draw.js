import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

const FRAME = 32;

/** A four-frame sheet: a square with a marker that moves around it, so frames are easy to tell apart. */
function makeSheet() {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME * 4;
  canvas.height = FRAME;
  const ctx = canvas.getContext('2d');
  const marks = [[20, 6], [20, 20], [6, 20], [6, 6]];
  for (let frame = 0; frame < 4; frame++) {
    const x = frame * FRAME;
    ctx.fillStyle = '#5c6bc0';
    ctx.fillRect(x + 4, 4, 24, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + marks[frame][0], marks[frame][1], 6, 6);
    ctx.fillStyle = '#ef5350';
    ctx.fillRect(x + 4, 4, 24, 4);           // a red top edge, so flips and rotations read
  }
  const image = new Image();
  image.src = canvas.toDataURL();
  return image;
}

const scene = { version: 1, type: 'level', name: 'main', world: { gravity: { x: 0, y: 0 } } };

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, {
    width: 640, height: 360, initialScene: 'main', performanceStats: false,
    worldFilter: 'nearest'
  });
  game.camera.x = 320;
  game.camera.y = 180;

  const image = makeSheet();
  await new Promise((resolve) => { image.onload = resolve; });
  const tile = { image, tileWidth: FRAME, tileHeight: FRAME };
  const labels = [];
  let time = 0;

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      const ui = game.sceneManager.getCurrentScene().ui;
      for (const [x, text] of [[90, 'frame 0'], [230, 'flipX'], [370, 'rotation'], [510, 'scaled 2x'],
        [90, 'frames 0 to 3'], [230, 'tint'], [370, 'globalAlpha'], [510, 'drawn twice']]) {
        const row = labels.length < 4 ? 0 : 1;
        labels.push(ui.addElement(new UIText(x, 150 + row * 170, text, { align: 'center', fontSize: '13px', color: '#9fb6d0' })));
      }
    },
    onUpdate(deltaTime) { time += deltaTime; },
    onDraw() {
      const renderer = game.renderer;
      const frame = Math.floor(time * 6) % 4;     // 6 frames per second
      const size = { width: 64, height: 64 };

      // Row one: one frame, four ways.
      renderer.drawSprite({ ...tile, ...size, x: 90, y: 100, tileX: 0 });
      renderer.drawSprite({ ...tile, ...size, x: 230, y: 100, tileX: 0, flipX: true });
      renderer.drawSprite({ ...tile, ...size, x: 370, y: 100, tileX: 0, rotation: time });
      renderer.drawSprite({ ...tile, x: 510, y: 100, tileX: 0, width: 128, height: 128 });

      // Row two: animation, colour and layering.
      renderer.drawSprite({ ...tile, ...size, x: 90, y: 270, tileX: frame });
      // tint needs the capability. The Canvas backend draws the sprite untinted.
      renderer.drawSprite({ ...tile, ...size, x: 230, y: 270, tileX: frame, tint: '#ff8a65' });
      renderer.drawSprite({ ...tile, ...size, x: 370, y: 270, tileX: frame, globalAlpha: 0.5 + Math.sin(time * 3) * 0.4 });
      renderer.drawSprite({ ...tile, ...size, x: 500, y: 262, tileX: 0 });
      renderer.drawSprite({ ...tile, ...size, x: 520, y: 278, tileX: 2 });
    }
  });

  await game.start();
  return game;
}
