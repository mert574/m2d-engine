# Camera

`game.camera` decides which part of the world is visible. Its `width` and `height` are the view size in world units, which come from the engine's `width` and `height` options in `letterbox` mode and widen with the display in `expand` mode. The camera's `x` and `y` are the world position at the centre of the view.

<Demo name="camera">
The camera follows a mover through a world larger than the view. Click to turn the bounds off and on. Without them the view shows the space past the world's edge.
</Demo>

## Following an entity

The scene makes the camera follow the entity named `Player`. To follow something else, call `follow`.

```javascript
game.camera.follow(entity);
game.camera.lerp = 0.1;      // fraction of the remaining distance covered per 60 Hz frame. 0.1 is the default
game.camera.target = null;   // stop following
```

`lerp` is specified against a 60 Hz frame and corrected for the actual frame length, so the follow feels the same at 30, 60 and 144 frames per second. `1` snaps to the target, `0` never moves. The engine calls `camera.update(deltaTime)` with wall time, so the camera does not slow down in slow motion; its target already does.

The camera follows the target's `renderPosition`, so it moves as smoothly as the target is drawn.

## A fixed camera

Without a target the camera stays where it is put. A single-screen game centres it on the world.

```javascript
game.camera.x = 480;
game.camera.y = 360;
```

## Bounds

`bounds` keeps the view inside a rectangle. Set them whenever the camera follows something, so neither the follow nor the `expand` aspect mode reveals the space past the edge of the map.

```javascript
game.camera.bounds = { left: 0, top: 0, right: worldWidth, bottom: worldHeight };
```

When the view is larger than the bounded area, the camera centres on that area.

## Coordinate helpers

| Method | Converts |
| --- | --- |
| `worldToScreen(x, y)` | World position to view coordinates, where `(0, 0)` is the top-left of the view |
| `screenToWorld(x, y)` | View coordinates to world position |
| `getVisibleArea()` | The visible world rectangle as `{ left, right, top, bottom }` |
| `isVisible(x, y, width, height)` | Whether a rectangle with its top-left at `x`, `y` intersects the view, grown by `padding`. `padding` defaults to `{ x: 100, y: 100 }` and is set on the camera directly |

Input events already carry world coordinates, and `game.worldToUI(x, y)` maps a world point into UI space. These helpers are for everything else.

## Resizing

The engine calls `camera.resize` when the view size changes. That only happens in the `expand` aspect mode, where a wider display shows more world. Changing the render resolution does not change the view. See [Display and resolution](./display).

## Demo source

<<< @/demos/camera.js
