/**
 * The viewer's camera.
 *
 * In edit mode the engine still delivers its input events — that is the
 * carve-out E0.6 made for exactly this — while nothing reaches the
 * simulation or the scene's UI. The mouse works as in every 3D tool:
 *
 * - **Left drag** orbits the 3D camera about its look-at point, or pans
 *   the 2D one.
 * - **Right drag** looks around from where the eye is (3D), or pans (2D).
 *   While the right button is held, **W A S D** fly forward, left, back
 *   and right along the view, **Q** and **E** sink and rise, **Shift**
 *   hurries and **Alt** creeps. The same keys are the gizmo's otherwise,
 *   which is why the button gates them (`flying` tells the editor so).
 * - **Middle drag** pans: the look-at point slides across the view.
 * - **Scroll** zooms: the orbit distance, or the 2D zoom about the wheel.
 * - **Arrow keys** and **Page Up / Page Down** fly too, whenever the
 *   viewport has the focus; nothing else wants them there.
 *
 * Speeds scale with the orbit distance, so a step feels the same over a
 * tabletop and a city. `changed` hears every move — the viewport redraws
 * on demand and the overlay follows the camera. The camera needs no
 * teardown of its own: it dies with the game; `detach` only drops the
 * listeners.
 */

interface InputEvent3D {
  /** The buttons held, as the DOM's bitmask (a move event's own `button` is -1). */
  buttons: number;
  /** The modifier keys held; a Shift drag is the editor's marquee, not the camera's. */
  modifiers?: { shift?: boolean };
  delta: { ui: { x: number; y: number } };
  scroll: { x: number; y: number };
  consume(): void;
}

interface EditorGame {
  input: { on(type: string, handler: (event: InputEvent3D) => void): () => void };
  camera: {
    // 3D
    mode?: 'orbit' | 'free';
    orbit?(deltaYaw: number, deltaPitch: number): void;
    zoom?: number | ((factor: number) => void);
    position?: { x: number; y: number; z: number };
    lookAt?: { x: number; y: number; z: number };
    yaw?: number; pitch?: number; distance?: number; minPitch?: number; maxPitch?: number;
    fov?: number; height?: number;
    update?(dt: number): void;
    // 2D
    x?: number;
    y?: number;
  };
  renderer: { dimensions: number };
}

export interface CameraControls {
  detach(): void;
  /** Whether the right button is down over the canvas: the fly keys are live. */
  readonly flying: boolean;
}

/** Mouse buttons: the DOM's `button` number for the right one, and the `buttons` bits for a held drag. */
const RIGHT = 2;
const RIGHT_HELD = 2;
const MIDDLE_HELD = 4;

/** Keys the fly loop reads, by physical code. */
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);

export function attachCameraControls(game: EditorGame, canvas: HTMLElement, changed: () => void = () => {}): CameraControls {
  const camera = game.camera;
  const off: Array<() => void> = [];
  const threeD = game.renderer.dimensions === 3;
  const listen = <K extends keyof GlobalEventHandlersEventMap>(
    target: EventTarget, type: K, handler: (event: GlobalEventHandlersEventMap[K]) => void
  ) => {
    target.addEventListener(type, handler as EventListener);
    off.push(() => target.removeEventListener(type, handler as EventListener));
  };

  // Edit mode never runs the loop's camera.update, so each gesture
  // rebuilds the view itself; an orbit without it would change nothing.
  const settle = () => { camera.update?.(0); changed(); };

  // --- The eye's frame, for flying and panning ----------------------------

  const forward3 = () => {
    const p = camera.position!;
    const l = camera.lookAt!;
    const d = { x: l.x - p.x, y: l.y - p.y, z: l.z - p.z };
    const n = Math.hypot(d.x, d.y, d.z) || 1;
    return { x: d.x / n, y: d.y / n, z: d.z / n };
  };
  const right3 = () => {
    const f = forward3();
    const n = Math.hypot(f.x, f.z) || 1;
    return { x: -f.z / n, y: 0, z: f.x / n };
  };
  /** Move eye and look-at point together (orbit mode derives the eye from the look-at, so both follow). */
  const translate3 = (dx: number, dy: number, dz: number) => {
    const l = camera.lookAt!;
    l.x += dx; l.y += dy; l.z += dz;
    if (camera.mode === 'free' && camera.position) {
      camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
    }
  };
  /** World units per UI pixel at the look-at depth. */
  const unitsPerPixel = () => {
    const d = camera.distance ?? 10;
    const fov = camera.fov ?? Math.PI / 3;
    const height = camera.height ?? 540;
    return (2 * d * Math.tan(fov / 2)) / height;
  };

  // --- Drags and the wheel -------------------------------------------------

  if (threeD) {
    off.push(game.input.on('drag', (event) => {
      if (event.modifiers?.shift) return;
      const { x: dx, y: dy } = event.delta.ui;
      if (event.buttons & RIGHT_HELD) {
        // Look: turn about the eye, so the eye stays put and the look-at
        // point swings round it at the orbit distance.
        const eye = { ...camera.position! };
        camera.yaw = (camera.yaw ?? 0) - dx * 0.004;
        camera.pitch = Math.min(camera.maxPitch ?? Math.PI / 2 - 0.05, Math.max(camera.minPitch ?? -Math.PI / 2 + 0.05, (camera.pitch ?? 0) + dy * 0.004));
        const d = camera.distance ?? 10;
        const cp = Math.cos(camera.pitch);
        Object.assign(camera.lookAt!, {
          x: eye.x - Math.sin(camera.yaw) * cp * d,
          y: eye.y - Math.sin(camera.pitch) * d,
          z: eye.z - Math.cos(camera.yaw) * cp * d
        });
      } else if (event.buttons & MIDDLE_HELD) {
        // Pan: slide the view across its own plane.
        const k = unitsPerPixel();
        const r = right3();
        translate3(-r.x * dx * k, dy * k, -r.z * dx * k);
      } else {
        camera.orbit?.(-dx * 0.005, dy * 0.004);
      }
      settle();
      event.consume();
    }));
    off.push(game.input.on('scroll', (event) => {
      (camera.zoom as (factor: number) => void)(Math.exp(event.scroll.y * 0.0012));
      settle();
      event.consume();
    }));
  } else {
    off.push(game.input.on('drag', (event) => {
      if (event.modifiers?.shift) return;
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

  // --- Flying ---------------------------------------------------------------

  let rightDown = false;
  let detached = false;
  const held = new Set<string>();
  let frame = 0;
  let last = 0;

  const typing = (target: EventTarget | null) =>
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  /** Whether the viewport is where the keyboard is: the canvas, or nothing in particular. */
  const viewportFocused = () => {
    const active = document.activeElement;
    return !active || active === document.body || canvas.contains(active) || canvas.parentElement?.contains(active) === true;
  };
  const moving = () =>
    (rightDown && [...held].some((code) => FLY_KEYS.has(code))) || [...held].some((code) => ARROW_KEYS.has(code));

  const step = (now: number) => {
    frame = 0;
    if (detached) return;
    // Clamped: a long stall is one step, and a clock that runs backwards is none.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0));
    last = now;
    if (!moving()) return;
    const is = (...codes: string[]) => codes.some((code) => held.has(code));
    const fly = rightDown;
    const ahead = Number((fly && is('KeyW')) || is('ArrowUp')) - Number((fly && is('KeyS')) || is('ArrowDown'));
    const side = Number((fly && is('KeyD')) || is('ArrowRight')) - Number((fly && is('KeyA')) || is('ArrowLeft'));
    const rise = Number((fly && is('KeyE')) || is('PageUp')) - Number((fly && is('KeyQ')) || is('PageDown'));
    const hurry = is('ShiftLeft', 'ShiftRight') ? 3.5 : is('AltLeft', 'AltRight') ? 0.3 : 1;
    if (threeD) {
      const speed = Math.max(1, camera.distance ?? 10) * 1.2 * hurry * dt;
      const f = forward3();
      const r = right3();
      translate3(
        (f.x * ahead + r.x * side) * speed,
        (f.y * ahead + rise) * speed,
        (f.z * ahead + r.z * side) * speed
      );
      settle();
    } else {
      const zoom = typeof camera.zoom === 'number' && camera.zoom > 0 ? camera.zoom : 1;
      const speed = (700 / zoom) * hurry * dt;
      camera.x = (camera.x ?? 0) + side * speed;
      // Up on the keyboard is up on the screen: y runs down in 2D.
      camera.y = (camera.y ?? 0) - (ahead + rise) * speed;
      changed();
    }
    frame = requestAnimationFrame(step);
  };
  const wake = () => {
    if (frame || !moving()) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };

  listen(canvas, 'pointerdown', (event) => {
    if (event.button === RIGHT) { rightDown = true; wake(); }
  });
  const release = (event: PointerEvent) => { if (event.button === RIGHT) rightDown = false; };
  listen(window, 'pointerup', release);
  listen(window, 'pointercancel', release);
  listen(window, 'keydown', (event) => {
    if (typing(event.target)) return;
    const flyKey = FLY_KEYS.has(event.code) && rightDown;
    const arrow = ARROW_KEYS.has(event.code) && viewportFocused();
    if (!flyKey && !arrow && !/^(Shift|Alt)(Left|Right)$/.test(event.code)) return;
    held.add(event.code);
    if (flyKey || arrow) { event.preventDefault(); wake(); }
  });
  listen(window, 'keyup', (event) => { held.delete(event.code); });
  listen(window, 'blur', () => { held.clear(); rightDown = false; });

  return {
    detach() {
      detached = true;
      held.clear();
      rightDown = false;
      for (const un of off) un();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
    get flying() { return rightDown; }
  };
}
