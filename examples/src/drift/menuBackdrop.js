import { makeRng, range } from '../shared/rng.js';
import starsFarUrl from './textures/backgrounds/stars-far.png';
import brownBig from './textures/meteors/brown-big1.png';
import greyBig from './textures/meteors/grey-big2.png';
import brownMed from './textures/meteors/brown-med1.png';
import greySmall from './textures/meteors/grey-small2.png';

/**
 * Salvage Run's menu: the field through the hangar window. A star tile
 * for the sky, a cold nebula glow, and Kenney's meteors tumbling past at
 * three depths, the near ones large and fast, the far ones small and slow.
 */
function load(url) {
  const image = new Image();
  image.src = url;
  return image;
}

export class FieldWindow {
  constructor(seed = 17) {
    const rng = makeRng(seed);
    this.stars = load(starsFarUrl);
    this.sprites = [load(brownBig), load(greyBig), load(brownMed), load(greySmall)];
    this.rocks = Array.from({ length: 18 }, (_, i) => {
      const depth = range(rng, 0.25, 1);
      return {
        x: range(rng, 0.3, 1.1), y: range(rng, -0.1, 1.1), depth,
        sprite: depth > 0.7 ? Math.floor(range(rng, 0, 2)) : depth > 0.45 ? 2 : 3,
        angle: range(rng, 0, 6.28), spin: range(rng, -0.4, 0.4), speed: range(rng, 0.012, 0.03)
      };
    }).sort((a, b) => a.depth - b.depth);
  }

  update(deltaTime) {
    for (const rock of this.rocks) {
      rock.x -= rock.speed * rock.depth * deltaTime;
      rock.y += rock.speed * 0.3 * rock.depth * deltaTime;
      rock.angle += rock.spin * deltaTime;
      if (rock.x < -0.15) { rock.x = 1.15; rock.y = (rock.y + 0.37) % 1; }
    }
  }

  draw(paint, { width, height, elapsed }) {
    if (this.stars.width) {
      for (let y = 0; y < height; y += 256) for (let x = 0; x < width; x += 256) paint.drawImage({ image: this.stars, x, y, width: 256, height: 256, globalAlpha: 0.9 });
    }
    const nx = width * 0.72;
    const ny = height * 0.45;
    paint.drawArc({ x: nx, y: ny, radius: height * 0.55, fillStyle: { type: 'radial', x: nx, y: ny, r0: 0, r1: height * 0.55, stops: [{ offset: 0, color: 'rgba(90, 120, 220, 0.28)' }, { offset: 0.5, color: 'rgba(140, 80, 200, 0.14)' }, { offset: 1, color: 'rgba(0, 0, 0, 0)' }] } });
    for (const rock of this.rocks) {
      const image = this.sprites[rock.sprite];
      if (!image.width) continue;
      const scale = 0.4 + rock.depth * 1.6;
      paint.pushTransform({ x: rock.x * width, y: rock.y * height, rotation: rock.angle, scaleX: scale, scaleY: scale });
      paint.drawImage({ image, x: -image.width / 2, y: -image.height / 2, width: image.width, height: image.height, globalAlpha: 0.35 + rock.depth * 0.65 });
      paint.popTransform();
    }
    // The window frame's edge light along the bottom.
    paint.drawRect({ x: 0, y: height - 6, width, height: 6, fillStyle: 'rgba(140, 190, 255, 0.35)' });
  }
}

export const menuBackdrop = {
  gradient: { from: '#06070f', to: '#0b0c1c', angle: 160 },
  layers: [new FieldWindow()],
  motes: 0,
  vignette: 0.5
};
