import { describe, it, expect } from 'vitest';
import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.ts';
import { createCanvasElement, readWebGLPixels } from '../../src/testing/environment.js';

/**
 * 2D lights that cast shadows (`drawLight({ shadows: true })` over
 * `drawShadowCaster` boxes): what they light, and what they leave dark.
 *
 * The shadow volumes are extruded away from the light, which makes one
 * case special — a light *inside* a caster. Every edge then extrudes
 * outward, the volumes cover everything except the caster itself, and the
 * world goes black but for a lit rectangle. A torch carried past a tree in
 * Hollow Grove did exactly that.
 */

const W = 200;
const H = 200;

/** A white ground, some casters and one shadow-casting light. */
function render(casters, light) {
  const target = createCanvasElement(W, H);
  const renderer = new WebGLRenderer({ contextAttributes: { preserveDrawingBuffer: true } });
  renderer.init(target, { width: W, height: H });
  renderer.setAmbientLight('#202020');
  renderer.beginFrame();
  renderer.applyCamera({ x: W / 2, y: H / 2, width: W, height: H, zoom: 1, rotation: 0 });
  renderer.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' });
  for (const caster of casters) renderer.drawShadowCaster(caster);
  renderer.drawLight({ shadows: true, color: '#ffffff', intensity: 1, ...light });
  renderer.endFrame();
  const pixels = readWebGLPixels(target);
  renderer.destroy?.();
  return pixels;
}

/** The red channel at a point: how lit it is. */
const at = (image, x, y) => image.data[(y * image.width + x) * 4];
const AMBIENT = 32;

describe('2D shadow-casting lights', () => {
  it('lights what it reaches and leaves what a caster hides', () => {
    const image = render([{ x: 60, y: 60, width: 20, height: 20 }], { x: 100, y: 100, radius: 70 });
    expect(at(image, 100, 100), 'at the light').toBeGreaterThan(200);
    expect(at(image, 75, 100), 'beside it, in reach').toBeGreaterThan(AMBIENT + 20);
    expect(at(image, 40, 40), 'behind the caster').toBeLessThanOrEqual(AMBIENT + 2);
    expect(at(image, 190, 190), 'past its radius').toBeLessThanOrEqual(AMBIENT + 2);
  });

  it('is not shadowed by the caster it stands inside', () => {
    const inside = render([{ x: 100, y: 100, width: 40, height: 40 }], { x: 100, y: 100, radius: 70 });
    const alone = render([], { x: 100, y: 100, radius: 70 });
    for (const [x, y] of [[130, 100], [100, 130], [70, 100], [100, 70]]) {
      expect(at(inside, x, y), `inside a caster, lit at ${x},${y} as it would be without one`)
        .toBeCloseTo(at(alone, x, y), -1);
    }
  });
});
