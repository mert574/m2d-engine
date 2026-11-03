# Example games

Five games ship with the engine. Each exercises a different part of it. Sources are under [`examples/src/`](https://github.com/mert574/m2d-engine/tree/master/examples/src) and [Adding a demo](../contributing/adding-a-demo) explains how they are wired.

<div class="example-grid">

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/showcase/">
<span class="example-card-tag">renderer</span>
<strong>Renderer showcase</strong>
<span>A harbour at night with thousands of sprites, particles, lights and bloom, counted on screen. Swap backends and compare.</span>
</a>

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/platformer/">
<span class="example-card-tag">physics · scenes</span>
<strong>Platformer</strong>
<span>Side-scrolling level with moving platforms, a chasing enemy, coins and a level-complete trigger.</span>
</a>

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/maze/">
<span class="example-card-tag">camera · character</span>
<strong>Top-down maze</strong>
<span>A generated maze explored with a following camera. Find the green goal in the far corner.</span>
</a>

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/physics/">
<span class="example-card-tag">input · physics</span>
<strong>Physics playground</strong>
<span>Grab and throw bodies through a funnel, a splitter and a peg field. Scroll or pinch to change gravity.</span>
</a>

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/topdown/">
<span class="example-card-tag">actors</span>
<strong>Top-down game</strong>
<span>Eight-directional movement, ghosts that chase, turrets with line of sight and rockets.</span>
</a>

</div>

Each example opens on a main menu with a scene of its own behind the type, drawn in code through `UIBackdrop` layers. Every example mounts the settings menu, opened with O. Its renderer row reloads the page with `?renderer=canvas` or `?renderer=webgl`, and the same parameter can be typed into the URL. The showcase skips its menu when the parameter is present.

Pointer lock is enabled only in the physics playground. The other examples leave the pointer free.

## Controls

### Renderer showcase

[Play](https://mert574.github.io/m2d-engine/examples/showcase/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/showcase)

A batching stress test and a side-by-side comparison of the two renderer backends. The scene is a harbour at night. It has thousands of batched sprites, a reed bank with per-sprite tint, a text storm and a lighthouse beam built from nested clips. Rain is a packed particle buffer, the lanterns are lights with bloom and a chart nests clips in screen space.

The overlay reports frames per second, primitives, draw calls and state changes. It also lists the optional capabilities the active backend supports. On WebGL2 the scene collapses into a handful of draw calls. On Canvas each primitive is one call, and tint, particles, lights and post effects drop out.

The scene is deterministic. Layers are built from a seeded random generator and the camera pans a fixed path, so both backends run the same workload.

| Key | Action |
| --- | --- |
| `[` and `]` | Decrease and increase load |
| `1` to `7` | Toggle layers: drift, reeds, labels, chart, rain, lights, bloom |
| `P` | Pause the camera pan |
| `H` | Hide the overlay |

### Platformer

[Play](https://mert574.github.io/m2d-engine/examples/platformer/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/platformer)

A side-scrolling level with a dynamic-body player, moving platforms, a chasing enemy, coins and a level-complete trigger. Uses the built-in `Player`, `Bee`, `Platform`, `MovingPlatform`, `Coin` and `Trigger` actors, scene JSON files, sprite sheets and music that changes between the menu and the level.

| Key | Action |
| --- | --- |
| Arrow keys | Move |
| `Space` | Jump |
| `X` | Attack |

### Top-down maze

[Play](https://mert574.github.io/m2d-engine/examples/maze/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/maze)

A procedurally carved maze with a fixed seed. Wall cells are merged into runs, so the world holds dozens of static bodies instead of hundreds. The player is a `character` body, the camera follows it through a world larger than the view and a sensor at the far corner resets the run. The scene is built in code.

| Key | Action |
| --- | --- |
| Arrow keys | Move |

### Physics playground

[Play](https://mert574.github.io/m2d-engine/examples/physics/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/physics)

A sandbox with a funnel, a splitter and a peg field made of rotated static boxes. Objects can be grabbed and thrown through the `Interactive` constraint, which steers the body toward the pointer with velocity so it still collides.

| Input | Action |
| --- | --- |
| Drag | Grab and throw a body |
| Right-click or long press | Remove a body |
| Click empty space | Spawn at the pointer |
| Scroll or pinch | Change gravity |
| `Space` | Spawn random objects |

### Top-down game

[Play](https://mert574.github.io/m2d-engine/examples/topdown/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/topdown)

Eight-directional movement with zero gravity, ghosts that chase, turrets that check line of sight before firing rockets, coins and a trigger.

| Key | Action |
| --- | --- |
| Arrow keys | Move |
| `X` | Attack |
