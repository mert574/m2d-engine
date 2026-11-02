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

`url` is resolved against the engine's `basePath` option. The example games set `basePath` to their deployed folder so the same scene JSON works in development and on the published site.

A frame is addressed by its column and row, `[tileX, tileY]`, counted from the top-left of the image. A sheet without `animations` gets one animation named `default` at frame `[0, 0]`.

## Choosing a frame

`entity.setAnimation(name)` selects an animation. The base `Entity.draw` draws its current frame tiled across the body's size, rotated with the body.

```javascript
onMove(dx) { this.setAnimation(dx !== 0 ? 'run' : 'idle'); }
```

The engine does not advance frames on a timer. An animation records a base frame, and the sheet's `currentFrame` is added to its column when drawing. An actor that wants a multi-frame animation steps `sprite.currentFrame` itself in `update`.

```javascript
update(deltaTime) {
  super.update(deltaTime);
  const frameCount = Math.floor(this.sprite.image.width / this.sprite.tileW);
  this.animTime = (this.animTime + 6 * deltaTime) % frameCount;   // 6 frames per second
  this.sprite.currentFrame = Math.floor(this.animTime);
}
```

When `frames` lists several pairs, the last pair becomes the base frame.

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

## Generated placeholder art

Image files are not committed to the repository. The example games draw their sprites with scripts under `examples/scripts/`, run by `npm run generate-sprites`. A new example that needs placeholder art adds a generator there.

## Demo sources

A sheet URL can be anything an image element loads, including a data URL. Both demos build their sheets with the Canvas 2D API at startup.

The walker:

<<< @/demos/sprites.js

The drawing grid:

<<< @/demos/sprites-draw.js
