/**
 * Lays out Hedgerow Court's three gardens: `node scripts/buildCourtScenes.mjs`.
 *
 * Each court is exactly one screen of hedge maze, carved by a
 * backtracker and stitched into a map of courts with gates between them
 * (see courtyards.mjs). That used to happen at boot, which meant no
 * editor could open a garden; the carving now runs here, once, and
 * `scenes/court*.json` are the gardens.
 *
 * The lawn, hedge, fountain and plaza textures are free, open assets
 * under `src/maze/textures/` (see THIRD_PARTY_NOTICES.md).
 */
import { writeFileSync } from 'node:fs';
import { writeScene } from 'm2d-editor-core';
import { seedTarget, placer } from './seedScene.mjs';
import { TILE, COURT_PX, MAPS, buildMap, wallObjects } from './courtyards.mjs';

/** How long a court's title hangs over it, in seconds. */
const TITLE_HOLD = 3;

const sensor = { bodyType: 'static', isSensor: true };

/** One court's scene, laid out from its map config. */
function courtScene(config, next) {
  const map = buildMap(config);
  const { objects, add } = placer();

  // The garden the courts stand in, under everything and over it.
  add('garden', map.width / 2, map.height / 2, 16, 16,
    { layer: 'lawn', lawnTexture: 'lawn', plazaTexture: 'plaza' });
  add('garden', map.width / 2, map.height / 2, 16, 16, { layer: 'sky' });

  // 26px in 32px corridors: the character controller keeps an 0.5px gap
  // on each side, so a full-width 32px body physically cannot fit — it
  // jammed against both walls at once, even on straights.
  add('player', map.start.x, map.start.y, 26, 26);
  add('fountain', map.goal.x, map.goal.y, 36, 36);
  for (const bed of map.flowerBeds) add('bed', bed.x, bed.y, 26, 26, { seed: bed.seed });
  for (const wall of wallObjects(map.wall)) add('hedge', wall.x, wall.y, wall.width, wall.height);

  const beds = map.flowerBeds.length;

  return {
    scene: {
      version: 4,
      name: config.scene,
      type: 'level',
      gameType: 'topDown',
      title: config.name,
      world: {
        width: map.width,
        height: map.height,
        gravity: { x: 0, y: 0 },
        player: 'player-1',
        // One court is one screen: the camera holds the court the gardener
        // is in and glides through the hedge when they take a gate.
        camera: {
          mode: 'rooms',
          roomSize: { width: COURT_PX.width, height: COURT_PX.height },
          lerp: 0.12,
          bounds: 'world'
        },
        // Morning. The sun does the work; the grade keeps it warm and the
        // bloom only catches the water and the brightest petals.
        lighting: { ambient: '#fffdf2' },
        post: {
          bloom: { threshold: 0.82, strength: 0.32, blur: 18 },
          vignette: { strength: 0.13, start: 0.64 },
          grade: { shadows: '#8aa381', highlights: '#fff8e2', amount: 0.32, saturation: 1.08, contrast: 1.02 },
          grain: { strength: 0.03 }
        },
        music: { track: 'game' },
        counters: {
          beds: { initial: 0, max: beds },
          bedsTotal: { prefab: 'bed', count: 'placed' }
        },
        rules: [
          {
            id: 'title',
            when: { event: 'start' },
            then: [{ do: 'notice', text: config.name, seconds: TITLE_HOLD }]
          },
          {
            id: 'tend',
            when: { event: 'emit', name: 'tended' },
            once: false,
            then: [
              { do: 'count', counter: 'beds', add: 1 },
              { do: 'sound', key: 'bloom' }
            ]
          },
          ...(beds ? [{
            id: 'all-tended',
            when: { event: 'count', counter: 'beds', atLeast: beds },
            then: [{ do: 'notice', text: 'Every bed in bloom', seconds: 2.2 }]
          }] : []),
          {
            id: 'walked',
            when: { event: 'notify', name: 'fountain' },
            then: [
              { do: 'sound', key: 'solved' },
              { do: 'notice', text: config.banner, seconds: config.last ? 3.4 : 2.5 },
              { do: 'switch', scene: next ?? 'mainMenu', after: config.last ? 3.6 : 1.8 }
            ]
          },
          {
            id: 'menu',
            when: { event: 'action', action: 'menu' },
            then: [{ do: 'switch', scene: 'mainMenu' }]
          }
        ]
      },
      assets: {
        spritesheets: {
          hedge: { url: 'textures/hedge.jpg', frameWidth: 512, frameHeight: 512 },
          fountain: { url: 'textures/fountain.png', frameWidth: 256, frameHeight: 256 }
        },
        images: {
          lawn: { url: 'textures/lawn.jpg' },
          plaza: { url: 'textures/plaza.png' }
        },
        sounds: {
          solved: { url: 'sounds/maximize_006.ogg' },
          bloom: { url: 'sounds/confirmation_001.ogg', volume: 0.5 }
        },
        music: { game: { url: 'music/halogen-redux.ogg' } }
      },
      prefabs: {
        // A circle character in 32px corridors the player is also 32px wide:
        // the round shape plus the controller's slide is what lets a 90° turn
        // happen on the move instead of only when perfectly aligned.
        player: {
          actor: 'Gardener',
          physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 },
          constraints: {
            movement: { type: 'GlideControl', params: { speed: 230, grid: TILE } }
          }
        },
        hedge: { actor: 'Hedge', spritesheet: 'hedge', physics: { bodyType: 'static' } },
        fountain: { actor: 'Fountain', spritesheet: 'fountain', physics: sensor },
        bed: { actor: 'FlowerBed', physics: sensor },
        garden: { actor: 'GardenBackdrop', physics: sensor }
      },
      layers: [{ name: 'garden', objects }],
      hud: [
        {
          type: 'text',
          id: 'beds',
          x: -20,
          y: 14,
          anchor: 'top-right',
          properties: {
            text: 'BEDS {beds} / {bedsTotal}',
            align: 'right',
            fontSize: '14px', letterSpacing: 2, color: '#f2e6b8',
            outlineColor: 'rgba(30, 44, 20, 0.6)', outlineWidth: 2
          }
        },
        {
          type: 'notice',
          id: 'banner',
          x: 0,
          y: 60,
          anchor: 'top',
          properties: {
            color: '#8ee6a0', fontSize: '22px', fontWeight: '700', align: 'center'
          }
        }
      ]
    },
    objects: objects.length,
    beds
  };
}

for (const [i, config] of MAPS.entries()) {
  const out = seedTarget(new URL(`../src/maze/scenes/${config.scene}.json`, import.meta.url));
  const { scene, objects, beds } = courtScene(config, MAPS[i + 1]?.scene);
  writeFileSync(out, writeScene(scene));
  console.log(`${config.scene}: ${objects} objects, ${beds} beds → ${out}`);
}
