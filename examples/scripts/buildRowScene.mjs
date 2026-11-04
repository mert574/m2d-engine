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
let nextId = 1;
const add = (prefab, x, y, width, height, properties) => {
  const o = { id: nextId++, prefab, x: Math.round(x), y: Math.round(y) };
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

const scene = {
  version: 1, name: 'row', type: 'level', gameType: 'belt',
  world: { width: LENGTH, height: DEPTH, gravity: { x: 0, y: 0 }, sort: 'depth', projection: { type: 'belt', ratio: 0.5 } },
  assets: {
    spritesheets: {
      paving: { url: 'textures/paving.jpg', frameWidth: 512, frameHeight: 512 },
      rogue: { url: 'textures/characters/rogue.png', frameWidth: 128, frameHeight: 128, animations: heroAnimations() },
      zombie: { url: 'textures/characters/zombie.png', frameWidth: 128, frameHeight: 128, animations: creatureAnimations() },
      goblin: { url: 'textures/characters/goblin.png', frameWidth: 128, frameHeight: 128, animations: creatureAnimations() },
      skeleton: { url: 'textures/characters/skeleton.png', frameWidth: 128, frameHeight: 128, animations: creatureAnimations() }
    }
  },
  // The paving stretched into the compressed lane: a 200-unit ground tile is 200 wide by 100 tall on screen.
  tileLayers: [{ name: 'street', spritesheet: 'paving', zIndex: -1, tileSize: 200, stretch: true }],
  prefabs: {
    player: { actor: 'ObliquePlayer', spritesheet: 'rogue', defaultAnimation: 'idle_right', physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 } },
    zombie: { actor: 'Ghost', spritesheet: 'zombie', defaultAnimation: 'idle_left', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, friction: 0.1, frictionAir: 0.25 } },
    goblin: { actor: 'Ghost', spritesheet: 'goblin', defaultAnimation: 'idle_left', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, friction: 0.1, frictionAir: 0.25 } },
    skeleton: { actor: 'Ghost', spritesheet: 'skeleton', defaultAnimation: 'idle_left', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, friction: 0.1, frictionAir: 0.25 } },
    lamp: { actor: 'Lamp', physics: { bodyType: 'static', shape: 'circle' } },
    street: { actor: 'Street', physics: { bodyType: 'static', isSensor: true } },
    foreground: { actor: 'Foreground', physics: { bodyType: 'static', isSensor: true } },
    bound: { actor: 'Bound', physics: { bodyType: 'static' } },
    door: { actor: 'Trigger', physics: { bodyType: 'static', isSensor: true } }
  },
  layers: [{ name: 'row', type: 'objects', objects }]
};
const out = fileURLToPath(new URL('../src/belt/scenes/row.json', import.meta.url));
writeFileSync(out, JSON.stringify(scene, null, 2) + '\n');
writeFileSync(fileURLToPath(new URL('../src/belt/layout.json', import.meta.url)), JSON.stringify({ lane: LANE, length: LENGTH, sections: SECTIONS }, null, 2) + '\n');
console.log(`row: ${objects.length} objects, ${SECTIONS.length} sections → ${out}`);
