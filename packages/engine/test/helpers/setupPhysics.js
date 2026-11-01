import { initPhysics } from '../../src/core/physics/index.js';

// Physics is WASM and has to be compiled before any world — and therefore
// before any M2D instance — can exist. Games await `initPhysics()` in their
// entry module; tests get it here, once per worker, so that every suite can
// construct an M2D synchronously without each one repeating the bootstrap.
await initPhysics();
