# Third-party notices

## UI typeface: Exo

The engine ships **Exo** by Natanael Gama / The Exo Project Authors, released under
the [SIL Open Font License 1.1](https://scripts.sil.org/OFL). The full license is
included in [LICENSES/OFL-1.1-Exo.txt](LICENSES/OFL-1.1-Exo.txt). The font retains
its separate license; the project's MIT license covers its original code and
artwork, not this font.

- Project: https://github.com/NDISCOVER/Exo-1.0
- Source: https://fonts.google.com/specimen/Exo (v25 webfont build)
- Directory: `packages/engine/src/core/ui/fonts/`

Included unchanged, as the Latin and Latin Extended subsets of the variable
face (weights 100-900) in upright and italic. Loaded by
`packages/engine/src/core/ui/fonts.js`. No glyphs were modified and the
font is not sold; it is bundled as part of the engine under the OFL's permission
to distribute the font software with software.

# Music credits

The demos' music is from **IDMf001: InDepthMelodics**, the first
compilation released by the IDMf Netlabel (the IDM Forum), released under
[Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
The full license is included in [LICENSES/CC-BY-3.0.txt](LICENSES/CC-BY-3.0.txt).
These recordings retain their separate license; the project's MIT license covers
its original code and artwork, not these recordings.

- Release page and license declaration: https://archive.org/details/Idmf001IndepthmelodicsfreeElectronicMusicCompilation
- Files are the release's Ogg Vorbis encodes, included unchanged and renamed.
  Playback volume is reduced and playback repeats in the demos.

| Track | Artist | Used for | File |
| --- | --- | --- | --- |
| Stars at Dawn | Nathan Rain | Platformer menu, Night Circuit menu, Beeline menu | `examples/src/shared/music/nathanrain-stars-at-dawn.ogg` |
| Perfect Union | The Get | Platformer level, Beeline level | `examples/src/shared/music/theget-perfect-union.ogg` |
| Last Transmission | Kloquewurk | Top-down menu, showcase menu | `examples/src/shared/music/kloquewurk-last-transmission.ogg` |
| November | Chaotic Pulse | Top-down level | `examples/src/shared/music/chaoticpulse-november.ogg` |
| Symmetrical Tree | Binary Pulse | Maze menu | `examples/src/shared/music/binarypulse-symmetrical-tree.ogg` |
| Redux | Halogen | Maze level | `examples/src/shared/music/halogen-redux.ogg` |
| G2 (Cockboymattt Remix) | GBSR | Showcase | `examples/src/shared/music/gbsr-g2-cockboymattt-remix.ogg` |
| Longing for Rain | Evelon | Night Circuit level | `examples/src/shared/music/evelon-longing-for-rain.ogg` |

The Hollow Grove demo plays tracks by **Matthew Pablo** (https://www.matthewpablo.com),
from [OpenGameArt](https://opengameart.org), released under
[Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
The MP3 encodes are included unchanged and renamed; playback volume is reduced and playback repeats.

| Track | Used for | Source | File |
| --- | --- | --- | --- |
| Woodland Fantasy | Hollow Grove level | https://opengameart.org/content/woodland-fantasy | `examples/src/shared/music/matthewpablo-woodland-fantasy.mp3` |
| Enchanted Festival | Hollow Grove menu | https://opengameart.org/content/enchanted-festival | `examples/src/shared/music/matthewpablo-enchanted-festival.mp3` |

Credits are also published at https://mert574.github.io/m2d-engine/examples/music-credits.

# Sound effects

The demos' sound effects are from **Interface Sounds (1.0)** by Kenney
(www.kenney.nl), released under
[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Included unchanged, under `examples/src/shared/sfx/`.
Source: https://kenney.nl/assets/interface-sounds
(mirror: https://opengameart.org/content/interface-sounds).

# Car sounds: OpenGameArt

The circuit demo's tyre squeal loop is from [OpenGameArt](https://opengameart.org), under `examples/src/circuit/sounds/`. (Its electric motor whine is synthesised in code, in `examples/src/circuit/evSound.js`.)

| Sound | Author | License | Source | File |
| --- | --- | --- | --- | --- |
| Car tire squeal skid loop (`tires_squal_loop.wav`) | qubodup | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://opengameart.org/content/car-tire-squeal-skid-loop | `tyre_squeal_loop.wav` |

The loop was converted from 24-bit, 96 kHz to 16-bit, 24 kHz mono and normalised; no other change. The CC BY 3.0 license text is in [LICENSES/CC-BY-3.0.txt](LICENSES/CC-BY-3.0.txt).

# Footsteps: Owlish Media

The Hollow Grove demo's grass footsteps are from the **Sound Effects Pack** by
Owlish Media on [OpenGameArt](https://opengameart.org/content/sound-effects-pack),
dedicated to the public domain under
[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The pack's grassy footstep WAVs are included unchanged, renamed to
`footstep-grass-*.wav` under `examples/src/oblique/sounds/`.

# Sprites: Wenrexa nature sprites

The Hollow Grove demo's trees, logs and stumps are from **Assets Free: Nature
Sprites [Trees, Shrubs]** by Wenrexa on
[OpenGameArt](https://opengameart.org/content/assets-free-nature-sprites-trees-shrubs),
dedicated to the public domain under
[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The pack's PNGs are included unchanged and renamed, under
`examples/src/oblique/textures/trees/`.

| Original | File |
| --- | --- |
| `PNG/07.png` | `lime.png` |
| `PNG/13.png` | `oak-a.png` |
| `PNG/14.png` | `oak-b.png` |
| `PNG/17.png` | `gold-a.png` |
| `PNG/20.png` | `gold-b.png` |
| `PNG/23.png` | `elder.png` |
| `PNG/05.png` | `ember.png` |
| `PNG/01.png` | `violet.png` |
| `PNG/03.png` | `lilac.png` |
| `PNG/15.png` | `log.png` |
| `PNG/16.png` | `stump.png` |
| `PNG/10.png` | `dead.png` |

# Characters: Flare isometric hero and heroine

The Hollow Grove demo's people are Clint Bellanger's **Isometric Hero and
Heroine** from [OpenGameArt](https://opengameart.org/content/isometric-hero-and-heroine),
released under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
Each of the demo's sheets layers three of the pack's PNGs (a body, a head
and a weapon) into one image, with the renders' baked ground shadow removed
(the engine draws its own, which stays on the ground when a sprite jumps):
128px frames, eight facing rows, animation columns as in the Flare engine. Under
`examples/src/oblique/textures/characters/`.

| Character | Layers | File |
| --- | --- | --- |
| The walker | hero `clothes`, `male_head1`, `staff` | `wanderer.png` |
| Maren | heroine `clothes`, `head_long`, `wand` | `maren.png` |
| Oswin | hero `leather_armor`, `male_head3`, `rod` | `oswin.png` |

# Tiles: Isometric Stone Soup

The Cinder Keep demo's floors, wall blocks and torch are from **Isometric Stone
Soup** by Screaming Brain Studios on
[OpenGameArt](https://opengameart.org/content/isometric-stone-soup), an
isometric conversion of the Dungeon Crawl Stone Soup tiles, dedicated to the
public domain under
[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The sheets are included with their magenta background keyed to transparency
and otherwise unchanged, under `examples/src/iso/textures/tiles/`.

| Original | File |
| --- | --- |
| `Floors/ISS_Floor_Crypt-64x32.png` | `floor-crypt.png` |
| `Floors/ISS_Floor_Cobble_Blood-64x32.png` | `floor-cobble.png` |
| `Floors/ISS_Floor_Dirt-64x32.png` | `floor-dirt.png` |
| `Walls/Block/ISS_Block_Brick_Gray-64x64.png` | `wall-brick.png` |
| `Walls/Block/ISS_Block_Catacombs-64x64.png` | `wall-catacombs.png` |
| `Walls/ISS-Torch_Anim-32x48.png` | `torch.png` |

# Characters: Flare isometric hero and creatures

The Cinder Keep demo's knight layers four of Clint Bellanger's **Isometric
Hero and Heroine** PNGs (above, baked shadow removed as above) into one sheet; its skeleton and goblin are
from his **Isometric Hero and Creatures** on
[OpenGameArt](https://opengameart.org/content/isometric-hero-and-creatures),
also [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/),
halved from 256px to 128px frames. Under `examples/src/iso/textures/characters/`.

| Character | Source | File |
| --- | --- | --- |
| The knight | hero `steel_armor`, `male_head2`, `longsword`, `shield` | `knight.png` |
| Skeleton | creatures `skeleton.png` | `skeleton.png` |
| Goblin | creatures `goblin.png` | `goblin.png` |

The Ash Row demo does the same under `examples/src/belt/textures/characters/`: its rogue layers the heroine's `leather_armor`, `head_long` and `shortsword` (baked shadow removed as above); its thugs are the creatures pack's zombie, goblin and skeleton (`zombie.png`, `goblin.png`, `skeleton.png`), halved.

# Icons: game-icons.net

The Hollow Grove demo's ability icons are by Lorc from [game-icons.net](https://game-icons.net),
released under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/),
rasterised to 128px PNGs with a transparent background. Under
`examples/src/oblique/textures/icons/`.

| Icon | File |
| --- | --- |
| [Sunbeams](https://game-icons.net/1x1/lorc/sunbeams.html) | `flare.png` |
| [Teleport](https://game-icons.net/1x1/lorc/teleport.html) | `blink.png` |
| [Magic shield](https://game-icons.net/1x1/lorc/magic-shield.html) | `ward.png` |

The Cinder Keep demo's ability icons are from the same set, under `examples/src/iso/textures/icons/`.

| Icon | File |
| --- | --- |
| [Sword spin](https://game-icons.net/1x1/lorc/sword-spin.html) | `cleave.png` |
| [Sprint](https://game-icons.net/1x1/lorc/sprint.html) | `dash.png` |
| [Fire shield](https://game-icons.net/1x1/lorc/fire-shield.html) | `emberShield.png` |

# Sprites and sounds: Kenney Space Shooter Redux

The Salvage Run demo's ships, meteors, lasers, effects, pickups, star tile
and sound effects are from the **Space Shooter Redux** pack by
[Kenney](https://kenney.nl), dedicated to the public domain under
[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Files are included unchanged and renamed under `examples/src/drift/textures/`
and `examples/src/drift/sounds/`; the pack's license text is kept beside them
as `textures/LICENSE-kenney.txt`.

- Pack page: https://kenney.nl/assets/space-shooter-redux
- Obtained from the mirror: https://github.com/ETdoFresh/kenney.nl (`spaceshooter/`)

| Folder | Originals |
| --- | --- |
| `textures/ships/` | `playerShip2_blue`, `playerShip2_damage1..3`, `enemyRed1`, `enemyBlack3` |
| `textures/meteors/` | `meteorBrown_big1`, `meteorBrown_big3`, `meteorBrown_med1`, `meteorBrown_small1`, `meteorGrey_big2`, `meteorGrey_med2`, `meteorGrey_small2`, `meteorGrey_tiny1` |
| `textures/effects/` | `laserBlue01`, `laserRed01`, `laserBlue08`, `laserRed08`, `fire09`, `fire13`, `shield1`, `star1..3` |
| `textures/pickups/` | `bolt_gold`, `powerupBlue_star`, `shield_gold` |
| `textures/backgrounds/` | `darkPurple` |
| `sounds/` | `sfx_laser1`, `sfx_laser2`, `sfx_zap`, `sfx_shieldDown`, `sfx_shieldUp`, `sfx_twoTone`, `sfx_lose` |

# Sprites: Kenney Foliage Sprites

The Beeline demo's meadow — its parallax planes, flowers and thistles — is
built from the **Foliage Sprites** pack by [Kenney](https://kenney.nl),
dedicated to the public domain under
[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The pack's white silhouettes were resized to demo tiles and flooded with the
meadow's palette at asset time (the pack is designed to be recoloured);
each file under `examples/src/scroller/textures/foliage/` is named for its
role, e.g. `far-grass-a.png`, `seedheads.png`, `bramble-b.png`.

- Pack page: https://kenney.nl/assets/foliage-sprites
- Obtained from the mirror: https://github.com/ETdoFresh/kenney.nl (`kenney_foliagesprites/PNG/Flat`)

# Sprites: Kenney Racing Pack

The circuit demo's sprites and ground textures are from the **Racing Pack**
by [Kenney](https://kenney.nl) (kenney.nl), dedicated to the public domain
under [Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
No attribution is required; it is given with thanks. Files are included
unchanged in `examples/src/circuit/textures/`, keeping the pack's own
filenames (`car_*`, `barrier_*`, `land_*`, `road_asphalt`, `tree_*`, and so on).

- Pack page: https://kenney.nl/assets/racing-pack
- Obtained from the mirror: https://github.com/ETdoFresh/kenney.nl (`kenney_racingpack_updated/`)

# Textures

The Hedgerow Court, top-down, Hollow Grove and Ash Row demos use materials from **ambientCG**
(https://ambientcg.com), released under
[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Each is the 1K colour map, resized to a 256px tile (512px for the grove) and re-encoded as JPEG;
Hedgerow Court's two are also lightly colour-graded (the lawn warmed, the hedge deepened).

| Material | Used for | File |
| --- | --- | --- |
| [Concrete034](https://ambientcg.com/view?id=Concrete034) | Top-down floor | `examples/src/topdown/textures/concrete.jpg` |
| [Metal032](https://ambientcg.com/view?id=Metal032) | Top-down walls | `examples/src/topdown/textures/steel.jpg` |
| [Grass004](https://ambientcg.com/view?id=Grass004) | Hedgerow Court lawn | `examples/src/maze/textures/lawn.jpg` |
| [Moss002](https://ambientcg.com/view?id=Moss002) | Hedgerow Court hedges | `examples/src/maze/textures/hedge.jpg` |
| [Travertine009](https://ambientcg.com/view?id=Travertine009) | Hedgerow Court fountain and plaza (composed into `fountain.png` and `plaza.png`) | `examples/src/maze/textures/` |
| [Grass001](https://ambientcg.com/view?id=Grass001) | Hollow Grove floor | `examples/src/oblique/textures/grass.jpg` |
| [Ground037](https://ambientcg.com/view?id=Ground037) | Hollow Grove path | `examples/src/oblique/textures/ground.jpg` |
| [PavingStones128](https://ambientcg.com/view?id=PavingStones128) | Ash Row street | `examples/src/belt/textures/paving.jpg` |
| [Bricks059](https://ambientcg.com/view?id=Bricks059) | Ash Row frontage | `examples/src/belt/textures/bricks.jpg` |
| [PaintedPlaster006](https://ambientcg.com/view?id=PaintedPlaster006) | Ash Row frontage | `examples/src/belt/textures/plaster.jpg` |
| [Road007](https://ambientcg.com/view?id=Road007) | Ash Row road | `examples/src/belt/textures/road.jpg` |
| [RoofingTiles006](https://ambientcg.com/view?id=RoofingTiles006) | Ash Row roofs and crates | `examples/src/belt/textures/roofing.jpg` |
| [Facade018A](https://ambientcg.com/view?id=Facade018A) | Ash Row buildings | `examples/src/belt/textures/facade-a.jpg` |
| [Facade019A](https://ambientcg.com/view?id=Facade019A) | Ash Row buildings | `examples/src/belt/textures/facade-b.jpg` |
| [Facade020A](https://ambientcg.com/view?id=Facade020A) | Ash Row buildings | `examples/src/belt/textures/facade-c.jpg` |
