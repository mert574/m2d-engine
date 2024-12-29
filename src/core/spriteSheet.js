export class SpriteSheet {
  constructor(image, tileW, tileH, width = tileW, height = tileH) {
    this.tileW = tileW;
    this.tileH = tileH;
    this.width = width;
    this.height = height;
    this.animations = new Map();
    this.currentFrame = 0;
    this.image = image;
    this.loaded = true;
  }

  define(name, tileX, tileY) {
    this.animations.set(name, { tileX, tileY });
  }

  drawTiles(context, x, y, tileX, tileY) {
    if (!this.loaded) return;

    context.drawImage(
      this.image,
      tileX * this.tileW,
      tileY * this.tileH,
      this.tileW,
      this.tileH,
      Math.floor(x - this.width / 2),
      Math.floor(y - this.height / 2),
      this.width,
      this.height
    );
  }

  drawStatic(context, x, y, tileX, tileY) {
    this.drawTiles(context, x, y, tileX, tileY);
  }

  draw(context, x, y, anim) {
    if (!anim) {
      this.drawTiles(context, x, y, this.currentFrame, 0);
      return;
    }

    const animation = this.animations.get(anim);
    if (!animation) {
      console.warn(`Animation ${anim} not found`);
      return;
    }

    this.drawTiles(context, x, y, animation.tileX + this.currentFrame, animation.tileY);
  }
}