/**
 * m2d-editor-core: the headless core of the m2d editor.
 *
 * Everything here runs in Node and in a browser alike — no DOM, which the
 * package's tsconfig enforces by leaving it out of `lib`. That is what
 * lets an agent edit a project over MCP with no browser open, and lets
 * the GUI and that agent drive one API.
 *
 * The pieces:
 *
 * - `writer` — the one way a scene becomes text, canonically (E0.3).
 * - `document` — an open scene: its data, its command stack, its text.
 * - `commands` — the command and undo model every edit goes through.
 * - `edits` — the concrete commands: set, insert and remove ops as data.
 * - `validate` — the engine's loader, wrapped into a result.
 *
 * - `outline`, `inspect`, `descriptors` — the tree and the inspector's
 *   rows, from the document and the engine's descriptors.
 * - `structure` — the structural edits (add an entry, rename a prefab,
 *   move a layer) as ops, shared by the GUI and the MCP tools.
 *
 * See knowledge-base/projects/editor/editor-e2.md for how the editor and its host use them.
 */

export { writeScene, writeManifest, write, WriteError } from './writer.ts';
export { SceneDocument } from './document.ts';
export { CommandStack, type Command, type Undo } from './commands.ts';
export {
  applyOps, EditCommand, EditError, uniqueId, formatPath, parsePath,
  type Op, type SetOp, type InsertOp, type RemoveOp, type Edit
} from './edits.ts';
export { validateScene, type ValidationResult, type ValidationIssue } from './validate.ts';
export { sceneOutline, type OutlineNode } from './outline.ts';
export * as rotation from './rotation.ts';
export type { Quaternion, Euler } from './rotation.ts';
export { inspectNode, startingValue, type InspectedRow, type InspectOptions } from './inspect.ts';
export { descriptorAt, resolveDescriptor, isPlainObject, type PathSegment, type ResolveContext } from './descriptors.ts';
export * as structure from './structure.ts';
export * as paths from './paths.ts';
export * as stage from './stage.ts';
export * as look from './look.ts';
export * as audit from './audit.ts';
export type { SceneInput, Reference, Audit } from './audit.ts';
export type { Rest, At, Variant } from './stage.ts';
export type { PointList, PathPoint } from './paths.ts';
export { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
