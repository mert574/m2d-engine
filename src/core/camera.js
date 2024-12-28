export class Camera {
  constructor(game, options = {}) {
    this.game = game;
    this.x = 0;
    this.y = 0;
    this.width = game.canvas.width;
    this.height = game.canvas.height;
    this.worldWidth = options.worldWidth || this.width;
    this.worldHeight = options.worldHeight || this.height;
    this.smoothing = options.smoothing || 0.1;
    this.target = null;
    this.deadzone = options.deadzone || {
      x: this.width * 0.4,
      y: this.height * 0.2,
      width: this.width * 0.4,
      height: this.height * 0.4
    };
  }

  follow(target) {
    this.target = target;
  }

  update() {
    if (!this.target) return;

    const targetX = this.target.body.position.x;
    const targetY = this.target.body.position.y;

    let desiredX = this.x;
    let desiredY = this.y;

    if (targetX < this.x + this.deadzone.x) {
      desiredX = targetX - this.deadzone.x;
    } else if (targetX > this.x + this.width - this.deadzone.x) {
      desiredX = targetX - this.width + this.deadzone.x;
    }

    if (targetY < this.y + this.deadzone.y) {
      desiredY = targetY - this.deadzone.y;
    } else if (targetY > this.y + this.height - this.deadzone.y) {
      desiredY = targetY - this.height + this.deadzone.y;
    }

    this.x += (desiredX - this.x) * this.smoothing;
    this.y += (desiredY - this.y) * this.smoothing;

    // Clamp camera position to world bounds
    this.x = Math.max(0, Math.min(this.x, this.worldWidth - this.width));
    this.y = Math.max(0, Math.min(this.y, this.worldHeight - this.height));
  }

  worldToScreen(x, y) {
    return {
      x: x - this.x,
      y: y - this.y
    };
  }

  screenToWorld(x, y) {
    return {
      x: x + this.x,
      y: y + this.y
    };
  }

  isVisible(x, y, width, height) {
    return (x + width >= this.x && 
            x <= this.x + this.width &&
            y + height >= this.y && 
            y <= this.y + this.height);
  }

  begin(ctx) {
    ctx.save();
    ctx.translate(-Math.floor(this.x), -Math.floor(this.y));
  }

  end(ctx) {
    ctx.restore();
  }
} 