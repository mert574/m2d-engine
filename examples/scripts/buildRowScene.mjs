/**
 * Lays out Ash Row's scene JSON: `node scripts/buildRowScene.mjs`.
 *
 * A belt scroller: a street that runs to the right, with a depth lane the
 * player walks up and down. The ground plane is x along the street and y
 * the depth; the scene's `belt` projection compresses depth on screen.
 * Sections lock the camera until their wave is beaten; the waves are
 * placed here and spawned by the game. Every sprite is a free, open asset
 * under `src/belt/textures/` (see THIRD_PARTY_NOTICES.md).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeScene, writeManifest } from 'm2d-editor-core';
import { seedTarget } from './seedScene.mjs';

// A seed: writes the scene only when it is not there; see seedScene.mjs.
const out = seedTarget(new URL('../src/belt/scenes/row.json', import.meta.url));

const LENGTH = 5200;
const LANE = { top: 40, bottom: 360 };      // depth range the feet may stand in
const DEPTH = 400;                          // ground y extent

const FLARE_ROWS = ['left', 'up_left', 'up', 'up_right', 'right', 'down_right', 'down', 'down_left'];
function directional(columns) {
  const animations = {};
  FLARE_ROWS.forEach((direction, row) => {
    for (const [name, { from, count, fps, loop }] of Object.entries(columns)) {
      const frames = Array.from({ length: count }, (_, k) => [from + k, row]);
      animations[`${name}_${direction}`] = loop === false ? { frames, fps, loop } : { frames, fps };
    }
  });
  animations.idle = animations.idle_down;
  animations.run = animations.run_down;
  return animations;
}
const heroAnimations = () => directional({
  idle: { from: 0, count: 4, fps: 5 }, run: { from: 4, count: 8, fps: 14 },
  swing: { from: 12, count: 4, fps: 14, loop: false }, hit: { from: 18, count: 2, fps: 8, loop: false },
  die: { from: 20, count: 4, fps: 8, loop: false }, cast: { from: 24, count: 4, fps: 10, loop: false }
});
const creatureAnimations = () => directional({
  idle: { from: 0, count: 2, fps: 2 }, run: { from: 2, count: 2, fps: 6 },
  swing: { from: 4, count: 2, fps: 6, loop: false }, hit: { from: 6, count: 1, fps: 1 }, die: { from: 7, count: 1, fps: 1, loop: false }
});

const objects = [];
const counts = new Map();
/** A stable id, readable in a diff: the prefab and its ordinal. */
const nextId = (prefab) => {
  const n = (counts.get(prefab) ?? 0) + 1;
  counts.set(prefab, n);
  return `${prefab}-${n}`;
};
const add = (prefab, x, y, width, height, properties) => {
  const o = { id: nextId(prefab), prefab, x: Math.round(x), y: Math.round(y) };
  if (width !== undefined) { o.width = Math.round(width); o.height = Math.round(height); }
  if (properties) o.properties = properties;
  objects.push(o);
};

// The lane's edges: the kerb at the back, the gutter at the front. Thick,
// because a finisher's knockback moves a thug far in one step and a thin
// wall can be stepped over; nothing thrown may end up outside the row.
add('bound', LENGTH / 2, LANE.top - 120, LENGTH + 480, 240);
add('bound', LENGTH / 2, LANE.bottom + 120, LENGTH + 480, 240);
add('bound', -120, DEPTH / 2, 240, DEPTH + 480);
add('bound', LENGTH + 120, DEPTH / 2, 240, DEPTH + 480);

// The scenery planes, then the street lamps along the back kerb.
add('street', LENGTH / 2, DEPTH / 2, 16, 16, { seed: 3, lane: LANE, length: LENGTH });
add('foreground', LENGTH / 2, DEPTH / 2, 16, 16, { lane: LANE });
// Street lamps along the back kerb.
for (let x = 300; x < LENGTH; x += 520) add('lamp', x, LANE.top + 10, 24, 24);

// The sections: where the camera locks, and who comes.
const SECTIONS = [
  { lock: 900, wave: [['zombie', 2]] },
  { lock: 1900, wave: [['goblin', 3]] },
  { lock: 2900, wave: [['zombie', 2], ['skeleton', 2]] },
  { lock: 3900, wave: [['goblin', 2], ['skeleton', 2], ['zombie', 2]] },
  { lock: 4800, wave: [['skeleton', 4], ['zombie', 2]] }
];

// The door at the end.
add('door', LENGTH - 120, (LANE.top + LANE.bottom) / 2, 120, 200, { visible: true, triggers: 'levelComplete', active: true });
add('player', 240, (LANE.top + LANE.bottom) / 2, 28, 24, { spriteSize: 200, spriteOffsetY: -56 });

/**
 * The three creatures are one prefab wearing three sprite sheets, which is
 * what an asset manifest is for: each is an asset with a uid, defined once
 * and bound into the scene by name. Renaming a texture or relabelling a
 * creature then changes this file and nothing else.
 */
const CREATURES = ['zombie', 'goblin', 'skeleton'];
const CREATURE_BODY = {
  bodyType: 'dynamic', shape: 'circle', lockRotation: true, friction: 0.1, frictionAir: 0.25
};

function buildManifest() {
  const assets = {};
  for (const name of CREATURES) {
    assets[`sheet-${name}`] = {
      type: 'spritesheet',
      name,
      source: `textures/characters/${name}.png`,
      import: { frameWidth: 128, frameHeight: 128, animations: creatureAnimations() }
    };
    assets[`prefab-${name}`] = {
      type: 'prefab',
      name,
      data: {
        actor: 'Ghost',
        spritesheet: `sheet-${name}`,
        defaultAnimation: 'idle_left',
        physics: CREATURE_BODY
      }
    };
  }
  return { version: 1, name: 'Ash Row', assets };
}

const scene = {
  version: 4, name: 'row', type: 'level', gameType: 'belt',
  world: { width: LENGTH, height: DEPTH, gravity: { x: 0, y: 0 }, sort: 'depth', projection: { type: 'belt', ratio: 0.5 } },
  // The three creatures live in the asset manifest instead, bound here by
  // uid. See CREATURES below.
  uses: Object.fromEntries(CREATURES.map(name => [name, `prefab-${name}`])),
  assets: {
    spritesheets: {
      paving: { url: 'textures/paving.jpg', frameWidth: 512, frameHeight: 512 },
      rogue: { url: 'textures/characters/rogue.png', frameWidth: 128, frameHeight: 128, animations: heroAnimations() }
    }
  },
  // The paving stretched into the compressed lane: a 200-unit ground tile is 200 wide by 100 tall on screen.
  tileLayers: [{ name: 'street', spritesheet: 'paving', zIndex: -1, tileSize: 200, stretch: true }],
  prefabs: {
    player: { actor: 'ObliquePlayer', spritesheet: 'rogue', defaultAnimation: 'idle_right', physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 } },
    lamp: { actor: 'Lamp', physics: { bodyType: 'static', shape: 'circle' } },
    street: { actor: 'Street', physics: { bodyType: 'static', isSensor: true } },
    foreground: { actor: 'Foreground', physics: { bodyType: 'static', isSensor: true } },
    bound: { actor: 'Bound', physics: { bodyType: 'static' } },
    door: { actor: 'Trigger', physics: { bodyType: 'static', isSensor: true } }
  },
  layers: [{ name: 'row', type: 'objects', objects }]
};
writeFileSync(out, writeScene(scene));
writeFileSync(fileURLToPath(new URL('../src/belt/assets.json', import.meta.url)),
  writeManifest(buildManifest()));
writeFileSync(fileURLToPath(new URL('../src/belt/layout.json', import.meta.url)), JSON.stringify({ lane: LANE, length: LENGTH, sections: SECTIONS }, null, 2) + '\n');
console.log(`row: ${objects.length} objects, ${SECTIONS.length} sections → ${out}`);
