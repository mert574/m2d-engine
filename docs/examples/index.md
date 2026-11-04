# Example games

These games ship with the engine. Each exercises a different part of it. Sources are under [`examples/src/`](https://github.com/mert574/m2d-engine/tree/master/examples/src) and [Adding a demo](../contributing/adding-a-demo) explains how they are wired.

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
<span class="example-card-tag">rooms camera · character</span>
<strong>Hedgerow Court</strong>
<span>A hedge-maze garden of single-screen courts. The camera holds each court and glides to the next at the gate; daisies bloom where you have walked.</span>
</a>

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/scroller/">
<span class="example-card-tag">scroll camera · parallax</span>
<strong>Beeline</strong>
<span>An auto-scroller down a golden-hour meadow: gather pollen, weave past wasps, deliver to the hive at the end of the lane.</span>
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

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/oblique/">
<span class="example-card-tag">perspective · depth sort</span>
<strong>Hollow Grove</strong>
<span>A three-quarter view of a grove at dusk, with a small quest: talk to Maren and Oswin, learn the ward, light the lanterns and open the clearing.</span>
</a>

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/iso/">
<span class="example-card-tag">isometric · click to move</span>
<strong>Cinder Keep</strong>
<span>An isometric dungeon: click or walk the knight through torchlit halls, gather the embers past the keep's dead and open the stair.</span>
</a>

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/belt/">
<span class="example-card-tag">belt scroller · waves</span>
<strong>Ash Row</strong>
<span>A beat 'em up down a sunlit street with a skyline behind it: chain punches, sweep kicks and drop kicks through five sections of thugs to reach the door.</span>
</a>

<a class="example-card" target="_self" href="https://mert574.github.io/m2d-engine/examples/drift/">
<span class="example-card-tag">rotating camera · parallax</span>
<strong>Salvage Run</strong>
<span>Fly a salvage ship through an asteroid field with the view turning to keep your nose up. Shoot meteors apart, outrun drones, bring twelve pods to the gate.</span>
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

### Hedgerow Court

[Play](https://mert574.github.io/m2d-engine/examples/maze/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/maze)

The single-screen, room-based perspective: a hedge-maze garden in three maps, each a grid of walled courts, and each court exactly one screen. The camera's `rooms` mode holds the court the gardener stands in and glides through the hedge when they take a gate, the classic room transition. Every court is its own seeded maze, connected along a spanning tree with a loop or two, and a test pins that every map stays solvable. Dead ends are flower beds, daisies bloom along the walked path (the route you have taken is the garden in bloom), butterflies work the beds, cloud shadows cross the lawn, and the fountain at the far end opens the next map. The scene is built in code; the lawn and hedge are CC0 materials from ambientCG.

| Key | Action |
| --- | --- |
| Arrow keys | Move |

### Beeline

[Play](https://mert574.github.io/m2d-engine/examples/scroller/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/scroller)

The auto-scroller: the camera runs in `scroll` mode down a meadow verge at golden hour, and a bee keeps up. Pollen glows at the flower heads and hangs in chains on the open air; wasps patrol seeded loops and thistles crowd the low route, and either scatters some of what the bee carries; the hive at the end of the lane takes the count. The simulation never reads the camera — a `ScrollFront` entity advances at the same speed per fixed tick and enforces the window, the worked example of the [determinism contract](../contributing/determinism). The meadow is four parallax planes of Kenney foliage silhouettes, pre-tinted to the palette at asset time, and a test pins that every grain stays inside the flight band.

| Key | Action |
| --- | --- |
| Arrow keys | Fly |

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

### Hollow Grove

[Play](https://mert574.github.io/m2d-engine/examples/oblique/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/oblique)

The engine's 3/4 ("oblique") perspective, in a grove at dusk, with a small quest in it. The trees are painted sprites standing on trunk-sized footprints, so the walker passes behind a canopy the moment their feet are above its roots; the people are eight-direction pre-rendered sheets whose facing follows the heading; the ground is a photographed grass texture with a dirt path laid along a curve, and grass and flowers that move in the wind. Footsteps follow the stride, and the swing reaches in whatever direction you last moved. Space hops through `elevation`: the sprite lifts and its shadow pulls in while the collider stays on the ground. Lanterns are lights that throw real shadows from the trunks on WebGL, and the wheel zooms the camera.

Maren the herbalist sends you east past the pond to Oswin the lamplighter, who teaches the ward that opens the sealed clearing in the north-east. Two of three skills are yours from the start: a lantern flare that throws the wisps back, and a blink through the dark. The minimap marks whoever you should talk to next.

| Key | Action |
| --- | --- |
| Arrow keys | Move |
| `Space` | Hop |
| `X` | Swing |
| `E` | Talk, and advance a conversation |
| `1` `2` `3` | Flare, Blink, Ward (Oswin teaches the ward) |
| Wheel | Zoom |
| `Escape` | Back to the menu |

### Cinder Keep

[Play](https://mert574.github.io/m2d-engine/examples/iso/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/iso)

The engine's isometric perspective. The scene declares `world.projection`, and every position is drawn through it while physics, movement and the depth sort stay on the flat ground plane. The floor is a diamond tile layer over only the carved cells, the walls are block sprites on tile footprints that fade when the knight passes behind them and cast torchlight shadows from their projected diamonds, and the knight and the keep's dead are Flare's eight-facing isometric figures. Click the floor to walk there, or use the arrows along the screen's axes; either way the pace is steady on screen rather than on the ground. Three abilities: a cleave all around, a dash along the heading and a shield of circling embers. Gather the embers to open the stair past the keep's dead.

| Key | Action |
| --- | --- |
| Click | Walk there |
| Arrow keys | Move along the screen |
| `X` | Swing, in the direction last faced |
| `1` `2` `3` | Cleave, Dash, Ember Shield |
| Wheel | Zoom |
| `Escape` | Back to the menu |

### Ash Row

[Play](https://mert574.github.io/m2d-engine/examples/belt/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/belt)

The engine's belt scroller and its 2.5D street, at noon. Five planes give the row depth: a hazy skyline at a tenth of the camera's travel, taller blocks behind the row at half, the shopfronts and their kerb props on the play plane, the road below the gutter, and bollards in front that outrun the pavement. The scene declares a `belt` projection, so the street's depth lane is compressed on screen while movement, chasing and the depth sort run on the flat ground. Space jumps through `elevation`, with the engine's ground shadow staying on the paving as the rogue rises. X chains a three-punch combo whose finisher launches whoever it lands on, C sweeps the whole crowd back on its own cooldown, and a strike in the air is a heavy drop kick — all on the engine's `Attack` combo support. The camera follows only along the street and locks at each section until its wave of Flare's zombies, goblins and skeletons is down; then the GO sign flashes and the lock lifts. The paving and brick are ambientCG materials under a blue sky.

| Key | Action |
| --- | --- |
| Arrow keys | Move along the street and the lane |
| `Space` | Jump |
| `X` | Punch; chained presses jab, cross, launch |
| `C` | Sweep kick, all the way around |
| `X` in the air | Drop kick |
| `Escape` | Back to the menu |

### Salvage Run

[Play](https://mert574.github.io/m2d-engine/examples/drift/) · [Source](https://github.com/mert574/m2d-engine/tree/master/examples/src/drift)

The rotating top-down perspective. The camera's `followRotation` keeps the ship's nose up the screen and eases out as it picks up speed, so the asteroid field wheels around you. A far star tile at a tenth of the camera's travel, nebulae and a scatter of star sprites at their own depths give the void distance. Meteors are dynamic bodies that split big to medium to small when shot and cost hull when rammed; drones hunt, turn to face you and fire; twelve salvage pods open the jump gate. Every sprite and sound is Kenney's Space Shooter Redux.

| Key | Action |
| --- | --- |
| Left, Right | Turn |
| Up | Thrust |
| Down | Brake, reverse |
| `X` | Fire |
| `C` | Boost |
| `Escape` | Back to the menu |

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
