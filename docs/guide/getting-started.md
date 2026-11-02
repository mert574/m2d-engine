# Getting started

M2D is a 2D game engine for the browser. It simulates physics with Rapier 2D, draws with WebGL2 or Canvas 2D, loads levels and menus from JSON and reads keyboard, mouse, touch and pen through one input API.

## Install

The engine is published on npm as [`m2d-engine`](https://www.npmjs.com/package/m2d-engine). It ships as ES modules and is meant to be used with a bundler. This documentation uses Vite.

```bash
npm create vite@latest my-game -- --template vanilla
cd my-game
npm install m2d-engine
npm run dev
```

Physics is a WebAssembly module that `initPhysics()` loads at runtime. No bundler configuration is needed. The examples use top-level `await`, which Vite 7 and later build by default. On an older Vite, set `build.target` to `es2022` or wrap the startup in an async function.

## A minimal game

<Demo name="hello">
Three balls and a floor. Click to drop more.
</Demo>

A game has three kinds of pieces.

- **Actors** are classes that extend `Entity`. Each owns a physics body and decides how it moves and draws.
- **Scenes** describe a level or a menu. A level scene lists prefabs and places them in layers. A prefab names an actor and its physics settings.
- **The engine instance** owns the canvas, the physics world, the camera, the input system and the scene manager. It runs the game loop.

The demo above is this file:

<<< @/demos/hello.js

The page gives the canvas a CSS size and calls `start`. The engine reads the displayed size, tracks the device pixel ratio and fullscreen changes and letterboxes inside the element.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>My game</title>
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

One option in the demo exists because it runs inside a documentation page. `performanceStats: false` hides the frame-rate readout every scene adds by default.

## Next

[Building](./building) covers the production build. [Your first game](./first-game) builds a playable platformer with a keyboard-controlled hero, a level file and a menu. The rest of the guide covers each system on its own.

The engine's own repository, with the example games and this site, is described in [Contributing](../contributing/).
