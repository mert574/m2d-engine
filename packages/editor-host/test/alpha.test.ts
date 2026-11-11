import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document } from '@gltf-transform/core';
import sharp from 'sharp';
import { foldAlpha } from '../src/pipeline/compile.mjs';

/** A 16x16 colour image, and beside it an alpha map half clear and half solid. */
async function images(dir: string) {
  const colour = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#808080' } }).jpeg().toBuffer();
  const mask = Buffer.alloc(16 * 16 * 3);
  for (let i = 0; i < 16 * 8 * 3; i++) mask[i] = 255;
  writeFileSync(join(dir, 'thing_alpha_1k.png'), await sharp(mask, { raw: { width: 16, height: 16, channels: 3 } }).png().toBuffer());
  return colour;
}

describe('folding alpha maps', () => {
  it('gives a shared atlas\'s map to the material marked as cut out, not to the opaque body beside it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'm2d-alpha-'));
    try {
      const doc = new Document();
      const texture = doc.createTexture('atlas').setImage(await images(dir)).setMimeType('image/jpeg').setURI('thing_diff_1k.jpg');
      const body = doc.createMaterial('body').setBaseColorTexture(texture);
      const glass = doc.createMaterial('glass').setAlphaMode('BLEND').setBaseColorTexture(texture);
      await foldAlpha(doc, dir);
      // The street lamp: its body read the glass's map and drew the whole lamp blended.
      expect(body.getAlphaMode()).toBe('OPAQUE');
      expect(glass.getAlphaMode()).toBe('MASK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives an opaque-marked material its own map when the texture is its alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'm2d-alpha-'));
    try {
      const doc = new Document();
      const texture = doc.createTexture('twig').setImage(await images(dir)).setMimeType('image/jpeg').setURI('thing_diff_1k.jpg');
      // The pine: its needle cut-out ships beside a material marked opaque.
      const twig = doc.createMaterial('twig').setBaseColorTexture(texture);
      await foldAlpha(doc, dir);
      expect(twig.getAlphaMode()).toBe('MASK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
