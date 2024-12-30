import { Scene } from './scene.js';
import { SceneLoader } from './sceneLoader.js';

export class SceneManager {
  constructor(game) {
    this.game = game;
    this.scenes = new Map();
    this.currentScene = null;
    this.loader = new SceneLoader(game);
    this.scenesToLoad = [];
    this.loading = true;
  }

  addScene(name, scene) {
    this.scenesToLoad.push({ name, scene });
  }

  async loadScene(sceneConfig, sceneName) {
    this.loading = true;
    try {
      const loadedScene = await sceneConfig.fetch();
      if (!loadedScene) {
        console.error('Failed to load scene', sceneConfig);
        throw new Error('Failed to load scene');
      }

      this.scenes.set(sceneName, new Scene(this.game, loadedScene));
      this.scenesToLoad = this.scenesToLoad.filter(s => s.name !== sceneName);

      return this.scenes.get(sceneName);
    } catch (error) {
      console.error('Error loading scene:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  async switchTo(sceneName) {
    let scene = this.scenes.get(sceneName);
    if (!scene) {
      const sceneToLoad = this.scenesToLoad.find(s => s.name === sceneName);
      if (!sceneToLoad) {
        throw new Error(`Scene ${sceneName} not found`);
      }
      scene = await this.loadScene(sceneToLoad.scene, sceneName);
    } else {
      this.loading = false;
    }
    if (this.currentScene) {
      this.currentScene.unload();
    }

    this.currentScene = scene;
    await scene.load();
    
    return scene;
  }

  getCurrentScene() {
    return this.currentScene;
  }
} 