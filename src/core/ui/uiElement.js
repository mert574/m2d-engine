export class UIElement {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.visible = true;
    this.isHovered = false;
    this.isFocused = false;
    this.game = null;
    this.stopPropagation = false;
  }

  setGame(game) {
    this.game = game;
  }

  update(deltaTime) {}

  draw(deltaTime) {}

  contains(x, y) {
    const hit = this.game.uiRenderer.hitTest(x, y, {
      type: 'rect',
      x: this.x - this.width/2,
      y: this.y - this.height/2,
      width: this.width,
      height: this.height
    });
    return hit;
  }

  onMouseMove(x, y) {
    const wasHovered = this.isHovered;
    this.isHovered = this.contains(x, y);
    if (wasHovered !== this.isHovered) {
      if (this.isHovered) this.onMouseEnter();
      else this.onMouseLeave();
    }
    return this.stopPropagation;
  }

  onMouseDown(x, y) {
    if (this.contains(x, y)) {
      this.onClick(x, y);
      return this.stopPropagation;
    }
    return false;
  }

  onMouseEnter() {}
  onMouseLeave() {}
  onClick(x, y) {}
  onFocus() {
    this.isFocused = true;
  }
  onBlur() {
    this.isFocused = false;
  }

  destroy() {
    this.visible = false;
    this.isHovered = false;
    this.isFocused = false;
  }
} 