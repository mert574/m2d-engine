export class SpriteSheet {
  constructor(url, tileW, tileH, width = tileW, height = tileH) {
    this.tileW = tileW;
    this.tileH = tileH;
    this.width = width;
    this.height = height;
    this.animations = new Map();
    this.currentFrame = 0;
    this.loaded = false;

    this.image = new Image();
    this.image.onload = () => {
      console.log('Sprite loaded:', url);
      this.loaded = true;
    };
    this.image.onerror = (e) => {
      console.error('Failed to load sprite:', url, e);
    };
    this.image.src = url;
  }

  define(name, tileX, tileY) {
    const x = tileX * this.tileW;
    const y = tileY * this.tileH;
    this.animations.set(name, { x, y });
  }

  drawStatic(context, x, y, tileX, tileY) {
    if (!this.loaded) return;

    context.drawImage(
      this.image,
      tileX * this.tileW,
      tileY * this.tileH,
      this.tileW,
      this.tileH,
      x - this.width / 2,
      y - this.height / 2,
      this.width,
      this.height
    );
  }

  draw(context, x, y, anim) {
    if (!this.loaded) return;

    if (!anim) {
      // Default to drawing first tile if no animation specified
      this.drawStatic(context, x, y, this.currentFrame, 0);
      return;
    }

    const animation = this.animations.get(anim);
    if (!animation) {
      console.warn(`Animation ${anim} not found`);
      return;
    }

    // Use currentFrame to offset horizontally from the animation's base position
    const frameX = animation.x + (this.currentFrame * this.tileW);
    context.drawImage(
      this.image,
      frameX,
      animation.y,
      this.tileW,
      this.tileH,
      x - this.width / 2,
      y - this.height / 2,
      this.width,
      this.height
    );
  }
} 