# Sprites and animation

Artwork comes from sprite sheets. A sheet is one image divided into equal frames. Scenes declare sheets under `assets.spritesheets`, and prefabs name the sheet they draw with.

<Demo name="sprites">
A four-frame walk cycle and a ground tile, both drawn into canvases at startup and loaded as sprite sheets. The walker steps its frames, flips to face its direction and the tile repeats across the world as the background.
</Demo>

```json
{
  "assets": {
    "spritesheets": {
      "player": {
        "url": "assets/player.png",
        "frameWidth": 32,
        "frameHeight": 32,
        "animations": {
          "idle": { "frames": [[0, 0]] },
          "run": { "frames": [[1, 0]] },
          "jump": { "frames": [[2, 0]] }
        }
      }
    }
  },
  "prefabs": {
    "player": { "actor": "Player", "spritesheet": "player", "defaultAnimation": "idle" }
  }
}
```

`url` is resolved against the engine's `basePath` option. The example games derive `basePath` from Vite's `BASE_URL`, so the same scene JSON works on the dev server and on the published site without naming either path.

A frame is addressed by its column and row, `[tileX, tileY]`, counted from the top-left of the image. A sheet without `animations` gets one animation named `default` at frame `[0, 0]`.

## Choosing a frame

`entity.setAnimation(name)` selects an animation. The base `Entity.draw` draws its current frame tiled across the body's size, rotated with the body.

```javascript
onMove(dx) { this.setAnimation(dx !== 0 ? 'run' : 'idle'); }
```

An animation with several `frames` and an `fps` plays itself: `Entity.update` advances `animTime`, `animFrame` is the frame to show, and `setAnimation` restarts the cycle when the name changes (pass `{ restart: true }` to restart it anyway). `loop: false` holds the last frame, for a death or a swing.

```json
"run": { "frames": [[4, 0], [5, 0], [6, 0], [7, 0]], "fps": 12 },
"die": { "frames": [[20, 0], [21, 0], [22, 0]], "fps": 8, "loop": false }
```

A sheet with eight facings names them `run_down`, `run_down_right` and so on (the names are `DIRECTIONS_8` in `core/math.js`), and `setDirectionalAnimation('run', angle)` picks the one for an angle, falling back to the nearest cardinal and then to plain `run`. The `ObliquePlayer` and `Npc` actors do this every frame.

A character's frame is usually its drawn size rather than a tile to repeat, so those actors set `spriteFit`, which stretches one frame to the entity's size instead of tiling it.

The legacy contract still holds for single-frame animations: the sheet's `currentFrame` is added to the frame's column when drawing, so an actor can step `sprite.currentFrame` itself.

```javascript
update(deltaTime) {
  super.update(deltaTime);
  const frameCount = Math.floor(this.sprite.image.width / this.sprite.tileW);
  this.animTime = (this.animTime + 6 * deltaTime) % frameCount;   // 6 frames per second
  this.sprite.currentFrame = Math.floor(this.animTime);
}
```

When `frames` lists several pairs without an `fps`, the first pair shows.

## Drawing a sprite directly

<Demo name="sprites-draw">
One four-frame sheet drawn eight ways through the renderer: a single frame, flipped, rotating, scaled, animated at six frames per second, tinted, fading and layered. The tint column shows the sheet unchanged on the Canvas backend, which lacks the capability.
</Demo>

`sprite.draw(animation, x, y, options)` draws one frame centred on a point. The options are passed to the renderer's `drawSprite`, so `width`, `height`, `rotation`, `flipX`, `flipY`, `globalAlpha` and `tint` all apply.

```javascript
this.sprite.draw('idle', x, y, { flipX: this.facingDirection < 0, width: 48, height: 48 });
```

For a sheet that is not tied to an entity, call the renderer with the image.

```javascript
game.renderer.drawSprite({ image, x, y, tileX: 2, tileY: 0, tileWidth: 32, tileHeight: 32, rotation: 0.4 });
```

## Backgrounds

A level's `background` tiles one frame across the whole world behind everything else. The world size comes from the `worldWidth` and `worldHeight` engine options. The grid step is `frameWidth` on both axes, so use square frames.

```json
{ "background": { "spritesheet": "tiles", "tileX": 0, "tileY": 0 } }
```

## Pixel art

Set `worldFilter: 'nearest'` so the world stays blocky when the render resolution is below native. See [World filter](./display#world-filter).

## Where the demos' art comes from

The example games ship committed textures and sprites, free open packs (CC0 and CC BY) credited in the repository's `THIRD_PARTY_NOTICES.md`, with living characters and effects drawn in code through the renderer. Only the renderer showcase generates images, for its batching stress test, via `examples/scripts/generateSprites.js` (the dev server runs it for anything missing). See [Adding a demo](../contributing/adding-a-demo#assets).

## Demo sources

A sheet URL can be anything an image element loads, including a data URL. Both demos build their sheets with the Canvas 2D API at startup.

The walker:

<<< @/demos/sprites.js

The drawing grid:

<<< @/demos/sprites-draw.js
