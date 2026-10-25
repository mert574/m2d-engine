import { createCanvasElement } from './environment.js';

export const TILE = 16;

/** Distinct, widely separated colors so tile selection failures are unambiguous. */
export const TILE_COLORS = {
  topLeft: '#ff0000',
  topRight: '#00ff00',
  bottomLeft: '#0000ff',
  bottomRight: '#ffff00'
};

/**
 * A 2x2 spritesheet of solid 16px tiles:
 *   (0,0) red    (1,0) green
 *   (0,1) blue   (1,1) yellow
 * Drawing tile (tileX, tileY) must produce exactly that color.
 */
export function makeTileSheet() {
  const canvas = createCanvasElement(TILE * 2, TILE * 2);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = TILE_COLORS.topLeft;
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = TILE_COLORS.topRight;
  ctx.fillRect(TILE, 0, TILE, TILE);
  ctx.fillStyle = TILE_COLORS.bottomLeft;
  ctx.fillRect(0, TILE, TILE, TILE);
  ctx.fillStyle = TILE_COLORS.bottomRight;
  ctx.fillRect(TILE, TILE, TILE, TILE);

  return canvas;
}

/**
 * A single tile whose left half is red and right half is blue, with a
 * cyan top stripe. Mirroring is detectable on both axes.
 */
export function makeAsymmetricTile() {
  const canvas = createCanvasElement(TILE, TILE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, TILE / 2, TILE);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(TILE / 2, 0, TILE / 2, TILE);
  ctx.fillStyle = '#00ffff';
  ctx.fillRect(0, 0, TILE, 4);

  return canvas;
}

/** A solid image of arbitrary size. */
export function makeSolidImage(width, height, color) {
  const canvas = createCanvasElement(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/**
 * An image split into four quadrant colors, for source sub-rect tests.
 */
export function makeQuadrantImage(size = 32) {
  const canvas = createCanvasElement(size, size);
  const ctx = canvas.getContext('2d');
  const h = size / 2;

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, h, h);
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(h, 0, h, h);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, h, h, h);
  ctx.fillStyle = '#ffff00';
  ctx.fillRect(h, h, h, h);

  return canvas;
}

/**
 * A SpriteSheet-shaped object for drawAnimation tests, matching the real
 * SpriteSheet's public surface (image, tileW, tileH, animations Map).
 */
export function makeAnimatedSprite() {
  const image = makeTileSheet();
  const animations = new Map([
    ['idle', { tileX: 0, tileY: 0 }],   // red, frame 1 -> green
    ['walk', { tileX: 0, tileY: 1 }]    // blue, frame 1 -> yellow
  ]);

  return { image, tileW: TILE, tileH: TILE, animations };
}
