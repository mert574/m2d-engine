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

The camera follows the target's `renderAnchor`: its interpolated feet on the render plane, through the scene's projection, without the visual offsets, so a hop does not bob the view. A bare `{ body }` target is followed by its body's render position.

## A fixed camera

Without a target the camera stays where it is put. A single-screen game centres it on the world.

```javascript
game.camera.x = 480;
game.camera.y = 360;
```

## Modes

`mode` decides how the camera moves each frame.

| Mode | Behaviour |
| --- | --- |
| `follow` (default) | Eases toward the target. `followAxes: { x, y }` locks an axis, as a belt scroller does with y |
| `scroll` | Moves at `scrollVelocity` (render units per second) whatever the target does, for an auto-scroller. `bounds` still apply |
| `rooms` | Snaps to the centre of the room of `roomSize` (default the view) the target stands in, easing between rooms |

```javascript
game.camera.mode = 'scroll';
game.camera.scrollVelocity = { x: 90, y: 0 };
```

`followRotation` turns the camera with the target: `rotation` eases toward the target body's angle plus `rotationOffset` (default `-π/2`, a +x nose up the screen) at `rotationLerp` (default `0.04`, like `lerp`), along the shorter arc, never faster than `rotationMaxRate` (default 1.2 rad/s; a whole screen turning is the strongest motion a camera makes) and not at all for turns under `rotationDeadband` (0.03 rad). The engine resets the mode, the axes and the rotation follow when it resets the world.

## Zoom and rotation

`zoom` magnifies the world about the centre of the view. `1` is native size; `2` shows half as much world at twice the size. `rotation` is the camera's own angle in radians, so the world turns the other way. Both are presentation: the simulation never sees them, and input events still arrive in world coordinates.

```javascript
game.camera.zoom = 1.5;
game.camera.rotation = car.body.angle - Math.PI / 2;   // the road always runs up the screen
```

Both renderer backends apply exactly the camera's `matrix`, a world-to-view affine in the six-number form the renderer's geometry uses, so what `worldToScreen` computes is where a point is drawn. The engine resets zoom and rotation to their defaults when it resets the world.

## Bounds

`bounds` keeps the view inside a rectangle. Set them whenever the camera follows something, so neither the follow nor the `expand` aspect mode reveals the space past the edge of the map.

```javascript
game.camera.bounds = { left: 0, top: 0, right: worldWidth, bottom: worldHeight };
```

When the view is larger than the bounded area, the camera centres on that area. The clamp uses the view at the current zoom, and under rotation the bounding box of the turned view, so neither reveals the void. `update` clamps after the follow; a game that moves the camera itself calls `clampToBounds()`.

## Coordinate helpers

| Method | Converts |
| --- | --- |
| `worldToScreen(x, y)` | World position to view coordinates, where `(0, 0)` is the top-left of the view |
| `screenToWorld(x, y)` | View coordinates to world position |
| `getVisibleArea()` | The visible world rectangle as `{ left, right, top, bottom }`. Under rotation, the bounding box of the turned view |
| `viewExtents()` | The width and height of that rectangle in world units |
| `isVisible(x, y, width, height)` | Whether a rectangle with its top-left at `x`, `y` intersects the visible area, grown by `padding`. `padding` defaults to `{ x: 100, y: 100 }` and is set on the camera directly |
| `matrix` | The world-to-view affine both backends apply |

Input events already carry world coordinates, and `game.worldToUI(x, y)` maps a world point into UI space. These helpers are for everything else.

## Resizing

The engine calls `camera.resize` when the view size changes. That only happens in the `expand` aspect mode, where a wider display shows more world. Changing the render resolution does not change the view. See [Display and resolution](./display).

## Demo source

<<< @/demos/camera.js
