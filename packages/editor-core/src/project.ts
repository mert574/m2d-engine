/**
 * The project file, `m2d.project.json`, as the editor and an agent edit it:
 * its inspector rows from the engine's `PROJECT_SCHEMA`, an edit as ops
 * checked against that schema, and the canonical text it is written as.
 *
 * A project file is not a scene and has no undo history in the host: an
 * edit either leaves a valid file or is refused whole, naming the field.
 */

import { PROJECT_SCHEMA, projectIssues, sceneNameOf } from 'm2d-engine/core/projectSchema.js';
import { write } from './writer.ts';
import { applyOps, type Op } from './edits.ts';
import { inspectWith, type InspectedRow } from './inspect.ts';
import type { PathSegment } from './descriptors.ts';

export { PROJECT_SCHEMA, sceneNameOf };

/** The inspector's rows for the project file, or one block of it. */
export function inspectProject(data: unknown, path: PathSegment[] = []): InspectedRow[] {
  return inspectWith(PROJECT_SCHEMA, data, path);
}

/** Every problem with a project file, each with the field it is at. */
export function projectProblems(data: unknown): Array<{ path: string; message: string }> {
  return projectIssues(data);
}

/**
 * The project file after `ops`, checked. Throws, changing nothing, when
 * an op cannot apply or the result fails the schema.
 */
export function editProject(data: Record<string, unknown>, ops: readonly Op[]): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  applyOps(next, ops);
  const issues = projectIssues(next);
  if (issues.length) {
    throw new Error(`m2d.project.json: ${issues.map((issue) => `${issue.path || '(file)'}: ${issue.message}`).join('; ')}`);
  }
  return next;
}

/** The project file as canonical JSON text. */
export function writeProject(data: Record<string, unknown>): string {
  return write(data, PROJECT_SCHEMA);
}
