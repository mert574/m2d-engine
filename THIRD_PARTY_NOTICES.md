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

## Basis Universal transcoder

The engine ships Binomial LLC's **Basis Universal** texture transcoder
(`basis_transcoder.js` and `basis_transcoder.wasm`), released under the
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). The full
license is included in
[LICENSES/Apache-2.0-basis_universal.txt](LICENSES/Apache-2.0-basis_universal.txt).

- Project: https://github.com/BinomialLLC/basis_universal
- Source: the build distributed by three.js (npm `three@0.187.0`,
  `examples/jsm/libs/basis/`)
- Directory: `packages/engine/src/core/renderers/webgpu/basis/`

Included unchanged except for an appended ES-module export line, marked by
a comment; checksums of the originals are recorded in the directory's
README. It turns the KTX2 textures the model compiler writes into the
GPU's compressed format at load.

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
The pack's white silhouettes (the shaded set) were resized to demo tiles
and tinted through the meadow's palette at asset time — the pack is
designed to be recoloured — with the foreground set additionally
defocused. Each file under `examples/src/scroller/textures/foliage/` is
named for its role, e.g. `far-grass-a.png`, `seedheads.png`, `bramble-b.png`.

- Pack page: https://kenney.nl/assets/foliage-sprites
- Obtained from the mirror: https://github.com/ETdoFresh/kenney.nl (`kenney_foliagesprites/PNG/Shaded`)

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

## 3D sample models: Cesium Milk Truck, Box Textured

- Cesium Milk Truck — © 2017 Cesium, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode), from the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMilkTruck). Used as-is in `examples/src/yard/models/`. The Cesium logo on it is a trademark of Cesium and not covered by the licence.
- Box Textured — © 2017 Cesium, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode), from the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BoxTextured). Used as-is as a test fixture in `packages/engine/test/fixtures/models/`.
- Fox — © 2014 tomkranis (rigging and animation), © 2017 AsoboStudio and scurest (glTF conversion), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode), from the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox). Used as-is in `examples/src/yard/models/`.
- Rigged Simple — © 2017 Cesium, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode), from the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/RiggedSimple). Used as-is as a test fixture in `packages/engine/test/fixtures/models/`.
## Poly Haven models (CC0)

The lot's trees, ground cover, rocks, street and garden furniture, depot stock, the shutters and lamps on its buildings, fences and ruin are photoscanned and modelled assets from [Poly Haven](https://polyhaven.com), all [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Fetched by `examples/scripts/fetchPolyHaven.mjs` and compiled by `examples/scripts/compileModel.mjs` into `examples/src/yard/models/ph/` as levels of detail with resized, re-encoded textures; some are single pieces cut from a modular kit (a fence panel, one pole, one bench, one shutter, the fort's tower). The compiled files are derived works of the sources below and carry the same CC0 dedication.

| Asset | Name | Authors |
| --- | --- | --- |
| [Barrel_01](https://polyhaven.com/a/Barrel_01) | Barrel_01 | Jorge Camacho |
| [barrel_03](https://polyhaven.com/a/barrel_03) | Barrel 03 | Serhii Khromov |
| [boulder_01](https://polyhaven.com/a/boulder_01) | Boulder 01 | Rico Cilliers |
| [cardboard_box_01](https://polyhaven.com/a/cardboard_box_01) | Cardboard Box 01 | Rahul Chaudhary |
| [CoffeeCart_01](https://polyhaven.com/a/CoffeeCart_01) | Coffee Cart 01 | Joe Seabuhr |
| [compost_bags](https://polyhaven.com/a/compost_bags) | Compost Bags | James Ray Cock |
| [concrete_road_barrier](https://polyhaven.com/a/concrete_road_barrier) | Concrete Road Barrier | Amal Kumar |
| [covered_car](https://polyhaven.com/a/covered_car) | Covered Car | MP |
| [dandelion_01](https://polyhaven.com/a/dandelion_01) | Dandelion 01 | Rob Tuytel, Rico Cilliers |
| [dead_tree_trunk](https://polyhaven.com/a/dead_tree_trunk) | Dead Tree Trunk | Rob Tuytel |
| [dead_tree_trunk_02](https://polyhaven.com/a/dead_tree_trunk_02) | Dead Tree Trunk 02 | Jenelle van Heerden, Rico Cilliers |
| [dry_branches_medium_01](https://polyhaven.com/a/dry_branches_medium_01) | Dry Branches Medium 01 | Rico Cilliers |
| [fern_02](https://polyhaven.com/a/fern_02) | Fern 02 | Rob Tuytel, Rico Cilliers |
| [fir_sapling_medium](https://polyhaven.com/a/fir_sapling_medium) | Fir Sapling Medium | Rob Tuytel, Rico Cilliers |
| [fire_hydrant](https://polyhaven.com/a/fire_hydrant) | Fire Hydrant | Gonçalo Felício |
| [flower_gazania](https://polyhaven.com/a/flower_gazania) | Flower Gazania | James Ray Cock, Jenelle van Heerden |
| [garden_gnome](https://polyhaven.com/a/garden_gnome) | Garden Gnome | Bhargav Kubal |
| [garden_hose_wall_mounted_01](https://polyhaven.com/a/garden_hose_wall_mounted_01) | Garden Hose Wall Mounted 01 | Kuutti Siitonen |
| [grass_medium_01](https://polyhaven.com/a/grass_medium_01) | Grass Medium 01 | Rob Tuytel, Rico Cilliers |
| [grass_medium_02](https://polyhaven.com/a/grass_medium_02) | Grass Medium 02 | Rico Cilliers |
| [hand_truck](https://polyhaven.com/a/hand_truck) | Hand Truck | Mutanzom3D |
| [industrial_storage_cart](https://polyhaven.com/a/industrial_storage_cart) | Industrial Storage Cart | Jule Bielitz |
| [industrial_wall_lamp](https://polyhaven.com/a/industrial_wall_lamp) | Industrial Wall Lamp | Kuutti Siitonen |
| [island_tree_01](https://polyhaven.com/a/island_tree_01) | Island Tree 01 | Rob Tuytel, Rico Cilliers |
| [island_tree_02](https://polyhaven.com/a/island_tree_02) | Island Tree 02 | Rob Tuytel, Rico Cilliers |
| [island_tree_03](https://polyhaven.com/a/island_tree_03) | Island Tree 03 | Rob Tuytel, Rico Cilliers |
| [jacaranda_tree](https://polyhaven.com/a/jacaranda_tree) | Jacaranda Tree | Rob Tuytel, Rico Cilliers |
| [large_iron_gate](https://polyhaven.com/a/large_iron_gate) | Large Iron Gate | Josh Dean |
| [metal_trash_can](https://polyhaven.com/a/metal_trash_can) | Metal Trash Can | GurJas Studios |
| [modular_chainlink_fence](https://polyhaven.com/a/modular_chainlink_fence) | Modular Chainlink Fence | James Ray Cock, Amal Kumar |
| [modular_electricity_poles](https://polyhaven.com/a/modular_electricity_poles) | Modular Electricity Poles | James Ray Cock |
| [modular_fort_01](https://polyhaven.com/a/modular_fort_01) | Modular Fort 01 | Rico Cilliers |
| [modular_industrial_pipes_01](https://polyhaven.com/a/modular_industrial_pipes_01) | Modular Industrial Pipes 01 | Jorge Camacho |
| [modular_street_seating](https://polyhaven.com/a/modular_street_seating) | Modular Street Seating | Stuart Attenborrow |
| [moss_01](https://polyhaven.com/a/moss_01) | Moss 01 | Rob Tuytel |
| [namaqualand_boulder_02](https://polyhaven.com/a/namaqualand_boulder_02) | Namaqualand Boulder 02 | Greg Zaal, Rico Cilliers |
| [nettle_plant](https://polyhaven.com/a/nettle_plant) | Nettle Plant | Rob Tuytel, Rico Cilliers |
| [old_tyre](https://polyhaven.com/a/old_tyre) | Old Tyre | MP |
| [outdoor_table_chair_set_01](https://polyhaven.com/a/outdoor_table_chair_set_01) | Outdoor Table Chair Set 01 | James Ray Cock |
| [painted_wooden_bench](https://polyhaven.com/a/painted_wooden_bench) | Painted Wooden Bench | Kirill Sannikov |
| [periwinkle_plant](https://polyhaven.com/a/periwinkle_plant) | Periwinkle Plant | Amal Kumar |
| [pine_tree_01](https://polyhaven.com/a/pine_tree_01) | Pine Tree 01 | Rob Tuytel, Rico Cilliers |
| [planter_box_01](https://polyhaven.com/a/planter_box_01) | Planter Box 01 | James Ray Cock |
| [planter_box_02](https://polyhaven.com/a/planter_box_02) | Planter Box 02 | James Ray Cock |
| [plastic_crate_03](https://polyhaven.com/a/plastic_crate_03) | Plastic Crate 03 | Pacific Penguin |
| [plastic_monobloc_chair_01](https://polyhaven.com/a/plastic_monobloc_chair_01) | Plastic Monobloc Chair 01 | Kuutti Siitonen |
| [portable_generator](https://polyhaven.com/a/portable_generator) | Portable Generator | James Ray Cock |
| [potted_plant_01](https://polyhaven.com/a/potted_plant_01) | Potted Plant 01 | Rico Cilliers |
| [potted_plant_02](https://polyhaven.com/a/potted_plant_02) | Potted Plant 02 | Rico Cilliers |
| [propane_tank](https://polyhaven.com/a/propane_tank) | Propane Tank | Slinc |
| [rock_moss_set_01](https://polyhaven.com/a/rock_moss_set_01) | Rock Moss Set 01 | Kless Gyzen |
| [rollershutter_door](https://polyhaven.com/a/rollershutter_door) | Rollershutter Door | MP |
| [rollershutter_window_01](https://polyhaven.com/a/rollershutter_window_01) | Rollershutter Window 01 | MP |
| [searsia_lucida](https://polyhaven.com/a/searsia_lucida) | Searsia Lucida | James Ray Cock, Jenelle van Heerden |
| [security_light](https://polyhaven.com/a/security_light) | Security Light | Maximilian Schuster |
| [shrub_01](https://polyhaven.com/a/shrub_01) | Shrub 01 | Rico Cilliers |
| [shrub_02](https://polyhaven.com/a/shrub_02) | Shrub 02 | Rico Cilliers |
| [shrub_03](https://polyhaven.com/a/shrub_03) | Shrub 03 | Rico Cilliers |
| [stone_fire_pit](https://polyhaven.com/a/stone_fire_pit) | Stone Fire Pit | Sebastian Platen |
| [street_lamp_01](https://polyhaven.com/a/street_lamp_01) | Street Lamp 01 | Josh Dean |
| [street_lamp_02](https://polyhaven.com/a/street_lamp_02) | Street Lamp 02 | Josh Dean |
| [tool_cart](https://polyhaven.com/a/tool_cart) | Tool Cart | Savva Zakharov |
| [tree_small_02](https://polyhaven.com/a/tree_small_02) | Tree Small 02 | Rico Cilliers |
| [tree_stump_01](https://polyhaven.com/a/tree_stump_01) | Tree Stump 01 | Rob Tuytel |
| [utility_box_01](https://polyhaven.com/a/utility_box_01) | Utility Box 01 | James Ray Cock |
| [water_manhole_cover](https://polyhaven.com/a/water_manhole_cover) | Water Manhole Cover | Raunox |
| [weed_plant_02](https://polyhaven.com/a/weed_plant_02) | Weed Plant 02 | Rob Tuytel, Rico Cilliers |
| [wooden_crate_01](https://polyhaven.com/a/wooden_crate_01) | Wooden Crate 01 | James Ray Cock |
| [wooden_crate_02](https://polyhaven.com/a/wooden_crate_02) | Wooden Crate 02 | James Ray Cock, Jurita Burger |
| [wooden_ladder](https://polyhaven.com/a/wooden_ladder) | Wooden Ladder | Miroslav Turura |
| [wooden_picnic_table](https://polyhaven.com/a/wooden_picnic_table) | Wooden Picnic Table | Ulan Cabanilla |

## Poly Haven textures (CC0)

The lot's ground (lawn, leaf litter, gravel, paving, setts, dirt), roads, kerbs, walls, plinths, crates and buildings (brick, render, plaster, cladding, corrugated iron, roof tiles, roller doors) are primitive shapes mapped with textures from [Poly Haven](https://polyhaven.com), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Fetched by `examples/scripts/buildModels.mjs` into `examples/src/yard/textures/` as their 1k colour, normal and occlusion-roughness-metal maps; not committed.

| Asset | Name | Authors |
| --- | --- | --- |
| [asphalt_03](https://polyhaven.com/a/asphalt_03) | Asphalt 03 | Dario Barresi, Charlotte Baglioni |
| [brick_wall_006](https://polyhaven.com/a/brick_wall_006) | Brick Wall 006 | Jan Burghardt |
| [brown_planks_09](https://polyhaven.com/a/brown_planks_09) | Brown Planks 09 | Rob Tuytel |
| [clay_roof_tiles](https://polyhaven.com/a/clay_roof_tiles) | Clay Roof Tiles | Amal Kumar |
| [cobblestone_floor_04](https://polyhaven.com/a/cobblestone_floor_04) | Cobblestone Floor 04 | Rob Tuytel |
| [concrete_floor_02](https://polyhaven.com/a/concrete_floor_02) | Concrete Floor 02 | Rob Tuytel |
| [concrete_pavement_03](https://polyhaven.com/a/concrete_pavement_03) | Concrete Pavement 03 | Charlotte Baglioni |
| [corrugated_iron_02](https://polyhaven.com/a/corrugated_iron_02) | Corrugated Iron 02 | Jenelle van Heerden, Sergej Majboroda |
| [dirt_floor](https://polyhaven.com/a/dirt_floor) | Dirt Floor | eye-candy.xyz |
| [exterior_wall_cladding](https://polyhaven.com/a/exterior_wall_cladding) | Exterior Wall Cladding | Charlotte Baglioni |
| [factory_brick](https://polyhaven.com/a/factory_brick) | Factory Brick | Rob Tuytel |
| [forest_leaves_03](https://polyhaven.com/a/forest_leaves_03) | Forest Leaves 03 | Rob Tuytel, Dimitrios Savva |
| [gravel_floor_02](https://polyhaven.com/a/gravel_floor_02) | Gravel Floor 02 | Jenelle van Heerden, Dimitrios Savva |
| [grey_roof_tiles](https://polyhaven.com/a/grey_roof_tiles) | Grey Roof Tiles | Rob Tuytel |
| [herringbone_pavement](https://polyhaven.com/a/herringbone_pavement) | Herringbone Pavement | Charlotte Baglioni |
| [leafy_grass](https://polyhaven.com/a/leafy_grass) | Leafy Grass | Charlotte Baglioni |
| [painted_metal_shutter](https://polyhaven.com/a/painted_metal_shutter) | Painted Metal Shutter | Dario Barresi, Rico Cilliers, Charlotte Baglioni |
| [red_brick_03](https://polyhaven.com/a/red_brick_03) | Red Brick 03 | Rob Tuytel |
| [white_stucco](https://polyhaven.com/a/white_stucco) | White Stucco | Amal Kumar |
| [yellow_plaster](https://polyhaven.com/a/yellow_plaster) | Yellow Plaster | Rob Tuytel |
