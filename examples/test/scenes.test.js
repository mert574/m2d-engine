import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { SceneLoader, SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { basename } from 'node:path';
import { sceneFiles, projectGames } from './helpers.js';

/**
 * Every scene the repo ships must satisfy the engine's scene schema, so
 * tightening the validator or editing a scene cannot quietly break an example.
 */

describe('shipped example scenes', () => {
  const files = sceneFiles();

  it('finds the scene files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // Migrations exist for documents the engine does not own. A shipped scene
  // left at an older version would validate through its migration and hide
  // whatever the current format now asks for.
  it.each(files)('$name is written at the current scene version', ({ path }) => {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    expect(data.version).toBe(SCENE_VERSION);
  });
});

// Each shipped project's scenes against the project's own classes — the
// examples and the walkthrough — which is what the game does when it
// boots and what the editor does when it opens one: a property the real
// actor does not declare, or an actor the game never registers, fails here.
describe('each declared game loads its scenes with its own classes', async () => {
  const games = await projectGames();
  const cases = games.flatMap(({ name, game, scenes }) =>
    scenes.map(path => ({ label: `${name}: ${basename(path)}`, game, path })));

  it('finds the declared games', () => {
    expect(games.length).toBeGreaterThan(0);
  });

  // Loaded as a displayed game loads it, so the UI widgets and paintings a
  // scene names are checked too; the headless games here would skip them.
  it.each(cases)('$label', ({ game, path }) => {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const displayed = Object.assign(Object.create(game), { headless: false });
    expect(() => new SceneLoader(displayed).load(data)).not.toThrow();
  });
});

describe('where play starts', () => {
  // The idiom: a level says where play starts by placing a SpawnPoint —
  // where its player starts alone, each player joins online, and a game
  // that builds its own avatar (a race's car) puts it. Only a level with
  // nothing to play as places none.
  const NOTHING_TO_PLAY_AS = new Set(['physics/workshop.json', 'template 3d/level.json', 'template 3d/room.json']);
  const templates = ['2d', '3d'].flatMap((t) => {
    const dir = new URL(`../../packages/editor-host/templates/${t}/scenes/`, import.meta.url);
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ name: `template ${t}/${f}`, path: new URL(f, dir) }));
  });
  const levels = [...sceneFiles(), ...templates]
    .map(({ name, path }) => ({ name, data: JSON.parse(readFileSync(path, 'utf8')) }))
    .filter(({ data }) => data.type === 'level');

  it.each(levels)('$name places a spawn point, or has nothing to play as', ({ name, data }) => {
    const objects = data.layers.flatMap((layer) => layer.objects);
    const places = objects.some((object) => data.prefabs[object.prefab]?.actor === 'SpawnPoint');
    if (NOTHING_TO_PLAY_AS.has(name)) expect(data.world?.player).toBeUndefined();
    else expect(places).toBe(true);
  });
});
