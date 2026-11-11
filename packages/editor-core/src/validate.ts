/// <reference path="./engine.d.ts" />
/**
 * Validation, which is the engine's job and not this package's.
 *
 * `SceneLoader` is the one validator: the scene format lives in the
 * engine's descriptors and a second implementation here would drift from
 * it within a month. This wraps the loader's throw into a result an
 * editor can render — a list rather than an exception, because an editor
 * shows problems, it does not crash on them.
 *
 * A loader built without a game checks structure and skips every
 * cross-reference it cannot resolve (actors, constraints and scenes come
 * from a registry a running game fills). Pass a game-like object to check
 * those too; see `SceneLoader`.
 */

import { SceneLoader } from 'm2d-engine/core/sceneLoader.js';

/** One problem with a document, at a field path the editor can focus. */
export interface ValidationIssue {
  /** `layers[0].objects[3].id`, or '' for the document itself. */
  path: string;
  /** The problem, without the path: what a row next to the field says. */
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  /** Every problem the loader found, in document order. */
  issues: ValidationIssue[];
  /** The document with defaults applied, when it validated. */
  loaded: Record<string, unknown> | null;
}

/**
 * Check a scene document, reporting every problem rather than the first —
 * see `SceneLoader.check`.
 *
 * @param doc - A parsed scene document
 * @param game - A game whose registries resolve actor, constraint and
 *   scene references; omit for the structural pass
 * @param options - `scenes`: the raw documents of the scenes this one may
 *   instance, by name, so composition expands (see the loader)
 */
export function validateScene(doc: unknown, game: unknown = null, options: { scenes?: Record<string, unknown> } = {}): ValidationResult {
  try {
    const { loaded, issues } = new SceneLoader(game).check(doc, undefined, options);
    return {
      ok: issues.length === 0,
      loaded,
      issues: issues.map((issue) => ({ path: issue.path ?? '', message: issue.detail ?? issue.message }))
    };
  } catch (error) {
    // Not a problem with the document: a bug in a refine or a registry.
    return { ok: false, loaded: null, issues: [{ path: '', message: String((error as Error).message ?? error) }] };
  }
}
