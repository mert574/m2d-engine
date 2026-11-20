// Test helpers for code built on the engine: a game with a recording
// renderer and no canvas, simulated input, and the DOM stubs a headless
// test needs. `m2d-engine/testing/setup` is a Vitest setup file that
// compiles the physics module once per worker. Loading this entry needs
// `vitest` and, outside a browser, `@napi-rs/canvas`.
export { makeTestGame, makeBody, expectBalancedStacks } from './testing/testGame.js';
export { RecordingRenderer } from './testing/recordingRenderer.js';
export {
  createCanvasElement, installWindowStub, readCanvas2DPixels, readWebGLPixels, displayCanvas, setDisplaySize, stubDocumentListeners
} from './testing/environment.js';
export {
  resetInputClock, advanceInputClock, pointerAtClient, pointerMove, pointerDown, pointerUp, click, drag, scroll,
  keyDown, keyUp, holdKeys, releaseKeys
} from './testing/input.js';
