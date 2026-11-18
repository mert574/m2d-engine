# Idiomatic m2d

How games are written on m2d: every example, docs demo and template, and the yardstick for new engine features. The project moving the shipped games onto it is [[idiomatic-examples]].

## The shape

Code is only:

- **Actors** (entity classes): behaviour and drawing.
- **Constraints**: reusable behaviours an actor attaches, tuned through `static params`.
- **Net intents**: the discrete requests a player's UI makes.
- **The definition** (`game.js`): `register(game)` registers the above and does nothing else; it may export `sceneHooks(game)` with simulation hooks (`onEnter`, `onFixedUpdate`), which the page, the editor's play and a server all run.
- **Scenery actors**: painting of the game's own (a valley's ridges, a street's skyline) is an actor placed in the scene, colliding with nothing, at a low or high `zIndex`. It draws in the editor too, which a draw hook never did. In 3D the engine draws an entity without a `mesh` block as a grey box of its collider, so scenery keeps none (the kit's `Scenery` base does this; a game's own 3D scenery actor must too). Weather, backdrops and ambient sound that any game could want are the kit's scenery actors on the same terms (`ParticleField`, `Sky`, `Scatter`, `AmbientSound`), not world data.
- **Tool actors**: anything a level needs but a player never sees (a trigger, a spawn point, an invisible wall, a dial) declares `static tool = { color, label }`, and the engine draws it as a colour-coded, semi-transparent box in the editor and under `r_showtools` in play. A new invisible actor declares one, or the editor cannot show where it is (18 Nov 2026).
- **The page** (`main.js`): `bootProject` and nothing else. The opening scene, display and input actions are `m2d.project.json`'s.

Everything else is scene data, which the editor and MCP can read and change:

- placement, prefabs, tile layers and paths, and where play starts: a `SpawnPoint` (the player starts at the first free one, and each player joins at one online; never a start position in code);
- camera, lighting, post, the day/night cycle, sound effects and music;
- the HUD, and menus as UI scenes;
- flow and outcomes as `world.rules`, with counters for what is counted. What arrives later (a wave, a reinforcement) is a placed object, `sealed` until a rule unseals it; there is no spawn action. `scene.spawnPrefab` is for what a running thing drops (a dropper, a shot);
- keys as named actions (`input.actions` in the project): rules and code read an action, never a raw key code. Every other device is keys too: an on-screen `UIKeyButton` and a gamepad control each stand for a key code and push it through the keyboard's seam, so nothing downstream knows which device it was (`input.gamepad` maps the pad);
- a player's choices (`choices` in the project: the car, a difficulty), read by the simulation as `player.state.<name>`. Never a cvar: a cvar is a setting, presentation that a headless game and a server have not got;
- which way the view faces, for a character steered relative to it: the tick's `input.heading`, sampled from the camera as the pointer's `world` is, never the camera itself (The Yard's hero read `camera.forward` in its tick and could not run headless).

Use the engine's helpers (Quest, Npc, the UI components) before writing your own. A HUD widget of the game's own is registered with `registerUIComponent` and placed by the scene's `hud`, not added by a hook. Something another game could want becomes an engine feature, not demo code. A hook keeps only what has no data form, and says why.

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
- **Docs demos** are single-file snippets (the first-game walkthrough, a project), still idiomatic: the camera, the world's size, the HUD and its buttons, the controls' actions and what happens when are the scene's. A page that teaches a raw API (the game loop, timers, draw calls, the pointer events) uses code for that API only; a widget the file cannot describe is a registered UI component the scene places.

Related: [[code-style]], [[demo-standards]], [[working-style]], [[engine-surface]] (the engine held to the same shape)
