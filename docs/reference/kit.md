# The kit

`m2d-kit` is the package of ready-to-use pieces for games on m2d: actors, prefab templates, constraints and helpers that are too opinionated for the engine and too reusable to live in one game. The engine keeps the contracts and what its own code names; the kit keeps what games compose from. Every example game is built on both.

Each piece is its own entry, so a game imports what it uses:

```javascript
import { registerEffects } from 'm2d-kit/effects';
import { makeRng, range } from 'm2d-kit/random';
```

The kit touches nothing of the DOM when it loads, so a game's definition may import it on a server as in a browser. What a scene names from it is registered through the kit's own `register…` helpers, which mark the classes as the kit's in the editor's Components tab and in `list_components`.

What belongs in the kit is decided by one test, kept in `knowledge-base/projects/engine-surface/`: two games or a template want it, it declares its properties or params, it works in 2D and 3D or says which, and it ships with its test and this page's row. A piece only one game wants is that game's code.

## `m2d-kit/actors`

The stock gameplay cast, each a composition of the engine's capabilities, and what the demos extend — a street thug is a `Ghost` from a Flare sheet, a glowing ember a `Coin`. The engine names what a thing does (`Collectable`, `Chase`, `PathFollow`); the kit names what it is in a game. `registerKitActors(game)` registers the cast, plus the prefab templates below.

| Export | Is |
| --- | --- |
| `Ghost` | A floating enemy that drifts toward the player: `Health` (100, half a second invulnerable, `whenDead: 'remove'`), `ContactDamage` (33, 480 px/s knockback), `Chase` (60 px/s, 36 idle, 400 range), `DamageFlash`. A scene retunes any of them by slot. Expects a `dynamic` body, on whatever collision layer its prefab names; plays the `damage` sound on a hit, wherever it was simulated |
| `Bee` | A `Ghost` that knocks harder: 720 px/s |
| `Coin` | A pickup: `Hover` bobs it, the engine's [`Collectable`](./constraints#collectable) takes it on an avatar's touch. Expects a `static` sensor |
| `MovingPlatform` | A kinematic platform patrolling `properties.path` with [`PathFollow`](./constraints#pathfollow); friction 1, so riders are carried |
| `GravityDial` | One axis of the world's gravity following a counter: `properties.counter` (a plain counter in `world.counters`, checked at load) and `axis` (`y`). A rule that turns the counter changes the fall from the next tick, headless and on a server too. Collides with nothing and draws nothing; 2D and 3D |

The players, the platform, the turret and the NPC came out of the engine with the rest of the cast; each expects certain prefab physics and reads certain `properties`, as below. Register what a game uses, or everything with `registerKitActors`.

### Player

`m2d-kit/actors`. Name `Player`. A platformer character controlled with the arrow keys, Space to jump and X to attack.

- Expects a `dynamic` body. It moves by friction and tumbles. Sets its mass to 1.
- Uses animations `idle`, `run`, `jump`, `attackLeft` and `attackRight` when the sheet has them.
- Constraints: `Health` (100), `Attack` (65 damage, 50 range, 22.5 cooldown), `KeyboardControl` (acceleration 3000, max speed 180, no vertical movement), `WallSlip`. Jumps at `jumpVelocity` (a declared property, 720 px/s) when on the ground.
- Calls `game.gameOver()` on death. Plays the `jump`, `attack` and `damage` sounds when loaded; a coin's sound is a rule on the `picked` event.

### TopDownPlayer

`m2d-kit/actors`. Name `Player`. Eight-directional movement with the arrow keys and X to attack.

- Works with a `dynamic` or `character` body and zero gravity. Sets its mass to 1.
- Constraints: `Health` (100), `Attack` (65 damage, 50 range, 22.5 cooldown), `KeyboardControl` (acceleration 3000, max speed 180, vertical movement on).

### ObliquePlayer

`m2d-kit/actors`. Name `Player`. The `TopDownPlayer` for a 3/4 view, with a heading, Space to hop and a swing in any direction.

- Everything `TopDownPlayer` has. Works best with a prefab `footprint`, so the body is the feet and the sprite stands above it.
- `heading` is the direction last moved in, radians. X swings the `Attack` at it, `attackArc` wide (default 1.5π) with `attackRange` (60) and `attackKnockback` (6000), so a wisp above or below is in reach.
- The hop is `elevation`: Space launches it at `jumpSpeed` (430 px/s) and `gravity` (1500 px/s²) brings it back. The collider never leaves the ground. `isAirborne` says whether the feet are off it; `jump()` hops from code; `onJump` and `onLand` hooks fire at the ends.
- With an eight-facing sheet it plays `idle_<dir>`, `run_<dir>` and `swing_<dir>` for the heading; `spriteFit` is on, so the object's size is the drawn frame. `spriteOffsetY` shifts the sprite down for a sheet whose feet sit above the frame's bottom.
- `properties`: `jumpSpeed`, `gravity`, `attackArc`, `attackRange`, `attackKnockback`, `spriteOffsetY`.

### Npc

`m2d-kit/actors`. Name `Npc`. Someone to talk to: stands on a `static` body, turns to face the player within `talkRadius` (110) and shows an `E · Talk to <displayName>` prompt through a `ProximityPrompt`. Set `hasNews` to draw a marker over the head. Plays `idle_<dir>` for its facing, or `idle`. `spriteFit` is on.

- `properties`: `who` (an id for the game), `displayName`, `facing` (resting facing, radians, default down), `talkRadius`, `spriteOffsetY`.
- `playerNear` is the prompt's test; the game reads it on its interact key and opens a `UIDialogue`.

### Platform

`m2d-kit/actors`. Name `Platform`. Draws the prefab's `defaultAnimation`, or `default`, tiled over its size. Without a sprite it draws the red placeholder rectangle.

- Expects a `static` body.
- A static body, so projectiles stop at it and `Turret` cannot see through it.

### Turret

`m2d-kit/actors`. Name `Turret`. A stationary enemy that aims at the player, checks line of sight with a raycast against static bodies and fires `Rocket` projectiles. Its rockets ignore the turret's own collision layer (other turrets, its mobs) unless it stands on the unset first layer, which is also the walls'.

- Sets its body to `static` and its category to `enemy`.
- Draws itself with primitives. No sprite needed.
- `properties`: `detectionRange` (350), `fireRate` seconds between shots (2), `rocketSpeed` (360), `rocketDamage` (25), `health` (80). A value of `0` falls back to the default.
- Constraints: `Health` (0.3 s invulnerable), `ContactDamage` (25 damage, 360 px/s knockback).

### Rocket

`m2d-kit/actors`. Name `Rocket`. A `Projectile` that draws itself. Created by `Turret`, or by code with `game.physics.createBox` and `new Rocket(body, null, game, { direction, speed, damage })`.

Defaults: speed 480, damage 25, lifetime 6 s; it hurts the players' avatars unless `targetNames` says otherwise. Every `Projectile` option can be passed.

**Prefab templates.** `PREFAB_TEMPLATES` holds ready-made `prefabs` entries — `mob` (chases, hurts, flashes, dies and is gone; it stands on an `enemy` collision layer the project declares) and `pickup` (bobs, is collected, counts) — composed over the engine's `Prop` with no class at all, art-free so they play the moment they land. `registerKitActors` offers them through the engine's `registerPrefabTemplate`; the editor's Components tab shows each as a card whose **Insert** copies it into the scene's own `prefabs`, and `list_components` hands an agent the same entry to copy in with `edit_scene`.

## `m2d-kit/controls`

Genre controllers: how a body answers held keys in one kind of game. The engine's `KeyboardControl` and `PointerMove` are the plain capabilities; these are opinionated, and a game attaches one from a scene's `constraints` or an actor's constructor. `registerKitControls(game)` registers the four under their names; `registerKit(game)` from `m2d-kit` registers the cast, the controls and the effects together.

### ThrustControl

`m2d-kit/controls`. A ship's handling on a dynamic body with rotation free: left and right drive angular velocity at `turn` rad/s, up thrusts along the nose at `thrust` px/s², down brakes or reverses at `reverse`, speed is capped at `maxSpeed` and coasting decays at `drag` 1/s. `KeyC` ignites a boost (`boostThrust` and `boostSpeed` multipliers for `boostDuration`, once per `boostCooldown`); `onBoost` fires then, and `onFire` every tick the fire key is held. `throttle` (0..1) and `steer` (-1..1) are read back for a flame and a bank. Keys as `KeyboardControl`'s, under `keys`.

### GlideControl

`m2d-kit/controls`. One-press gliding on a corridor grid: tap a direction and the body keeps going until a wall, a new direction or the same key again: Pac-Man's movement, for cosy mazes. A turn pressed early is buffered and taken at the next opening; one pressed a beat late snaps back to the junction just passed and takes it anyway. Openness is asked of the physics world (`physics.overlaps` one cell over, sensors ignored), so the constraint needs no map, only the grid the corridors are built on. The body parks on the centre of the last open cell at a wall, and is held to the corridor's centre line while gliding. Runs in `fixedUpdate` on `entity.input`, the owning player's snapshot.

| Option | Default | Meaning |
| --- | --- | --- |
| `keys` | arrows | `{ left, right, up, down }` as key codes |
| `speed` | `240` | Glide speed, px/s |
| `grid` | `32` | Corridor cell size; centres at `(n + 0.5) * grid` |
| `buffer` | `0.35` | Seconds a queued turn waits for its opening |
| `snap` | `0.6` | How far past a junction, in cells, a late turn still takes it |
| `stopOnRepeat` | `true` | Pressing the direction of travel stops the body |
| `onMove(dx, dy)` | | When a glide starts or changes direction |
| `onStop()` | | When the body comes to rest |

Hedgerow Court is the worked example.

### CarControl

`m2d-kit/controls`. Arcade top-down car handling on a dynamic body. Each tick the body's velocity splits along its heading: throttle and brakes act on the forward part, grip decays the lateral part, and the handbrake swaps in a much lower grip so the car slides while the nose turns, a drift. Steering drives angular velocity and scales with speed, so the car cannot pivot in place. Runs in `fixedUpdate` on `entity.input`, the owning player's snapshot, so the same inputs always drive the same path and a server drives each car from its own player.

| Option | Default | Meaning |
| --- | --- | --- |
| `keys` | arrows, `Space`, `KeyX` | `{ throttle, brake, left, right, handbrake, nitro }` as key codes. Partial overrides are merged |
| `manual` | `false` | Ignore the keyboard; a driver supplies `setControls({ throttle, brake, steer, handbrake, nitro })` |
| `autoThrottle` | `false` | The throttle is held for the driver: full drive whenever the brake is not, so the player steers and drifts and never lifts off. The throttle key is ignored; a `manual` driver's `throttle` too |
| `handbrakeDrag` | `0` | Speed the handbrake takes off while held, 1/s. With it one button both slows the car and sets it sliding, which a touch screen with two buttons wants |
| `acceleration` | `420` | Forward drive, px/s² |
| `maxSpeed` | `560` | Forward cap, px/s |
| `brake` | `780` | Braking, px/s². Held past the stop it reverses, capped at `maxReverse` |
| `maxReverse` | `170` | Reverse cap, px/s |
| `drag` | `0.6` | Coasting decay, 1/s |
| `grip` | `18` | Lateral decay, 1/s. Steady-state sliding at full lock is `maxSpeed * steer / grip`; the defaults keep that under `driftThreshold` |
| `driftGrip` | `2.4` | Grip while the handbrake is held |
| `steer` | `2.4` | Yaw rate at full steering, rad/s |
| `driftSteer` | `3.6` | Yaw rate while drifting |
| `driftThreshold` | `90` | Lateral px/s that counts as drifting |
| `nitroThrust`, `nitroBoost` | `2.1`, `1.35` | Acceleration and speed-cap multipliers while the nitro burns |
| `nitroDuration`, `nitroCooldown` | `1.1`, `5` | Burn and recharge, seconds |
| `overspeedDecay` | `1.4` | How fast speed above the cap bleeds away, 1/s. The throttle never pushes past the cap; a boost pad, a mini-turbo or the end of a nitro burn carries the car over it, and it settles back over about a second |
| `onDrift(active)` | | Drift started or ended |
| `onNitro()` | | Nitro ignited |

Fields and methods: `surfaceGrip` (set it per tick from the world: 1 asphalt, lower on oil or grass; it scales grip, steering and drive together), `surfaceDrag` (set it per tick too: speed the surface takes away, 1/s, 0 on asphalt), `drifting`, `forwardSpeed`, `lateralSpeed`, `speed`, `boostLeft`, `nitroReady`, `igniteNitro()`, `applyBoost(speed)` (a shove along the heading up to `speed`, what a boost pad does; it may pass the cap, and `overspeedDecay` brings it back), `setControls(controls)`.

### WallSlip

`m2d-kit/controls`. No options. Sets the body's friction to zero while airborne and restores it on landing, so holding a direction into a wall does not make a dynamic player cling to it.

## `m2d-kit/scenery`

Backdrops, weather and ambient sound any game could want, as actors placed in the scene. Each collides with nothing whatever its prefab says, draws at a `zIndex` instead of at its body (under every layer at -1000, or over every entity at 1000, unless its object gives one), and covers the camera's visible area, so it has no edge at any zoom or rotation. All of it is presentation: stateless, seeded, the same on every machine, and drawn in the editor too, where the clock stands still. `registerKitScenery(game)` registers the four actors and the templates below. A game's own painting — a valley's ridges, a street's skyline — is an actor of its own on the same terms.

| Actor | For | Properties | Is |
| --- | --- | --- | --- |
| `Sky` | 2D | `top`, `bottom`, `middle`, `horizon` (0.5) | A vertical gradient over the view, under everything; `middle` sits `horizon` of the way down. A 3D level's sky is its `environment` and `lighting` |
| `Scatter` | 2D | `kind` (`stars`, `clouds`, `motes`), `count`, `seed`, `color`, `size` (px), `opacity`, `parallax`, `speed` (px/s), `twinkle`, `band { top, bottom }` | A seeded layer: stars twinkle by `twinkle`, clouds are soft puffs drifting at `speed`, motes rise. `parallax` 0 is fixed to the view and 1 moves with the world; `band` keeps it to a part of the view, as fractions from the top |
| `ParticleField` | both | `kind`, `count`, `extent { x, y, z }`, `radius`, `color`, `opacity`, `emissive`, `speed`, `follow`, `seed` (2D) | See below |
| `AmbientSound` | both | `sound`, `volume` (1), `fadeIn` (1 s), `rate` (1), `radius` (0) | A looping sound, faded in from silence. With a `radius` (px in 2D, metres in 3D) it is a place: full where it stands, falling off to silence that far from the camera (the view's centre in 2D, the eye in 3D); 0 fills the scene. Starts on its first frame, never in the editor or headless, and stops when its entity is removed or its scene leaves. A sound the game has not loaded is warned about once |

**Particle fields.** Stateless: each particle is a function of its index, the seed and the time. A `kind` is drawn in one dimension, and a field of the other dimension's kind, or of none, is refused at load naming the property.

- 2D: `fireflies` (wandering and pulsing, among the level), `leaves` (falling and turning), `rain` (slanted streaks) or `sparks` (rising and fading), the last three over the entities. `radius` and `extent` are px, `speed` px/s. `emissive` makes each bright one draw a small light in a lit level. With `follow` (the default) the field covers the view; without, the box of half sizes `extent` around the entity.
- 3D: `motes` (dust and pollen through a box of half sizes `extent` around the camera, or around the entity without `follow`, carried by `world.lighting.wind`) or `smoke` (rising from the entity at `speed` metres a second through a column `extent.y` in half-height, widening by `extent.x` and `extent.z`, leaning downwind). The field is the entity's `particles` record, which the scene collects into the frame for the renderer as it collects a light; sixteen fields a frame at most. See [particle fields](./renderer#three-dimensions).

| Template | For | Is |
| --- | --- | --- |
| `sky` | 2D | A dusk gradient |
| `stars` | 2D | Stars across the top half of the view |
| `fireflies`, `rain` | 2D | The particle field of that kind |
| `motes`, `smoke` | 3D | The particle field of that kind; smoke rises from where its object stands |
| `ambience` | both | An `AmbientSound` to give a sound |

## `m2d-kit/effects`

Combat visuals. The engine's `Attack` and `DamageFlash` know the rules; what a swing or a hit looks like is the game's, so these are ordinary constraints a scene attaches next to the mechanical ones and tunes to its palette. `registerEffects(game)` registers both under the names below.

| Constraint | Params | Does |
| --- | --- | --- |
| `AttackSwing` | `color` (`#ffffff`; an array is one colour per combo step), `duration` (0.3 s), `reach` (the attack's range), `attack` (the `Attack` slot to follow, `attack`) | A crescent that sweeps across the facing half when the attack starts and fades as it goes. It wraps the attack's `onStart`, so the two stay in step; the centre goes through the scene's projection when there is one |
| `HitBurst` | `color` (`#fff3e6`), `duration` (0.3 s), `radius` (the entity's size) | A flash over the entity and a ring that leaves it, on the `damage` world event `Health` raises — so a hit the server simulated bursts on every client watching. `flash()` fires one by hand |

## `m2d-kit/random`

Deterministic randomness for presentation: backdrops, scenery actors and menus that want their own fixed seed. `makeRng(seed)` is the engine's generator (mulberry32) re-exported; `range(rng, min, max)` draws a float in `[min, max)`. Simulation code draws from `game.rng`, never from here; see [Determinism](../contributing/determinism).

## `m2d-kit/textures`

`tileTexture(renderer, image, rect, tile = 128, options)` tiles a texture over a world rectangle at its natural scale, clipped to the rectangle. `origin: 'world'` (default) aligns the tiling to the world grid so neighbouring rectangles continue each other's pattern; `'rect'` pins it to the rectangle's own corner, which a parallax plane needs. Other options pass through to `drawSprite` (`tint`, `globalAlpha`).

## `m2d-kit/audio`

`audioOption(game)` is the Audio row a game adds to the settings menu with `game.settings.addOption`: one switch for music and effects together, through the engine's mute. A game with volumes of its own adds its own rows.
