export class SceneLoader {
  constructor(game) {
    this.game = game;
    this.spriteIndices = new Map();
  }

  async loadScene(sceneData) {
    if (!sceneData.version || !sceneData.type) {
      throw new Error('Invalid scene format');
    }

    return sceneData.type === 'level' 
      ? this.loadLevelScene(sceneData)
      : this.loadUIScene(sceneData);
  }

  async loadLevelScene(data) {
    this.mapSprites(data.assets.spritesheets);

    return {
      name: data.name,
      type: 'level',
      title: data.title || data.name,
      gameType: data.gameType,
      world: data.world,
      sprites: this.getSpritesArray(data),
      player: this.createPlayerEntity(data),
      entities: this.createEntities(data)
    };
  }

  mapSprites(spritesheets) {
    this.spriteIndices.clear();
    Object.keys(spritesheets).forEach((key, index) => {
      this.spriteIndices.set(key, index);
    });
  }

  getSpritesArray(data) {
    return Object.entries(data.assets.spritesheets).map(([_, sprite]) => [
      sprite.url,
      sprite.frameWidth
    ]);
  }

  createPlayerEntity(data) {
    const playerLayer = data.layers.find(layer => 
      layer.objects.some(obj => obj.prefab === 'player')
    );
    if (!playerLayer) return null;

    const playerObj = playerLayer.objects.find(obj => obj.prefab === 'player');
    if (!playerObj) return null;

    const prefab = data.prefabs.player;
    return this.createEntity(playerObj, prefab);
  }

  createEntities(data) {
    return data.layers.flatMap(layer => 
      layer.objects
        .filter(obj => obj.prefab !== 'player')
        .map(obj => this.createEntity(obj, data.prefabs[obj.prefab]))
    );
  }

  createEntity(obj, prefab) {
    return {
      actor: prefab.actor,
      position: [obj.x, obj.y],
      size: [obj.width || 32, obj.height || 32],
      sprite: this.spriteIndices.get(prefab.spritesheet),
      animations: this.createAnimations(prefab),
      options: obj.properties,
      physics: prefab.physics,
    };
  }

  createAnimations(prefab) {
    const spritesheet = prefab.spritesheet;
    if (!spritesheet?.animations) return undefined;

    return Object.entries(spritesheet.animations).map(([name, anim]) => [
      name,
      ...anim.frames[0],
      anim.loop
    ]);
  }

  async loadUIScene(data) {
    return {
      name: data.name,
      type: 'ui',
      title: data.title || data.name,
      assets: data.assets,
      elements: data.elements.map(element => ({
        type: element.type,
        id: element.id,
        x: element.x,
        y: element.y,
        ...element.properties
      }))
    };
  }
} 