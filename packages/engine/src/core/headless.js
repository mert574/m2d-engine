/**
 * The pieces a headless game has in place of its presentation.
 *
 * `new M2D(null, { headless: true })` builds the simulation only: the
 * clock, the seeded generator, physics, entities and scenes. There is no
 * canvas, renderer, camera, UI, world overlay or audio, and the input is
 * whatever a snapshot source feeds it. That is what an authoritative
 * server runs, and what a test that wants the simulation and nothing else
 * can run in plain Node.
 *
 * Presentation is not stubbed out quietly. Each part of it is a guard that
 * throws a named error on first use, so simulation code that reads the
 * camera or asks the renderer something fails on the server, loudly,
 * instead of silently simulating a different game from the clients.
 *
 * Sound is the exception. Simulation code plays sounds as side effects (a
 * footstep, a hit), which is legitimate, and the server simply has no
 * speakers: `SilentSound` accepts every call and does nothing.
 */

import { InputSnapshot } from './input/snapshot.js';
import { SoundManager } from './soundManager.js';

const DOCS = 'docs/contributing/determinism.md';

/**
 * An object that throws on any use, naming what was touched.
 * @param {string} name - How game code reaches it, e.g. `game.camera`.
 */
export function presentationGuard(name) {
  const fail = (what) => {
    throw new Error(
      `M2D headless: ${what} ${name}, which is presentation and does not exist in a headless game. ` +
      `Simulation code must not depend on it; see ${DOCS}.`
    );
  };
  return new Proxy(Object.freeze({}), {
    get(_, key) {
      // Inspection (console.log, util.inspect) and `await` probe these;
      // answering them is not a use.
      if (typeof key === 'symbol' || key === 'then' || key === 'toJSON') return undefined;
      return fail(`read ${String(key)} on`);
    },
    set(_, key) { return fail(`wrote ${String(key)} on`); },
    has(_, key) { return fail(`asked for ${String(key)} on`); },
    apply() { return fail('called'); },
    construct() { return fail('constructed'); },
    ownKeys() { return fail('listed the keys of'); },
    defineProperty(_, key) { return fail(`defined ${String(key)} on`); },
    deleteProperty(_, key) { return fail(`deleted ${String(key)} on`); }
  });
}

/** Every `SoundManager` method, as a no-op. `loop` reports an unknown sound. */
export class SilentSound {}
for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(SoundManager.prototype))) {
  if (name === 'constructor' || typeof descriptor.value !== 'function') continue;
  SilentSound.prototype[name] = name === 'loop' ? () => null : () => {};
}

/**
 * `game.input` without devices. The simulation reads `snapshot`, which a
 * snapshot source fills tick by tick; with no source every tick is empty.
 * The live device API (`isDown`, `on`, the pointer) is presentation and
 * throws, as do the guards.
 */
class HeadlessInputState {
  constructor() {
    this.snapshot = InputSnapshot.empty();
    this.snapshotSource = null;
  }

  /** See `InputManager.setSnapshotSource`. */
  setSnapshotSource(source) {
    this.snapshotSource = source ?? null;
  }

  /** See `InputManager.sample`. */
  sample() {
    const fed = this.snapshotSource?.();
    this.snapshot = fed instanceof InputSnapshot
      ? fed
      : fed ? InputSnapshot.from(fed) : InputSnapshot.empty();
    return this.snapshot;
  }

  // Registration calls that engine lifecycle code makes. With no pointer
  // there is nothing to hit-test, so they have nothing to do.
  setUIContainer() {}
  addInteractive() {}
  removeInteractive() {}
  destroy() {}
}

export function createHeadlessInput() {
  const state = new HeadlessInputState();
  return new Proxy(state, {
    get(target, key, receiver) {
      if (typeof key === 'symbol' || key in target) return Reflect.get(target, key, receiver);
      throw new Error(
        `M2D headless: read game.input.${String(key)}, which reads the live devices. ` +
        `A headless game has none; simulation code reads game.input.snapshot. See ${DOCS}.`
      );
    }
  });
}
