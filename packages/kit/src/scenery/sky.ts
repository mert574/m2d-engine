import { s } from 'm2d-engine/schema';
import type { M2D } from 'm2d-engine';
import { Scenery, BACK } from './scenery.ts';
import type { ActorBody, ActorSprite, VisibleArea, VisibleArea2D } from '../engineTypes.ts';

const colour = (options: Parameters<typeof s.string>[0] = {}) => s.string({ editor: 'color', ...options });

export interface SkyOptions {
  top?: string;
  bottom?: string;
  /** A third stop, at the horizon. */
  middle?: string;
  /** Where the middle stop sits, down the view. */
  horizon?: number;
}

/**
 * A 2D level's sky: a vertical gradient over the view, under everything.
 * Fixed to the view, so it has no edge at any zoom or rotation. A 3D
 * level's sky is its environment and lighting.
 */
export class Sky extends Scenery {
  static override description = 'A vertical gradient over the view, behind the level';
  static override dimensions = 2 as const;
  static override properties = {
    top: colour({ initial: '#0b1026', label: 'Top' }),
    bottom: colour({ initial: '#5c6f8a', label: 'Bottom' }),
    middle: colour({ label: 'Middle', description: 'A third stop, at the horizon' }),
    horizon: s.number({ min: 0, max: 1, initial: 0.5, description: 'Where the middle stop sits, down the view' })
  };

  override name = 'Sky';

  top: string;
  bottom: string;
  /** The horizon stop, or null for a two-stop gradient. */
  middle: string | null;
  horizon: number;

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: SkyOptions = {}) {
    super(body, sprite, game, BACK);
    this.top = options.top ?? '#0b1026';
    this.bottom = options.bottom ?? '#5c6f8a';
    this.middle = options.middle ?? null;
    this.horizon = options.horizon ?? 0.5;
  }

  override paint(area: VisibleArea): void {
    // 2D-only scenery (`dimensions = 2`): the area is the flat camera's.
    const view = area as VisibleArea2D;
    const stops = [{ offset: 0, color: this.top }];
    if (this.middle) stops.push({ offset: this.horizon, color: this.middle });
    stops.push({ offset: 1, color: this.bottom });
    this.game.renderer.drawRect({
      x: view.left, y: view.top, width: view.right - view.left, height: view.bottom - view.top,
      fillStyle: { type: 'linear', x0: view.left, y0: view.top, x1: view.left, y1: view.bottom, stops }
    });
  }
}
