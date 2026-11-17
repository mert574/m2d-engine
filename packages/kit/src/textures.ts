/**
 * Tile a texture over a rectangle at its natural scale.
 *
 * `Entity.draw` stretches a sheet to the body, which is right for a sprite
 * and wrong for a material: a 256px stone texture over a 32px-thick wall
 * would squash to a smear. This clips to the rectangle and lays the tile
 * down at `tile` world units, aligned to the world grid so neighbouring
 * walls continue each other's pattern.
 */

interface Rect { x: number; y: number; width: number; height: number }

interface TileRenderer {
  pushClip(rect: Rect): void;
  popClip(): void;
  drawSprite(options: Record<string, unknown>): void;
}

interface TileOptions extends Record<string, unknown> {
  /**
   * `'world'` (default) aligns the tiling to the world grid so neighbouring
   * rectangles continue each other's pattern; `'rect'` pins it to the
   * rectangle's own corner, which a parallax plane needs — a facade aligned
   * to the world grid slides through a building that moves at a fraction of
   * the camera's speed, and its windows crawl into the air.
   */
  origin?: 'world' | 'rect';
}

/**
 * @param renderer - The game's renderer
 * @param image - The texture, square
 * @param rect - World rectangle to fill
 * @param tile - World size of one repeat
 * @param options - Extra `drawSprite` options (`tint`, `globalAlpha`), plus `origin`
 */
export function tileTexture(renderer: TileRenderer, image: { width: number; height: number } | null | undefined, rect: Rect, tile = 128, options: TileOptions = {}): void {
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
