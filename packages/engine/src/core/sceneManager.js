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
      const fetched = await sceneConfig.fetch();
      if (!fetched) {
        console.error('Failed to load scene', sceneConfig);
        throw new Error('Failed to load scene');
      }

      // Validate and apply defaults before anything tries to build the scene,
      // so a bad reference names itself instead of surfacing as a half-built
      // level. Throws SceneValidationError; see sceneLoader.js.
      const loadedScene = this.loader.load(fetched, sceneName);

      // Keep registered hooks, including the platformer's music transitions.
      this.scenes.set(sceneName, new Scene(this.game, { ...sceneConfig, ...loadedScene }));
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
