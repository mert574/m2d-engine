# Idiomatic examples

Goal: Every example and docs demo is written the way m2d means games to be written. No code works around the engine. Part of [[editor]].

## Decisions

The target is [[idiomatic-m2d]], including its rulings on prewritten levels, the showcase and docs demos; menus and quality follow [[demo-standards]]; commits, MCP parity and GPU checks follow [[working-style]].

- **Progress is the allow-list.** `examples/test/idiom.test.js` lists each example's departures (`project-file`, `layout-json`, `boot`, `hooks: <camera|ui|audio|look|input|drawing|instanceof|budget>`, `audit`), each line naming the phase that removes it. The test fails on a new departure and on a listed one that is fixed, so the list only shrinks. Hooks get 40 code lines. The showcase is exempt.
- **The audit's unused files are the hooks' art.** Every unused file `audit_project` reports today is art a hook loads in code; moving it into `assets` (sheets, `assets.images`, asset-reference properties) clears the audit line.
- **Notify rules are presentation only.** A rule on `player.notify` runs where the screen is, a client too, so the schema holds it to notice, objective, say, sound, switch and camera. Cinder Keep's stair messages and descent move onto these.
- **The audit counts tracked files only.** A checkout can hold ignored leftovers (an old sprite generator's output, local HDRs) that no project owns; `idiom.test.js` filters `audit_project`'s unused files by `git ls-files`, so one worktree's leftovers cannot fail it.
- **Listed exceptions, accepted for good**: Cinder Keep's satchel and shop screens (its own UI, opened by the `satchel` and `trade` actions) and Hollow Grove's quest with the talking that moves it on (JS on the engine's `Quest`). Each is an `exception:` line in the allow-list, with its reason.
- **The other five examples come before the menus** (phases 3 and 4, swapped 13 Nov 2026). A menu is a UI scene *in a project*, and Night Circuit, Hedgerow Court, the playground and Beeline have no project file until the examples phase makes them one. Doing the menus first would have meant either pulling those four project files forward or leaving four menus behind as code.
- **The project file has no undo.** Its edits (Project tab, `edit_project`) are written at once and refused whole when invalid; it is configuration, not a scene.

## Plan

| Phase | Work | Done when |
| --- | --- | --- |
| 0: The bar | Point `adding-a-demo.md` at [[idiomatic-m2d]]. Add `examples/test/idiom.test.js`, which checks every project for an `m2d.project.json`, a clean `audit_project`, no forbidden hook calls, a hook line budget and no `layout.json`. Today's violations start on an allow-list | The test passes with the allow-list. Every later phase shrinks the list |
| 1: Engine, editor, MCP | The general features the examples are missing (list below). Each gets a schema field, an editor field, an MCP tool or field, docs and a test | Every feature is usable from the editor and over MCP |
| 2: The seven editor projects | Ash Row, Salvage Run, Cinder Keep, Hollow Grove, Ember Valley, The Facility, The Yard move onto the phase 1 features (per-project list below) | Each `hooks.js` is gone or lists only allowed exceptions; screenshots match |
| 3: The other five examples | Night Circuit, Hedgerow Court, Physics playground and Beeline become editor projects with prewritten scenes. The showcase gains effects | All four open, play and save in the editor; the generators are deleted |
| 4: Menus | Every menu becomes its own UI scene in its project, each in a distinct style. `shared/mainMenu.js` goes | No menu is a code screen; no two menus share a layout or selection style |
| 5: Docs demos | The 14 `docs/demos/*.js` and the first-game tutorial use scene data, constraints, rules, HUD and `world.camera`. A page that teaches a raw API keeps code only for that API. `first-game.md` leads with the editor | No demo places the camera, adds static UI or spawns gameplay in code it doesn't teach |
| 6: Close | Rerun the audit and the idiom test with an empty allow-list. Add headless playthroughs and a `test:editor` suite that opens every example. Update the docs | All green; the roadmap line is struck and the record below filled in |

**Phase 1 features**, ordered by how many projects each unblocks:

1. **Project boot**: `m2d.project.json` gains the initial scene, the scene list and display options, read by one `bootProject()`. Every `main.js` shrinks to a few lines and the world size stops being declared twice.
2. **Named input actions** and a rule trigger on an action: Escape to the menu (every project), T to turn the yard's cycle, the playground's gravity. Rebinding in the settings menu.
3. **UI scene richness, for distinct menus**: a menu-item element with style variants, a backdrop element, per-element enter, select and exit effects (motion, stagger, glow, shake), screen transitions chosen in the scene.
4. **HUD completions**:
   - minimap markers keyed by prefab, with colour that changes with a property (e.g. `sealed`), and a target;
   - ability bar and dialogue elements;
   - icons as image assets;
   - text templates over counters (`"{taken} / {total}"`);
   - a meter filled from a constraint's fields.
5. **Rules**: counters, a trigger on game or net events (`emit`), notice duration.
6. **Asset-reference properties**: an actor property that names a sprite sheet or image. This covers Salvage Run's effect sheets and the grove's ground texture.
7. **Camera controls in `world.camera`**: orbit drag, wheel zoom with limits, speed zoom.
8. **Ambience**: looping sounds with fade in `world`. The yard moves to the engine's `Footsteps` constraint.
9. **2D backdrops and particles**: a clear colour, a sky gradient, seeded scatter layers (stars, clouds, motes), 2D particle fields (fireflies, leaves, rain, sparks).
10. **Post bound to a value** (The Facility's damage tear). Optional: it may stay a listed exception.

**Phase 2, per project:**

| Project | What leaves code |
| --- | --- |
| Ash Row | `layout.json`; the camera height (scene camera bounds); the sky fill (clear colour); Escape |
| Salvage Run | `layout.json`; the eight hand-loaded sheets (assets plus sheet properties); the boost meter (`bind.ratio: 'boostCharge'` on `ThrustControl`), the minimap (gate ringed as `target`, colour `by: sealed`) and the salvage count (a `{taken} / {total}` text over tally counters); speed zoom and the opening pose (`world.camera`); Escape |
| Cinder Keep | Minimap, ability bar and satchel bar (HUD); `say()` and the stair events (rules on net events); the duplicated simulation wiring in its hooks |
| Hollow Grove | Minimap, ability bar and dialogue (HUD); notices (rules); zoom limits (camera). The quest stays JS on the engine's `Quest`, which is acceptable |
| Ember Valley | The drawn ridge goes to parallax layers plus scatter; fireflies and leaves become 2D particles |
| The Facility | The damage tear (a `world.postBind` on health); the sonar as a constraint |
| The Yard | Orbit and zoom (camera), wind (ambience), footsteps (engine constraint), T (input action rule) |

**Phase 3:**

- **Night Circuit**: the five maps are baked once into scene files, with each road a closed smooth path and the cones, gates and traffic placed. The radial builder goes. The track draws along the path, and race and replay stay as actors.
- **Hedgerow Court**: the courts are baked once into scene files and `generateMaze.js` goes. The rooms camera moves into `world.camera`.
- **Physics playground**: its scene goes into a file, grab-and-throw becomes an engine constraint, and gravity becomes an input-action rule.
- **Beeline**: the meadow becomes a scene with a scroll camera. Its headless simulation keeps working.
- **Showcase**: stays a code-driven director. New beats show off more of the engine:
  - lights: the day/night cycle, spot lights with 2D shadows;
  - the full post stack: bloom, vignette, blur, colour grade, chromatic aberration;
  - camera shake, zoom and rotation;
  - slow motion;
  - animated sprite sheets and parallax layers;
  - 2D particles from phase 1;
  - UI motion.

Its counters stay comparable between backends.

**Phase 4, a direction per menu** (a starting point, not binding): Ash Row as an arcade marquee with a blinking prompt; Salvage Run as a ship console down one edge with scanline selection; Cinder Keep as a torch-lit stone list with an ember cursor; Hollow Grove as a storybook page with ink-in items; Ember Valley as a low centred row over the valley; The Facility as a glitching terminal; The Yard over the live 3D scene in a corner; Night Circuit as a race-start grid; Hedgerow Court as a garden sign; the playground with items as physics blocks; Beeline as a flight path of flowers.

## Record

- Phase 3, Beeline and Hedgerow Court, 13 Nov 2026: both are editor projects on prewritten scenes. Beeline's lane is `scenes/lane.json`, seeded once by `scripts/buildLaneScene.mjs`: 148 placed things, the scroll camera at the window's pace, the sun going down over the lane as a three-state cycle, the brief and the way home as rules; the parallax planes take their silhouettes from the scene, the bee's readout is a HUD component, and the hive notifies rather than calling back, so the `instanceof` sweep and the whole presentation block in `main.js` are gone. `simulate.mjs` reads the same file, so the headless lane is the one the editor opens. Hedgerow Court's three gardens are `scenes/court*.json`, carved once by `scripts/buildCourtScenes.mjs` (the layout moved to `scripts/courtyards.mjs`, out of the game): the rooms camera, the morning light and grade, the court titles, the tending count and the walk to the next court all scene data; the lawn and sky became a `GardenBackdrop` scenery actor in two layers, and the cast moved to `gardenActors.js`. Engine additions: asset-reference properties resolve a list or a record of refs; `world.camera.scrollVelocity` and `roomSize`.
- Phase 3, the playground, 13 Nov 2026: the physics playground is an editor project. Its machine is `scenes/workshop.json` — the funnel, splitter and peg field as placed parts, the room as a `WorkshopBackdrop` scenery actor in back and front layers, the lamp's light and the film grade as `world.lighting` and `world.post` — and `main.js` is `bootProject`. `MachineRamp`, which guessed what it was from its size, became the `Housing`, `Girder` and `Peg` actors the scene names as prefabs. Engine additions: the `Grabbable` constraint (steers a dynamic body toward the pointer and flings it on release, `removable` for a right-click that takes it out of the world), which the ball and crate prefabs attach; `scene.spawnPrefab(prefab, where)`, so a spawner drops what the scene already describes rather than restating its body; `world.gravityBind`, an axis of gravity that follows a counter, with `min` and `max` on a plain counter to hold it — the playground's gravity is now a counter its action rules turn and its HUD shows. The spout, a sensor the size of the room under everything in the hit test, is what a click on bare room lands on. A camera with nothing to follow now clamps to its bounds, so a single-screen level opens on its world rather than its corner.

- Phase 0, 13 Nov 2026: `examples/test/idiom.test.js` with the allow-list and the audit over every project; `adding-a-demo.md` rewritten around [[idiomatic-m2d]].
- Review of phases 0 to 2, 13 Nov 2026: a scene now releases what its data started before a reload as well as on unload (a game-over restart doubled ambience, camera controls and notify rules); a UI scene's failed or empty exit can no longer wedge scene switching, and the last switch asked for wins; particles split back and front on their defaulted `front`; rain at speed 0 no longer draws NaN; every HUD text takes counter holes; a scene-named minimap target resolves each frame; dialogue hints follow rebinding; plain counters ride snapshots (online they stay at `initial` on a client, documented); notify rules may only follow notify rules; action rules are documented single-player; a malformed project file is refused, not overwritten; projects without actions leave a game's own. With it, a pre-existing lot bug: a moving body's `mesh.texture` is now mapped in its own frame (`webgpu.planar.test.js`).
- Phase 2, 13 Nov 2026: all seven editor projects boot with `bootProject`; Ember Valley, The Facility, The Yard, Ash Row and Salvage Run have no hooks module, Cinder Keep and Hollow Grove keep only their listed exceptions. Ember Valley's painted valley became a scenery actor (`ValleyBackdrop`, back and front layers) with its fireflies and leaves as particles; The Facility's tear became `world.postBind` on the scanner's `tear`, its echo the `Sonar` constraint; The Yard's synthesized sounds were replaced by Owlish footsteps (engine `Footsteps`, now measuring ground speed in x and z in 3D) and Thimras's CC0 wind (`world.ambience`); Ash Row's street textures and Salvage Run's ship, flame, shield and laser art became asset-reference properties; layout.json went from both. Engine additions: HUD `component` (`registerHudComponent`), the definition's `sceneHooks` merged by `bootProject` and editor play (`combineSceneHooks`), minimap `trail` and `area` shapes, dialogue `advance: ''` and `clock: 'game'`, `world.lighting.fallback`. Orphans removed: Ash Row's icons, Salvage Run's unused effects, Cinder Keep's unused icon and floors, Hollow Grove's character sheets; the grove's dead trees, named in Oswin's lines, were placed. Before/after GPU screenshots matched for all seven.
- Phase 1, 13 Nov 2026: every feature listed above, each in the schema, the inspector (schema-driven) and MCP, with docs and tests. Project boot: `m2d.project.json` gains `initialScene`, `display`, `input.actions`, `settings`, `music`, read by `bootProject` (`core/project.js`, schema in `core/projectSchema.js`); a level's `world.width` is the world size; the Project tab and `read_project`/`edit_project`. Named actions (`game.actions`, an `action` rule, Controls in settings). UI scenes: `menuItem` (five variants), `backdrop`, per-element `effects`, scene `transition`, `stagger`, `music`; a switch waits for exits. HUD: `{counter}` texts, meter `bind.ratio` and `full`, minimap `by`, `target`, `players`, `abilityBar`, `dialogue` with a `say` action. Rules: `world.counters` (plain and prefab tallies), `count`, `emit`, `notify` and `action` events, `count` and `say` actions, cycle `toggle`. `assets.images` and asset-reference actor properties. Camera `wheelZoom`, `orbitDrag`, `speedZoom`, and a snap on show. `world.ambience`. 2D `clearColor`, `sky`, `scatter`, particle kinds fireflies, leaves, rain and sparks. `world.postBind`. Both editor templates boot with `bootProject` and no hooks.

Before this project, 12 Nov 2026: the seven editor projects' light, post, cameras, sounds, music and static HUDs moved into their scenes; Ash Row's waves and Salvage Run's gate became rules; The Facility's floor and lamps became scene data; actor gameplay numbers became declared properties; orphaned assets and prefabs removed.
