/**
 * The dev textures the yard's primitives wear:
 * `node scripts/generateDevTextures.mjs [--missing]`.
 *
 * Source-engine-style measurement grids — a metre tile with decimetre
 * lines, a bold border and a centre cross — so scale and alignment read
 * at a glance on untextured blockout geometry. Generated, not committed,
 * like the showcase sprites: the dev server builds what is missing.
 * Grey for floors, orange for walls, the way Source's dev rooms use them.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

export const OUT_DIR = resolve(import.meta.dirname, '..', 'src', 'yard', 'textures');

const SIZE = 512;
const CELL = SIZE / 8;

/** One grid as SVG: `tone` the base, `line` the grid, `bold` the border and cross. */
function grid({ tone, shade, line, bold, label }) {
  const lines = [];
  for (let i = 1; i < 8; i++) {
    lines.push(`<line x1="${i * CELL}" y1="0" x2="${i * CELL}" y2="${SIZE}" stroke="${line}" stroke-width="2"/>`);
    lines.push(`<line x1="0" y1="${i * CELL}" x2="${SIZE}" y2="${i * CELL}" stroke="${line}" stroke-width="2"/>`);
  }
  const c = SIZE / 2;
  const arm = CELL * 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${tone}"/>
  <!-- Alternate cells a shade off, so the tile reads even where lines alias away. -->
  ${Array.from({ length: 32 }, (_, i) => {
    const x = (i % 4) * 2 * CELL + (Math.floor(i / 4) % 2) * CELL;
    const y = Math.floor(i / 4) * CELL;
    return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${shade}"/>`;
  }).join('\n  ')}
  ${lines.join('\n  ')}
  <rect x="2" y="2" width="${SIZE - 4}" height="${SIZE - 4}" fill="none" stroke="${bold}" stroke-width="5"/>
  <line x1="${c - arm}" y1="${c}" x2="${c + arm}" y2="${c}" stroke="${bold}" stroke-width="5"/>
  <line x1="${c}" y1="${c - arm}" x2="${c}" y2="${c + arm}" stroke="${bold}" stroke-width="5"/>
  <text x="${c + 10}" y="${c - 12}" font-family="monospace" font-size="30" fill="${bold}">${label}</text>
</svg>`;
}

const TEXTURES = {
  'dev_grid.png': grid({ tone: '#9a9a92', shade: '#92928a', line: '#83837b', bold: '#6e6e66', label: '1m' }),
  'dev_orange.png': grid({ tone: '#c6763a', shade: '#bd6f36', line: '#a95f2c', bold: '#8d4c20', label: '1m' })
};

const missingOnly = process.argv.includes('--missing');
mkdirSync(OUT_DIR, { recursive: true });
for (const [name, svg] of Object.entries(TEXTURES)) {
  const to = resolve(OUT_DIR, name);
  if (missingOnly && existsSync(to)) continue;
  await sharp(Buffer.from(svg)).png().toFile(to);
  console.log(`  ${name}`);
}
