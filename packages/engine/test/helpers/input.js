/**
 * Driving `game.input` from tests.
 *
 * Nothing here synthesizes DOM events. Records are pushed through the same
 * public seam a virtual joystick or a replay would use
 * (`InputManager.push`), so these helpers exercise the real queue, the real
 * gesture recognizers and the real router — only the DOM is missing.
 *
 * Positions are given in **UI units**, the space UI elements live in, and
 * converted to the client coordinates a browser would have reported.
 */

const NO_MODIFIERS = { shift: false, ctrl: false, alt: false, meta: false };

/** Monotonic clock for synthesized events, in ms. */
let clock = 1000;

/** Reset the synthetic clock between tests that care about timing. */
export function resetInputClock(value = 1000) {
  clock = value;
}

/** Advance the synthetic clock without producing an event. */
export function advanceInputClock(ms) {
  clock += ms;
  return clock;
}

/**
 * UI units -> the clientX/clientY a browser would have reported, inverting
 * what `mapPointer` does. Tests can therefore think in UI coordinates while
 * the engine still does its full letterbox-aware mapping.
 */
function clientFromUI(game, x, y) {
  const viewport = game.viewport;
  const rect = game.canvas.getBoundingClientRect();
  const rectAspect = rect.width / rect.height;
  const backingAspect = viewport.backingWidth / viewport.backingHeight;
  const presentedWidth = rectAspect > backingAspect ? rect.height * backingAspect : rect.width;
  const presentedHeight = rectAspect > backingAspect ? rect.height : rect.width / backingAspect;
  const presentedX = rect.left + (rect.width - presentedWidth) / 2;
  const presentedY = rect.top + (rect.height - presentedHeight) / 2;
  const scale = viewport.backingWidth / presentedWidth;

  return {
    clientX: (x * viewport.uiScale) / scale + presentedX,
    clientY: (y * viewport.uiScale) / scale + presentedY
  };
}

function record(game, kind, x, y, options = {}) {
  const { button = 0, buttons, pointerId = 1, pointerType = 'mouse', modifiers, time } = options;
  return {
    kind,
    pointerId,
    pointerType,
    button,
    buttons: buttons ?? (kind === 'down' || kind === 'move' ? 1 : 0),
    ...clientFromUI(game, x, y),
    movementX: 0,
    movementY: 0,
    scrollX: 0,
    scrollY: 0,
    modifiers: modifiers ?? NO_MODIFIERS,
    time: time ?? clock
  };
}

/**
 * Move the pointer to raw client coordinates and report where the engine
 * decided that was, in every space.
 *
 * Tests of the *mapping itself* have to start from client coordinates,
 * since that is the only thing a browser actually reports.
 *
 * @returns {{ui: {x: number, y: number}, world: {x: number, y: number}}}
 */
export function pointerAtClient(game, clientX, clientY) {
  game.input.push({
    kind: 'move',
    pointerId: 1,
    pointerType: 'mouse',
    button: -1,
    buttons: 0,
    clientX,
    clientY,
    movementX: 0,
    movementY: 0,
    scrollX: 0,
    scrollY: 0,
    modifiers: NO_MODIFIERS,
    time: clock
  });
  game.input.flush();
  return { ui: { ...game.input.pointer.ui }, world: game.input.pointer.world };
}

/** Move the pointer to a UI-space point and deliver it. */
export function pointerMove(game, x, y, options = {}) {
  game.input.push(record(game, 'move', x, y, { button: -1, ...options }));
  game.input.flush();
}

/** Press at a UI-space point. */
export function pointerDown(game, x, y, options = {}) {
  game.input.push(record(game, 'down', x, y, options));
  game.input.flush();
}

/** Release at a UI-space point. */
export function pointerUp(game, x, y, options = {}) {
  game.input.push(record(game, 'up', x, y, { buttons: 0, ...options }));
  game.input.flush();
}

/**
 * A full press-and-release at one point — what a player means by "click".
 * The pointer is moved there first, exactly as a real one would have been,
 * so hover state is correct before the press lands.
 */
export function click(game, x, y, options = {}) {
  pointerMove(game, x, y, options);
  pointerDown(game, x, y, options);
  pointerUp(game, x, y, options);
}

/** Press at one point, move through the rest, release at the last. */
export function drag(game, points, options = {}) {
  const [first, ...rest] = points;
  pointerMove(game, first.x, first.y, options);
  pointerDown(game, first.x, first.y, options);
  advanceInputClock(120);
  for (const point of rest) pointerMove(game, point.x, point.y, options);
  const last = points[points.length - 1];
  pointerUp(game, last.x, last.y, options);
}

/** Scroll at a UI-space point. */
export function scroll(game, x, y, { dx = 0, dy = 0, ...options } = {}) {
  game.input.push({
    ...record(game, 'wheel', x, y, { button: -1, buttons: 0, ...options }),
    scrollX: dx,
    scrollY: dy
  });
  game.input.flush();
}

/** Press a physical key, by code. */
export function keyDown(game, code, options = {}) {
  game.input.push({ kind: 'keydown', code, key: options.key ?? code, time: options.time ?? clock });
  game.input.flush();
}

/** Release a physical key, by code. */
export function keyUp(game, code, options = {}) {
  game.input.push({ kind: 'keyup', code, key: options.key ?? code, time: options.time ?? clock });
  game.input.flush();
}

/** Hold a set of key codes down, as if the player were pressing them. */
export function holdKeys(game, ...codes) {
  for (const code of codes) keyDown(game, code);
}

/** Release every held key. */
export function releaseKeys(game) {
  game.input.keyboard.releaseAll();
}
