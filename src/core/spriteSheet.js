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
    
    // Cache for sprite positions
    this.positionCache = new Map();
  }

  define(name, tileX, tileY) {
    const key = `${name}-${tileX}-${tileY}`;
    if (!this.positionCache.has(key)) {
      this.positionCache.set(key, {
        backgroundPosition: `-${tileX * this.tileW}px -${tileY * this.tileH}px`,
        tileX: tileX * this.tileW,
        tileY: tileY * this.tileH
      });
    }
    this.animations.set(name, this.positionCache.get(key));
  }

  draw(anim, x, y, options = {}) {
    if (!this.loaded || !this.game) return;

    const drawOptions = {
      image: this.image,
      x,
      y,
      tileWidth: this.tileW,
      tileHeight: this.tileH,
      ...options
    };

    if (!anim) {
      drawOptions.tileX = this.currentFrame * this.tileW;
      drawOptions.tileY = 0;
      this.game.renderer.drawSprite(drawOptions);
      return;
    }

    const animation = this.animations.get(anim);
    if (!animation) {
      console.warn(`Animation ${anim} not found`);
      return;
    }

    drawOptions.tileX = animation.tileX;
    drawOptions.tileY = animation.tileY;
    this.game.renderer.drawSprite(drawOptions);
  }

  getBackgroundPosition(anim) {
    if (!anim) {
      return `-${this.currentFrame * this.tileW}px 0px`;
    }

    const animation = this.animations.get(anim);
    if (!animation) {
      console.warn(`Animation ${anim} not found`);
      return '0px 0px';
    }

    return animation.backgroundPosition;
  }
}