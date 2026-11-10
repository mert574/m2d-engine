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

  /**
   * Make a scene current: unload the old one, load the new one.
   *
   * `loading` stays set until the new scene has finished `load()`, which
   * includes its asset fetch and `setupScene`. The engine draws its loading
   * message while the flag is set, so no frame can run the new scene's
   * hooks against a world that is not built yet (the projection unset, the
   * entities absent) — which is what a scene's `onDrawBackground` would
   * otherwise see for the first frame or two.
   */
  switchTo(sceneName) {
    // Requested from inside a tick (a collision handler, a game-time timer,
    // `onFixedUpdate`): that tick finishes against the scene it started in,
    // no further tick runs this frame, and the switch begins after the
    // frame. The first request in a tick wins.
    if (this.game.time?.inStep) {
      if (this.#deferred) return this.#deferred;
      this.loading = true;
      this.#deferred = Promise.resolve().then(() => {
        this.#deferred = null;
        return this.#run(() => this.#switch(sceneName));
      });
      return this.#deferred;
    }
    return this.#run(() => this.#switch(sceneName));
  }

  /**
   * Run the current scene's `load()` again, under the same loading flag as
   * a switch, so no tick or frame sees the world half rebuilt. The game-over
   * restart uses this after `game.reset()`.
   */
  reload() {
    const scene = this.currentScene;
    if (!scene) return Promise.resolve(null);
    return this.#run(async () => {
      await scene.load();
      return scene;
    });
  }

  #deferred = null;

  async #run(work) {
    this.loading = true;
    try {
      return await work();
    } finally {
      this.loading = false;
      // A new scene is a new picture; edit mode should not wait for its
      // idle frame to show it.
      this.game.invalidate?.();
    }
  }

  async #switch(sceneName) {
    let scene = this.scenes.get(sceneName);
    if (!scene) {
      const sceneToLoad = this.scenesToLoad.find(s => s.name === sceneName);
      if (!sceneToLoad) {
        throw new Error(`Scene ${sceneName} not found`);
      }
      scene = await this.loadScene(sceneToLoad.scene, sceneName);
      this.loading = true;
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

  /** Whether a scene is registered, loaded or not. */
  has(sceneName) {
    return this.scenes.has(sceneName) || this.scenesToLoad.some((s) => s.name === sceneName);
  }
}
