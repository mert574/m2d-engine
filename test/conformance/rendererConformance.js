import { describe, it, expect, beforeEach } from 'vitest';
import {
  snapshot,
  expectColorAt,
  expectNotColorAt,
  expectTransparentAt,
  differsFrom
} from '../helpers/pixels.js';
import { OPTIONAL_CAPABILITIES, PARTICLE_STRIDE } from '../../src/core/renderers/baseRenderer.js';
import {
  makeTileSheet,
  makeAsymmetricTile,
  makeSolidImage,
  makeQuadrantImage,
  makeAnimatedSprite,
  TILE,
  TILE_COLORS
} from '../helpers/fixtures.js';

/**
 * The renderer backend contract, expressed as executable tests.
 *
 * Every BaseRenderer implementation must pass this suite. To validate a new
 * backend (WebGL, WebGPU, ...), call this with a harness:
 *
 *   describeRendererConformance({
 *     name: 'WebGLRenderer',
 *     createRenderer: () => new WebGLRenderer(),
 *     createTarget: (w, h) => createCanvasElement(w, h),
 *     readPixels: (target) => readWebGLPixels(target),  // RGBA, top-left origin
 *     capabilities: { gradients: true, shadows: false, text: true, ... }
 *   });
 *
 * Capabilities let a partially-implemented backend skip what it does not
 * support yet while still being held to everything it claims.
 *
 * Assertions sample shape interiors with colour tolerance rather than
 * comparing exact buffers, so backends may differ in antialiasing.
 */
export function describeRendererConformance(harness) {
  const caps = {
    gradients: true,
    shadows: true,
    text: true,
    roundedCorners: true,
    clipping: true,
    transforms: true,
    // Optional contract features default to unsupported, so a backend is only
    // held to the ones it claims. Mandatory flags above default to true and
    // exist for backends still under construction.
    ...OPTIONAL_CAPABILITIES,
    ...(harness.capabilities || {})
  };

  const W = 200;
  const H = 120;
  const BG = '#000000';

  describe(`${harness.name} conformance`, () => {
    let renderer;
    let target;

    function setup(width = W, height = H) {
      target = harness.createTarget(width, height);
      renderer = harness.createRenderer();
      renderer.init(target, { width, height });
      return renderer;
    }

    /** Read the current contents of the render target. */
    const read = () => snapshot(harness, target);

    /**
     * Run one frame the way M2D does: world pass, present, then screen pass.
     */
    function renderFrame({ world, screen, camera } = {}) {
      renderer.beginFrame();
      if (camera) renderer.applyCamera(camera);
      if (world) world(renderer);
      renderer.endFrame();

      if (screen) {
        renderer.beginScreenFrame();
        screen(renderer);
        renderer.endScreenFrame();
      }
    }

    beforeEach(() => {
      setup();
    });

    // ===================================================================
    describe('lifecycle and sizing', () => {
      it('applies the initial dimensions from init options', () => {
        expect(target.width).toBe(W);
        expect(target.height).toBe(H);
        expect(renderer.width).toBe(W);
        expect(renderer.height).toBe(H);
      });

      it('resizes the target and reports new dimensions', () => {
        renderer.resize(320, 240);
        expect(target.width).toBe(320);
        expect(target.height).toBe(240);
        expect(renderer.width).toBe(320);
        expect(renderer.height).toBe(240);
      });

      it('keeps current dimensions when resize is called with no arguments', () => {
        renderer.resize();
        expect(renderer.width).toBe(W);
        expect(renderer.height).toBe(H);
      });

      it('renders correctly into the new size after a resize', () => {
        renderer.resize(80, 60);
        renderFrame({
          world: r => r.drawRect({ x: 0, y: 0, width: 80, height: 60, fillStyle: '#ff0000' })
        });
        const snap = read();
        expect(snap.width).toBe(80);
        expect(snap.height).toBe(60);
        expectColorAt(snap, 40, 30, '#ff0000');
      });

      // A backend must size the world surface, the UI layer and the backing
      // store independently. This is what lets a game expose a resolution
      // setting that coarsens the world while the HUD stays sharp.
      describe('independent world and UI resolution', () => {
        /**
         * A 200x120 view rendered into a 20x12 world surface (a tenth of the
         * linear resolution) and presented on a 200x120 backing store.
         */
        function setupSplitResolution(worldFilter) {
          target = harness.createTarget(W, H);
          renderer = harness.createRenderer();
          renderer.init(target, {
            worldFilter,
            viewport: {
              backingWidth: W, backingHeight: H, pixelRatio: 1,
              viewWidth: W, viewHeight: H,
              worldWidth: 20, worldHeight: 12, worldScale: 0.1,
              contentX: 0, contentY: 0, contentWidth: W, contentHeight: H,
              uiWidth: W, uiHeight: H, uiScale: 1
            }
          });
        }

        /** A shape with curved edges, so detail exists at every scale. */
        const circle = r => {
          r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#000000' });
          r.drawArc({
            x: 100, y: 60, radius: 50,
            startAngle: 0, endAngle: Math.PI * 2,
            fillStyle: '#00ff00'
          });
        };

        /**
         * Find an upscale block whose pixels are not all one colour.
         *
         * With a world surface a tenth of the backing store and nearest
         * filtering, every 10x10 block of output is one world texel, so it
         * must be uniform. A block that varies means the world was rasterized
         * finer than the surface it was supposed to be rasterized into.
         *
         * @returns {Object|null} The first varying block, or null if none
         */
        function findVaryingBlock(snap, blockW, blockH) {
          for (let by = 0; by + blockH <= snap.height; by += blockH) {
            for (let bx = 0; bx + blockW <= snap.width; bx += blockW) {
              const want = snap.at(bx, by);
              for (let y = by; y < by + blockH; y++) {
                for (let x = bx; x < bx + blockW; x++) {
                  const got = snap.at(x, y);
                  if ([0, 1, 2].some(c => Math.abs(got[c] - want[c]) > 2)) {
                    return { block: [bx, by], pixel: [x, y], want: want.slice(0, 3), got: got.slice(0, 3) };
                  }
                }
              }
            }
          }
          return null;
        }

        it('presents a low-resolution world across the whole backing store', () => {
          setupSplitResolution();
          renderFrame({
            world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ff0000' })
          });

          const snap = read();
          expect(snap.width).toBe(W);
          expect(snap.height).toBe(H);
          // Upscaled to fill the surface, corners included.
          expectColorAt(snap, 5, 5, '#ff0000');
          expectColorAt(snap, W - 5, H - 5, '#ff0000');
        });

        it('rasterizes the world coarsely but the UI at full resolution', () => {
          setupSplitResolution();
          renderFrame({
            // A one-unit-wide world stripe cannot survive a 10x downscale as
            // a crisp edge; a one-unit-wide UI stripe must.
            world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#000000' }),
            screen: r => r.drawRect({ x: 100, y: 0, width: 1, height: H, fillStyle: '#00ff00', isScreenSpace: true })
          });

          const snap = read();
          // The UI stripe lands exactly where it was asked to, one pixel wide.
          expectColorAt(snap, 100, 60, '#00ff00');
          expectNotColorAt(snap, 97, 60, '#00ff00');
          expectNotColorAt(snap, 103, 60, '#00ff00');
        });

        // The assertion the earlier cases miss: they pin where the world lands
        // and that the UI stays sharp, but neither fails if a backend quietly
        // rasterizes the world at display resolution and ignores the setting.
        it('rasterizes the world into the world surface, not the backing store', () => {
          setupSplitResolution('nearest');
          renderFrame({ world: circle });

          expect(findVaryingBlock(read(), 10, 10)).toBeNull();
        });

        it('keeps sub-block detail when the world is not downscaled', () => {
          // The control for the case above: at an unscaled viewport the same
          // circle must show detail finer than a 10x10 block, or "uniform
          // blocks" would prove nothing about the resolution setting.
          setup();
          renderer.setWorldFilter('nearest');
          renderFrame({ world: circle });

          expect(findVaryingBlock(read(), 10, 10)).not.toBeNull();
        });

        it('upscales the world surface with the requested filter', () => {
          setupSplitResolution('nearest');
          renderFrame({ world: circle });
          const nearest = read();

          setupSplitResolution('linear');
          renderFrame({ world: circle });
          const linear = read();

          // Nearest replicates each texel as a flat block; linear interpolates
          // between them, so the same block varies across its width.
          expect(findVaryingBlock(nearest, 10, 10)).toBeNull();
          expect(findVaryingBlock(linear, 10, 10)).not.toBeNull();
        });

        it('keeps UI geometry in UI units, not world units', () => {
          setupSplitResolution();
          renderFrame({
            screen: r => r.drawRect({ x: 0, y: 0, width: 50, height: 30, fillStyle: '#00ff00', isScreenSpace: true })
          });

          const snap = read();
          // 50x30 UI units on a 200x120 UI space: a quarter of the surface.
          expectColorAt(snap, 25, 15, '#00ff00');
          expectNotColorAt(snap, 75, 15, '#00ff00');
        });
      });

      it('tolerates draw calls after destroy without throwing', () => {
        renderer.destroy();
        expect(() => {
          renderer.drawRect({ x: 0, y: 0, width: 10, height: 10, fillStyle: '#ff0000' });
          renderer.drawText({ text: 'x', x: 0, y: 0 });
          renderer.drawArc({ x: 0, y: 0, radius: 5, fillStyle: '#fff' });
        }).not.toThrow();
      });
    });

    // ===================================================================
    describe('clearing', () => {
      it('clear() fills the visible surface with the given colour', () => {
        renderer.clear('#112233');
        expectColorAt(read(), 10, 10, '#112233');
      });

      it('clear() with no colour leaves the surface transparent', () => {
        renderer.clear('#ff0000');
        renderer.clear();
        expectTransparentAt(read(), 100, 60);
      });

      it('clear() replaces presented world content', () => {
        renderFrame({
          world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ff0000' })
        });
        renderer.clear('#00ff00');
        expectColorAt(read(), 100, 60, '#00ff00');
      });
    });

    // ===================================================================
    describe('frame presentation', () => {
      it('presents world content drawn between beginFrame and endFrame', () => {
        renderFrame({
          world: r => r.drawRect({ x: 20, y: 20, width: 40, height: 30, fillStyle: '#ff0000' })
        });
        expectColorAt(read(), 40, 35, '#ff0000');
      });

      it('does not retain world content from the previous frame', () => {
        renderFrame({
          world: r => r.drawRect({ x: 20, y: 20, width: 40, height: 30, fillStyle: '#ff0000' })
        });
        expectColorAt(read(), 40, 35, '#ff0000');

        renderFrame({});
        expectNotColorAt(read(), 40, 35, '#ff0000', { label: 'stale frame content' });
      });

      it('draws screen-space content on top of world content', () => {
        renderFrame({
          world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#0000ff' }),
          screen: r => r.drawRect({
            x: 50, y: 40, width: 30, height: 20, fillStyle: '#ff0000', isScreenSpace: true
          })
        });

        const snap = read();
        expectColorAt(snap, 65, 50, '#ff0000', { label: 'UI over world' });
        expectColorAt(snap, 10, 10, '#0000ff', { label: 'world outside UI' });
      });
    });

    // ===================================================================
    describe('camera', () => {
      it('translates world content by the camera offset', () => {
        // Offset = (-x + width/2, -y + height/2) = (-10, +10)
        renderFrame({
          camera: { x: W / 2 + 10, y: H / 2 - 10, width: W, height: H },
          world: r => r.drawRect({ x: 50, y: 50, width: 20, height: 20, fillStyle: '#ff0000' })
        });

        const snap = read();
        expectColorAt(snap, 50, 60, '#ff0000', { label: 'shifted rect' });
        expectNotColorAt(snap, 50, 45, '#ff0000', { label: 'original position' });
      });

      it('is identity when the camera is centred on the viewport', () => {
        renderFrame({
          camera: { x: W / 2, y: H / 2, width: W, height: H },
          world: r => r.drawRect({ x: 50, y: 50, width: 20, height: 20, fillStyle: '#ff0000' })
        });
        expectColorAt(read(), 60, 60, '#ff0000');
      });

      it('does not apply the camera offset to screen-space content', () => {
        renderFrame({
          camera: { x: W / 2 + 40, y: H / 2 + 40, width: W, height: H },
          screen: r => r.drawRect({
            x: 50, y: 50, width: 20, height: 20, fillStyle: '#00ff00', isScreenSpace: true
          })
        });
        expectColorAt(read(), 60, 60, '#00ff00', { label: 'UI ignores camera' });
      });
    });

    // ===================================================================
    describe('drawRect', () => {
      it('fills at the given position and size', () => {
        renderFrame({
          world: r => r.drawRect({ x: 20, y: 20, width: 40, height: 30, fillStyle: '#ff0000' })
        });

        const snap = read();
        expectColorAt(snap, 40, 35, '#ff0000', { label: 'interior' });
        expectColorAt(snap, 20, 20, '#ff0000', { label: 'top-left corner' });
        expectColorAt(snap, 59, 49, '#ff0000', { label: 'bottom-right corner' });
        expectColorAt(snap, 19, 35, BG, { label: 'just left of rect' });
        expectColorAt(snap, 60, 35, BG, { label: 'just right of rect' });
      });

      it('strokes without filling when only strokeStyle is given', () => {
        renderFrame({
          world: r => r.drawRect({
            x: 40, y: 30, width: 40, height: 30, strokeStyle: '#ff0000', lineWidth: 4
          })
        });

        const snap = read();
        expectColorAt(snap, 40, 45, '#ff0000', { label: 'left border' });
        expectColorAt(snap, 60, 45, BG, { label: 'interior stays empty' });
      });

      it('suppresses the fill when fill is false', () => {
        renderFrame({
          world: r => r.drawRect({
            x: 20, y: 20, width: 40, height: 30, fillStyle: '#ff0000', fill: false
          })
        });
        expectColorAt(read(), 40, 35, BG, { label: 'fill suppressed' });
      });

      it('renders fill and stroke together', () => {
        renderFrame({
          world: r => r.drawRect({
            x: 40, y: 30, width: 40, height: 30,
            fillStyle: '#0000ff', strokeStyle: '#ff0000', lineWidth: 4
          })
        });

        const snap = read();
        expectColorAt(snap, 60, 45, '#0000ff', { label: 'fill' });
        expectColorAt(snap, 40, 45, '#ff0000', { label: 'stroke' });
      });

      it.skipIf(!caps.roundedCorners)('rounds corners when cornerRadius is set', () => {
        renderFrame({
          world: r => r.drawRect({
            x: 40, y: 30, width: 60, height: 50, cornerRadius: 20, fillStyle: '#ff0000'
          })
        });

        const snap = read();
        expectColorAt(snap, 70, 55, '#ff0000', { label: 'centre is filled' });
        expectColorAt(snap, 41, 31, BG, { label: 'corner is cut away' });
      });

      it.skipIf(!caps.gradients)('fills with a linear gradient descriptor', () => {
        renderFrame({
          world: r => r.drawRect({
            x: 20, y: 40, width: 160, height: 40,
            fillStyle: {
              type: 'linear',
              x0: 20, y0: 0, x1: 180, y1: 0,
              stops: [
                { offset: 0, color: '#ff0000' },
                { offset: 1, color: '#0000ff' }
              ]
            }
          })
        });

        const snap = read();
        const left = snap.at(25, 60);
        const right = snap.at(175, 60);

        expect(left[0]).toBeGreaterThan(200);
        expect(left[2]).toBeLessThan(60);
        expect(right[2]).toBeGreaterThan(200);
        expect(right[0]).toBeLessThan(60);
      });

      it.skipIf(!caps.gradients)('fills with a radial gradient descriptor', () => {
        renderFrame({
          world: r => r.drawRect({
            x: 0, y: 0, width: W, height: H,
            fillStyle: {
              type: 'radial',
              x: 100, y: 60, r0: 0, r1: 80,
              stops: [
                { offset: 0, color: '#ffffff' },
                { offset: 1, color: '#000000' }
              ]
            }
          })
        });

        const snap = read();
        const centre = snap.at(100, 60)[0];
        const edge = snap.at(100, 5)[0];

        expect(centre).toBeGreaterThan(200);
        // Relative check: exact falloff curves may differ between backends.
        expect(edge).toBeLessThan(centre - 120);
      });

      it.skipIf(!caps.gradients)('honours translucent gradient stops', () => {
        // Absolute, not relative: a stop at alpha 0.5 over the opaque black
        // world clear must land near 128. Backends that premultiply the ramp
        // twice square the alpha and land near 64 instead, which stays
        // invisible to a test whose stops are all opaque.
        renderFrame({
          world: r => r.drawRect({
            x: 0, y: 0, width: W, height: H,
            fillStyle: {
              type: 'radial',
              x: 100, y: 60, r0: 0, r1: 80,
              stops: [
                { offset: 0, color: 'rgba(255, 255, 255, 0.5)' },
                { offset: 1, color: 'rgba(255, 255, 255, 0)' }
              ]
            }
          })
        });

        expectColorAt(read(), 100, 60, '#808080', { tolerance: 10, label: 'half-alpha centre' });
      });

      it.skipIf(!caps.gradients)('honours a translucent linear gradient stop', () => {
        renderFrame({
          world: r => r.drawRect({
            x: 0, y: 0, width: W, height: H,
            fillStyle: {
              type: 'linear',
              x0: 0, y0: 0, x1: W, y1: 0,
              stops: [
                { offset: 0, color: 'rgba(255, 255, 255, 0.5)' },
                { offset: 1, color: 'rgba(255, 255, 255, 0.5)' }
              ]
            }
          })
        });

        const snap = read();
        expectColorAt(snap, 20, 60, '#808080', { tolerance: 10, label: 'left' });
        expectColorAt(snap, 180, 60, '#808080', { tolerance: 10, label: 'right' });
      });

      it('blends using globalAlpha', () => {
        renderFrame({
          world: r => r.drawRect({
            x: 20, y: 20, width: 40, height: 30, fillStyle: '#ffffff', globalAlpha: 0.5
          })
        });
        // 50% white over the black frame background.
        expectColorAt(read(), 40, 35, '#808080', { tolerance: 6, label: 'alpha blend' });
      });

      it.skipIf(!caps.shadows)('casts a shadow outside the shape', () => {
        renderFrame({
          world: r => r.drawRect({
            x: 50, y: 50, width: 20, height: 20,
            fillStyle: '#ffffff',
            shadow: { color: '#ff0000', blur: 0, offsetX: 15, offsetY: 0 }
          })
        });

        const snap = read();
        expectColorAt(snap, 80, 60, '#ff0000', { tolerance: 20, label: 'offset shadow' });
        expectColorAt(snap, 60, 60, '#ffffff', { label: 'shape itself' });
      });

      it.skipIf(!caps.shadows)('casts the shadow from the whole silhouette, stroke included', () => {
        // A 20x20 rect with a 10px stroke covers 45..75; its shadow, offset by
        // 40, covers 85..115. A fill-only shadow would start at 90.
        renderFrame({
          world: r => r.drawRect({
            x: 50, y: 50, width: 20, height: 20,
            fillStyle: '#ffffff', strokeStyle: '#ffffff', lineWidth: 10,
            shadow: { color: '#ff0000', blur: 0, offsetX: 40, offsetY: 0 }
          })
        });

        const snap = read();
        expectColorAt(snap, 87, 60, '#ff0000', { tolerance: 20, label: 'shadow of the stroke' });
        expectColorAt(snap, 100, 60, '#ff0000', { tolerance: 20, label: 'shadow of the fill' });
        expectColorAt(snap, 60, 60, '#ffffff', { label: 'shape itself' });
        expectColorAt(snap, 47, 60, '#ffffff', { label: 'stroke itself' });
      });

      it.skipIf(!caps.shadows)('casts a single shadow when globalAlpha is set', () => {
        // Fill, stroke and shadow are one primitive: alpha applies once, so the
        // shadow under the stroke is not darker than the shadow under the fill.
        renderFrame({
          world: r => r.drawRect({
            x: 50, y: 50, width: 20, height: 20,
            fillStyle: '#ffffff', strokeStyle: '#ffffff', lineWidth: 10,
            globalAlpha: 0.5,
            shadow: { color: '#ff0000', blur: 0, offsetX: 40, offsetY: 0 }
          })
        });

        const snap = read();
        const underStroke = snap.at(87, 60);
        const underFill = snap.at(100, 60);
        expect(Math.abs(underStroke[0] - underFill[0])).toBeLessThanOrEqual(8);
        expectColorAt(snap, 100, 60, '#800000', { tolerance: 10, label: 'half-alpha shadow' });
      });
    });

    // ===================================================================
    describe('drawArc', () => {
      it('fills a full circle', () => {
        renderFrame({
          world: r => r.drawArc({ x: 100, y: 60, radius: 20, fillStyle: '#ff0000' })
        });

        const snap = read();
        expectColorAt(snap, 100, 60, '#ff0000', { label: 'centre' });
        expectColorAt(snap, 100, 45, '#ff0000', { label: 'inside top' });
        expectColorAt(snap, 100, 30, BG, { label: 'outside radius' });
      });

      it('strokes a ring without filling the interior', () => {
        renderFrame({
          world: r => r.drawArc({
            x: 100, y: 60, radius: 20, strokeStyle: '#ff0000', lineWidth: 4
          })
        });

        const snap = read();
        expectColorAt(snap, 100, 60, BG, { label: 'hollow centre' });
        expectColorAt(snap, 100, 40, '#ff0000', { tolerance: 40, label: 'ring edge' });
      });

      it('fills a half turn as a half disc', () => {
        // The engine's attack cone relies on this: a half-turn sweep fills the
        // half disc, because the closing chord is a diameter.
        renderFrame({
          world: r => r.drawArc({
            x: 100, y: 60, radius: 30,
            startAngle: 0, endAngle: Math.PI,
            fillStyle: '#ff0000'
          })
        });

        const snap = read();
        expectColorAt(snap, 100, 75, '#ff0000', { label: 'inside swept half' });
        expectColorAt(snap, 100, 45, BG, { label: 'outside swept half' });
      });

      it('fills a partial arc as a circular segment, not a pie sector', () => {
        // Closing the arc with a chord (rather than through the centre) is the
        // documented contract; a sector-filling backend would fail this and
        // would silently change how existing scenes render.
        renderFrame({
          world: r => r.drawArc({
            x: 100, y: 60, radius: 50,
            startAngle: 0, endAngle: Math.PI / 2,
            fillStyle: '#ff0000'
          })
        });

        const snap = read();
        expectColorAt(snap, 130, 90, '#ff0000', { label: 'inside the segment' });
        expectColorAt(snap, 100, 60, BG, { label: 'centre is NOT filled' });
      });

      it('respects startAngle and endAngle when stroking', () => {
        renderFrame({
          world: r => r.drawArc({
            x: 100, y: 60, radius: 30,
            startAngle: 0, endAngle: Math.PI / 2,
            strokeStyle: '#ff0000', lineWidth: 4
          })
        });

        const snap = read();
        expectColorAt(snap, 100, 90, '#ff0000', { tolerance: 40, label: 'on the swept arc' });
        expectColorAt(snap, 100, 30, BG, { label: 'off the swept arc' });
      });

      it('defaults to a full circle when angles are omitted', () => {
        renderFrame({
          world: r => r.drawArc({ x: 100, y: 60, radius: 15, fillStyle: '#00ff00' })
        });

        const snap = read();
        expectColorAt(snap, 110, 60, '#00ff00');
        expectColorAt(snap, 90, 60, '#00ff00');
        expectColorAt(snap, 100, 50, '#00ff00');
        expectColorAt(snap, 100, 70, '#00ff00');
      });
    });

    // ===================================================================
    describe('drawLine', () => {
      it('draws between the given endpoints', () => {
        renderFrame({
          world: r => r.drawLine({
            x1: 20, y1: 40, x2: 180, y2: 40, strokeStyle: '#ff0000', lineWidth: 2
          })
        });

        const snap = read();
        expectColorAt(snap, 100, 40, '#ff0000', { label: 'on the line' });
        expectColorAt(snap, 100, 30, BG, { label: 'off the line' });
        expectColorAt(snap, 10, 40, BG, { label: 'before the start point' });
      });

      it('honours lineWidth', () => {
        renderFrame({
          world: r => r.drawLine({
            x1: 20, y1: 60, x2: 180, y2: 60, strokeStyle: '#ff0000', lineWidth: 10
          })
        });

        const snap = read();
        expectColorAt(snap, 100, 64, '#ff0000', { label: 'thick line covers offset pixel' });
        expectColorAt(snap, 100, 50, BG, { label: 'beyond line thickness' });
      });
    });

    // ===================================================================
    describe('drawPath', () => {
      it('fills a closed polygon', () => {
        renderFrame({
          world: r => r.drawPath({
            points: [{ x: 100, y: 30 }, { x: 130, y: 80 }, { x: 70, y: 80 }],
            closed: true,
            fillStyle: '#ff0000'
          })
        });

        const snap = read();
        expectColorAt(snap, 100, 70, '#ff0000', { label: 'inside triangle' });
        expectColorAt(snap, 75, 40, BG, { label: 'outside triangle' });
      });

      it('strokes an open polyline without filling it', () => {
        renderFrame({
          world: r => r.drawPath({
            points: [{ x: 20, y: 20 }, { x: 40, y: 60 }, { x: 60, y: 20 }],
            closed: false,
            strokeStyle: '#ff0000',
            lineWidth: 3
          })
        });

        const snap = read();
        expectColorAt(snap, 30, 40, '#ff0000', { tolerance: 60, label: 'on the stroke' });
        expectColorAt(snap, 40, 35, BG, { label: 'interior not filled' });
      });

      it('ignores degenerate paths', () => {
        expect(() => {
          renderFrame({
            world: r => {
              r.drawPath({ points: [], fillStyle: '#ff0000' });
              r.drawPath({ points: [{ x: 10, y: 10 }], fillStyle: '#ff0000' });
              r.drawPath({ fillStyle: '#ff0000' });
            }
          });
        }).not.toThrow();
      });
    });

    // ===================================================================
    describe.skipIf(!caps.text)('drawText', () => {
      const ink = differsFrom(BG);

      it('renders visible glyphs', () => {
        renderFrame({
          world: r => r.drawText({
            text: 'HELLO', x: 20, y: 40,
            fillStyle: '#ffffff', fontSize: '32px', fontFamily: 'sans-serif'
          })
        });
        expect(read().count(ink)).toBeGreaterThan(50);
      });

      it('applies the fill colour', () => {
        renderFrame({
          world: r => r.drawText({
            text: 'HELLO', x: 20, y: 40,
            fillStyle: '#ff0000', fontSize: '32px', fontFamily: 'sans-serif'
          })
        });

        const snap = read();
        const reddish = snap.count(([r, g, b]) => r > 150 && g < 80 && b < 80);
        expect(reddish).toBeGreaterThan(20);
      });

      it('accepts a numeric fontSize equivalently to a px string', () => {
        renderFrame({
          world: r => r.drawText({
            text: 'HELLO', x: 20, y: 40,
            fillStyle: '#ffffff', fontSize: 32, fontFamily: 'sans-serif'
          })
        });
        const numeric = read().bounds(ink);

        setup();
        renderFrame({
          world: r => r.drawText({
            text: 'HELLO', x: 20, y: 40,
            fillStyle: '#ffffff', fontSize: '32px', fontFamily: 'sans-serif'
          })
        });
        const string = read().bounds(ink);

        expect(numeric).not.toBeNull();
        expect(Math.abs(numeric.minX - string.minX)).toBeLessThanOrEqual(1);
        expect(Math.abs(numeric.width - string.width)).toBeLessThanOrEqual(2);
      });

      it('grows with fontSize', () => {
        renderFrame({
          world: r => r.drawText({
            text: 'W', x: 20, y: 40, fillStyle: '#fff', fontSize: '16px', fontFamily: 'sans-serif'
          })
        });
        const small = read().count(ink);

        setup();
        renderFrame({
          world: r => r.drawText({
            text: 'W', x: 20, y: 40, fillStyle: '#fff', fontSize: '48px', fontFamily: 'sans-serif'
          })
        });
        const large = read().count(ink);

        expect(large).toBeGreaterThan(small * 2);
      });

      it('honours textAlign', () => {
        const draw = (textAlign) => {
          setup();
          renderFrame({
            world: r => r.drawText({
              text: 'TEXT', x: 100, y: 40, textAlign,
              fillStyle: '#fff', fontSize: '24px', fontFamily: 'sans-serif'
            })
          });
          return read().bounds(ink);
        };

        const left = draw('left');
        const centre = draw('center');
        const right = draw('right');

        expect(left.minX).toBeGreaterThanOrEqual(98);
        expect(Math.abs(centre.centerX - 100)).toBeLessThanOrEqual(4);
        expect(right.maxX).toBeLessThanOrEqual(102);
      });

      it('honours textBaseline', () => {
        const draw = (textBaseline) => {
          setup();
          renderFrame({
            world: r => r.drawText({
              text: 'TEXT', x: 20, y: 60, textBaseline,
              fillStyle: '#fff', fontSize: '24px', fontFamily: 'sans-serif'
            })
          });
          return read().bounds(ink);
        };

        const top = draw('top');
        const bottom = draw('bottom');

        expect(top.minY).toBeGreaterThanOrEqual(58);
        expect(bottom.maxY).toBeLessThanOrEqual(62);
      });

      it('draws an outline when strokeStyle is given', () => {
        renderFrame({
          world: r => r.drawText({
            text: 'O', x: 20, y: 40,
            fillStyle: '#ffffff', fontSize: '48px', fontFamily: 'sans-serif'
          })
        });
        const plain = read().count(ink);

        setup();
        renderFrame({
          world: r => r.drawText({
            text: 'O', x: 20, y: 40,
            fillStyle: '#ffffff', strokeStyle: '#ff0000', lineWidth: 4,
            fontSize: '48px', fontFamily: 'sans-serif'
          })
        });
        const snap = read();

        expect(snap.count(ink)).toBeGreaterThan(plain);
        expect(snap.count(([r, g, b]) => r > 120 && g < 90 && b < 90)).toBeGreaterThan(10);
      });
    });

    // ===================================================================
    describe.skipIf(!caps.text)('measureText', () => {
      it('reports zero width for empty text', () => {
        expect(renderer.measureText('', { fontSize: '16px' }).width).toBe(0);
      });

      it('reports a positive width for non-empty text', () => {
        expect(renderer.measureText('hello', { fontSize: '16px' }).width).toBeGreaterThan(0);
      });

      it('scales width with text length', () => {
        const short = renderer.measureText('ab', { fontSize: '16px' }).width;
        const long = renderer.measureText('abcdefgh', { fontSize: '16px' }).width;
        expect(long).toBeGreaterThan(short);
      });

      it('scales width with font size', () => {
        const small = renderer.measureText('hello', { fontSize: '12px' }).width;
        const large = renderer.measureText('hello', { fontSize: '48px' }).width;
        expect(large).toBeGreaterThan(small);
      });

      it('reports a height derived from the font size', () => {
        expect(renderer.measureText('hello', { fontSize: '24px' }).height).toBe(24);
      });
    });

    // ===================================================================
    describe('drawSprite', () => {
      let sheet;

      beforeEach(() => {
        sheet = makeTileSheet();
      });

      it('centres the tile on the given position', () => {
        renderFrame({
          world: r => r.drawSprite({
            image: sheet, x: 100, y: 60, tileWidth: TILE, tileHeight: TILE
          })
        });

        const snap = read();
        expectColorAt(snap, 100, 60, TILE_COLORS.topLeft, { label: 'sprite centre' });
        expectColorAt(snap, 93, 60, TILE_COLORS.topLeft, { label: 'inside left edge' });
        expectColorAt(snap, 90, 60, BG, { label: 'outside left edge' });
      });

      it.each([
        ['top-left', 0, 0, TILE_COLORS.topLeft],
        ['top-right', 1, 0, TILE_COLORS.topRight],
        ['bottom-left', 0, 1, TILE_COLORS.bottomLeft],
        ['bottom-right', 1, 1, TILE_COLORS.bottomRight]
      ])('selects the %s tile via tileX/tileY', (_label, tileX, tileY, expected) => {
        renderFrame({
          world: r => r.drawSprite({
            image: sheet, x: 100, y: 60, tileX, tileY, tileWidth: TILE, tileHeight: TILE
          })
        });
        expectColorAt(read(), 100, 60, expected);
      });

      it('scales to explicit width and height', () => {
        renderFrame({
          world: r => r.drawSprite({
            image: sheet, x: 100, y: 60,
            tileWidth: TILE, tileHeight: TILE, width: 64, height: 40
          })
        });

        const snap = read();
        const bounds = snap.bounds(differsFrom(BG));
        expect(bounds.width).toBeGreaterThanOrEqual(63);
        expect(bounds.width).toBeLessThanOrEqual(65);
        expect(bounds.height).toBeGreaterThanOrEqual(39);
        expect(bounds.height).toBeLessThanOrEqual(41);
      });

      it('mirrors horizontally with flipX', () => {
        const tile = makeAsymmetricTile();
        const draw = (flipX) => {
          setup();
          renderFrame({
            world: r => r.drawSprite({
              image: tile, x: 100, y: 60, tileWidth: TILE, tileHeight: TILE, width: 40, height: 40, flipX
            })
          });
          return read();
        };

        const normal = draw(false);
        expectColorAt(normal, 85, 70, '#ff0000', { label: 'unflipped left half' });
        expectColorAt(normal, 115, 70, '#0000ff', { label: 'unflipped right half' });

        const flipped = draw(true);
        expectColorAt(flipped, 85, 70, '#0000ff', { label: 'flipped left half' });
        expectColorAt(flipped, 115, 70, '#ff0000', { label: 'flipped right half' });
      });

      it('mirrors vertically with flipY', () => {
        const tile = makeAsymmetricTile();
        renderFrame({
          world: r => r.drawSprite({
            image: tile, x: 100, y: 60, tileWidth: TILE, tileHeight: TILE,
            width: 40, height: 40, flipY: true
          })
        });
        // The cyan stripe sits at the top of the tile; flipping moves it down.
        expectColorAt(read(), 100, 78, '#00ffff', { label: 'stripe moved to bottom' });
      });

      it.skipIf(!caps.transforms)('rotates about the sprite centre', () => {
        renderFrame({
          world: r => r.drawSprite({
            image: sheet, x: 100, y: 60,
            tileWidth: TILE, tileHeight: TILE,
            width: 48, height: 12,
            rotation: Math.PI / 2
          })
        });

        const bounds = read().bounds(differsFrom(BG));
        // A 48x12 sprite rotated 90 degrees occupies a 12x48 box.
        expect(bounds.width).toBeLessThanOrEqual(14);
        expect(bounds.height).toBeGreaterThanOrEqual(46);
      });

      it('ignores draws with no image', () => {
        expect(() => {
          renderFrame({
            world: r => r.drawSprite({ x: 100, y: 60, tileWidth: TILE, tileHeight: TILE })
          });
        }).not.toThrow();
      });
    });

    // ===================================================================
    describe('drawImage', () => {
      it('draws into the destination rectangle, anchored top-left', () => {
        const image = makeSolidImage(10, 10, '#ff0000');
        renderFrame({
          world: r => r.drawImage({ image, x: 20, y: 20, width: 40, height: 30 })
        });

        const snap = read();
        expectColorAt(snap, 40, 35, '#ff0000', { label: 'interior' });
        expectColorAt(snap, 20, 20, '#ff0000', { label: 'top-left anchor' });
        expectColorAt(snap, 19, 19, BG, { label: 'outside' });
        expectColorAt(snap, 61, 51, BG, { label: 'beyond destination size' });
      });

      it('defaults to the intrinsic image size', () => {
        const image = makeSolidImage(24, 16, '#00ff00');
        renderFrame({
          world: r => r.drawImage({ image, x: 50, y: 50 })
        });

        const bounds = read().bounds(differsFrom(BG));
        expect(bounds.width).toBe(24);
        expect(bounds.height).toBe(16);
        expect(bounds.minX).toBe(50);
        expect(bounds.minY).toBe(50);
      });

      it('selects a source sub-rectangle', () => {
        const image = makeQuadrantImage(32);
        renderFrame({
          world: r => r.drawImage({
            image, x: 60, y: 40, width: 40, height: 40,
            sourceX: 16, sourceY: 0, sourceWidth: 16, sourceHeight: 16
          })
        });
        // Top-right quadrant of the fixture is green.
        expectColorAt(read(), 80, 60, '#00ff00', { label: 'source sub-rect' });
      });

      it('ignores draws with no image', () => {
        expect(() => {
          renderFrame({ world: r => r.drawImage({ x: 10, y: 10, width: 10, height: 10 }) });
        }).not.toThrow();
      });
    });

    // ===================================================================
    describe('drawAnimation', () => {
      let sprite;

      beforeEach(() => {
        sprite = makeAnimatedSprite();
      });

      it('draws frame 0 of a named animation', () => {
        renderFrame({
          world: r => r.drawAnimation({ sprite, x: 100, y: 60, animation: 'idle' })
        });
        expectColorAt(read(), 100, 60, TILE_COLORS.topLeft);
      });

      it('advances along the sheet with the frame index', () => {
        renderFrame({
          world: r => r.drawAnimation({ sprite, x: 100, y: 60, animation: 'idle', frame: 1 })
        });
        expectColorAt(read(), 100, 60, TILE_COLORS.topRight);
      });

      it('uses the animation row', () => {
        renderFrame({
          world: r => r.drawAnimation({ sprite, x: 100, y: 60, animation: 'walk' })
        });
        expectColorAt(read(), 100, 60, TILE_COLORS.bottomLeft);
      });

      it('forwards transform options', () => {
        renderFrame({
          world: r => r.drawAnimation({
            sprite, x: 100, y: 60, animation: 'idle',
            transform: { width: 48, height: 48 }
          })
        });

        const bounds = read().bounds(differsFrom(BG));
        expect(bounds.width).toBeGreaterThanOrEqual(47);
        expect(bounds.width).toBeLessThanOrEqual(49);
      });

      it('draws nothing for an unknown animation', () => {
        renderFrame({
          world: r => r.drawAnimation({ sprite, x: 100, y: 60, animation: 'nope' })
        });
        expect(read().count(differsFrom(BG))).toBe(0);
      });
    });

    // ===================================================================
    describe.skipIf(!caps.transforms)('transform stack', () => {
      it('translates subsequent draws', () => {
        renderFrame({
          world: r => {
            r.pushTransform({ x: 50, y: 30 });
            r.drawRect({ x: 0, y: 0, width: 20, height: 20, fillStyle: '#ff0000' });
            r.popTransform();
          }
        });

        const snap = read();
        expectColorAt(snap, 60, 40, '#ff0000', { label: 'translated position' });
        expectColorAt(snap, 10, 10, BG, { label: 'untranslated position' });
      });

      it('scales subsequent draws', () => {
        renderFrame({
          world: r => {
            r.pushTransform({ x: 0, y: 0, scaleX: 2, scaleY: 2 });
            r.drawRect({ x: 10, y: 10, width: 10, height: 10, fillStyle: '#ff0000' });
            r.popTransform();
          }
        });

        const bounds = read().bounds(differsFrom(BG));
        expect(bounds.minX).toBe(20);
        expect(bounds.minY).toBe(20);
        expect(bounds.width).toBe(20);
        expect(bounds.height).toBe(20);
      });

      it('rotates subsequent draws about the transform origin', () => {
        renderFrame({
          world: r => {
            r.pushTransform({ x: 100, y: 60, rotation: Math.PI / 2 });
            r.drawRect({ x: 0, y: -5, width: 40, height: 10, fillStyle: '#ff0000' });
            r.popTransform();
          }
        });

        const bounds = read().bounds(differsFrom(BG));
        // The 40x10 bar becomes a 10x40 vertical bar below the origin.
        expect(bounds.width).toBeLessThanOrEqual(12);
        expect(bounds.height).toBeGreaterThanOrEqual(38);
        expect(bounds.minY).toBeGreaterThanOrEqual(58);
      });

      it('composes nested transforms', () => {
        renderFrame({
          world: r => {
            r.pushTransform({ x: 30, y: 20 });
            r.pushTransform({ x: 20, y: 10 });
            r.drawRect({ x: 0, y: 0, width: 10, height: 10, fillStyle: '#ff0000' });
            r.popTransform();
            r.popTransform();
          }
        });

        const bounds = read().bounds(differsFrom(BG));
        expect(bounds.minX).toBe(50);
        expect(bounds.minY).toBe(30);
      });

      it('restores the previous transform on pop', () => {
        renderFrame({
          world: r => {
            r.pushTransform({ x: 50, y: 30 });
            r.popTransform();
            r.drawRect({ x: 0, y: 0, width: 10, height: 10, fillStyle: '#ff0000' });
          }
        });

        const bounds = read().bounds(differsFrom(BG));
        expect(bounds.minX).toBe(0);
        expect(bounds.minY).toBe(0);
      });

      it.skipIf(!caps.clipping)('nests a clip inside a transform and restores both', () => {
        renderFrame({
          world: r => {
            r.pushTransform({ x: 50, y: 30 });
            r.pushClip({ x: 0, y: 0, width: 20, height: 20 });
            r.drawRect({ x: -W, y: -H, width: 2 * W, height: 2 * H, fillStyle: '#ff0000' });
            r.popClip();
            r.popTransform();
            r.drawRect({ x: 0, y: 0, width: 10, height: 10, fillStyle: '#00ff00' });
          }
        });

        const snap = read();
        expectColorAt(snap, 60, 40, '#ff0000', { label: 'inside translated clip' });
        expectColorAt(snap, 100, 90, BG, { label: 'outside clip' });
        expectColorAt(snap, 5, 5, '#00ff00', { label: 'transform restored after both pops' });
        expectColorAt(snap, 55, 35, '#ff0000', { label: 'clip did not leak onto later draws' });
      });
    });

    // ===================================================================
    describe.skipIf(!caps.clipping)('clip stack', () => {
      const fillEverything = r =>
        r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ff0000' });

      it('restricts drawing to the clip rectangle', () => {
        renderFrame({
          world: r => {
            r.pushClip({ x: 40, y: 30, width: 40, height: 30 });
            fillEverything(r);
            r.popClip();
          }
        });

        const snap = read();
        expectColorAt(snap, 60, 45, '#ff0000', { label: 'inside clip' });
        expectColorAt(snap, 100, 90, BG, { label: 'outside clip' });
      });

      it('restores the full surface after popClip', () => {
        renderFrame({
          world: r => {
            r.pushClip({ x: 40, y: 30, width: 40, height: 30 });
            r.popClip();
            fillEverything(r);
          }
        });
        expectColorAt(read(), 150, 100, '#ff0000', { label: 'clip released' });
      });

      it('intersects nested clips', () => {
        renderFrame({
          world: r => {
            r.pushClip({ x: 20, y: 20, width: 80, height: 80 });
            r.pushClip({ x: 60, y: 20, width: 80, height: 80 });
            fillEverything(r);
            r.popClip();
            r.popClip();
          }
        });

        const snap = read();
        expectColorAt(snap, 80, 60, '#ff0000', { label: 'inside both clips' });
        expectColorAt(snap, 40, 60, BG, { label: 'only inside the first clip' });
        expectColorAt(snap, 120, 60, BG, { label: 'only inside the second clip' });
      });

      it.skipIf(!caps.roundedCorners)('supports rounded clip rectangles', () => {
        renderFrame({
          world: r => {
            r.pushClip({ x: 40, y: 30, width: 60, height: 50, cornerRadius: 20 });
            fillEverything(r);
            r.popClip();
          }
        });

        const snap = read();
        expectColorAt(snap, 70, 55, '#ff0000', { label: 'inside rounded clip' });
        expectColorAt(snap, 41, 31, BG, { label: 'rounded corner excluded' });
      });
    });

    // ===================================================================
    describe('screen-space routing', () => {
      it('routes every primitive to the screen surface', () => {
        const image = makeSolidImage(10, 10, '#00ffff');
        const sheet = makeTileSheet();

        renderFrame({
          screen: r => {
            r.drawRect({ x: 5, y: 5, width: 20, height: 20, fillStyle: '#ff0000', isScreenSpace: true });
            r.drawArc({ x: 60, y: 15, radius: 10, fillStyle: '#00ff00', isScreenSpace: true });
            r.drawLine({ x1: 90, y1: 15, x2: 120, y2: 15, strokeStyle: '#0000ff', lineWidth: 4, isScreenSpace: true });
            r.drawPath({
              points: [{ x: 140, y: 5 }, { x: 160, y: 25 }, { x: 140, y: 25 }],
              closed: true, fillStyle: '#ffff00', isScreenSpace: true
            });
            r.drawImage({ image, x: 5, y: 60, width: 20, height: 20, isScreenSpace: true });
            r.drawSprite({
              image: sheet, x: 60, y: 70, tileWidth: TILE, tileHeight: TILE, isScreenSpace: true
            });
          }
        });

        const snap = read();
        expectColorAt(snap, 15, 15, '#ff0000', { label: 'screen rect' });
        expectColorAt(snap, 60, 15, '#00ff00', { label: 'screen arc' });
        expectColorAt(snap, 105, 15, '#0000ff', { label: 'screen line' });
        expectColorAt(snap, 145, 22, '#ffff00', { label: 'screen path' });
        expectColorAt(snap, 15, 70, '#00ffff', { label: 'screen image' });
        expectColorAt(snap, 60, 70, TILE_COLORS.topLeft, { label: 'screen sprite' });
      });

      it.skipIf(!caps.clipping)('applies screen-space clips', () => {
        renderFrame({
          screen: r => {
            r.pushClip({ x: 40, y: 30, width: 40, height: 30, isScreenSpace: true });
            r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ff0000', isScreenSpace: true });
            r.popClip();
          }
        });

        const snap = read();
        expectColorAt(snap, 60, 45, '#ff0000', { label: 'inside screen clip' });
        expectColorAt(snap, 150, 100, BG, { label: 'outside screen clip' });
      });

      it.skipIf(!caps.transforms)('applies screen-space transforms', () => {
        renderFrame({
          screen: r => {
            r.pushTransform({ x: 50, y: 30, isScreenSpace: true });
            r.drawRect({ x: 0, y: 0, width: 20, height: 20, fillStyle: '#ff0000', isScreenSpace: true });
            r.popTransform();
          }
        });
        expectColorAt(read(), 60, 40, '#ff0000', { label: 'transformed screen rect' });
      });
    });

    // ===================================================================
    describe('hitTest', () => {
      const rect = { type: 'rect', x: 10, y: 20, width: 100, height: 50 };
      const circle = { type: 'circle', x: 50, y: 50, radius: 20 };

      it('detects points inside a rectangle', () => {
        expect(renderer.hitTest(60, 45, rect)).toBe(true);
      });

      it('includes rectangle edges', () => {
        expect(renderer.hitTest(10, 20, rect)).toBe(true);
        expect(renderer.hitTest(110, 70, rect)).toBe(true);
      });

      it('rejects points outside a rectangle', () => {
        expect(renderer.hitTest(9, 45, rect)).toBe(false);
        expect(renderer.hitTest(111, 45, rect)).toBe(false);
        expect(renderer.hitTest(60, 19, rect)).toBe(false);
        expect(renderer.hitTest(60, 71, rect)).toBe(false);
      });

      it('detects points inside a circle', () => {
        expect(renderer.hitTest(50, 50, circle)).toBe(true);
        expect(renderer.hitTest(65, 50, circle)).toBe(true);
      });

      it('rejects points outside a circle', () => {
        expect(renderer.hitTest(75, 50, circle)).toBe(false);
        expect(renderer.hitTest(65, 65, circle)).toBe(false);
      });

      it('returns false for unknown shape types', () => {
        expect(renderer.hitTest(0, 0, { type: 'hexagon' })).toBe(false);
      });
    });

    // ===================================================================
    describe('debug state', () => {
      it('is enabled by default', () => {
        expect(renderer.isDebugEnabled()).toBe(true);
      });

      it('toggles the debug flag', () => {
        renderer.setDebugEnabled(false);
        expect(renderer.isDebugEnabled()).toBe(false);
        renderer.setDebugEnabled(true);
        expect(renderer.isDebugEnabled()).toBe(true);
      });

      it('tracks the debug layer', () => {
        expect(renderer.getDebugLayer()).toBe('default');
        renderer.setDebugLayer('physics');
        expect(renderer.getDebugLayer()).toBe('physics');
      });

      it('keeps debug state independent between renderer instances', () => {
        const other = harness.createRenderer();
        renderer.setDebugEnabled(false);
        expect(other.isDebugEnabled()).toBe(true);
      });
    });

    // ===================================================================
    describe('statistics', () => {
      it('counts draw calls by primitive type', () => {
        renderFrame({
          world: r => {
            r.drawRect({ x: 0, y: 0, width: 10, height: 10, fillStyle: '#fff' });
            r.drawRect({ x: 20, y: 0, width: 10, height: 10, fillStyle: '#fff' });
            r.drawLine({ x1: 0, y1: 50, x2: 10, y2: 50, strokeStyle: '#fff' });
            r.drawArc({ x: 50, y: 50, radius: 5, fillStyle: '#fff' });
            r.drawPath({ points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], strokeStyle: '#fff' });
            r.drawText({ text: 'hi', x: 0, y: 80, fillStyle: '#fff' });
          }
        });

        const stats = renderer.getStats();
        expect(stats.primitives).toBe(6);
        expect(stats.shapesDrawn).toBe(5);
        expect(stats.textDrawn).toBe(1);
        // Backends may batch: one GPU draw per batch, but at least one and
        // never more than one per primitive.
        expect(stats.drawCalls).toBeGreaterThanOrEqual(1);
        expect(stats.drawCalls).toBeLessThanOrEqual(stats.primitives);
      });

      it('counts sprites and images together', () => {
        const sheet = makeTileSheet();
        const image = makeSolidImage(8, 8, '#fff');

        renderFrame({
          world: r => {
            r.drawSprite({ image: sheet, x: 50, y: 50, tileWidth: TILE, tileHeight: TILE });
            r.drawImage({ image, x: 0, y: 0, width: 8, height: 8 });
          }
        });

        expect(renderer.getStats().spritesDrawn).toBe(2);
      });

      it('resets counters at the start of each frame', () => {
        renderFrame({
          world: r => r.drawRect({ x: 0, y: 0, width: 10, height: 10, fillStyle: '#fff' })
        });
        expect(renderer.getStats().primitives).toBe(1);

        renderFrame({});
        expect(renderer.getStats().primitives).toBe(0);
        expect(renderer.getStats().drawCalls).toBe(0);
      });

      it('returns a copy of the stats object', () => {
        const stats = renderer.getStats();
        stats.drawCalls = 9999;
        expect(renderer.getStats().drawCalls).not.toBe(9999);
      });
    });

    // ===================================================================
    describe('frame timing', () => {
      it('exposes an FPS API with sane shapes', () => {
        renderFrame({});
        expect(typeof renderer.getFPS()).toBe('number');
        expect(typeof renderer.getAverageFPS()).toBe('number');
        expect(Array.isArray(renderer.getFPSHistory())).toBe(true);
      });

      it('returns a copy of the FPS history', () => {
        const history = renderer.getFPSHistory();
        history[0] = 9999;
        expect(renderer.getFPSHistory()[0]).not.toBe(9999);
      });

      it('falls back to the current FPS before any sample window closes', () => {
        expect(renderer.getAverageFPS()).toBe(renderer.getFPS());
      });
    });

    // ===================================================================
    describe('drawParticles', () => {
      function particles(list) {
        const data = new Float32Array(list.length * PARTICLE_STRIDE);
        list.forEach((p, i) => {
          const o = i * PARTICLE_STRIDE;
          data[o] = p.x; data[o + 1] = p.y; data[o + 2] = p.size; data[o + 3] = p.rotation ?? 0;
          data[o + 4] = p.r ?? 1; data[o + 5] = p.g ?? 1; data[o + 6] = p.b ?? 1; data[o + 7] = p.a ?? 1;
        });
        return data;
      }

      it('draws every particle at its position and size (any backend)', () => {
        const sheet = makeSolidImage(TILE, TILE, '#ffffff');
        renderFrame({
          world: r => r.drawParticles({
            image: sheet, tileWidth: TILE, tileHeight: TILE,
            data: particles([{ x: 40, y: 60, size: 30 }, { x: 160, y: 60, size: 30 }])
          })
        });
        const snap = read();
        expectColorAt(snap, 40, 60, '#ffffff', { label: 'first particle' });
        expectColorAt(snap, 160, 60, '#ffffff', { label: 'second particle' });
        expectColorAt(snap, 100, 60, '#000000', { label: 'gap between them' });
      });

      it('honours per-particle alpha and skips fully transparent ones', () => {
        const sheet = makeSolidImage(TILE, TILE, '#ffffff');
        renderFrame({
          world: r => r.drawParticles({
            image: sheet, tileWidth: TILE, tileHeight: TILE,
            data: particles([{ x: 40, y: 60, size: 30, a: 0.5 }, { x: 160, y: 60, size: 30, a: 0 }])
          })
        });
        const snap = read();
        expectColorAt(snap, 40, 60, '#808080', { tolerance: 6, label: 'half alpha' });
        expectColorAt(snap, 160, 60, '#000000', { label: 'zero alpha' });
      });

      it('respects count over the buffer length', () => {
        const sheet = makeSolidImage(TILE, TILE, '#ffffff');
        renderFrame({
          world: r => r.drawParticles({
            image: sheet, tileWidth: TILE, tileHeight: TILE, count: 1,
            data: particles([{ x: 40, y: 60, size: 30 }, { x: 160, y: 60, size: 30 }])
          })
        });
        const snap = read();
        expectColorAt(snap, 40, 60, '#ffffff', { label: 'counted' });
        expectColorAt(snap, 160, 60, '#000000', { label: 'beyond count' });
      });

      it('counts each particle as a sprite primitive', () => {
        const sheet = makeSolidImage(TILE, TILE, '#ffffff');
        const list = [];
        for (let i = 0; i < 50; i++) list.push({ x: 10 + (i % 10) * 18, y: 20 + Math.floor(i / 10) * 18, size: 8 });
        renderFrame({
          world: r => r.drawParticles({ image: sheet, tileWidth: TILE, tileHeight: TILE, data: particles(list) })
        });
        expect(renderer.getStats().spritesDrawn).toBe(50);
        expect(renderer.getStats().primitives).toBe(50);
      });

      it.skipIf(!caps.particles)('submits a field in far fewer draw calls than particles', () => {
        const sheet = makeSolidImage(TILE, TILE, '#ffffff');
        const list = [];
        for (let i = 0; i < 2000; i++) list.push({ x: (i * 7) % W, y: (i * 13) % H, size: 3 });
        renderFrame({
          world: r => r.drawParticles({ image: sheet, tileWidth: TILE, tileHeight: TILE, data: particles(list) })
        });
        expect(renderer.getStats().drawCalls).toBeLessThan(20);
      });

      it.skipIf(!caps.particles)('applies per-particle colour', () => {
        const sheet = makeSolidImage(TILE, TILE, '#ffffff');
        renderFrame({
          world: r => r.drawParticles({
            image: sheet, tileWidth: TILE, tileHeight: TILE,
            data: particles([{ x: 40, y: 60, size: 30, r: 1, g: 0, b: 0 }, { x: 160, y: 60, size: 30, r: 0, g: 0, b: 1 }])
          })
        });
        const snap = read();
        expectColorAt(snap, 40, 60, '#ff0000', { label: 'red particle' });
        expectColorAt(snap, 160, 60, '#0000ff', { label: 'blue particle' });
      });
    });

    // ===================================================================
    describe('optional: tint', () => {
      it.skipIf(!caps.tint)('multiplies a sprite by the tint colour', () => {
        const sheet = makeSolidImage(TILE, TILE, '#ffffff');
        renderFrame({
          world: r => r.drawSprite({
            image: sheet, x: 100, y: 60, tileWidth: TILE, tileHeight: TILE,
            width: 80, height: 60, tint: '#ff0000'
          })
        });
        expectColorAt(read(), 100, 60, '#ff0000', { label: 'tinted white sprite' });
      });

      it.skipIf(!caps.tint)('leaves a sprite unchanged for a white tint', () => {
        const sheet = makeSolidImage(TILE, TILE, '#3366cc');
        renderFrame({
          world: r => r.drawSprite({
            image: sheet, x: 100, y: 60, tileWidth: TILE, tileHeight: TILE,
            width: 80, height: 60, tint: '#ffffff'
          })
        });
        expectColorAt(read(), 100, 60, '#3366cc', { label: 'white tint is identity' });
      });

      it.skipIf(!caps.tint)('scales coverage by the tint alpha', () => {
        const sheet = makeSolidImage(TILE, TILE, '#ffffff');
        renderFrame({
          world: r => r.drawSprite({
            image: sheet, x: 100, y: 60, tileWidth: TILE, tileHeight: TILE,
            width: 80, height: 60, tint: 'rgba(255, 255, 255, 0.5)'
          })
        });
        // Half-covered white over the opaque black world clear.
        expectColorAt(read(), 100, 60, '#808080', { tolerance: 6, label: 'half-alpha tint' });
      });
    });

    // ===================================================================
    describe('optional: blend modes', () => {
      it.skipIf(!caps.blendModes)('adds colour with the additive blend', () => {
        renderFrame({
          world: (r) => {
            r.drawRect({ x: 0, y: 0, width: 200, height: 120, fillStyle: '#0000ff' });
            r.drawRect({ x: 0, y: 0, width: 200, height: 120, fillStyle: '#ff0000', blend: 'additive' });
          }
        });
        expectColorAt(read(), 100, 60, '#ff00ff', { label: 'red added onto blue' });
      });

      it.skipIf(!caps.blendModes)('darkens with the multiply blend', () => {
        renderFrame({
          world: (r) => {
            r.drawRect({ x: 0, y: 0, width: 200, height: 120, fillStyle: '#ffff00' });
            r.drawRect({ x: 0, y: 0, width: 200, height: 120, fillStyle: '#00ffff', blend: 'multiply' });
          }
        });
        expectColorAt(read(), 100, 60, '#00ff00', { label: 'yellow x cyan' });
      });

      it.skipIf(!caps.blendModes)('draws normally when blend is omitted', () => {
        renderFrame({
          world: (r) => {
            r.drawRect({ x: 0, y: 0, width: 200, height: 120, fillStyle: '#0000ff' });
            r.drawRect({ x: 0, y: 0, width: 200, height: 120, fillStyle: '#ff0000' });
          }
        });
        expectColorAt(read(), 100, 60, '#ff0000', { label: 'source-over default' });
      });

      it.skipIf(!caps.blendModes)('does not leak the blend mode into later draws', () => {
        renderFrame({
          world: (r) => {
            r.drawRect({ x: 0, y: 0, width: 200, height: 120, fillStyle: '#0000ff' });
            r.drawRect({ x: 0, y: 0, width: 100, height: 120, fillStyle: '#ff0000', blend: 'additive' });
            r.drawRect({ x: 100, y: 0, width: 100, height: 120, fillStyle: '#00ff00' });
          }
        });
        const snap = read();
        expectColorAt(snap, 50, 60, '#ff00ff', { label: 'additive half' });
        expectColorAt(snap, 150, 60, '#00ff00', { label: 'normal half after additive' });
      });
    });

    // ===================================================================
    describe('optional: lights', () => {
      it('accepts lighting calls on any backend without throwing', () => {
        expect(() => {
          renderFrame({
            world: (r) => {
              r.setAmbientLight('#404040');
              r.drawLight({ x: 100, y: 60, radius: 50, color: '#ffffff' });
              r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' });
            }
          });
        }).not.toThrow();
        renderer.setAmbientLight(null);
      });

      it.skipIf(!caps.lights)('darkens the world by the ambient colour', () => {
        renderer.setAmbientLight('#808080');
        renderFrame({
          world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' })
        });
        expectColorAt(read(), 100, 60, '#808080', { tolerance: 8, label: 'ambient-lit white' });
        renderer.setAmbientLight(null);
      });

      it.skipIf(!caps.lights)('brightens where a light falls and not outside it', () => {
        renderer.setAmbientLight('#202020');
        renderFrame({
          world: (r) => {
            r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' });
            r.drawLight({ x: 50, y: 60, radius: 40, color: '#ffffff', intensity: 1 });
          }
        });
        const snap = read();
        const lit = snap.at(50, 60)[0];
        const unlit = snap.at(180, 60)[0];
        expect(lit).toBeGreaterThan(unlit + 60);
        renderer.setAmbientLight(null);
      });

      it.skipIf(!caps.lights)('renders at full brightness once ambient is cleared', () => {
        renderer.setAmbientLight('#303030');
        renderFrame({ world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' }) });
        renderer.setAmbientLight(null);
        renderFrame({ world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' }) });
        expectColorAt(read(), 100, 60, '#ffffff', { label: 'lighting disabled again' });
      });

      it.skipIf(!caps.lights)('keeps clipping working while lighting is on', () => {
        renderer.setAmbientLight('#ffffff');
        renderFrame({
          world: (r) => {
            r.pushClip({ x: 0, y: 0, width: 100, height: H });
            r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ff0000' });
            r.popClip();
          }
        });
        const snap = read();
        expectColorAt(snap, 50, 60, '#ff0000', { tolerance: 8, label: 'inside clip' });
        expectColorAt(snap, 150, 60, '#000000', { tolerance: 8, label: 'outside clip' });
        renderer.setAmbientLight(null);
      });

      it.skipIf(!caps.lights)('leaves the screen pass unlit', () => {
        renderer.setAmbientLight('#202020');
        renderFrame({
          world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' }),
          screen: r => r.drawRect({ x: 120, y: 20, width: 60, height: 60, fillStyle: '#ffffff' })
        });
        const snap = read();
        expectColorAt(snap, 150, 50, '#ffffff', { label: 'UI ignores ambient' });
        renderer.setAmbientLight(null);
      });
    });

    // ===================================================================
    describe('optional: post effects', () => {
      it('accepts post-effect calls on any backend without throwing', () => {
        expect(() => {
          renderer.setPostEffects({ vignette: { strength: 0.5 } });
          renderFrame({ world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' }) });
        }).not.toThrow();
        renderer.setPostEffects(null);
      });

      it.skipIf(!caps.postEffects)('darkens the corners with a vignette', () => {
        renderer.setPostEffects({ vignette: { strength: 0.9, start: 0.2 } });
        renderFrame({
          world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' })
        });
        const snap = read();
        const centre = snap.at(100, 60)[0];
        const corner = snap.at(4, 4)[0];
        expect(centre).toBeGreaterThan(200);
        expect(corner).toBeLessThan(centre - 60);
        renderer.setPostEffects(null);
      });

      it.skipIf(!caps.postEffects)('spreads light outward with bloom', () => {
        // Sample just outside a bright square: unbloomed it is the black
        // clear, bloomed it picks up the halo. The margin is calibrated to
        // the actual Gaussian falloff at this distance rather than guessed.
        const square = r => r.drawRect({ x: 80, y: 40, width: 40, height: 40, fillStyle: '#ffffff' });

        renderer.setPostEffects({ bloom: { threshold: 0.3, strength: 1.8, blur: 48 } });
        renderFrame({ world: square });
        const bloomed = read().at(100, 28)[0];

        renderer.setPostEffects(null);
        renderFrame({ world: square });
        const plain = read().at(100, 28)[0];

        expect(plain).toBeLessThan(10);
        expect(bloomed).toBeGreaterThan(plain + 15);
      });

      it.skipIf(!caps.postEffects)('returns to an untouched frame once disabled', () => {
        renderer.setPostEffects({ vignette: { strength: 1, start: 0 } });
        renderFrame({ world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' }) });
        renderer.setPostEffects(null);
        renderFrame({ world: r => r.drawRect({ x: 0, y: 0, width: W, height: H, fillStyle: '#ffffff' }) });
        expectColorAt(read(), 4, 4, '#ffffff', { label: 'post disabled' });
      });
    });

    // ===================================================================
    describe('cursor', () => {
      it('sets the cursor without throwing', () => {
        expect(() => renderer.setCursor('pointer')).not.toThrow();
      });
    });
  });
}
