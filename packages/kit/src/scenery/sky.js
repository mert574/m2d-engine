import { s } from 'm2d-engine/core/schema.js';
import { Scenery, BACK } from './scenery.js';

const colour = (options = {}) => s.string({ editor: 'color', ...options });

/**
 * A 2D level's sky: a vertical gradient over the view, under everything.
 * Fixed to the view, so it has no edge at any zoom or rotation. A 3D
 * level's sky is its environment and lighting.
 */
export class Sky extends Scenery {
  static description = 'A vertical gradient over the view, behind the level';
  static dimensions = 2;
  static properties = {
    top: colour({ initial: '#0b1026', label: 'Top' }),
    bottom: colour({ initial: '#5c6f8a', label: 'Bottom' }),
    middle: colour({ label: 'Middle', description: 'A third stop, at the horizon' }),
    horizon: s.number({ min: 0, max: 1, initial: 0.5, description: 'Where the middle stop sits, down the view' })
  };

  name = 'Sky';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, BACK);
    this.top = options.top ?? '#0b1026';
    this.bottom = options.bottom ?? '#5c6f8a';
    this.middle = options.middle ?? null;
    this.horizon = options.horizon ?? 0.5;
  }

  paint(area) {
    const stops = [{ offset: 0, color: this.top }];
    if (this.middle) stops.push({ offset: this.horizon, color: this.middle });
    stops.push({ offset: 1, color: this.bottom });
    this.game.renderer.drawRect({
      x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top,
      fillStyle: { type: 'linear', x0: area.left, y0: area.top, x1: area.left, y1: area.bottom, stops }
    });
  }
}
