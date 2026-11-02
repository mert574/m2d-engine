import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

const RESOLUTIONS = [0.25, 0.5, 'native'];
const SAMPLE = 'HP 73/100 · AMMO 12 · 00:42';

/** Fine detail drawn with `target`: thin spokes, a dotted ring and small text. */
function drawDetail(target, cx, cy, title) {
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    target.drawLine({
      x1: cx + Math.cos(angle) * 26, y1: cy + Math.sin(angle) * 26,
      x2: cx + Math.cos(angle) * 80, y2: cy + Math.sin(angle) * 80,
      strokeStyle: '#80cbc4', lineWidth: 1
    });
  }
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    target.drawArc({ x: cx + Math.cos(angle) * 92, y: cy + Math.sin(angle) * 92, radius: 1.5, fillStyle: '#ffcc80' });
  }
  target.drawText({ x: cx, y: cy - 8, text: title, fillStyle: '#eceff1', fontSize: '13px', textAlign: 'center', textBaseline: 'middle' });
  target.drawText({ x: cx, y: cy + 10, text: SAMPLE, fillStyle: '#ffe082', fontSize: '12px', textAlign: 'center', textBaseline: 'middle' });
}

const scene = { version: 1, type: 'level', name: 'main', world: { gravity: { x: 0, y: 0 } } };

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, {
    width: 640, height: 360, initialScene: 'main', performanceStats: false,
    resolution: RESOLUTIONS[0]        // start coarse, so the difference is visible at once
  });
  game.camera.x = 320;
  game.camera.y = 180;

  let index = 0;
  let label = null;
  const describe = () => {
    const resolution = RESOLUTIONS[index];
    label.text = `world resolution ${resolution === 'native' ? 'native' : resolution + 'x'} · filter ${game.worldFilter} · click to change, right-click for the filter`;
  };

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      const ui = game.sceneManager.getCurrentScene().ui;
      label = ui.add(new UIText({
        x: 0,
        y: 10,
        text: '',
        anchor: 'top',
        align: 'center',
        fontSize: '13px',
        color: '#cfd8dc'
      }));
      // A HUD: UI elements, drawn at display resolution whatever the world is set to.
      ui.add(new UIText({
        x: 16,
        y: -48,
        text: SAMPLE,
        anchor: 'bottom-left',
        fontSize: '12px',
        color: '#ffe082'
      }));
      ui.add(new UIText({
        x: 16,
        y: -30,
        text: 'UI text at 12px, always sharp',
        anchor: 'bottom-left',
        fontSize: '12px',
        color: '#9fb6d0'
      }));
      describe();
    },
    onDraw() {
      // Left: the world pass. Rasterized at the world render resolution.
      drawDetail(game.renderer, 170, 180, 'world pass');
      // Right: the world overlay. World coordinates, display resolution.
      drawDetail(game.worldOverlay, 470, 180, 'world overlay');
    }
  });

  game.input.on('click', () => {
    index = (index + 1) % RESOLUTIONS.length;
    game.setResolution(RESOLUTIONS[index]);
    describe();
  });
  game.input.on('rightclick', () => {
    game.setWorldFilter(game.worldFilter === 'linear' ? 'nearest' : 'linear');
    describe();
  });

  await game.start();
  return game;
}
