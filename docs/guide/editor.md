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
  "hooks": "hooks.js"
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `name` | the folder's name | Shown in the editor's bar |
| `definition` | none | The module that registers the game: exports `register(game)` and may export `GAME`, the M2D options the simulation needs |
| `hooks` | none | The module with each scene's presentation hooks: exports `sceneHooks(game)`, which returns `{ [sceneName]: { onEnter, onShow, onRender, ... } }`. It may also export `OPTIONS`, M2D options the game's look depends on (a `textureFilter`), which the editor applies when it edits and plays and the page spreads into its own options |
| `scenes` | `scenes` | The folder the scene JSON lives in |
| `basePath` | the project folder | What asset URLs in scenes are relative to |

The definition holds the cast: actors, constraints, intents and the asset manifest. It never draws, so a headless game, a server and the editor's checks can load it. The hooks module holds what shows the game: the camera, lights, HUD and music. The game's page (`main.js`) builds both, and so does the editor's play mode. Without a definition the editor draws placeholder actors. Without a hooks module, play runs the bare scene.

## The window

Drag the edge of the scene tree, the inspector or the dock to resize it. Double-click an edge to reset it. The three buttons at the right of the bar show or hide the tree, the dock and the inspector (Alt+1, Alt+2, Alt+3). Sizes and visibility are kept in the browser.

| Region | Shows |
| --- | --- |
| Bar | The scene picker, undo and redo, Save, Play, Build, New project, Snap and Power saving |
| Scene tree | The scene's world, prefabs, layers and objects. Big groups start folded. The filter narrows it. A badge counts the problems under a node |
| Viewport | The scene, drawn by the game's own code. Drag moves the camera, scroll zooms |
| Inspector | The selected node's fields, every one the schema declares, with defaults shown as placeholders |
| Dock | Tabs for Assets, Problems, History, Console and Build |
| Status line | The last action, the problem count, the drawing mode, the dimension and the scene's path |

## Editing

Click an object in the viewport or the tree to select it. The gizmo has two modes. Move shows an arm per axis and a square for a free move, which runs along the ground in 3D. Rotate turns a 2D object's `angle`, or a 3D object's `rotation` about the world axes. Snap rounds moves to 8 px or 0.25 m and turns to 15°. Hold Ctrl to invert Snap for one drag.

The inspector writes as you type. Drag a number's label sideways to scrub it (Shift for ten times the step, Alt for a tenth). Angles show in degrees and are stored in radians. A 3D rotation shows as yaw, pitch and roll and is stored as a quaternion. Add creates a block the scene leaves out. The × button resets a field to its default or removes a block or list entry.

An object edit rebuilds that object in place. Other edits rebuild the scene with the camera held.

Edits are kept by the editor's host process until you save. Save writes the scene in the canonical form. A scene with a `generator` field is read-only until you detach it from its script.

## Problems

The editor checks the scene after every change against the game's real classes. Every problem the loader finds is listed in the Problems tab, counted on the tree and marked on the field it names. Click a problem to select its object. A scene with problems keeps its last good picture in the viewport.

## Assets

The Assets tab has two views.

Project lists the scene's prefabs and the project's models, images and environments. Drag a card into the viewport to place it, or double-click it to place it at the centre of the view.

| Dropped | Becomes |
| --- | --- |
| A prefab | Another object of that prefab, sized like the ones already placed |
| A model (3D scenes) | A scene model asset, a static prefab whose box fits the mesh and an object standing on the ground |
| An image (2D scenes) | A sprite sheet, a prefab and an object at the image's size, at most 256 px |
| An image onto an object (3D scenes) | That object's texture, in its `overrides.mesh.texture`. Textures tile over shapes; an object that draws a model keeps its own materials |
| An environment (3D scenes) | The level's `world.environment`: it lights the scene and is its sky |

A placed model or image gets the engine's `Prop` actor when the game registers it.

Library searches Poly Haven's free CC0 models, textures and HDRIs. Import fetches the files with their checksums into `library/sources/` (which is ignored by git) and compiles a model into a `.glb` with levels of detail and compressed textures in `library/models/`. It records the import in `library.json` and rewrites `CREDITS.md` from it. The import runs in the background. When it is done, Place puts it at the centre of the view.

## Play

Play (F5) runs the scene as it stands, unsaved edits included, in a fresh game with the project's hooks. The other scenes load for real, so a door into the next level opens. The keyboard belongs to the game while it plays. If the game switches to a scene its page builds in code (a main menu), play stops and the status line says so. F5 or Stop returns to editing with the document as it was and the camera where it was. A code change during play starts the play again on the new code.

The Console tab shows what the game logs and anything thrown and not caught. Its input line runs the engine's console commands and cvars on the live game. Type `help` to list them.

## Hot reload

When a file the game's definition or hooks import changes, the editor imports them again and rebuilds the scene from the open document, with the camera held. Files no game module imports reload nothing. A scene file changed on disk reloads the document, unless it has unsaved edits.

## Build

Build writes the game into `dist/`, a static site any host serves. It builds the project's `index.html` with Vite and copies the asset files beside the page, since scenes name them in JSON where Vite cannot see them. Preview serves the built site on a local port. Build reads what is saved on disk.

## Power saving

With Power saving on (the default), the viewport draws when something changes and otherwise at 20 frames a second. Off, it draws every frame, as the game does.

## Agents

The running editor serves MCP at `/mcp` on its port. An agent there edits the same documents as the window, and its edits appear in the history marked as an agent's. `npm run editor:mcp <folder>` serves the same tools over stdio when no editor is running. `run_scene` and `build_project` need the running editor.

| Tool | Does |
| --- | --- |
| `list_scenes`, `read_scene`, `outline_scene` | List the scenes, read one as canonical JSON, show its tree with paths |
| `inspect_node` | The inspector's rows for one node |
| `edit_scene` | Apply a list of set, insert and remove ops as one labelled step |
| `undo`, `redo`, `save_scene` | Step the history, write the scene |
| `validate_scene` | Every problem, with its path |
| `list_assets`, `search_library`, `import_asset` | The project's asset files, a Poly Haven search, an import with its credit |
| `run_scene` | Step the scene headless for some seconds and report where each object ended up |
| `build_project` | Build the game into `dist/` |

## Keyboard

| Key | Does |
| --- | --- |
| F5 | Play or stop |
| Ctrl+S | Save |
| Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y | Undo, redo |
| Ctrl+D | Duplicate the selection |
| Delete | Delete the selection |
| W, E | Move or rotate gizmo |
| Alt+1, Alt+2, Alt+3 | Show or hide the scene tree, the dock, the inspector |
| F | Frame the selection |
| Escape | Clear the selection |
| Up, Down (in the tree) | Walk the rows |
