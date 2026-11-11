/**
 * Seeds Ember Valley's painted-tile sheet and coin strip:
 * `node scripts/buildPlatformerArt.mjs [--missing]`.
 *
 * Images are built, never committed (the repo ignores `*.png`), so a
 * fresh checkout needs `assets/tiles.png` and `assets/coin.png` for the
 * level the editor painted (E8). Like `seedScene.mjs`, this **seeds**:
 * with `--missing` (how the dev server runs it) a file that exists is
 * left exactly as it is, so hand-swapped art survives — the scene's
 * cells address an 8x2 grid of 70px tiles and a strip of 16px coin
 * frames, and any art with those shapes may sit in these files.
 *
 * What it builds, when the files are missing:
 * - `tiles.png` (560x140): twelve tiles of Kenney's **Platformer Art
 *   Deluxe** (CC0), composed onto the 8x2 grid the scene paints from.
 * - `coin.png` (144x16): MedicineStorm's **Spinning Gold Coin**
 *   (CC BY 3.0), its nine 32px frames resized to 16px in one strip.
 *
 * Both are fetched from OpenGameArt with pinned URLs into
 * `examples/assets-src/platformer/` (gitignored; the directory is the
 * cache). Credits: THIRD_PARTY_NOTICES.md at the repository root.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'src', 'platformer', 'assets');
const cache = join(here, '..', 'assets-src', 'platformer');

const SOURCES = {
  deluxe: 'https://opengameart.org/sites/default/files/platformerGraphicsDeluxe_Updated.zip',
  coin: 'https://opengameart.org/sites/default/files/goldCoin.zip'
};

/** The 8x2 tile grid the scene's cells address, as Deluxe tile names. */
const TILES = [
  ['Tiles/grassLeft.png', 'Tiles/grassMid.png', 'Tiles/dirt.png', 'Tiles/grassMid.png', 'Tiles/grassMid.png', 'Tiles/grassRight.png', 'Tiles/grassCenter_rounded.png', 'Tiles/liquidWaterTop_mid.png'],
  ['Tiles/grass.png', 'Tiles/grassMid.png', 'Tiles/grassHalf.png', 'Tiles/dirtCenter.png', 'Tiles/stoneCenter.png', 'Tiles/fence.png', 'Tiles/signRight.png', 'Items/plant.png']
];

const missingOnly = process.argv.includes('--missing');
const wantTiles = !(missingOnly && existsSync(join(assets, 'tiles.png')));
const wantCoin = !(missingOnly && existsSync(join(assets, 'coin.png')));
if (!wantTiles && !wantCoin) process.exit(0);

async function fetched(name, url) {
  const file = join(cache, `${name}.zip`);
  if (!existsSync(file)) {
    await mkdir(cache, { recursive: true });
    const response = await fetch(url, { headers: { 'User-Agent': 'm2d-engine asset builder' } });
    if (!response.ok) throw new Error(`fetching ${url}: ${response.status}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  const dir = join(cache, name);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
    execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
  }
  return dir;
}

await mkdir(assets, { recursive: true });

if (wantTiles) {
  const dir = await fetched('deluxe', SOURCES.deluxe);
  const cells = await Promise.all(TILES.flat().map(async (name) => {
    const file = join(dir, name);
    if (!existsSync(file)) {
      console.warn(`buildPlatformerArt: no ${name} in the pack; its cell stays empty`);
      return null;
    }
    return sharp(await readFile(file))
      .resize(70, 70, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
  }));
  await sharp({ create: { width: 560, height: 140, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cells.flatMap((buffer, i) => (buffer ? [{ input: buffer, left: (i % 8) * 70, top: Math.floor(i / 8) * 70 }] : [])))
    .png().toFile(join(assets, 'tiles.png'));
  console.log('built src/platformer/assets/tiles.png');
}

if (wantCoin) {
  const dir = await fetched('coin', SOURCES.coin);
  const frames = await Promise.all(Array.from({ length: 9 }, (_, i) =>
    sharp(join(dir, `goldCoin${i + 1}.png`)).resize(16, 16).png().toBuffer()));
  await sharp({ create: { width: 16 * 9, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((buffer, i) => ({ input: buffer, left: i * 16, top: 0 })))
    .png().toFile(join(assets, 'coin.png'));
  console.log('built src/platformer/assets/coin.png');
}
