import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SceneLoader } from 'm2d-engine/core/sceneLoader.js';
import { AssetDatabase } from 'm2d-engine/core/assets.js';
import { writeScene, writeManifest } from 'm2d-editor-core';
import { gameFor, sceneFiles, manifestFiles, DEMO_ACTORS, makeGame } from './helpers.js';

/**
 * The canonical writer against every scene and manifest the repo ships —
 * the round-trip the editor plan demands before anything may save a file.
 *
 * Three guarantees, each its own test. Nothing is lost: loading what the
 * writer wrote gives the same scene as loading the original. Writing is
 * stable: formatting the writer's own output changes nothing. And the
 * shipped files *are* the writer's output, byte for byte — the generator
 * scripts emit through it and hand-written scenes were reformatted once —
 * so any save, regeneration or hand edit diffs against the same canonical
 * form. A scene written any other way fails the third test, which is the
 * point: there is one way a scene becomes text.
 */

describe('the canonical writer over shipped scenes', () => {
  const files = sceneFiles();

  it('finds the scene files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('$name loses nothing through write and load', ({ example, path }) => {
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    const written = writeScene(doc);
    const load = data => new SceneLoader(gameFor(example)).load(data);
    expect(load(JSON.parse(written))).toEqual(load(doc));
  });

  it.each(files)('$name writes stably', ({ path }) => {
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    const written = writeScene(doc);
    expect(writeScene(JSON.parse(written))).toBe(written);
  });

  it.each(files)('$name is in canonical form on disk', ({ path }) => {
    const text = readFileSync(path, 'utf8');
    expect(writeScene(JSON.parse(text))).toBe(text);
  });
});

describe('the canonical writer over shipped manifests', () => {
  const files = manifestFiles();

  it('finds the manifests to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('$name loses nothing through write and load', ({ example, path }) => {
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    const written = writeManifest(doc);
    const game = makeGame({ actors: DEMO_ACTORS[example] });
    const load = data => {
      const db = new AssetDatabase();
      db.load(data, { actors: game.actors });
      return { basePath: db.basePath, assets: [...db.assets.entries()] };
    };
    expect(load(JSON.parse(written))).toEqual(load(doc));
  });

  it.each(files)('$name is in canonical form on disk', ({ path }) => {
    const text = readFileSync(path, 'utf8');
    expect(writeManifest(JSON.parse(text))).toBe(text);
  });
});
