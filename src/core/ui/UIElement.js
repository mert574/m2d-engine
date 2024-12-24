export class UIElement {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.visible = true;
    this.isHovered = false;
    this.isFocused = false;
  }

  update(deltaTime) {}

  draw(ctx) {}

  contains(x, y) {
    return x >= this.x && x <= this.x + this.width &&
           y >= this.y && y <= this.y + this.height;
  }

  onMouseMove(x, y) {
    const wasHovered = this.isHovered;
    this.isHovered = this.contains(x, y);
    if (wasHovered !== this.isHovered) {
      if (this.isHovered) this.onMouseEnter();
      else this.onMouseLeave();
    }
  }

  onMouseDown(x, y) {
    if (this.contains(x, y)) {
      this.onClick?.(x, y);
      return true;
    }
    return false;
  }

  onMouseEnter() {}
  onMouseLeave() {}
  onClick() {}
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