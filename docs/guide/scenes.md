# Scenes

Levels and menus are defined as JSON. Scene files are **validated strictly**
when they load: a wrong version, an unknown field, a prefab naming an
unregistered actor, a button pointing at a scene nobody registered — each
throws a `SceneValidationError` naming the scene and the exact path to the
offending field, rather than half-building the scene and logging as it goes.
Anything not in the schema is an error, including misspellings like
`"anchour"`.

## Level scenes

```json
{
  "version": 1,
  "type": "level",
  "name": "level1",
  "title": "Level 1",
  "gameType": "platformer",
  "world": {
    "gravity": { "x": 0, "y": 1000 }
  },
  "assets": {
    "spritesheets": {
      "player": {
        "url": "path/to/sprite.png",
        "frameWidth": 32,
        "frameHeight": 32,
        "animations": {
          "idle": { "frames": [[0, 0]] },
          "run": { "frames": [[1, 0], [2, 0]] }
        }
      }
    }
  },
  "prefabs": {
    "player": {
      "actor": "Player",
      "spritesheet": "player",
      "physics": {
        "bodyType": "dynamic",
        "friction": 0.1,
        "frictionStatic": 0.5
      }
    },
    "movingPlatform": {
      "actor": "MovingPlatform",
      "spritesheet": "platform",
      "physics": {
        "bodyType": "kinematic",
        "friction": 1
      }
    }
  },
  "layers": [
    {
      "name": "main",
      "objects": [
        {
          "prefab": "player",
          "x": 100,
          "y": 100,
          "width": 32,
          "height": 32,
          "properties": {}
        },
        {
          "prefab": "movingPlatform",
          "x": 200,
          "y": 200,
          "width": 96,
          "height": 32,
          "properties": {
            "path": {
              "points": [
                { "x": 200, "y": 200 },
                { "x": 400, "y": 200 }
              ],
              "speed": 3,
              "waitTime": 1000
            }
          }
        }
      ]
    }
  ]
}
```

The key components:

- **version** — scene format version, currently `1` (a number)
- **type** — scene type (`"level"` or `"ui"`)
- **world** — physics world configuration
- **assets** — sprite and audio assets used in the level
- **prefabs** — reusable entity definitions with physics and sprite properties
- **layers** — groups of game objects with their positions and properties
- **background** *(optional)* — `{ "spritesheet": "tiles", "tileX": 0, "tileY": 0 }`
  tiles one frame across the whole world behind everything else

Objects default to 32×32 when they give no `width`/`height`. Every
cross-reference is checked at load: `object.prefab` against `prefabs`,
`prefab.spritesheet` and `background.spritesheet` against
`assets.spritesheets`, `prefab.defaultAnimation` against that sheet's
animations, and `prefab.actor` against the actors registered with
`game.registerActor`.

### Physics properties

- **bodyType** — `"static"` never moves, `"dynamic"` is driven by the solver,
  `"kinematic"` is driven by game code but still pushes and carries what it
  touches (moving platforms), and `"character"` is for players:
  velocity-driven like a dynamic body, but moved by a character controller
  that slides along walls, never rotates, snaps to the ground and rides
  moving platforms
- **shape** — collider shape: `"box"` (default), `"circle"` (diameter taken
  from the width) or `"capsule"` (the box with rounded ends, which stops
  characters catching on the seams between floor tiles)
- **friction** — surface friction
- **frictionAir** — velocity damping, as a fraction lost per 1/60s
- **lockRotation** — the body can be pushed but never spun; for
  velocity-driven actors whose sprites do not rotate
- **restitution** — bounciness
- **isSensor** — the object triggers collisions without physical response
- **path** — movement path for platforms (points, speed, waitTime, acceleration)
- **angle** (on layer objects, not prefabs) — the instance's rotation in
  radians; a ramp is a tilted platform, placed per object
- **triggers** — actions or events triggered by collision

## UI scenes

A `"type": "ui"` scene holds `elements` instead of layers. Each element has a
`type` (`button`, `text`, `image`, `rect`), a position, an optional `anchor`,
and a `properties` block whose allowed keys depend on the type:

```json
{
  "version": 1,
  "type": "ui",
  "name": "mainMenu",
  "elements": [
    { "type": "rect", "id": "background", "fill": true, "color": "#298ccc" },
    {
      "type": "button", "id": "start", "anchor": "center", "x": 0, "y": -80,
      "properties": { "text": "Start Game", "onClick": "level1", "width": 200, "height": 50 }
    },
    {
      "type": "button", "id": "settings", "anchor": "center", "x": 0, "y": -10,
      "properties": { "text": "Settings", "action": "settings", "width": 200, "height": 50 }
    }
  ]
}
```

A button must have exactly one of `onClick` (switch to that scene, which must
be registered) or `action` (a named behaviour — `settings` opens the settings
overlay, anything else reaches the scene config's `onAction` hook). A button
with neither, or with both, is a load error.

## Loading and switching

Every scene is registered with a `fetch` method that returns the scene
configuration; the scene manager uses it to load scene data asynchronously.

```javascript
game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default,
  onEnter() {
    game.soundManager.playMusic('game');
  }
});
```

The scene configuration:

- Must include a `fetch` method that returns the scene data
- Can include lifecycle hooks: `onEnter`, `onExit`, `onUpdate(deltaTime)`,
  `onDraw(deltaTime)`, `onResize(width, height, viewport)` and
  `onAction(name)` for button actions
- Supports lazy loading through dynamic imports
- Can load data from any async source (files, API, …)
- Is cached after first load for faster scene switching

Fetched data is validated before the scene is built, so a malformed scene
fails with a message naming the field rather than loading half-built.

Switch scenes with:

```javascript
await game.sceneManager.switchTo('sceneName');
```

This unloads the current scene if one exists, loads the new scene using its
`fetch` method, initializes it with assets and entities, and calls its
`onEnter` hook if defined.
