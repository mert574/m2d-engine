# The host: the editor becomes an IDE — done, Nov 2026

Working record, not published documentation. This replan landed after E1
shipped with placeholder actors and the owner called it: a game's look
and behaviour live in its *code*, and an editor that cannot run that
code is a map viewer, not an IDE. Godot and Unity both host the game's
code in the editor's process and reload it on change; this is that,
mapped onto ES modules.

## The mistake this corrects

E0 chose the File System Access API as the way into a project. It hands
back *bytes*, and code needs *URLs* — bare-import resolution, a
TypeScript transform, an invalidation graph. You cannot `import()` a
file handle, and the gap surfaced exactly where it had to: placeholders
standing in for every class the editor could not load. FSA is gone from
the editor entirely.

## The shape now

**`m2d-editor <project>`** (packages/editor-host, renamed from
editor-mcp) is one process hosting one project, chosen at boot — no
folder picker, no switching mid-run; another project is another editor
on another port, which is also how several agents share a machine. It
runs Vite rooted at the editor app with the project allowed through
`/@fs/`, so the app imports the project's **real** actor and constraint
classes; serves `/__project` (the declaration, the scene list, the
absolute root) and `/__scene` (raw file text); watches the folder and
forwards every change as a `m2d:file` event; and still speaks MCP over
stdio (`npm run editor:mcp`) as a one-off command with no port at all.
The port is random per start and printed; `PORT=` pins it.

**`m2d.project.json`** declares the games: for each, a `definition`
module exporting `register(game)` (and optionally `GAME`, the M2D
options its simulation needs), its `scenes` folder, its asset
`basePath`. The convention is not new — it generalizes the split
`iso/game.js` already had because Cinder Keep's match server needed it;
the editor is that seam's third consumer. All seven demos with scene
files now carry a `game.js`, and their `main.js` boots from it, so the
definition cannot drift from the game.

**Hot reload.** A source file changes → Vite invalidates its module
graph → the host *suppresses* Vite's default reaction for project files
(`handleHotUpdate` returns `[]`, because nothing hot-accepts a
dynamically imported module and the fallback is a full page reload that
would junk the editor's state) → the app hears `m2d:file`, re-imports
the definition with a fresh query (Vite re-serves the invalidated
children re-evaluated, which hand-rolled cache busting would get wrong),
tears the game down (`destroy()` leaving nothing is what makes this
safe), re-registers and re-materializes the **in-memory document** —
never the file; there may be unsaved edits — with the camera captured
and restored. A scene file changing on disk (a hand edit, a generator
rerun, an agent over MCP) reloads the open document unless it is dirty.
Verified end to end: the hosted editor was driven headlessly, Hollow
Grove opened with its real `Tree`, `GroundDetail` and lanterns drawn by
their own code, `groveActors.js` was edited on disk mid-session, and the
editor re-materialized in place with no page reload and no errors.

**Placeholders survive only as the fallback** — a scene from a game the
project does not declare, a class registration missed — and the status
line says so.

## Big assets, and the Electron question

The owner's requirements: easy copy/move/edit of project files, and a
multi-gigabyte asset dropped in must never stream through the browser.
The architecture's answer is that the project directory is a **plain
folder**: heavy files move with the OS file manager at zero copies, the
host's watcher sees them land, and the editor hears about it live. The
browser never holds bytes it does not need; a browser-side drop target
(E3) will write *small* files through the host over loopback and, for
anything large, say where the folder is instead of uploading it. This —
plus `/@fs` serving and native compilers — is the companion process
doing the jobs Electron's main process would do, without owning the
window.

## What it cost

The demo scene is deleted (the examples are the editor's dogfood
project: `npm run editor` opens them), FSA and the blob-URL asset
rewriting are deleted (assets are simply *served* now, `basePath` =
`/@fs/<project>/<game.basePath>/`), and the editor app no longer works
from a bare static server — it requires its host, which is the honest
shape of an IDE.
