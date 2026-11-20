import type { BaseRenderer } from 'm2d-engine/renderers';

/** A world rectangle: its top-left corner and its size. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a texture has to offer to be tiled: its pixel size. */
export interface TextureImage {
  width: number;
  height: number;
}

export interface TileOptions {
  /**
   * `'world'` (the default) aligns the tiling to the world grid so
   * neighbouring rectangles continue each other's pattern; `'rect'` pins
   * it to the rectangle's own corner, which a parallax plane needs — a
   * facade aligned to the world grid slides through a building that moves
   * at a fraction of the camera's speed, and its windows crawl into the
   * air.
   */
  origin?: 'world' | 'rect';
  /** A colour laid over the texture, as `drawSprite` takes it. */
  tint?: string;
  /** 0 to 1, as `drawSprite` takes it. */
  globalAlpha?: number;
}

/**
 * Tile a texture over a rectangle at its natural scale.
 *
 * `Entity.draw` stretches a sheet to the body, which is right for a sprite
 * and wrong for a material: a 256px stone texture over a 32px-thick wall
 * would squash to a smear. This clips to the rectangle and lays the tile
 * down at `tile` world units, aligned to the world grid so neighbouring
 * walls continue each other's pattern.
 *
 * @param image - The texture, square
 * @param rect - World rectangle
 * @param tile - World size of one repeat
 */
export function tileTexture(
  renderer: BaseRenderer,
  image: TextureImage | null | undefined,
  rect: Rect,
  tile = 128,
  options: TileOptions = {}
): void {
  if (!image || !image.width) return;
  const { origin = 'world', ...drawOptions } = options;
  renderer.pushClip({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  const x0 = origin === 'rect' ? rect.x : Math.floor(rect.x / tile) * tile;
  const y0 = origin === 'rect' ? rect.y : Math.floor(rect.y / tile) * tile;
  for (let y = y0; y < rect.y + rect.height; y += tile) {
    for (let x = x0; x < rect.x + rect.width; x += tile) {
      renderer.drawSprite({
        image, x: x + tile / 2, y: y + tile / 2,
        tileWidth: image.width, tileHeight: image.height,
        width: tile, height: tile,
        ...drawOptions
      });
    }
  }
  renderer.popClip();
}
