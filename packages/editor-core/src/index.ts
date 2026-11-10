/**
 * m2d-editor-core: the headless core of the m2d editor.
 *
 * Everything here runs in Node and in a browser alike — no DOM, which the
 * package's tsconfig enforces by leaving it out of `lib`. The pieces land
 * in the order the editor plan (docs/plans/editor-e0.md) needs them:
 * the canonical writer first, then the scene document, the command/undo
 * model and validation over it.
 */

export { writeScene, writeManifest, write, WriteError } from './writer.ts';
