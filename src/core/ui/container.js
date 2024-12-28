import { UIElement } from './uiElement.js';

export class Container extends UIElement {
  constructor(game) {
    super(0, 0, game.canvas.width, game.canvas.height);
    this.game = game;
    this.children = new Set();
  }

  add(element) {
    this.children.add(element);
  }

  remove(element) {
    if (element.destroy) {
      element.destroy();
    }
    this.children.delete(element);
  }

  update(deltaTime) {
    if (!this.visible) return;
    this.children.forEach(child => child.update(deltaTime));
  }

  draw(ctx) {
    if (!this.visible) return;
    this.children.forEach(child => child.draw(ctx));
  }

  onMouseMove(x, y) {
    if (!this.visible) return;
    super.onMouseMove(x, y);
    this.children.forEach(child => child.onMouseMove(x, y));
  }

  onMouseDown(x, y) {
    if (!this.visible) return false;
    if (!this.contains(x, y)) return false;

    for (const child of this.children) {
      if (child.onMouseDown(x, y)) {
        return true;
      }
    }

    return super.onMouseDown(x, y);
  }

  clear() {
    this.children.forEach(child => {
      if (child.destroy) {
        child.destroy();
      }
    });
    this.children.clear();
  }

  destroy() {
    this.clear();
  }

  resize() {
    this.width = this.game.canvas.width;
    this.height = this.game.canvas.height;
  }
} 