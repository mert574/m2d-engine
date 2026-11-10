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
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** The document with defaults applied, when it validated. */
  loaded: Record<string, unknown> | null;
}

/**
 * Check a scene document.
 *
 * @param doc - A parsed scene document
 * @param game - A game whose registries resolve actor, constraint and
 *   scene references; omit for the structural pass
 */
export function validateScene(doc: unknown, game: unknown = null): ValidationResult {
  try {
    const loaded = new SceneLoader(game).load(doc) as Record<string, unknown>;
    return { ok: true, issues: [], loaded };
  } catch (error) {
    const issue = error as { path?: unknown; message?: unknown };
    return {
      ok: false,
      loaded: null,
      issues: [{
        path: typeof issue.path === 'string' ? issue.path : '',
        message: typeof issue.message === 'string' ? issue.message : String(error)
      }]
    };
  }
}
