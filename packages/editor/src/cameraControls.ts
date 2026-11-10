/**
 * The viewer's camera: drag to move, scroll to zoom.
 *
 * In edit mode the engine still delivers its input events — that is the
 * carve-out E0.6 made for exactly this — while nothing reaches the
 * simulation or the scene's UI. 3D orbits (`Camera3D.orbit`/`zoom`); 2D
 * pans the camera against the drag and scales `camera.zoom` around the
 * wheel. `changed` hears every move — the viewport redraws on demand and
 * the overlay follows the camera. Returns an unsubscribe, and the camera
 * needs no teardown of its own: it dies with the game.
 */

interface InputEvent3D {
  delta: { ui: { x: number; y: number } };
  scroll: { x: number; y: number };
  consume(): void;
}

interface EditorGame {
  input: { on(type: string, handler: (event: InputEvent3D) => void): () => void };
  camera: {
    // 3D
    orbit?(deltaYaw: number, deltaPitch: number): void;
    zoom?: number | ((factor: number) => void);
    // 2D
    x?: number;
    y?: number;
  };
  renderer: { dimensions: number };
}

export function attachCameraControls(game: EditorGame, changed: () => void = () => {}): () => void {
  const camera = game.camera;
  const off: Array<() => void> = [];

  if (game.renderer.dimensions === 3) {
    // Edit mode never runs the loop's camera.update, so each gesture
    // rebuilds the view itself; an orbit without it would change nothing.
    const update = camera as unknown as { update(dt: number): void };
    off.push(game.input.on('drag', (event) => {
      camera.orbit?.(-event.delta.ui.x * 0.005, event.delta.ui.y * 0.004);
      update.update(0);
      changed();
      event.consume();
    }));
    off.push(game.input.on('scroll', (event) => {
      (camera.zoom as (factor: number) => void)(Math.exp(event.scroll.y * 0.0012));
      update.update(0);
      changed();
      event.consume();
    }));
  } else {
    off.push(game.input.on('drag', (event) => {
      const zoom = typeof camera.zoom === 'number' && camera.zoom > 0 ? camera.zoom : 1;
      camera.x = (camera.x ?? 0) - event.delta.ui.x / zoom;
      camera.y = (camera.y ?? 0) - event.delta.ui.y / zoom;
      changed();
      event.consume();
    }));
    off.push(game.input.on('scroll', (event) => {
      const zoom = typeof camera.zoom === 'number' && camera.zoom > 0 ? camera.zoom : 1;
      (camera as { zoom: number }).zoom = Math.min(8, Math.max(0.1, zoom * Math.exp(-event.scroll.y * 0.0012)));
      changed();
      event.consume();
    }));
  }
  return () => { for (const un of off) un(); };
}
