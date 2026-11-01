export class LevelManager {
  constructor(game) {
    this.game = game;
    this.names = game.options.levelNames || [];
    this.path = game.options.levelsPath || './levels/';
    this.currentLevel = game.options.currentLevel;
    this.currentIndex = this.names.indexOf(this.currentLevel);
  }

  async loadLevel(name) {
    try {
      // If the level is already loaded (in-memory data), return it
      if (this._levelData) {
        return this._levelData;
      }

      // Otherwise, try to fetch from file
      const response = await fetch(this.path + name);
      return await response.json();
    } catch (error) {
      console.error('Error loading level:', error);
      return null;
    }
  }

  setLevelData(data) {
    this._levelData = data;
  }

  nextLevel() {
    if (this.currentIndex < this.names.length - 1) {
      this.currentIndex++;
      this.currentLevel = this.names[this.currentIndex];
      return true;
    }
    return false;
  }

  previousLevel() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.currentLevel = this.names[this.currentIndex];
      return true;
    }
    return false;
  }
} 