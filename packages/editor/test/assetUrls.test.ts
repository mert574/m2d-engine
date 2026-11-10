import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withProjectAssets } from '../src/assetUrls.ts';
import type { BrowserProject } from '../src/project.ts';

/**
 * Asset URLs rewritten for a scene opened from a folder: the viewport's
 * copy reaches blob URLs, the document is untouched, and closing gives
 * the blobs back.
 */

const files = new Set([
  'platformer/textures/tiles.png',
  'platformer/scenes/local.png'
]);

const project = {
  readFile: vi.fn(async (path: string) => (files.has(path) ? new Blob(['x']) as File : null))
} as unknown as BrowserProject;

let made: string[];
beforeEach(() => {
  made = [];
  let n = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => { const url = `blob:test/${n++}`; made.push(url); return url; }),
    revokeObjectURL: vi.fn()
  });
});

describe('withProjectAssets', () => {
  const doc = () => ({
    type: 'level', name: 'level1',
    assets: {
      spritesheets: {
        tiles: { url: 'textures/tiles.png', frameWidth: 16, frameHeight: 16 },
        local: { url: 'scenes/local.png', frameWidth: 8, frameHeight: 8 },
        inline: { url: 'data:image/png;base64,AAAA', frameWidth: 8, frameHeight: 8 },
        missing: { url: 'textures/not-there.png', frameWidth: 8, frameHeight: 8 }
      }
    }
  });

  it('rewrites what the project has, relative to the scene and its demo folder', async () => {
    const original = doc();
    const prepared = await withProjectAssets(original, project, 'platformer/scenes/level1.json');
    const sheets = (prepared.data.assets as Record<string, Record<string, { url: string }>>).spritesheets!;

    // Resolved against the demo folder (the shipped convention)…
    expect(sheets.tiles!.url).toMatch(/^blob:/);
    // …or the scene's own folder when that is where it is.
    expect(sheets.local!.url).toMatch(/^blob:/);
    // A data: URL already resolves; a missing file is left for the engine
    // to report honestly.
    expect(sheets.inline!.url).toMatch(/^data:/);
    expect(sheets.missing!.url).toBe('textures/not-there.png');

    // The document itself was never touched.
    expect((original.assets.spritesheets as Record<string, { url: string }>).tiles!.url)
      .toBe('textures/tiles.png');

    prepared.revoke();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(made.length);
  });
});
