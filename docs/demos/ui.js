import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { UIButton } from 'm2d-engine/core/ui/button.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

/** A custom element: a bar that fills over time. Clicking it resets it. */
class ProgressBar extends UIElement {
  constructor(x, y, options = {}) {
    super(x, y, 260, 18, options);
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

// Scene JSON positions elements against anchors.
const scene = {
  version: 1, type: 'ui', name: 'main',
  elements: [
    { type: 'rect', id: 'background', fill: true, color: '#1b2a38' },
    { type: 'text', id: 'title', anchor: 'top', x: 0, y: 16,
      properties: { text: 'UI', fontSize: '28px', align: 'center', color: '#ffffff' } },
    { type: 'text', id: 'corner', anchor: 'top-left', x: 16, y: 16,
      properties: { text: 'top-left', fontSize: '14px', color: '#90a4ae' } },
    { type: 'text', id: 'corner2', anchor: 'top-right', x: -16, y: 16,
      properties: { text: 'top-right', fontSize: '14px', align: 'right', color: '#90a4ae' } }
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    // The rest is added from code.
    onEnter() {
      const ui = game.sceneManager.getCurrentScene().ui;
      let count = 0;
      const counter = ui.addElement(new UIText(0, -40, 'count 0', { anchor: 'center', align: 'center', fontSize: '32px', color: '#ffffff' }));
      const set = (value) => { count = value; counter.text = `count ${count}`; };

      const style = { backgroundColor: '#37474f', hoverColor: '#546e7a', pressedColor: '#263238', fontSize: '16px' };
      ui.addElement(new UIButton(70, -36, 100, 40, '-1', () => set(count - 1), { ...style, anchor: 'bottom-left' }));
      ui.addElement(new UIButton(0, -36, 100, 40, 'reset', () => set(0), { ...style, anchor: 'bottom' }));
      ui.addElement(new UIButton(-70, -36, 100, 40, '+1', () => set(count + 1), { ...style, anchor: 'bottom-right' }));

      ui.addElement(new ProgressBar(0, 30, { anchor: 'center' }));
      ui.addElement(new UIText(0, 50, 'click the bar to reset it', { anchor: 'center', align: 'center', fontSize: '13px', color: '#90a4ae' }));
    }
  });

  await game.start();
  return game;
}
