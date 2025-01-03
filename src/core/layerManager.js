export class LayerManager {
  constructor() {
    this.layers = new Map();
    this.game = null;
    this.containers = new Map();
  }

  setGame(game) {
    this.game = game;
  }

  addLayer(name, layer) {
    layer.sprite.game = this.game;
    this.layers.set(name, layer);

    // Create container for this layer if it doesn't exist
    if (!this.containers.has(name)) {
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.zIndex = this.containers.size; // Layer order based on addition order
      this.game.gameLayer.appendChild(container);
      this.containers.set(name, container);
    }

    // Pre-create tile elements
    layer.elements = layer.tiles.map(tile => {
      const element = document.createElement('div');
      element.style.position = 'absolute';
      element.style.width = `${layer.sprite.tileW}px`;
      element.style.height = `${layer.sprite.tileH}px`;
      element.style.backgroundImage = `url(${layer.sprite.image.src})`;
      element.style.backgroundRepeat = 'no-repeat';
      element.style.imageRendering = 'pixelated';
      this.containers.get(name).appendChild(element);
      return element;
    });
  }

  clear() {
    // Remove all layer elements
    this.containers.forEach(container => {
      container.remove();
    });
    this.containers.clear();
    this.layers.clear();
  }

  drawLayer(layerName) {
    const layer = this.layers.get(layerName);
    if (!layer) return;

    const container = this.containers.get(layerName);
    if (!container) return;

    // Update tile positions
    layer.tiles.forEach((tile, index) => {
      const element = layer.elements[index];
      if (!element) return;

      const anim = layer.sprite.animations.get(tile.anim);
      if (!anim) return;

      const worldX = tile.pos.x - this.game.camera.x;
      const worldY = tile.pos.y - this.game.camera.y;

      element.style.display = 'block';
      element.style.left = `${worldX}px`;
      element.style.top = `${worldY}px`;
      element.style.backgroundPosition = `-${anim.tileX}px -${anim.tileY}px`;
    });
  }

  constructLayer(sprite, x, y, tileSize, fields) {
    let layer = { 
      sprite, 
      tiles: [],
      elements: [] // Will store the HTML elements for each tile
    };

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