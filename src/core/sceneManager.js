import { Scene } from './scene.js';

export class SceneManager {
  constructor(game) {
    this.game = game;
    this.scenes = new Map();
    this.currentScene = null;

    this.levelNames = game.options.levelNames || [];
    this.levelsPath = game.options.levelsPath || './levels/';
    this.currentLevelIndex = -1;

    if (this.levelNames.length > 0) {
      this.levelNames.forEach(levelName => {
        this.registerScene({
          name: levelName,
          type: 'level',
          levelData: levelName
        });
      });

      if (game.options.currentLevel) {
        this.currentLevelIndex = this.levelNames.indexOf(game.options.currentLevel);
      }
    }
  }

  registerScene(config) {
    const scene = new Scene(this.game, config);
    this.scenes.set(config.name, scene);
  }

  async switchTo(sceneName) {
    const currentScene = this.getCurrentScene();
    if (currentScene) {
      currentScene.unload();
      this.currentScene = null;
    }

    const nextScene = this.scenes.get(sceneName);
    if (!nextScene) {
      const levelData = this.levelData.get(sceneName);
      if (!levelData) {
        console.error(`Scene "${sceneName}" not found`);
        return;
      }
      await this.loadLevel(sceneName);
    } else {
      this.currentScene = sceneName;
      await nextScene.load();
    }
  }

  async loadLevel(sceneName) {
    const levelData = await this.loadLevelData(sceneName);
    if (levelData) {
      const scene = new Scene(this.game, {
        name: sceneName,
        type: 'level',
        levelData
      });
      this.scenes.set(sceneName, scene);
      this.currentScene = sceneName;
      await scene.load();
    }
  }

  getCurrentScene() {
    return this.scenes.get(this.currentScene);
  }

  async loadLevelData(name) {
    try {
      const response = await fetch(this.levelsPath + name);
      return await response.json();
    } catch (error) {
      console.error('Error loading level:', error);
      return null;
    }
  }

  async nextLevel() {
    if (this.currentLevelIndex < this.levelNames.length - 1) {
      this.currentLevelIndex++;
      const nextLevelName = this.levelNames[this.currentLevelIndex];
      await this.switchTo(nextLevelName);
      return true;
    }
    return false;
  }

  async previousLevel() {
    if (this.currentLevelIndex > 0) {
      this.currentLevelIndex--;
      const prevLevelName = this.levelNames[this.currentLevelIndex];
      await this.switchTo(prevLevelName);
      return true;
    }
    return false;
  }

  setLevelData(name, data) {
    const scene = new Scene(this.game, {
      name,
      type: 'level',
      levelData: data
    });
    this.scenes.set(name, scene);
  }
} 