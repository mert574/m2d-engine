# The editor

The editor opens one game's project in the browser. It shows each scene's tree, an inspector built from the engine's schemas and a live viewport running the game's own code. It edits, saves, places assets from the project and from an online library, plays the scene and builds the game into a static site. An AI agent can do the same over MCP, in the same undo history.

## Starting it

```bash
npm run editor examples/src/yard          # open a project
npm run editor new my-game --template 3d  # make one from a template
npm run editor new my-game --open         # make one and open it
```

The editor prints its address and a random port. `PORT=` pins the port. One editor serves one project. Another project is another editor on another port. Run against a folder that is not a project, it lists the projects it finds below it.

| Template | Holds |
| --- | --- |
| `2d` (default) | A small platformer: a hero drawn in code, platforms, a goal |
| `3d` | A sunny blockout: ground, blocks, pillars, a ball and an orbit camera |

A new project runs and builds as it is. `--name` sets its title. The folder must be empty or new.

## The project file

A project is a folder with an `m2d.project.json`.

```json
{
  "name": "My Game",
  "definition": "game.js",
  "initialScene": "menu",
  "display": { "width": 1280, "height": 720 },
  "input": { "actions": { "menu": ["Escape"], "interact": ["KeyE"] } }
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `name` | the folder's name | Shown in the editor's bar |
| `definition` | none | The module that registers the game: exports `register(game)` and may export `GAME`, the M2D options the simulation needs, and `sceneHooks(game)`, each scene's simulation hooks (`onEnter`, `onFixedUpdate`, `onExit`), which a headless server runs too |
| `hooks` | none | The module with each scene's presentation hooks: exports `sceneHooks(game)`, which returns `{ [sceneName]: { onEnter, onShow, onRender, ... } }`. It may also export `OPTIONS`, M2D options the game's look depends on (a `textureFilter`), which the editor applies when it edits and plays and the page spreads into its own options |
| `scenes` | `scenes` | The folder the scene JSON lives in |
| `basePath` | the project folder | What asset URLs in scenes are relative to |
| `initialScene` | none | The scene the game opens on, by its file's name |
| `display` | | `width`, `height` (the design size, 1280 by 720), `aspectMode` (`letterbox` or `expand`), `textureFilter`, `worldFilter` (`linear` or `nearest`), `pointerLock`, `performanceStats`, `clearColor` |
| `input.actions` | none | Named input actions to the key codes that perform them. Rules fire on them and the settings menu rebinds them. See [Named actions](./input#named-actions) |
| `settings` | `true` | Mount the settings menu (O). `{ "pauseWhenOpen": true }` also holds the game still while it is up, which a race or a timed level wants; `false` leaves it out |
| `music` | none | Tracks by key, `{ url, volume }`, loaded at boot for screens that are not scenes |

The definition holds the cast: actors, constraints, intents and the asset manifest. It never draws, so a headless game, a server and the editor's checks can load it. The hooks module holds what shows the game: the camera, lights, HUD and music. The game's page (`main.js`) boots the project with `bootProject`, and the editor's play mode builds the same game. Without a definition the editor draws placeholder actors. Without a hooks module, play runs the bare scene.

```js
import { bootProject } from 'm2d-engine/core/project.js';
import project from './m2d.project.json';
import * as definition from './game.js';

await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' })
});
```

`bootProject(canvas, parts)` checks the project file, initialises physics (and WebGPU for a game whose `GAME` says `dimensions: 3`), makes the game with the project's display, actions, opening scene and music, runs `register`, adds every scene under its file's name with the definition's simulation hooks and the hooks module's presentation hooks (the definition's run first where both name one), mounts the settings menu and starts. `parts` takes `project`, `definition`, `hooks`, `scenes` (path to data or to a loader), `basePath`, `options` (M2D options over the rest) and `setup(game)`, called before the start for what the page adds. The two templates boot this way.

The Project tab shows the file in the inspector, in tabs for the game, display, input and audio. An edit is written at once and refused whole, naming the field, when the file would not be a valid project.

## The window

Drag the edge of the scene tree, the inspector or the dock to resize it. Double-click an edge to reset it. The three buttons at the right of the bar show or hide the tree, the dock and the inspector (Alt+1, Alt+2, Alt+3). Sizes and visibility are kept in the browser.

| Region | Shows |
| --- | --- |
| Bar | The scene picker and its menu (new, duplicate, rename, delete a scene), undo and redo, Save, Play, Build, New project, Snap and Power saving |
| Scene tree | The scene's world, prefabs, layers and objects. Big groups start folded. The filter narrows it. A badge counts the problems under a node. Right-click a node for what can be done with it |
| Viewport | The scene, drawn by the game's own code. Left drag orbits (pans in 2D), right drag looks around, middle drag pans, scroll zooms. Hold the right button and press W A S D to fly, Q and E to sink and rise; the arrow keys and Page Up and Page Down fly too |
| Inspector | The selected node's fields in tabs by concern, every one the schema declares, with defaults shown as placeholders |
| Dock | Tabs for Assets, Components, Problems, History, Console and Build |
| Status line | The last action, the problem count, the drawing mode, the dimension and the scene's path |

## Editing

Click an object in the viewport or the tree to select it. A click lands on what you see: a model's own bounds and a shape's real outline, not a trigger box around them, and a near miss of a few pixels still finds a small thing. The floor and other backdrops are picked only when nothing else is under the pointer. A hidden mesh is picked last.

The gizmo has three modes. Move shows an arm per axis and a square for a free move, which runs along the ground in 3D. Rotate turns a 2D object's `angle`, or a 3D object's `rotation` about the world axes. Scale drags a side's handle to resize that side, or the centre handle to resize every side; the object takes the size as you drag and is rebuilt on release. An object that draws a model scales as a whole, and the model scales with it: its `overrides.mesh.scale` (and `offset`) follow the box, so a model that came in small can be dragged up to size. Snap rounds moves to 8 px or 0.25 m, sizes to the same grid and turns to 15°. Hold Ctrl to invert Snap for one drag. The gizmo hides while the selection is off screen or behind the camera.

Hold Ctrl to add an object to the selection or take it out, in the viewport or the tree; Shift-click in the tree selects the run of objects between. Shift-drag on the viewport draws a marquee that selects every object whose centre it covers. With several selected, every one is outlined, the gizmo sits at their centre and moves them together; a turn or a scale applies to each about its own centre; one undo step per gesture. Delete, Ctrl+D, Ctrl+C and Ctrl+V act on the whole set, and a paste works across scenes (the prefabs must exist there). An Arrange strip appears over the viewport: align to the least, the middle or the greatest on each axis, or distribute evenly. Ctrl+Shift+A selects every object of the selection's prefab.

The inspector sorts a node's fields into tabs: an object's Transform, Object and Overrides; a prefab's Body, Look and Constraints; the world's World, Camera, Look, Rules and Sound. A level's camera, lighting, post effects, lighting cycle, rules, kill plane and music are scene fields, so they are edited here; the lighting and post show in the viewport as you edit them (the cycle at its starting phase), while the camera, the rules and the music run when the scene plays. The HUD is a group in the tree: its texts, meters, notices and minimap are drawn over the level in the viewport, and a meter reads the player's starting health. The tab stays as you step through nodes of the same kind. Within a tab the plain fields come first and each block the scene sets (physics, mesh, a list) is a card with its own fold, add and remove; the blocks the scene leaves out are one row of Add chips at the foot. The inspector writes as you type. Drag a number's label sideways to scrub it (Shift for ten times the step, Alt for a tenth). Angles show in degrees and are stored in radians. A 3D rotation shows as yaw, pitch and roll and is stored as a quaternion. Resizing a model object's Size in the inspector scales it as the gizmo does, and scrubbing a Position or Size label moves or resizes the object on screen as you drag. The × button resets a field to its default or removes a block or list entry.

An object's Object tab ends with **Running constraints**: every constraint the entity carries in the game, the ones its actor attached in code as well as the document's, with the live value of each param. A slot the document does not name has a Retune button, which adds an entry for it so its params can be set above.

Anything the scene format can hold can be made here. A record (prefabs, constraints, sprite sheets, animations, models, environments) has an Add row at the foot of its card: type a name and press Add; a constraints block also asks which type, from the ones the game registers, or none to retune a constraint the actor attached itself. Hover an entry's name for the rename pencil; renaming a prefab, a sheet or a model rewrites every reference to it. A field that may take several shapes (a projection, a parallax, a prop's collider, a UI element's type) has a shape picker beside it. Tuples (a frame, a tile cell) read as a row of cells, and an empty list gains its first item from its template.

## Structure

Right-click in the scene tree. A layer: new layer below, rename, move up or down, delete. An object: frame, duplicate, copy, move to a layer, bring forward or send backward in its draw order, select all of its prefab, make a prefab of it (its overrides folded into a prefab of its own), make a prop instance of it (3D), delete. A prefab: duplicate, rename (carried into every object), select its instances, delete. A sprite sheet: open its animations, rename, delete. The scene itself: new layer, new prefab, and in a 2D level a new tile layer.

A layer's menu also offers **Instance a scene**: another level of the project placed whole (composition), shown in the tree as one node — click any of its objects in the viewport and the instance is what you select; its position, turn and per-object overrides edit in the inspector. The scene picker's menu makes a new 2D level, 3D level or UI scene, duplicates, renames or deletes the current one. Files are made in the project's scenes folder; a rename waits until the scene is saved.

## Props

In a 3D level, a layer's props are scenery placed many times from one prefab — the lot's grass is thousands of instances in a handful of groups. Click one in the viewport to select it: the gizmo moves it along the ground and up, turns it about the up axis (its one ring) and scales it as a whole; the outline follows the drag and the scene's batches rebuild once, on release. Delete and Ctrl+D act on instances too, and a strip over the viewport offers **To object**, which turns the instance into a placed object without moving a pixel — a model's scale rides its overrides — and the object menu's *Make a prop instance* is its inverse, into a group whose size matches or a new one.

Right-click a prop group in the tree for the **brushes**. Scatter plants instances in a circle as you drag — so many per stamp, a random turn, a jittered scale, at the height the group lives at — and Erase takes out every instance of the group the stroke covers. Each stroke is one step of undo. Esc or Done leaves the brush.

## Painting tiles

A 2D level's tile layers paint. Double-click one in the tree (or right-click, Paint…): the grid draws over the world at the layer's tile size — through the projection, so an isometric floor paints on diamonds — and a palette shows the layer's sheet. Pick a tile, then drag to paint; Fill floods the region under the click; Erase clears. A stroke is one step of undo. A cell may carry its own frame, so one layer holds many tiles; a cell painted with the layer's own `tileX, tileY` is written short, as every older document already reads.

## Paths

A level's named `paths` draw over the world as faint dashed lines; click one to select it, or pick it under Paths in the tree. A selected path, and the routes a selected object follows (a named path it or its prefab refers to, or a `points` list of its own), draw solid with a handle on each point, the first one white. Drag a point to move it, double-click the line to add a point there, and Alt-click a point to remove it; a path keeps at least two. Each is one step of undo, and Snap applies to drags. The line drawn is the engine's own, so a smooth path shows the curve a follower travels. New path (on the scene, or the Paths group) lays one across the middle of the view; Rename carries every `path` that names it, and Delete says how many followers use it first.

## Look

The Look tab in the dock holds a level's lighting cycle and particle fields. Edits to the lighting, post effects, cycle or particles redraw in place, without rebuilding the level.

**Cycle.** A strip shows the colours the cycle moves through (ambient, sky, ground, sun and fog, wherever its states set them), from the engine's own blend. Drag the scrubber to preview any phase in the viewport; it writes nothing. Click a state's name to jump to it. Set as start writes the phase shown as `world.cycle.phase`, Add state here inserts the look shown as a new state, and × removes a state, keeping at least two. The start phase stays on the state it named. Back to the document returns the view to the written phase. A level without a cycle offers Start a cycle, two states copied from its resting look.

**Particles.** Each field of `world.particles` shows its count, radius, opacity, speed, glow and colour, with what it leaves out shown at the value it draws with. A slider previews while it is held and writes one step of undo on release. In a 3D level, Add motes and Add smoke place a new field at the camera's target. In a 2D level, Add fireflies, leaves, rain or sparks adds a field over the view, the sliders run in pixels, and In front draws it over the entities.

## Animations

Double-click a sprite sheet in the tree for the animation editor. The sheet draws with its frame grid; click frames to append them to the open animation, nudge them earlier or later, set the fps and whether it loops, and watch the preview, which runs on its own clock (an edited scene never animates). The same dialog slices the sheet: set the frame width and height and the grid follows. Every change is one step of undo, shared with any agent editing beside you.

## UI scenes

A UI scene previews at the game's design size, letterboxed. Right-click the Elements group (or the scene) to add a button, a menu item, a text, an image, a rect or a backdrop, each valid from birth: a button or a menu item arrives with something to do, and a backdrop goes first, behind everything. An element's `effects` and the scene's `transition` and `stagger` play in Play; the edit view shows every element at rest. Click an element to select it; the gizmo moves it by its offsets, resizes the kinds that keep a size (a text measures itself), and the nine anchor points of the screen draw over the view with the element's own filled. Changing the anchor in the inspector moves only the point the offsets measure from — the element stays put. Style fields (a label, a size, a colour, a font) take a literal or a `$token` from the game's theme, offered as completions; changing an element's kind with the shape picker keeps its id, position and anchor. A button's `onClick` names a scene and switches to it in Play; an `action` goes to the scene's `onAction` hook, with `settings` opening the settings menu.

## Components

The Components tab lists every actor and constraint the game registers and every one the engine ships, each with what it does and the fields a scene may set, with their kinds, units and starting values. Filter by name or by what a field is called. With an object or a prefab selected, Attach adds a constraint to it under a free slot. New prefab makes a prefab of an actor and selects it. The engine's own actors and constraints are marked "engine" and can be attached without the game registering them; a scene names them and they load in the game too.

An object edit rebuilds that object in place. Other edits rebuild the scene with the camera held.

Edits are kept by the editor's host until you save — and journaled beside the project (`.m2d/journal/`, ignored by git), so a host that stops and starts again picks them up, history and all, as long as the file is still the one they were made on. Save writes the scene in the canonical form. A scene with a `generator` field is read-only until you detach it from its script.

## View helpers

Four switches on the viewport's toolbar, each with a key. **Grid and axes** (G): a ground grid about the camera's target in 3D — metres, brighter every five — with the X and Z axes through the origin; in 2D a world-unit grid stepped to stay readable at the zoom, through the projection. **Light icons** (L): a bulb at every light the scene carries, an entity's and a prop's; a spot's direction is an arm whose tip drags to aim it, writing the object's `overrides.light.direction`. **Camera** (C): what `world.camera` declares — the bounds it clamps to and the view the player sees at start in 2D, the orbit eye and its target in 3D. **Isolate** (I): only the selection shows, props included in what hides, until I again or the selection is cleared. Shift+1…9 saves the editor's camera for this scene; 1…9 returns to it.

## Layouts

Drag a panel's edge to resize it, double-click to reset, Alt+1/2/3 to hide and show the tree, dock and inspector. The layout menu at the bar's right puts the dock below the viewport or beside it, mirrors the side panels (inspector left, tree right), and saves the whole arrangement under a name in this browser — sizes, what is hidden, the dock's side and tab — to return to in one step, with a reset to the defaults.

## Problems

The editor checks the scene after every change against the game's real classes. Every problem the loader finds is listed in the Problems tab, counted on the tree and marked on the field it names. Click a problem to select its object and open the inspector tab its field is in. A scene with problems keeps its last good picture in the viewport.

## Assets

The Assets tab has two views.

Project lists the scene's prefabs and the project's models, images and environments. Drag a card into the viewport to place it, or double-click it to place it at the centre of the view. While you drag, a ghost outline shows exactly where and how big the thing will land: a prefab or model standing on the ground under the pointer with its coordinates, or the object a texture would go onto.

| Dropped | Becomes |
| --- | --- |
| A prefab | Another object of that prefab, sized like the ones already placed |
| A model (3D scenes) | A scene model asset, a static prefab whose box fits the mesh and an object standing on the ground |
| An image (2D scenes) | A sprite sheet, a prefab and an object at the image's size, at most 256 px |
| An image onto an object (3D scenes) | That object's texture, in its `overrides.mesh.texture`. Textures tile over shapes; an object that draws a model keeps its own materials |
| An environment (3D scenes) | The level's `world.environment`: it lights the scene and is its sky |

A placed model or image gets the engine's `Prop` actor when the game registers it.

A model or an environment card shows a **thumbnail** the editor renders itself — a model turned three-quarters under the default sky, a panorama as the sky it lights — the first time the card is seen, kept by the host under `library/thumbs/` per file state so every tab shares it. Images show themselves.

Library searches Poly Haven's free CC0 models, textures and HDRIs. Import fetches the files with their checksums into `library/sources/` (which is ignored by git) and compiles a model into a `.glb` with levels of detail and compressed textures in `library/models/`. It records the import in `library.json` and rewrites `CREDITS.md` from it. The import runs in the background. When it is done, Place puts it at the centre of the view.

## Search and audit

The Assets tab marks what the project audit finds: a file no scene names carries an **unused** badge (game code may still load it — the mark means the scenes don't), and a line at the top names any file a scene asks for that is not on disk. **Where is it used?**, on a prefab's or a path's menu in the tree, answers across every scene of the project, counting each field that names it.

## Play

Play (F5) runs the scene as it stands, unsaved edits included, in a fresh game with the project's hooks. The other scenes load for real, so a door into the next level opens. The keyboard belongs to the game while it plays. If the game switches to a scene its page builds in code (a main menu), play stops and the status line says so. F5 or Stop returns to editing with the document as it was and the camera where it was. A code change during play starts the play again on the new code.

**Play from here** (Shift+F5, or the scene's menu) starts the player at the middle of the view: the view's centre in 2D, the camera's target in 3D. The player is the object `world.player` names, or else the first whose actor is `Player`.

**Stage it**, on a prefab's menu in the tree, plays that prefab alone on a floor in the scene's world and look, without the level's other objects, HUD, rules or player. The staged instance copies the scene's first placed one of that prefab (its size, properties and constraints), so a moving platform rides its route. While a prefab is staged, prefabs and assets stay editable and each edit restarts the stage; everything else waits for Stop. In 2D the floor has no sprite, so it holds things up without being drawn.

**Settle physics**, on the scene's menu, runs the scene briefly in the editor's host and writes where its dynamic bodies came to rest (position, and angle or rotation) as one step of undo. Crates stacked by hand stop floating. With objects selected it settles only those. It leaves the player alone and the objects composed from another scene. The body type is the one the game built, so an actor that makes its body kinematic is not settled. If the run logs an error, nothing is written.

The Console tab shows what the game logs and anything thrown and not caught. Its input line runs the engine's console commands and cvars on the live game. Type `help` to list them.

## Hot reload

When a file the game's definition or hooks import changes, the editor imports them again and rebuilds the scene from the open document, with the camera held. Files no game module imports reload nothing. A scene file changed on disk reloads the document, unless it has unsaved edits.

## Build

Build writes the game into `dist/`, a static site any host serves. It builds the project's `index.html` with Vite and copies the asset files beside the page, since scenes name them in JSON where Vite cannot see them. Preview serves the built site on a local port. Build reads what is saved on disk.

## Power saving

With Power saving on (the default), the viewport draws when something changes and otherwise at 20 frames a second. Off, it draws every frame, as the game does.

## Agents

The running editor serves MCP at `/mcp` on its port. An agent there edits the same documents as the window, and its edits appear in the history marked as an agent's. `npm run editor:mcp <folder>` serves the same tools over stdio when no editor is running. `run_scene`, `settle_scene`, `screenshot_scene` and `build_project` need the running editor.

| Tool | Does |
| --- | --- |
| `list_scenes`, `read_scene`, `outline_scene` | List the scenes, read one as canonical JSON, show its tree with paths |
| `inspect_node` | The inspector's rows for one node |
| `edit_scene` | Apply a list of set, insert and remove ops as one labelled step |
| `rename_entry` | Rename a prefab, sprite sheet, model, environment or path along with every reference to it, as the editor's Rename does |
| `find_uses` | Each scene using a named prefab, sheet, model, environment, path, actor, constraint, scene or file, with the fields that use it |
| `audit_project` | Missing files, files no scene names, prefabs and paths their own scene never uses, and which scene uses which |
| `look_at` | The lighting and post at a phase of the cycle, as the engine blends them, with the states and the strip's colours |
| `edit_look` | The Look tab's actions: start a cycle, add a state from a phase, remove a state, add a particle field (motes or smoke in 3D; fireflies, leaves, rain or sparks in 2D) |
| `read_project`, `edit_project` | The project file with every field the schema declares and any problems, as the Project tab shows it; ops on it, written at once and refused whole when the result is invalid |
| `undo`, `redo`, `save_scene` | Step the history, write the scene |
| `validate_scene` | Every problem, with its path |
| `list_assets`, `search_library`, `import_asset` | The project's asset files, a Poly Haven search, an import with its credit |
| `create_scene`, `rename_scene`, `delete_scene` | Scene files: a blank level or UI scene or a copy, a new name, gone |
| `list_components` | The actors and constraints the game registers, with their fields, as the Components tab shows them |
| `run_scene` | Step the scene headless for some seconds and report where each object ended up, with its body type and angle or rotation. `from` starts the player elsewhere and `prefab` runs a prefab's stage, as the editor's Play from here and Stage it do |
| `settle_scene` | The editor's Settle physics: write where dynamic bodies came to rest, as one step of undo, optionally only some `ids` |
| `screenshot_scene` | A picture of the scene as the editor holds it, unsaved edits included: the viewport alone or the whole window, optionally framed on one object or after some seconds of play. Takes `from` and `prefab` as `run_scene` does, and `phase` for the edit view at a phase of the cycle |
| `build_project` | Build the game into `dist/` |

The host has no GPU, so `screenshot_scene` opens the editor in a Chrome that has one, started on the first call and closed after five idle minutes or with the editor. It uses the Chrome named by `M2D_CHROME`; under WSL, the Windows Chrome, which needs mirrored networking so both sides share `localhost`; otherwise Playwright's Chromium, which may draw without a GPU. Each launch gets a debugging port from the OS and a profile folder of its own, so several editors can share one machine and one Chrome install.

## Keyboard

| Key | Does |
| --- | --- |
| F5 | Play or stop |
| Ctrl+S | Save |
| Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y | Undo, redo |
| Ctrl+D | Duplicate the selection |
| Ctrl+C, Ctrl+V | Copy the selection, paste it (into this scene or another) |
| Ctrl+Shift+A | Select every object of the selection's prefab |
| Ctrl+click, Shift+drag | Add to the selection; draw a marquee |
| Delete | Delete the selection |
| W, E, R | Move, rotate or scale gizmo |
| Right button held + W A S D, Q, E | Fly the camera: forward, left, back, right, down, up (Shift hurries, Alt creeps) |
| Arrows, Page Up, Page Down | Fly the camera when the viewport has the focus |
| Alt+1, Alt+2, Alt+3 | Show or hide the scene tree, the dock, the inspector |
| F | Frame the selection |
| Escape | Clear the selection |
| Up, Down (in the tree) | Walk the rows |
