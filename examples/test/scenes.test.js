import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SceneLoader, SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { gameFor, sceneFiles } from './helpers.js';

/**
 * Every scene the repo ships must satisfy the engine's scene schema, so
 * tightening the validator or editing a scene cannot quietly break an example.
 */

describe('shipped example scenes', () => {
  const files = sceneFiles();

  it('finds the scene files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('$name validates', ({ example, path }) => {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    expect(() => new SceneLoader(gameFor(example)).load(data)).not.toThrow();
  });

  // Migrations exist for documents the engine does not own. A shipped scene
  // left at an older version would validate through its migration and hide
  // whatever the current format now asks for.
  it.each(files)('$name is written at the current scene version', ({ path }) => {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    expect(data.version).toBe(SCENE_VERSION);
  });
});
