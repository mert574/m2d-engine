# Example games

Six games ship with the engine. Each exercises a different part of it. Sources are under [`examples/src/`](https://github.com/mert574/m2d-engine/tree/master/examples/src) and [Adding a demo](../contributing/adding-a-demo) explains how they are wired.

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

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/circuit/">
<span class="example-card-tag">ticks · replay · lights</span>
<strong>Night Circuit</strong>
<span>Arcade time trials on five circuits. Drift, boost, spill oil for the next round, race your ghost and replay laps from recorded inputs.</span>
</a>

</div>

Each example opens on a main menu with a scene of its own behind the type, drawn in code through `UIBackdrop` layers, and plays its own pair of tracks from the IDMf netlabel ([credits](./music-credits)). Every example mounts the settings menu, opened with O. Its renderer row reloads the page with `?renderer=canvas` or `?renderer=webgl`, and the same parameter can be typed into the URL. The showcase skips its menu when the parameter is present.

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

A side-scrolling level with a dynamic-body player, moving platforms, a chasing enemy, coins and a level-complete trigger, set in the same dusk valley its menu shows: a parallax skyline behind the level, drawn terrain, lights and bloom over it. The built-in `Player`, `Bee`, `Platform`, `MovingPlatform`, `Coin` and `Trigger` actors are subclassed for the look only — scene JSON files, sprite sheets and the music that changes between the menu and the level work as stock.

| Key | Action |
| --- | --- |
| Arrow keys | Move |
| `Space` | Jump |
| `X` | Attack |

### Top-down maze

[Play](https://mert574.github.io/m2d-engine/examples/maze/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/maze)

A procedurally carved maze with a fixed seed: a stone maze at night, cobbles underfoot, walked by lantern light. The walls brighten as the lantern comes near and the route is chalked on the floor behind the player. Wall cells are merged into runs, so the world holds dozens of static bodies instead of hundreds. The player is a `character` body, the camera follows it through a world larger than the view and a sensor at the far corner resets the run. The scene is built in code; the floor and walls are CC0 textures from ambientCG.

| Key | Action |
| --- | --- |
| Arrow keys | Move |

### Physics playground

[Play](https://mert574.github.io/m2d-engine/examples/physics/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/physics)

A sandbox with a funnel, a splitter and a peg field made of rotated static boxes, drawn as a lamplit machine: brass pegs, girder rails, amber balls and wooden crates, with no image assets at all. Objects can be grabbed and thrown through the `Interactive` constraint, which steers the body toward the pointer with velocity so it still collides; whatever the pointer holds glows.

| Input | Action |
| --- | --- |
| Drag | Grab and throw a body |
| Right-click or long press | Remove a body |
| Click empty space | Spawn at the pointer |
| Scroll or pinch | Change gravity |
| `Space` | Spawn random objects |

### Top-down game

[Play](https://mert574.github.io/m2d-engine/examples/topdown/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/topdown)

Eight-directional movement with zero gravity, ghosts that chase, turrets that check line of sight before firing, pickups and an exit trigger, staged as the dark facility the menu's motion tracker is scanning: concrete and steel under failing ceiling lamps, a hand lamp and a sonar ping on the player, drawn apparitions for ghosts, and each turret showing its scan cone — pale while patrolling, red and narrow when it has line of sight. Taking a hit tears the picture for a moment.

| Key | Action |
| --- | --- |
| Arrow keys | Move |
| `X` | Attack |

### Night Circuit

[Play](https://mert574.github.io/m2d-engine/examples/circuit/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/circuit)

Arcade time trials at night on five circuits of rising difficulty: wider or narrower roads, sliding gates, patrolling traffic, cone rows and oil barrels that spill onto the racing line when hit — and the spill stays for every following round of the session, where the hit's angle put it. Laps are timed in simulation ticks. The best lap of each circuit is stored as its input recording: Enter replays it through the engine's input seam and reports whether the re-simulation matched the recording (it always does — that is the point). The best lap also runs alongside as a ghost. Headlights and street lamps are spot lights with shadow casting, so barriers, barrels and trees throw moving shadows as you pass; on the Canvas backend the same game runs in daylight.

| Key | Action |
| --- | --- |
| Arrow keys | Throttle, brake and steer |
| `Space` | Handbrake — hold to drift |
| `X` | Nitro |
| `R` | Restart the round (fresh props, the session's oil stays) |
| `Enter` | Replay the best lap, or the round so far |
| `Esc` | Back to the menu |
