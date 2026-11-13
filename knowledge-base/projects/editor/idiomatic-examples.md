# Idiomatic examples

Goal: Every example and docs demo is written the way m2d means games to be written. No code works around the engine. Part of [[editor]].

## Decisions

The target is [[idiomatic-m2d]], including its rulings on prewritten levels, the showcase and docs demos; menus and quality follow [[demo-standards]]; commits, MCP parity and GPU checks follow [[working-style]].

## Plan

| Phase | Work | Done when |
| --- | --- | --- |
| 0: The bar | Point `adding-a-demo.md` at [[idiomatic-m2d]]. Add `examples/test/idiom.test.js`, which checks every project for an `m2d.project.json`, a clean `audit_project`, no forbidden hook calls, a hook line budget and no `layout.json`. Today's violations start on an allow-list | The test passes with the allow-list. Every later phase shrinks the list |
| 1: Engine, editor, MCP | The general features the examples are missing (list below). Each gets a schema field, an editor field, an MCP tool or field, docs and a test | Every feature is usable from the editor and over MCP |
| 2: The seven editor projects | Ash Row, Salvage Run, Cinder Keep, Hollow Grove, Ember Valley, The Facility, The Yard move onto the phase 1 features (per-project list below) | Each `hooks.js` is gone or lists only allowed exceptions; screenshots match |
| 3: Menus | Every menu becomes its own UI scene in its project, each in a distinct style. `shared/mainMenu.js` goes | No menu is a code screen; no two menus share a layout or selection style |
| 4: The other five examples | Night Circuit, Hedgerow Court, Physics playground and Beeline become editor projects with prewritten scenes. The showcase gains effects | All four open, play and save in the editor; the generators are deleted |
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
| Salvage Run | `layout.json`; the eight hand-loaded sheets (assets plus sheet properties); the boost meter, the minimap and the salvage count (HUD and counters); Escape |
| Cinder Keep | Minimap, ability bar and satchel bar (HUD); `say()` and the stair events (rules on net events); the duplicated simulation wiring in its hooks |
| Hollow Grove | Minimap, ability bar and dialogue (HUD); notices (rules); zoom limits (camera). The quest stays JS on the engine's `Quest`, which is acceptable |
| Ember Valley | The drawn ridge goes to parallax layers plus scatter; fireflies and leaves become 2D particles |
| The Facility | The damage tear (post binding or a listed exception); the sonar as a constraint |
| The Yard | Orbit and zoom (camera), wind (ambience), footsteps (engine constraint), T (input action rule) |

**Phase 3, a direction per menu** (a starting point, not binding): Ash Row as an arcade marquee with a blinking prompt; Salvage Run as a ship console down one edge with scanline selection; Cinder Keep as a torch-lit stone list with an ember cursor; Hollow Grove as a storybook page with ink-in items; Ember Valley as a low centred row over the valley; The Facility as a glitching terminal; The Yard over the live 3D scene in a corner; Night Circuit as a race-start grid; Hedgerow Court as a garden sign; the playground with items as physics blocks; Beeline as a flight path of flowers.

**Phase 4:**

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

## Record

Before this project, 12 Nov 2026: the seven editor projects' light, post, cameras, sounds, music and static HUDs moved into their scenes; Ash Row's waves and Salvage Run's gate became rules; The Facility's floor and lamps became scene data; actor gameplay numbers became declared properties; orphaned assets and prefabs removed.
