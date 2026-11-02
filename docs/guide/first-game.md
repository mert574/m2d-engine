# Your first game

This page builds a small platformer. A hero walks and jumps between platforms and a settings menu is available throughout. Four files, under a hundred lines of code.

<Demo name="first-game" aspect="16 / 9">
Click the canvas to give it keyboard focus. Arrow keys move, Space jumps, O opens the settings menu. Falling off the bottom ends the game. R restarts.
</Demo>

The files below are the demo's source. Create them in a Vite project as set up in [Getting started](./getting-started), or in a new folder under `examples/src/` in the repository.

## The page

The canvas fills the window. The engine sizes its drawing buffer from the element's displayed size. The page imports `start` from `main.js` and hands it the canvas.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>First game</title>
  <style>
    html, body { margin: 0; height: 100%; background: #222; }
    #screen { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <canvas id="screen"></canvas>
  <script type="module">
    import start from './main.js';
    start(document.getElementById('screen'));
  </script>
</body>
</html>
```

## The hero

An actor extends `Entity`. The constructor receives the physics body the scene created for it, the sprite sheet named by its prefab, the engine instance and the `properties` object from the scene JSON.

This hero has no sprite, so it draws itself as a rectangle. Movement comes from the `KeyboardControl` constraint, which reads the arrow keys and sets the body's velocity. The jump handler checks for ground contact first.

<<< @/demos/first-game/hero.js

`renderPosition` is the body position blended between physics steps. Use it when drawing. Use `position` for game logic.

## The level

A level scene declares prefabs and places them. The hero is a `character` body, which slides along walls and never rotates. Platforms are `static` and use the built-in `Platform` actor, which draws its sprite tiled over its size.

The tile is a 32 by 32 image. Here it is an inline SVG so the demo needs no image file. A game points `url` at a PNG next to its scene files.

<<< @/demos/first-game/level1.json

Positions are the centre of each object, in world units. The loader rejects unknown fields and references to prefabs, sprite sheets or actors that do not exist, so a typo fails at load with the path to the field.

## Wiring it together

`main.js` compiles the physics module, creates the engine, registers the actors the scene names, registers the scene, mounts the settings menu and starts the loop. A menu would be a second scene of `"type": "ui"`. [Scenes](./scenes) shows one.

<<< @/demos/first-game/main.js

`performanceStats: false` is there because the game runs inside this page. A full-page game can drop it.

## Where to go next

- [Scenes](./scenes) covers the scene format, lifecycle hooks and switching.
- [Entities and constraints](./entities) covers actor lifecycle and reusable behaviour.
- [Physics](./physics) covers body types, units and queries.
- [Sprites and animation](./sprites) adds artwork to the hero.
