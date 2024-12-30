export class Camera {
  constructor(width, height, options = {}) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
    
    this.target = null;
    this.lerp = options.lerp || 0.1;
    this.bounds = options.bounds || null;
    this.padding = options.padding || { x: 100, y: 100 };
  }

  init(scene) {
    this.scene = scene;
    this.width = scene.game.canvas.width;
    this.height = scene.game.canvas.height;
  }

  follow(target) {
    this.target = target;
  }

  update() {
    if (!this.target) return;

    const targetX = this.target.body.position.x;
    const targetY = this.target.body.position.y;

    // Smooth camera movement
    this.x += (targetX - this.x) * this.lerp;
    this.y += (targetY - this.y) * this.lerp;

    // Apply camera bounds if set
    if (this.bounds) {
      const halfWidth = this.width / 2;
      const halfHeight = this.height / 2;

      this.x = Math.max(this.bounds.left + halfWidth, Math.min(this.bounds.right - halfWidth, this.x));
      this.y = Math.max(this.bounds.top + halfHeight, Math.min(this.bounds.bottom - halfHeight, this.y));
    }
  }

  isVisible(x, y, width, height) {
    const left = x - this.x + this.width / 2;
    const top = y - this.y + this.height / 2;
    
    return (
      left + width >= -this.padding.x &&
      left <= this.width + this.padding.x &&
      top + height >= -this.padding.y &&
      top <= this.height + this.padding.y
    );
  }

  worldToScreen(worldX, worldY) {
    return {
      x: worldX - this.x + this.width / 2,
      y: worldY - this.y + this.height / 2
    };
  }

  screenToWorld(screenX, screenY) {
    return {
      x: screenX + this.x - this.width / 2,
      y: screenY + this.y - this.height / 2
    };
  }

  getVisibleArea() {
    return {
      left: this.x - this.width / 2,
      right: this.x + this.width / 2,
      top: this.y - this.height / 2,
      bottom: this.y + this.height / 2
    };
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }
} 