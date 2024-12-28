export class Renderer {
  constructor(game) {
    this.game = game;
    this.ctx = game.context;
    this.camera = game.camera;
  }

  drawWorld(callback) {
    this.ctx.save();
    this.camera.begin(this.ctx);
    callback(this.ctx);
    this.camera.end(this.ctx);
    this.ctx.restore();
  }

  drawScreen(callback) {
    this.ctx.save();
    callback(this.ctx);
    this.ctx.restore();
  }

  drawSprite(sprite, x, y, width, height) {
    if (!this.camera.isVisible(x, y, width, height)) return;
    sprite.draw(this.ctx, x, y, width, height);
  }

  drawRect(x, y, width, height, style) {
    if (!this.camera.isVisible(x, y, width, height)) return;
    this.ctx.fillStyle = style;
    this.ctx.fillRect(x, y, width, height);
  }

  drawText(text, x, y, options = {}) {
    this.ctx.fillStyle = options.color || '#fff';
    this.ctx.font = options.font || '16px Arial';
    this.ctx.textAlign = options.align || 'left';
    this.ctx.textBaseline = options.baseline || 'top';
    this.ctx.fillText(text, x, y);
  }

  clear(color = '#000') {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.game.canvas.width, this.game.canvas.height);
    this.ctx.restore();
  }

  worldToScreen(x, y) {
    return this.camera.worldToScreen(x, y);
  }

  screenToWorld(x, y) {
    return this.camera.screenToWorld(x, y);
  }
} 