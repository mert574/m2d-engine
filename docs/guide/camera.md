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
| `follow` (default) | Eases toward the target. `followAxes: { x, y }` locks an axis, as Ash Row does with y |
| `scroll` | Moves at `scrollVelocity` (render units per second) whatever the target does. `bounds` still apply. Beeline is this |
| `rooms` | Snaps to the centre of the room of `roomSize` (default the view) the target stands in, easing between rooms. Hedgerow Court is this |

```javascript
game.camera.mode = 'scroll';
game.camera.scrollVelocity = { x: 90, y: 0 };
```

The camera moves per frame, on wall time: it is presentation, and simulation code never reads it. An auto-scroller's rules (spawning ahead of the view, despawning behind it, crushing a straggler) track a simulation-side scroll front advanced in `fixedUpdate` at the same velocity, not `getVisibleArea()`. See [Determinism](../contributing/determinism#the-worked-example-an-auto-scroller).

`followRotation` turns the camera with the target: `rotation` eases toward the target body's angle plus `rotationOffset` (default `-π/2`, a +x nose up the screen) at `rotationLerp` (default `0.04`, like `lerp`), along the shorter arc, never faster than `rotationMaxRate` (default 1.2 rad/s; a whole screen turning is the strongest motion a camera makes) and not at all for turns under `rotationDeadband` (0.03 rad).

Camera setup is scene state. When a scene unloads, and when the engine resets the world, `camera.resetConfig()` restores the position and every tunable above to its default: mode, `scrollVelocity`, `roomSize`, the axes, the rotation follow, `lerp`, `bounds`, zoom and rotation. A scene configures the camera it wants in its `onEnter` and cleans up nothing.

## Zoom and rotation

`zoom` magnifies the world about the centre of the view. `1` is native size; `2` shows half as much world at twice the size. `rotation` is the camera's own angle in radians, so the world turns the other way. Both are presentation: the simulation never sees them, and input events still arrive in world coordinates.

```javascript
game.camera.zoom = 1.5;
game.camera.rotation = car.body.angle - Math.PI / 2;   // the road always runs up the screen
```

Both renderer backends apply exactly the camera's `matrix`, a world-to-view affine in the six-number form the renderer's geometry uses, so what `worldToScreen` computes is where a point is drawn. Like every camera setting, zoom and rotation return to their defaults when the scene unloads (see [Modes](#modes)).

## Controls in the scene

A scene's `world.camera` can give the player control of the view, with no code.

```json
"camera": {
  "zoom": 1,
  "wheelZoom": { "min": 0.6, "max": 1.8 },
  "speedZoom": { "out": 0.22, "at": 570 }
}
```

`wheelZoom` zooms with the mouse wheel, between `min` and `max` in 2D and between `minDistance` and `maxDistance` in 3D. `orbitDrag` turns a 3D orbit camera when the player drags. `speedZoom` pulls a 2D view out as the followed object speeds up: by the fraction `out` at `at` px/s and above, easing by `ease`. The wheel sets the zoom the speed pulls out from. All three are detached when the scene leaves. The camera also opens on its target when a scene shows, rather than easing to it from where the last scene left it. See [`world.camera`](../reference/scene-format#world) for every field.

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

## Three dimensions

A game with `dimensions: 3` gets a `Camera3D` as `game.camera`: an eye, a point it looks at and a perspective projection, with two modes.

- `'orbit'` (the default) circles a target at a `distance`, by a `yaw` around the up axis and a `pitch` above the ground. `follow(entity)` sets the target and `targetOffset` lifts the look-at point off its feet; `orbit(deltaYaw, deltaPitch)` and `zoom(factor)` are what a drag and a scroll call. `minDistance`, `maxDistance`, `minPitch` and `maxPitch` bound it and `lerp` eases the look-at point.
- `'free'` leaves `position` and `lookAt` to game code: a flying camera, a first-person view.

`fov` is the vertical field of view in radians, `near` and `far` the clip planes. `forward` and `right` are the view direction flattened to the ground, for steering a character relative to the camera. `resetConfig`, `init`, `follow`, `update` and `resize` are called by the engine as for the 2D camera.

| Method | Converts |
| --- | --- |
| `screenToRay(x, y)` | A view point to a world ray, `{ origin, direction }`; with `game.physics.raycast`, this is picking |
| `screenToWorld(x, y, groundY = 0)` | A view point to where its ray meets the ground plane |
| `worldToScreen(x, y, z)` | A world point to view coordinates, with clip depth in `z` |

`viewProjection`, `view`, `projection` and `inverseViewProjection` are the matrices, as column-major `Float32Array`s, rebuilt by `update`.

## Resizing

The engine calls `camera.resize` when the view size changes. That only happens in the `expand` aspect mode, where a wider display shows more world. Changing the render resolution does not change the view. See [Display and resolution](./display).

## Demo source

<<< @/demos/camera.js
