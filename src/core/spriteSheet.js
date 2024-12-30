export class SpriteSheet {
  constructor(image, tileW, tileH, game, width = tileW, height = tileH) {
    this.tileW = tileW;
    this.tileH = tileH;
    this.width = width;
    this.height = height;
    this.animations = new Map();
    this.currentFrame = 0;
    this.image = image;
    this.loaded = true;
    this.game = game;
  }

  define(name, tileX, tileY) {
    this.animations.set(name, { tileX, tileY });
  }

  draw(anim, x, y, options = {}) {
    if (!this.loaded) return;

    if (!this.game) {
      console.error('Game instance not found');
      return;
    }

    if (!anim) {
      this.game.renderer.drawSprite({
        image: this.image,
        x,
        y,
        tileWidth: this.tileW,
        tileHeight: this.tileH,
        tileX: this.currentFrame,
        tileY: 0,
        ...options
      });
      return;
    }

    const animation = this.animations.get(anim);
    if (!animation) {
      console.warn(`Animation ${anim} not found`);
      return;
    }

    this.game.renderer.drawSprite({
      image: this.image,
      x,
      y,
      tileWidth: this.tileW,
      tileHeight: this.tileH,
      tileX: animation.tileX + this.currentFrame,
      tileY: animation.tileY,
      ...options
    });
  }
}