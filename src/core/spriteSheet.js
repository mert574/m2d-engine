export class SpriteSheet {
  constructor(image, tileW, tileH, width = tileW, height = tileH) {
    this.tileW = tileW;
    this.tileH = tileH;
    this.width = width;
    this.height = height;
    this.animations = new Map();
    this.currentFrame = 0;

    if (image instanceof Image) {
      this.image = image;
      this.loaded = true;
    } else {
      this.loaded = false;
      this.image = new Image();
      this.image.onload = () => {
        console.log('Sprite loaded:', image);
        this.loaded = true;
      };
      this.image.onerror = (e) => {
        console.error('Failed to load sprite:', image, e);
      };
      this.image.src = image;
    }
  }

  define(name, tileX, tileY) {
    const x = tileX * this.tileW;
    const y = tileY * this.tileH;
    this.animations.set(name, { x, y });
  }

  drawTiles(context, x, y, sourceX, sourceY) {
    if (!this.loaded) return;

    const tilesX = Math.ceil(this.width / this.tileW);
    const tilesY = Math.ceil(this.height / this.tileH);

    for (let i = 0; i < tilesX; i++) {
      for (let j = 0; j < tilesY; j++) {
        context.drawImage(
          this.image,
          sourceX,
          sourceY,
          this.tileW,
          this.tileH,
          x - this.width / 2 + i * this.tileW,
          y - this.height / 2 + j * this.tileH,
          this.tileW,
          this.tileH
        );
      }
    }
  }

  drawStatic(context, x, y, tileX, tileY) {
    this.drawTiles(context, x, y, tileX * this.tileW, tileY * this.tileH);
  }

  draw(context, x, y, anim) {
    if (!anim) {
      this.drawStatic(context, x, y, this.currentFrame, 0);
      return;
    }

    const animation = this.animations.get(anim);
    if (!animation) {
      console.warn(`Animation ${anim} not found`);
      return;
    }

    this.drawTiles(context, x, y, animation.x + (this.currentFrame * this.tileW), animation.y);
  }
}