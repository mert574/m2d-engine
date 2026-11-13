# Idiomatic m2d

How games are written on m2d: every example, docs demo and template, and the yardstick for new engine features. The project moving the shipped games onto it is [[idiomatic-examples]].

## The shape

Code is only:

- **Actors** (entity classes): behaviour and drawing.
- **Constraints**: reusable behaviours an actor attaches, tuned through `static params`.
- **Net intents**: the discrete requests a player's UI makes.
- **The definition** (`game.js`): `register(game)` registers the above and does nothing else.
- **The page** (`main.js`): `bootProject` and nothing else. The opening scene, display and input actions are `m2d.project.json`'s.

Everything else is scene data, which the editor and MCP can read and change:

- placement, prefabs, tile layers and paths;
- camera, lighting, post, the day/night cycle, sounds and music;
- the HUD, and menus as UI scenes;
- flow and outcomes as `world.rules`, with counters for what is counted;
- keys as named actions (`input.actions` in the project): rules and code read an action, never a raw key code.

Use the engine's helpers (Quest, Npc, the UI components) before writing your own. Something another game could want becomes an engine feature, not demo code. A hook keeps only what has no data form, and says why.

## Tunables

- An actor's own numbers (speeds, ranges, cadences, flags such as `sealed`) are declared `static properties`, never module constants.
- Numbers an actor passes to the constraints it attaches (chase speed, contact damage, thrust) stay where it attaches them. The editor's Running constraints card shows them and retunes them by slot.
- One number read in two places (a radius for the prompt and for the server) is one property both read.
- Drawing constants internal to a look (a glow radius, a reed count) don't need declaring.

## Not idiomatic

- hooks that set the camera, light, audio or UI;
- `instanceof` lookups in hooks;
- sidecar layout files next to scenes;
- boot code beyond the generic boot.
- **Levels generated at run time.** Shipped maps are prewritten scene files. A layout script may seed a scene once; after that the JSON is the source. A generated level can't be opened or saved in the editor.
- **Custom ticks that skip a constraint.** Use `Constraint.suspended`. Hollow Grove's hand-written ticks still moved "frozen" walkers and ticked cooldowns and health twice a tick.

## Where it bends

- **The renderer showcase** stays a code-driven director. It is the backend comparison harness and needs an identical load on every backend. It should still show off as much of the engine's visual range as it can, and it is the one place art may be generated (see [[demo-standards]]).
- **Docs demos** are single-file snippets, not projects, but still idiomatic. A page that teaches a raw API (the game loop, timers, draw calls) uses code for that API only.

Related: [[code-style]], [[demo-standards]], [[working-style]]
