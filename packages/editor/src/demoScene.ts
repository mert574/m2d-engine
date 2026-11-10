/**
 * The built-in demo scene, for `?demo`: the editor with no project to
 * pick. A small sunlit 2D courtyard with enough variety to exercise the
 * panels — prefabs, declared constraints with an override, actor
 * properties, a tile-less background, and ids a tree can show.
 */

import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';

export function demoScene(): Record<string, unknown> {
  return {
    version: SCENE_VERSION,
    name: 'courtyard',
    type: 'level',
    title: 'Editor demo',
    world: { width: 960, height: 540, gravity: { x: 0, y: 900 } },
    prefabs: {
      wall: { actor: 'Wall', physics: { bodyType: 'static', friction: 0.4 } },
      crate: { actor: 'Crate', physics: { bodyType: 'dynamic', friction: 0.6, restitution: 0.1 } },
      ball: { actor: 'Ball', physics: { bodyType: 'dynamic', shape: 'circle', restitution: 0.7 } },
      sensor: { actor: 'Marker', physics: { bodyType: 'static', isSensor: true } }
    },
    layers: [{
      name: 'main',
      objects: [
        { id: 'floor', prefab: 'wall', x: 480, y: 520, width: 960, height: 40 },
        { id: 'wall-left', prefab: 'wall', x: 20, y: 270, width: 40, height: 540 },
        { id: 'wall-right', prefab: 'wall', x: 940, y: 270, width: 40, height: 540 },
        { id: 'ledge', prefab: 'wall', x: 300, y: 360, width: 280, height: 24, angle: 0.08 },
        { id: 'crate-1', prefab: 'crate', x: 620, y: 460, width: 56, height: 56 },
        { id: 'crate-2', prefab: 'crate', x: 620, y: 404, width: 56, height: 56 },
        { id: 'crate-3', prefab: 'crate', x: 676, y: 460, width: 56, height: 56, angle: 0.2 },
        { id: 'ball-1', prefab: 'ball', x: 260, y: 120, width: 40, height: 40 },
        { id: 'ball-2', prefab: 'ball', x: 330, y: 60, width: 28, height: 28 },
        // No size at all: the schema's default (32) applies, which is
        // exactly what the inspector shows muted.
        { id: 'pebble', prefab: 'ball', x: 520, y: 80 },
        { id: 'goal', prefab: 'sensor', x: 860, y: 460, width: 80, height: 80,
          properties: { note: 'the editor cannot know this bag without the actor' } }
      ]
    }]
  };
}
