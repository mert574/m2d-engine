import { describe, it, expect } from 'vitest';
import { audit, type SceneInput } from '../src/index.ts';

const scene = (path: string, name: string, data: Record<string, unknown>): SceneInput => ({
  path, name, data: { version: 4, type: 'level', name, ...data }
});

const project = (): SceneInput[] => [
  scene('scenes/town.json', 'town', {
    world: { rules: [{ when: { event: 'start' }, then: [{ do: 'switch', scene: 'cave' }] }] },
    assets: { spritesheets: { tiles: { url: 'art/tiles.png', frameWidth: 16, frameHeight: 16 } } },
    prefabs: {
      wall: { actor: 'Wall', spritesheet: 'tiles', physics: { bodyType: 'static' } },
      ghost: { actor: 'Wall', physics: { bodyType: 'static' } }
    },
    paths: { beat: { points: [{ x: 0, y: 0 }, { x: 9, y: 0 }] }, idle: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } },
    layers: [{ name: 'main', objects: [
      { id: 'wall-1', prefab: 'wall', x: 0, y: 0, constraints: { patrol: { type: 'PathFollow', params: { path: 'beat' } } } }
    ] }]
  }),
  scene('scenes/cave.json', 'cave', {
    assets: { models: { rock: { url: 'models/rock.glb' } } },
    world: { dimensions: 3, environment: 'dawn' },
    prefabs: { rock: { actor: 'Wall', physics: { bodyType: 'static' }, mesh: { model: 'rock', texture: { url: 'tex/rock.png', normal: 'tex/rock-n.png' } } } },
    layers: [{ name: 'main', objects: [{ id: 'rock-1', prefab: 'rock', x: 0, y: 0, z: 0 }], scenes: [{ id: 'town-1', scene: 'town', x: 0, y: 0, z: 0 }] }]
  })
];

/** The engine's registries, enough for params and properties to resolve. */
const game = async () => {
  const { M2D } = await import('m2d-engine/core/m2d.js' as string) as { M2D: new (c: null, o: object) => unknown };
  const { initPhysics } = await import('m2d-engine/core/physics/index.js' as string) as { initPhysics: () => Promise<void> };
  await initPhysics();
  return new M2D(null, { headless: true, worldWidth: 100, worldHeight: 100, seed: 1 });
};

describe('references through the schema walk', () => {
  it('finds every scope without knowing where the format keeps them', async () => {
    const refs = audit.references(project(), await game());
    const scopes = (scope: string) => refs.filter((ref) => ref.scope === scope).map((ref) => `${ref.name}@${ref.at}`).sort();
    expect(scopes('prefab')).toEqual(['rock@layers[0].objects[0].prefab', 'wall@layers[0].objects[0].prefab']);
    expect(scopes('path')).toEqual(['beat@layers[0].objects[0].constraints.patrol.params.path']);
    expect(scopes('scene')).toEqual(['cave@world.rules[0].then[0].scene', 'town@layers[0].scenes[0].scene']);
    expect(scopes('spritesheet')).toEqual(['tiles@prefabs.wall.spritesheet']);
    expect(scopes('environment')).toEqual(['dawn@world.environment']);
  });

  it('answers where one thing is used', async () => {
    const uses = audit.usesOf(project(), 'scene', 'town', await game());
    expect(uses).toEqual([{ scene: 'scenes/cave.json', scope: 'scene', name: 'town', at: 'layers[0].scenes[0].scene' }]);
  });
});

describe('the project audit', () => {
  it('flags missing files, unused files, unused prefabs and paths, and counts scene uses', async () => {
    const result = audit.auditProject(project(), ['art/tiles.png', 'tex/rock.png', 'music/theme.ogg'], await game());
    expect(result.missingFiles.map((use) => `${use.url}@${use.scene}`).sort()).toEqual([
      'models/rock.glb@scenes/cave.json', 'tex/rock-n.png@scenes/cave.json'
    ]);
    expect(result.unusedFiles).toEqual(['music/theme.ogg']);
    expect(result.unusedPrefabs).toEqual([{ scene: 'scenes/town.json', prefab: 'ghost' }]);
    expect(result.unusedPaths).toEqual([{ scene: 'scenes/town.json', path: 'idle' }]);
    expect(result.sceneUses.sort((a, b) => a.scene.localeCompare(b.scene))).toEqual([
      { scene: 'scenes/cave.json', to: 'town', count: 1 },
      { scene: 'scenes/town.json', to: 'cave', count: 1 }
    ]);
  });
});
