import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';

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

const resolutionLabel = (resolution) => `resolution ${resolution === 'native' ? 'native' : resolution + 'x'}`;

const scene = {
  version: 6, type: 'level', name: 'main',
  world: { width: 640, height: 360, gravity: { x: 0, y: 0 }, camera: { bounds: 'world' } },
  // A HUD: UI elements, drawn at display resolution whatever the world is set to.
  hud: [
    { type: 'text', id: 'caption', anchor: 'top', x: 0, y: 10,
      properties: { text: 'left: the world pass · right: the world overlay', align: 'center', fontSize: '13px', color: '#cfd8dc' } },
    { type: 'text', id: 'sample', anchor: 'bottom-left', x: 16, y: -48, properties: { text: SAMPLE, fontSize: '12px', color: '#ffe082' } },
    { type: 'text', id: 'sharp', anchor: 'bottom-left', x: 16, y: -30, properties: { text: 'UI text at 12px, always sharp', fontSize: '12px', color: '#9fb6d0' } },
    { type: 'button', id: 'resolution', anchor: 'bottom-right', x: -96, y: -70,
      properties: { text: resolutionLabel(RESOLUTIONS[0]), action: 'resolution', width: 160, height: 32, variant: 'secondary', fontSize: '13px' } },
    { type: 'button', id: 'filter', anchor: 'bottom-right', x: -96, y: -30,
      properties: { text: 'filter linear', action: 'filter', width: 160, height: 32, variant: 'secondary', fontSize: '13px' } }
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, {
    width: 640, height: 360, initialScene: 'main', performanceStats: false,
    resolution: RESOLUTIONS[0]        // start coarse, so the difference is visible at once
  });

  let index = 0;
  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onAction(name) {
      const buttons = game.sceneManager.getCurrentScene().hud.elements;
      if (name === 'resolution') {
        index = (index + 1) % RESOLUTIONS.length;
        game.setResolution(RESOLUTIONS[index]);
        buttons.get('resolution').text = resolutionLabel(RESOLUTIONS[index]);
      } else if (name === 'filter') {
        game.setWorldFilter(game.worldFilter === 'linear' ? 'nearest' : 'linear');
        buttons.get('filter').text = `filter ${game.worldFilter}`;
      }
    },
    onDraw() {
      // Left: the world pass. Rasterized at the world render resolution.
      drawDetail(game.renderer, 170, 180, 'world pass');
      // Right: the world overlay. World coordinates, display resolution.
      drawDetail(game.worldOverlay, 470, 180, 'world overlay');
    }
  });

  await game.start();
  return game;
}
