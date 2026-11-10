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
 * - `validate` — the engine's loader, wrapped into a result.
 *
 * The concrete commands, the project (a folder of scenes and a manifest)
 * and the inspector's schema walk arrive with the phases that need them;
 * see docs/plans/editor-e0.md and the editor phases in the roadmap.
 */

export { writeScene, writeManifest, write, WriteError } from './writer.ts';
export { SceneDocument } from './document.ts';
export { CommandStack, type Command, type Undo } from './commands.ts';
export { validateScene, type ValidationResult, type ValidationIssue } from './validate.ts';
export { sceneOutline, type OutlineNode } from './outline.ts';
export { inspectNode, type InspectedRow, type InspectOptions } from './inspect.ts';
export { descriptorAt, resolveDescriptor, isPlainObject, type PathSegment, type ResolveContext } from './descriptors.ts';
