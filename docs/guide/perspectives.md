# Perspectives

The engine simulates on a flat plane. A side view and a top-down view are the two ways of looking at that plane the examples have always used; the 3/4 view, isometric and the belt scroller are more. All of them run on the same physics and differ in four things the engine now provides: the order things draw in, the camera transform, layers at different depths and a faked third axis. This page is how to use those; the [roadmap](../contributing/roadmap#perspectives) tracks which perspectives are done.

The [Hollow Grove](../examples/#hollow-grove) example is a 3/4 view built from everything below.

## Draw order

The scene draws tile layers and entities in one ascending order: by `zIndex`, then by `depth`. An entity's `depth` defaults to the bottom edge of its body at the drawn position, its feet. Whatever stands lower on the ground is drawn in front, which is the one rule every 3/4 and isometric game shares, and it comes for free: a character walking up the screen passes behind a tree the moment their feet are above its roots.

`zIndex` is the coarse order. It defaults to `0` for entities and `-1` for the `background` layer, and a scene object can set it:

```json
{ "prefab": "canopyBird", "x": 400, "y": 300, "zIndex": 10 }
```

Pin an entity's depth by assigning it: `this.depth = -Infinity` for ground detail that must draw under every foot, `Infinity` for an effect that must draw over everything at its `zIndex`.

A side-scroller gains little from the feet rule and may prefer scene order. Ask for it in the scene:

```json
"world": { "gravity": { "x": 0, "y": 1000 }, "sort": "insertion" }
```

## Footprints

In a 3/4 view a tree is a trunk you cannot walk through under a canopy you can walk behind. The prefab's `footprint` says which part is solid:

```json
"tree": {
  "actor": "Tree",
  "physics": { "bodyType": "static", "footprint": { "width": 36, "height": 24 } }
}
```

The body becomes a 36 by 24 box at the bottom of the object's rectangle. The entity's `size` stays the object's full size and its `renderPosition` is the centre of that frame, so a `draw` written against `renderPosition` and `size` draws the whole tree while `body.position` and `body.size` are the roots. `depth` is the feet. The same applies to the player: a footprint under a tall sprite means the sprite can overlap a hedge the collider has not reached.

## Elevation

`elevation` is height above the ground, in world units, that the physics never sees. Set it in `fixedUpdate`; `renderPosition` lifts the sprite by it and `depth` ignores it, so a jumping character keeps their place in the draw order and lands where they left. Draw a shadow at `body.renderPosition` and shrink it with `renderElevation` for the effect to read.

```javascript
fixedUpdate(dt) {
  super.fixedUpdate(dt);          // first: it snapshots the previous elevation for blending
  this.lift -= 1500 * dt;
  this.elevation = Math.max(0, this.elevation + this.lift * dt);
}
```

The `ObliquePlayer` actor packages this as a hop on Space, with `isAirborne` for game rules that care.

## Tile layers

`tileLayers` repeat one spritesheet frame across the world, each layer at its own `zIndex` and with its own `parallax`:

```json
"tileLayers": [
  { "name": "ground", "spritesheet": "grass", "zIndex": -1 },
  { "name": "canopyShadows", "spritesheet": "shade", "zIndex": 40, "parallax": 1.12 }
]
```

A layer's parallax is how much of the camera's travel it follows. `1` is pinned to the world. `0` never moves: a sky. `0.5` is a distant hill crossing the screen at half speed. Above `1` the layer is nearer than the ground and outruns it, which is what makes a shadow layer read as high overhead. A layer with a parallax other than `1` repeats across the whole view so it never shows an edge. Tiles outside the view are not drawn.

The scene's `onDrawBackground` hook runs before every layer. Ground detail that has to sit above the floor layer and under the entities is therefore an entity at the floor's `zIndex`, as the grove's paths and flowers are.

## Isometric: a projection on positions

An isometric view is the same flat ground plane seen obliquely. The engine keeps everything the simulation does on that plane and applies a projection only where a position becomes a point on screen. Ask for it in the scene:

```json
"world": { "gravity": { "x": 0, "y": 0 }, "projection": "isometric" }
```

With `"isometric"` (or `{ "type": "isometric", "ratio": 0.5 }`), `game.projection` maps ground `(x, y)` to render `(x - y, (x + y) · ratio)`: a ground square of side `s` draws as a diamond `2s` wide and `s` tall. What changes:

- `Entity.renderPosition` and `renderAnchor` (the feet, with no offsets) are on the render plane; `position`, `velocity` and every physics query stay on the ground.
- `depth` is the projected feet, so the sort rule still holds: whatever is nearer the viewer draws last.
- The camera follows the render anchor and its `bounds` are render-plane; `game.projection.boundsOf(0, 0, worldWidth, worldHeight)` gives the projected extent of the ground.
- Input events and `game.input.snapshot.pointer.world` are on the ground plane, through the inverse projection, so a click lands where it looks like it landed. `game.worldToUI(x, y)` takes ground coordinates. The world overlay takes render-plane coordinates, which is what drawing code already has.
- Tile layers draw each ground tile's sprite centred on the tile's projected centre, at the sprite's size times `scale`, and cull by mapping the view back to the ground. A 64×32 diamond at `scale: 2` covers a 64-unit ground tile. `cells` limits a layer to listed `[column, row]` cells, so a dungeon floor stops at its walls.
- Sprites are isometric art and draw unrotated. An entity whose ground body differs from its drawn size sets `spriteFit` and `spriteSize`: a wall block on a 64×64 footprint drawn as a 128×128 image. Under `spriteFit` the sprite is centred on `renderPosition`, so `renderOffset.y` lifts a block so its base meets its tile.
- `KeyboardControl` with `inputSpace: 'screen'` moves along the screen's axes through the projection, so Up walks toward the top of the view. `PointerMove` walks to a click on the ground.

The [Cinder Keep](../examples/#cinder-keep) example is this: Stone Soup blocks and floors, Flare's hero and creatures, click-to-move and torchlight shadows cast from the blocks' projected diamonds.

## Beat 'em up: a belt projection

A belt scroller is a side view with a depth lane, and that is a projection too: ground x runs along the street, ground y is the depth, and the screen shows depth compressed.

```json
"world": { "gravity": { "x": 0, "y": 0 }, "projection": { "type": "belt", "ratio": 0.5 } }
```

Movement, chasing and the depth sort all run on the flat ground plane, as in the top-down and isometric views; the jump is `elevation`, which rises freely on screen while the collider stays in the lane. The engine's `drawGroundShadow` and `shadowForLift` in `core/renderers/shadows.js` draw the shadow that shrinks as a sprite rises. A flat texture becomes the street with a tile layer's `stretch`, which fits it to each tile's projected box. The camera follows x only (`followAxes`) and each section locks it through `bounds` until the wave is beaten.

The [Ash Row](../examples/#ash-row) example is this.

## Rotating top-down

A twin-stick or space game keeps the player's nose up the screen and turns the world instead. `camera.followRotation` eases `camera.rotation` toward the target body's angle plus `rotationOffset` (default a quarter turn, so a +x nose points up), at `rotationLerp`. Everything else is the plain top-down view: tile layers' parallax and culling work against the rotated view's bounding box, input events arrive in world coordinates as before, and sprites drawn with `renderAngle` turn with their bodies. `ThrustControl` is the matching handling constraint: turn, thrust, reverse and a boost on the tick's input snapshot.

The [Salvage Run](../examples/#salvage-run) example is this.

## 2.5D: parallax planes

Depth in a side view comes from planes that slide at a fraction of the camera's travel: a skyline at a tenth, buildings at half, the play plane at one, and something in front at more than one. Tile layers give this for free through `parallax` (see [Tile layers](#tile-layers)); a plane that is not a repeating tile — a row of varied buildings, props along a kerb — is an entity at the right `zIndex` that draws each element at `q + camera · (1 - parallax)` and culls against `camera.getVisibleArea()`. Ash Row's `Street` and `Foreground` entities are the worked example: five planes from a hazy skyline to the bollards in front of the pavement, all from ambientCG materials.

## Camera modes

`camera.mode` picks how the camera moves: `'follow'` eases toward the target, `'scroll'` moves at `scrollVelocity` regardless of the target (an auto-scroller: the game's spawn and despawn rules track a simulation-side scroll front at the same velocity, never the camera — see [Determinism](../contributing/determinism#the-worked-example-an-auto-scroller)), and `'rooms'` snaps to the room of `roomSize` the target stands in, easing between rooms (a single-screen game with transitions). `followAxes` locks an axis of the follow. A rotating top-down game sets `camera.rotation` from the heading each frame. See [Camera](./camera#modes).

## Camera zoom and rotation

`camera.zoom` magnifies about the view centre and `camera.rotation` turns the world the other way from the camera's own angle. Both are presentation. A top-down game that keeps the heading up the screen sets `rotation` from the player's angle each frame; a 3/4 game lets the wheel set `zoom`. See [Camera](./camera#zoom-and-rotation).

## What each perspective needs

| Perspective | Use | Also needs |
| --- | --- | --- |
| 3/4 oblique | The default depth sort, footprints on anything tall, `elevation` for a hop | Nothing further. The grove is this |
| Isometric | `world.projection`, a diamond tile layer with `cells`, `spriteSize` on blocks, `inputSpace: 'screen'` or `PointerMove` | Nothing further. Cinder Keep is this |
| Beat 'em up | The `belt` projection, `elevation` for the jump, `drawGroundShadow`, `followAxes` and section `bounds` | Nothing further. Ash Row is this |
| Rotating top-down | `camera.followRotation`, `ThrustControl` | Nothing further. Salvage Run is this |
| Auto-scroller | `camera.mode = 'scroll'` with `scrollVelocity` | A simulation-side scroll front for the window's rules; the camera is never read from `fixedUpdate`. Beeline is this |
| Room-based | `camera.mode = 'rooms'` with `roomSize` | Nothing further. Hedgerow Court is this |
