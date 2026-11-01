export class LayerManager {
  constructor() {
    this.layers = [];
    this.game = null;
  }

  setGame(game) {
    this.game = game;
  }

  addLayer(name, layer) {
    layer.sprite.game = this.game;
    this.layers.push([name, layer]);
  }

  clear() {
    this.layers = [];
  }

  draw() {
    for (let [name, layer] of this.layers) {
      this.drawLayer(name);
    }
  }

  drawLayer(layerName) {
    for (let [name, layer] of this.layers) {
      if (layerName !== undefined && layerName !== name) {
        continue;
      }

      for (let tile of layer.tiles) {
        const anim = layer.sprite.animations.get(tile.anim);
        if (!anim) continue;

        layer.sprite.draw(tile.anim, tile.pos.x, tile.pos.y, {
          game: this.game
        });
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