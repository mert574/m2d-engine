import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';

/** A custom element: a bar that fills over time. Clicking it resets it. */
class ProgressBar extends UIElement {
  constructor(options = {}) {
    super({ ...options, width: 260, height: 18 });
    this.value = 0;
  }

  update(deltaTime) {
    this.value = Math.min(1, this.value + deltaTime / 6);
  }

  onClick() {
    this.value = 0;
  }

  draw() {
    const ui = this.game.uiRenderer;
    const left = this.x - this.width / 2;
    const top = this.y - this.height / 2;
    ui.drawRect({ x: left, y: top, width: this.width, height: this.height, fillStyle: '#263238', cornerRadius: 9 });
    ui.drawRect({ x: left, y: top, width: this.width * this.value, height: this.height, fillStyle: this.isHovered ? '#4dd0e1' : '#26a69a', cornerRadius: 9 });
  }
}

const BUTTON = { width: 100, height: 40, variant: 'secondary', fontSize: '16px' };

// Scene JSON positions elements against anchors. The buttons name actions
// the scene's onAction hook counts; the bar is a component the game registers.
const scene = {
  version: 7, type: 'ui', name: 'main',
  elements: [
    { type: 'rect', id: 'background', fill: true, color: '#1b2a38' },
    { type: 'text', id: 'title', anchor: 'top', x: 0, y: 16,
      properties: { text: 'UI', fontSize: '28px', align: 'center', color: '#ffffff' } },
    { type: 'text', id: 'corner', anchor: 'top-left', x: 16, y: 16,
      properties: { text: 'top-left', fontSize: '14px', color: '#90a4ae' } },
    { type: 'text', id: 'corner2', anchor: 'top-right', x: -16, y: 16,
      properties: { text: 'top-right', fontSize: '14px', align: 'right', color: '#90a4ae' } },
    { type: 'text', id: 'count', anchor: 'center', x: 0, y: -40,
      properties: { text: 'count 0', fontSize: '32px', align: 'center', color: '#ffffff' } },
    { type: 'button', id: 'down', anchor: 'bottom-left', x: 70, y: -36, properties: { text: '-1', action: 'down', ...BUTTON } },
    { type: 'button', id: 'reset', anchor: 'bottom', x: 0, y: -36, properties: { text: 'reset', action: 'reset', ...BUTTON } },
    { type: 'button', id: 'up', anchor: 'bottom-right', x: -70, y: -36, properties: { text: '+1', action: 'up', ...BUTTON } },
    { type: 'component', id: 'progress', component: 'progressBar', anchor: 'center', x: 0, y: 30 },
    { type: 'text', id: 'hint', anchor: 'center', x: 0, y: 50,
      properties: { text: 'click the bar to reset it', fontSize: '13px', align: 'center', color: '#90a4ae' } }
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });
  game.registerUIComponent('progressBar', (_scene, element) => new ProgressBar(element));

  let count = 0;
  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onAction(name) {
      count = name === 'reset' ? 0 : name === 'up' ? count + 1 : count - 1;
      game.sceneManager.getCurrentScene().uiById.get('count').text = `count ${count}`;
    }
  });

  await game.start();
  return game;
}
