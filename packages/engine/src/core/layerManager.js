/**
 * Tiled layers: a spritesheet frame repeated on a grid, drawn under the
 * camera at fixed world positions. A level's floor, a sky, a canopy of
 * leaves over the player's head, cloud shadows drifting across the ground.
 *
 * Each layer carries three things beyond its tiles:
 *
 * - `zIndex`: where it sits among the entities. The scene draws layers and
 *   entities in one ascending order, so a layer at -1 is a floor and one at
 *   5 is drawn over every entity below 5. Default -1.
 * - `parallax`: how much of the camera's motion the layer follows. 1 is
 *   pinned to the world. 0 never moves — a sky. 0.5 is a distant hill that
 *   crosses the screen at half speed. Above 1 the layer is nearer than the
 *   ground and outruns it: cloud shadows at 1.15 read as high overhead.
 * - `repeat`: tile the layer across the whole visible area instead of its
 *   own grid, for anything that must never show an edge. On by default
 *   for a layer with parallax other than 1, since such a layer's grid
 *   cannot stay aligned with the world's.
 *
 * Tiles outside the view are skipped: a layer's cost is the tiles on screen,
 * not the size of the world.
 */
export class LayerManager {
  constructor() {
    this.layers = [];
    this.game = null;
  }

  setGame(game) {
    this.game = game;
  }

  /**
   * Add a layer built by `constructLayer`.
   * @param {string} name
   * @param {Object} layer
   * @param {Object} [options]
   * @param {number} [options.zIndex=-1]
   * @param {number|{x: number, y: number}} [options.parallax=1]
   * @param {boolean} [options.repeat] - Default: true when parallax is not 1
   */
  addLayer(name, layer, { zIndex = -1, parallax = 1, repeat, scale = 1, stretch = false } = {}) {
    layer.sprite.game = this.game;
    layer.scale = scale;
    layer.stretch = stretch;
    const factor = typeof parallax === 'number' ? { x: parallax, y: parallax } : { x: 1, y: 1, ...parallax };
    layer.name = name;
    layer.zIndex = zIndex;
    layer.parallax = factor;
    layer.repeat = repeat ?? (factor.x !== 1 || factor.y !== 1);
    this.layers.push([name, layer]);
    // Kept sorted so the scene can merge layers and entities in one pass.
    this.layers.sort((a, b) => a[1].zIndex - b[1].zIndex);
  }

  getLayer(name) {
    return this.layers.find(([n]) => n === name)?.[1] ?? null;
  }

  clear() {
    this.layers = [];
  }

  draw() {
    for (const [name] of this.layers) {
      this.drawLayer(name);
    }
  }

  drawLayer(layerName) {
    for (const [name, layer] of this.layers) {
      if (layerName !== undefined && layerName !== name) continue;
      this.drawOne(layer);
    }
  }

  /** Draw one layer, parallax applied and tiles off the view skipped. */
  drawOne(layer) {
    if (this.game?.projection) {
      this.#drawProjected(layer, this.game.projection);
      return;
    }
    const camera = this.game?.camera;
    const { tileW, tileH } = layer.sprite;
    const size = layer.tileSize;
    const { cols, rows, tiles } = layer;
    if (!cols || !rows) return;

    // The layer moves by `parallax` of the camera's travel, so a layer
    // point q is drawn at q + camera · (1 - parallax). With the camera at
    // the origin every layer lines up with the world.
    const shiftX = camera ? camera.x * (1 - layer.parallax.x) : 0;
    const shiftY = camera ? camera.y * (1 - layer.parallax.y) : 0;

    // The range of tile indices that can be on screen, in layer space.
    let i0 = 0, i1 = cols - 1, j0 = 0, j1 = rows - 1;
    if (camera) {
      const area = camera.getVisibleArea();
      const pad = Math.max(tileW, tileH);
      i0 = Math.floor((area.left - shiftX - pad) / size);
      i1 = Math.floor((area.right - shiftX + pad) / size);
      j0 = Math.floor((area.top - shiftY - pad) / size);
      j1 = Math.floor((area.bottom - shiftY + pad) / size);
      if (!layer.repeat) {
        i0 = Math.max(0, i0); i1 = Math.min(cols - 1, i1);
        j0 = Math.max(0, j0); j1 = Math.min(rows - 1, j1);
      }
    }

    for (let i = i0; i <= i1; i++) {
      const col = layer.repeat ? ((i % cols) + cols) % cols : i;
      for (let j = j0; j <= j1; j++) {
        const row = layer.repeat ? ((j % rows) + rows) % rows : j;
        const tile = tiles[col * rows + row];
        if (!tile) continue;
        const anim = layer.sprite.animations.get(tile.anim);
        if (!anim) continue;

        // Tile positions are top-left corners on the grid; the sprite draws
        // centred, so offset by half a tile to cover the cell exactly.
        layer.sprite.draw(tile.anim,
          i * size + tileW / 2 + shiftX,
          j * size + tileH / 2 + shiftY,
          { game: this.game });
      }
    }
  }

  /**
   * Under a projection a tile is a ground square drawn as whatever the
   * sprite is — a diamond for isometric — centred on the projected centre
   * of the square, at the sprite's own size times `scale`. Parallax does
   * not apply: the layer is the ground. Tiles are culled by mapping the
   * visible render area back to a ground box.
   */
  #drawProjected(layer, projection) {
    const camera = this.game.camera;
    const size = layer.tileSize;
    const { cols, rows, tiles } = layer;
    if (!cols || !rows) return;
    // Isometric art is already drawn for the view, so it draws at its own
    // size; a flat texture is stretched to the tile's projected box.
    let drawW = layer.sprite.tileW * (layer.scale ?? 1);
    let drawH = layer.sprite.tileH * (layer.scale ?? 1);
    if (layer.stretch) {
      const box = projection.boundsOf(0, 0, size, size);
      drawW = (box.right - box.left) * (layer.scale ?? 1);
      drawH = (box.bottom - box.top) * (layer.scale ?? 1);
    }

    let i0 = 0, i1 = cols - 1, j0 = 0, j1 = rows - 1;
    if (camera) {
      const area = camera.getVisibleArea();
      const pad = Math.max(drawW, drawH);
      const ground = projection.groundBoundsOf({
        left: area.left - pad, top: area.top - pad, right: area.right + pad, bottom: area.bottom + pad
      });
      i0 = Math.max(0, Math.floor(ground.left / size));
      i1 = Math.min(cols - 1, Math.floor(ground.right / size));
      j0 = Math.max(0, Math.floor(ground.top / size));
      j1 = Math.min(rows - 1, Math.floor(ground.bottom / size));
    }

    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const tile = tiles[i * rows + j];
        if (!tile) continue;
        if (!layer.sprite.animations.get(tile.anim)) continue;
        const centre = projection.toScreen((i + 0.5) * size, (j + 0.5) * size);
        layer.sprite.draw(tile.anim, centre.x, centre.y, { width: drawW, height: drawH, game: this.game });
      }
    }
  }

  /**
   * A regular grid of `x` by `y` tiles of `tileSize`, every one carrying
   * `fields` (at least `anim`, the frame to draw).
   */
  constructLayer(sprite, x, y, tileSize, fields) {
    const layer = { sprite, tileSize, cols: x, rows: y, tiles: [] };

    for (let i = 0; i < x; i++) {
      for (let j = 0; j < y; j++) {
        layer.tiles.push({
          pos: { x: i * tileSize, y: j * tileSize },
          ...fields
        });
      }
    }

    return layer;
  }
}
