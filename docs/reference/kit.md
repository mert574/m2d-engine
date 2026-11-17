# The kit

`m2d-kit` is the package of ready-to-use pieces for games on m2d: constraints, helpers and, in time, actors and prefabs that are too opinionated for the engine and too reusable to live in one game. The engine keeps the contracts and what its own code names; the kit keeps what games compose from. Every example game is built on both.

Each piece is its own entry, so a game imports what it uses:

```javascript
import { registerEffects } from 'm2d-kit/effects';
import { makeRng, range } from 'm2d-kit/random';
```

The kit touches nothing of the DOM when it loads, so a game's definition may import it on a server as in a browser. What a scene names from it is registered through the kit's own `register…` helpers, which mark the classes as the kit's in the editor's Components tab and in `list_components`.

What belongs in the kit is decided by one test, kept in `knowledge-base/projects/engine-surface/`: two games or a template want it, it declares its properties or params, it works in 2D and 3D or says which, and it ships with its test and this page's row. A piece only one game wants is that game's code.

## `m2d-kit/effects`

Combat visuals. The engine's `Attack` and `DamageFlash` know the rules; what a swing or a hit looks like is the game's, so these are ordinary constraints a scene attaches next to the mechanical ones and tunes to its palette. `registerEffects(game)` registers both under the names below.

| Constraint | Params | Does |
| --- | --- | --- |
| `AttackSwing` | `color` (`#ffffff`; an array is one colour per combo step), `duration` (0.3 s), `reach` (the attack's range), `attack` (the `Attack` slot to follow, `attack`) | A crescent that sweeps across the facing half when the attack starts and fades as it goes. It wraps the attack's `onStart`, so the two stay in step; the centre goes through the scene's projection when there is one |
| `HitBurst` | `color` (`#fff3e6`), `duration` (0.3 s), `radius` (the entity's size) | A flash over the entity and a ring that leaves it, on the `damage` world event `Health` raises — so a hit the server simulated bursts on every client watching. `flash()` fires one by hand |

## `m2d-kit/random`

Deterministic randomness for presentation: backdrops, scenery actors and menus that want their own fixed seed. `makeRng(seed)` is the engine's generator (mulberry32) re-exported; `range(rng, min, max)` draws a float in `[min, max)`. Simulation code draws from `game.rng`, never from here; see [Determinism](../contributing/determinism).

## `m2d-kit/textures`

`tileTexture(renderer, image, rect, tile = 128, options)` tiles a texture over a world rectangle at its natural scale, clipped to the rectangle. `origin: 'world'` (default) aligns the tiling to the world grid so neighbouring rectangles continue each other's pattern; `'rect'` pins it to the rectangle's own corner, which a parallax plane needs. Other options pass through to `drawSprite` (`tint`, `globalAlpha`).

## `m2d-kit/audio`

`audioOption(game)` is the Audio row a game adds to the settings menu with `game.settings.addOption`: one switch for music and effects together, through the engine's mute. A game with volumes of its own adds its own rows.
