import layout from './layout.json';

/**
 * Ash Row's presentation hooks: only the camera's height, which depends on
 * the projection and the real view, and Escape. Everything else is the
 * scene's (row.json): the waves are placed thugs, sealed until their
 * section's zone calls them; the section locks, the GO sign and the door
 * are `world.rules`; the light, music and HUD are `world` and `hud`. Kept
 * out of the definition (`game.js`) so a headless game never loads them;
 * `main.js` and the editor's play mode both build them here. See
 * m2d.project.json.
 */
export function sceneHooks(game) {
  let unsubscribe = [];

  return {
    row: {
      onEnter() {
        // The street is drawn in the lower part of the view, the wall above it.
        // The gutter sits a little above the bottom edge; the wall fills the rest.
        const gutterY = game.projection.toScreen(0, layout.lane.bottom).y;
        const cameraY = gutterY + 84 - game.camera.height / 2;
        game.camera.y = cameraY;
        // Bounds narrower than the view centre it: this pins the height. The
        // rules move the right edge as each section locks and clears.
        game.camera.bounds = { left: 0, top: cameraY - 10, right: layout.length, bottom: cameraY + 10 };

        unsubscribe.push(game.input.on('keydown', (event) => {
          if (event.code === 'Escape') { game.sceneManager.switchTo('mainMenu'); event.consume(); }
        }));
      },

      onDrawBackground() {
        // The Street entity paints the sky, the skyline and the road; this
        // only guarantees no clear colour shows at the edges.
        const area = game.camera.getVisibleArea();
        game.renderer.drawRect({ x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fillStyle: '#5fa6e4' });
      },

      onExit() {
        for (const stop of unsubscribe) stop();
        unsubscribe = [];
      }
    }
  };
}
