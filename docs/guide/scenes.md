# Scenes

A scene is a JSON document that describes a level or a menu. The engine validates it when it loads, builds entities or UI elements from it and tears it down when another scene takes over.

For the complete list of fields see the [scene format reference](../reference/scene-format).

<Demo name="scenes">
A UI scene and a level scene. Start level switches scenes with a button's onClick. About runs a named action that the scene's onAction hook receives. The level adds a Menu button from code and switches back on its own once the ball reaches the goal.
</Demo>

## Level scenes

A level scene has `"type": "level"`. It declares the assets it needs, the prefabs it builds entities from and the layers that place them.

```json
{
  "version": 1,
  "type": "level",
  "name": "level1",
  "world": { "gravity": { "x": 0, "y": 1000 } },
  "assets": {
    "spritesheets": {
      "player": {
        "url": "assets/player.png",
        "frameWidth": 32,
        "frameHeight": 32,
        "animations": {
          "idle": { "frames": [[0, 0]] },
          "run": { "frames": [[1, 0]] }
        }
      },
      "tiles": { "url": "assets/tiles.png", "frameWidth": 32, "frameHeight": 32 }
    }
  },
  "background": { "spritesheet": "tiles", "tileX": 0, "tileY": 0 },
  "prefabs": {
    "player": {
      "actor": "Player",
      "spritesheet": "player",
      "defaultAnimation": "idle",
      "physics": { "bodyType": "dynamic", "friction": 0.1 }
    },
    "platform": {
      "actor": "Platform",
      "spritesheet": "tiles",
      "physics": { "bodyType": "static", "friction": 1 }
    },
    "lift": {
      "actor": "MovingPlatform",
      "spritesheet": "tiles",
      "physics": { "bodyType": "kinematic", "friction": 1 }
    }
  },
  "layers": [
    {
      "name": "main",
      "objects": [
        { "prefab": "player", "x": 100, "y": 100 },
        { "prefab": "platform", "x": 200, "y": 300, "width": 320, "height": 32 },
        { "prefab": "platform", "x": 480, "y": 240, "width": 96, "height": 16, "angle": 0.3 },
        {
          "prefab": "lift", "x": 600, "y": 200, "width": 96, "height": 16,
          "properties": {
            "path": { "points": [{ "x": 600, "y": 200 }, { "x": 800, "y": 200 }], "speed": 60, "waitTime": 1000 }
          }
        }
      ]
    }
  ]
}
```

| Field | Purpose |
| --- | --- |
| `version` | Always the number `1` |
| `world.gravity` | Gravity in px/s². `{ "x": 0, "y": 1000 }` is a normal downward pull. Use `0` for top-down games |
| `assets.spritesheets` | Images, their frame size and named animations. See [Sprites and animation](./sprites) |
| `background` | One frame of a sprite sheet tiled across the whole world, behind everything else |
| `prefabs` | Named templates. Each names a registered actor and optionally a sprite sheet, a default animation and physics settings |
| `layers` | Groups of placed objects. Each object names a prefab, gives a centre position and optionally a size, a rotation and properties |

Objects default to 32 by 32 when they give no size. `angle` is in radians and belongs to the object, so a tilted platform is placed per instance while the prefab stays reusable.

`properties` is passed to the actor's constructor as its options argument. Built-in actors read specific keys from it. `MovingPlatform` reads `path`. `Trigger` reads `active`, `visible`, `triggers` and `debugColor`. Your own actors read whatever they define.

### Physics settings

The `physics` block of a prefab configures the body the scene creates.

| Key | Values | Default |
| --- | --- | --- |
| `bodyType` | `static`, `dynamic`, `kinematic`, `character` | `dynamic` |
| `shape` | `box`, `circle`, `capsule` | `box` |
| `friction` | Surface friction. `0` falls back to the default | `0.1` |
| `frictionAir` | Velocity damping, as the fraction lost per 1/60 s. `0` falls back to the default | `0.01` |
| `restitution` | Bounciness, 0 to 1 | `0` |
| `lockRotation` | `true` keeps the body from spinning | `false` |
| `isSensor` | `true` reports contacts without a physical response | `false` |

A circle takes its diameter from the object's width. A capsule is the object's box with semicircular ends, which lets a character cross the seams between floor tiles without catching. [Physics](./physics) explains the body types.

## UI scenes

A UI scene has `"type": "ui"` and an `elements` array instead of layers. Element types are `button`, `text`, `image` and `rect`.

```json
{
  "version": 1,
  "type": "ui",
  "name": "mainMenu",
  "elements": [
    { "type": "rect", "id": "background", "fill": true, "color": "#298ccc" },
    { "type": "text", "id": "title", "anchor": "center", "x": 0, "y": -160,
      "properties": { "text": "My Game", "fontSize": "48px", "align": "center", "color": "#ffffff" } },
    { "type": "button", "id": "start", "anchor": "center", "x": 0, "y": -40,
      "properties": { "text": "Start", "onClick": "level1", "width": 200, "height": 50 } },
    { "type": "button", "id": "settings", "anchor": "center", "x": 0, "y": 20,
      "properties": { "text": "Settings", "action": "settings", "width": 200, "height": 50 } }
  ]
}
```

`x` and `y` are offsets from the element's `anchor`. The default anchor is `top-left`, where the offset is an absolute position. A rect with `"fill": true` covers the whole screen at any aspect ratio.

A button has exactly one of `onClick` or `action`. `onClick` names a registered scene to switch to. `action` names a behaviour. The engine handles `settings` by opening the mounted settings menu. Any other action name is passed to the scene's `onAction` hook, and so is `settings` when no menu is mounted. An action that reaches neither logs a warning. A scene switch that fails logs an error.

## Validation

Scenes are checked before anything is built from them. The check covers the format version, the scene type, every cross-reference and every key.

- An object's `prefab` must exist in `prefabs`.
- A prefab's `actor` must have been passed to `game.registerActor`.
- A prefab's `spritesheet` and the `background` sprite sheet must exist in `assets.spritesheets`.
- A prefab's `defaultAnimation` must exist on its sprite sheet.
- A button's `onClick` must name a registered scene.
- Unknown keys are errors, including misspellings such as `"anchour"`. Three places are not checked: the contents of `world`, the keys of a prefab's `physics` other than `bodyType` and `shape`, and an object's `properties`. Sprite sheet contents are checked in level scenes only.

A failure throws `SceneValidationError` with the scene name and the path to the field, for example `Scene 'level1' at layers[0].objects[3].prefab: no prefab named 'platfrom' (declared: player, platform, lift)`.

## Registering and switching

Every scene is registered under a name with a `fetch` function that returns the scene data. The data can come from a dynamic import, a network request or be built in code.

```javascript
game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default,
  onEnter() { game.soundManager.playMusic('game'); },
  onExit() { game.soundManager.stopMusic(); }
});

await game.sceneManager.switchTo('level1');
```

`switchTo` fetches and validates the new scene on first use, then unloads the current scene, builds the new one and calls its `onEnter` hook. A scene that fails validation leaves the current scene running. Fetched data is cached, so switching back to a scene does not fetch it again.

The name `mainMenu` is special in two places. The game-over screen's M key switches to it, and the built-in `Trigger` actor switches to it when the player enters.

### Lifecycle hooks

| Hook | When it runs |
| --- | --- |
| `onEnter()` | After the scene is built and its assets are loaded |
| `onExit()` | Before the scene is unloaded |
| `onFixedUpdate(dt)` | Once per simulation tick, after entities' `fixedUpdate` and before physics steps. `dt` is the fixed tick length in seconds |
| `onUpdate(deltaTime)` | Every frame, after the frame's ticks and after entities' per-frame `update`. `deltaTime` is the frame's game time in seconds |
| `onDrawBackground(deltaTime)` | Every frame inside the world pass, before the background layer and the entities draw, with the camera applied |
| `onDraw(deltaTime)` | Every frame inside the world pass, after entities draw, with the camera applied |
| `onResize(width, height, viewport)` | After the display size or resolution changes |
| `onAction(name)` | When a scene button with an `action` is clicked and the engine did not handle it |

`onFixedUpdate`, `onUpdate`, `onDrawBackground` and `onDraw` are for things that are not entities. A director that spawns waves or a win condition goes in `onFixedUpdate`, so it runs the same at every frame rate. A sky or a particle layer goes in `onUpdate` and the draw hooks. Screen-space drawing does not belong in either draw hook. Add a UI element to the scene instead, as shown in [UI](./ui).

The current scene is available as `game.sceneManager.getCurrentScene()`. Its `ui` property is the container that holds its screen-space elements.

## Demo source

<<< @/demos/scenes.js
