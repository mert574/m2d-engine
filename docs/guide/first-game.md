# Your first game

This page builds a small platformer. A hero walks and jumps between platforms and a settings menu is available throughout. It is a **project**: a folder the [editor](./editor) opens, with one file that says what the game is, one that defines its cast, its scenes, and a page that boots it. Five files, under a hundred lines of code.

<Demo name="first-game" aspect="16 / 9">
Click the canvas to give it keyboard focus. Arrow keys move, Space jumps, O opens the settings menu. Falling off the bottom ends the game. R restarts.
</Demo>

The quickest way to a project is a template. In the engine's repository, this makes a platformer that runs as it is and opens it in the editor:

```bash
npm run editor new my-game --template 2d --open
```

What follows builds the same shape by hand, file by file, so each is understood. In a Vite project set up as in [Getting started](./getting-started), or in a new folder under `examples/src/` in the repository, create the files below; then `npm run editor my-game` opens the folder, and everything but the hero's code is edited there.

## The project file

`m2d.project.json` is what makes a folder a project. It names the module that defines the game, the scene the game opens on and how it is displayed. The editor reads the same file, so what the page boots and what the editor plays agree.

<<< @/demos/first-game/m2d.project.json

Scenes are the files in the `scenes` folder, each named after its file. `performanceStats: false` is there because the game runs inside this page; a full-page game can drop it. A project may also declare named input actions, which rules fire on and the player rebinds in the settings menu, and the music its menus play. See [The project file](./editor#the-project-file) for every field.

## The level

A level scene declares what the world is like, the prefabs it builds entities from, where they are placed and what is drawn over them. This one is `scenes/level1.json`.

<<< @/demos/first-game/scenes/level1.json

The `world` says how big the level is and how it is seen. The hero is the `player`, which makes it `game.player` and the thing the camera follows, and `"bounds": "world"` keeps the camera inside the level while it does. The hero starts where `spawn-1`, a `SpawnPoint`, stands: a level says where play begins by placing one, and online each player joins at a free one. Falling out of the level ends the game because the level says so: `pit` is a `Trigger` under the world, and the rule `fell` ends the game when the hero enters it. Nothing ends a level that does not say how.

The hero is a `character` body, which slides along walls and never rotates. Platforms are `static` and use the engine's `Prop` actor, which draws its sprite tiled over its size. The tile is a 32 by 32 image; here it is an inline SVG so the demo needs no image file. A game points `url` at a PNG next to its scene files. The `hud` is the overlay drawn over the level: a line of text here, and meters, notices, a minimap or a menu button in a bigger game.

Positions are the centre of each object, in world units. Open the folder in the editor to drag a ledge, add one, or change the gravity, and the file is written for you. The loader rejects unknown fields and references to prefabs, sprite sheets or actors that do not exist, so a typo fails at load with the path to the field.

## The hero

The one thing the file cannot say is how the hero behaves, and that is an actor. An actor extends `Entity`. The constructor receives the physics body the scene created for it, the sprite sheet named by its prefab, the engine instance and the `properties` object from the scene JSON.

This hero has no sprite, so it draws itself as a rectangle. Movement comes from the `KeyboardControl` constraint, which reads the arrow keys and sets the body's velocity. The jump handler checks for ground contact first.

<<< @/demos/first-game/hero.js

`renderPosition` is the body position blended between physics steps. Use it when drawing. Use `position` for game logic.

## The definition

`game.js` registers the cast under the names the scenes use, and nothing else. It never draws, so the editor's checks, a test and a headless server can load it as the page does. The engine's own actors, such as `Prop` and `Trigger`, need no registering.

<<< @/demos/first-game/game.js

## The page

`main.js` boots the project: it compiles the physics module, creates the engine with the project's display options, registers the cast, adds every scene in the folder, mounts the settings menu and starts the loop. A menu would be a second scene file of `"type": "ui"`; the template ships one, and [Scenes](./scenes) shows one.

<<< @/demos/first-game/main.js

The page itself gives the canvas a CSS size and hands it to `start`. The engine sizes its drawing buffer from the element's displayed size.

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

## Where to go next

- [The editor](./editor) covers opening the project, placing objects, the inspector, play mode and building.
- [Scenes](./scenes) covers the scene format, rules, the HUD and switching.
- [Entities and constraints](./entities) covers actor lifecycle and reusable behaviour.
- [Physics](./physics) covers body types, units and queries.
- [Sprites and animation](./sprites) adds artwork to the hero.
