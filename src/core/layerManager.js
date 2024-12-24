export class LayerManager {
  constructor(context) {
    this.context = context;
    this.layers = [];
  }

  addLayer(name, layer) {
    this.layers.push([name, layer]);
  }

  clear() {
    this.layers = [];
  }

  draw() {
    for (let [name, layer] of this.layers) {
      for (let tile of layer.tiles) {
        layer.sprite.draw(this.context, tile.pos.x, tile.pos.y, tile.anim);
      }
    }
  }

  drawLayer(layerName) {
    for (let [name, layer] of this.layers) {
      if (layerName !== undefined && layerName !== name)
        continue;

      for (let tile of layer.tiles) {
        layer.sprite.draw(this.context, tile.pos.x, tile.pos.y, tile.anim);
      }
    }
  }

  constructLayer(sprite, x, y, tileSize, fields) {
    let layer = { sprite, tiles: [] };

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