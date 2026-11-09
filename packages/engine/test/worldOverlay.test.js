import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createCanvasElement, installWindowStub, displayCanvas, stubDocumentListeners } from './helpers/environment.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { M2D } from '../src/core/m2d.js';
import { UIElement } from '../src/core/ui/uiElement.js';

/**
 * The world overlay (`game.worldOverlay`): annotations drawn *on* the world.
 *
 * The contract under test: a draw call submitted in world coordinates during
 * the world pass is replayed by the overlay pass in screen space, clipped to
 * the content rect, at the display's resolution rather than the world's.
 * Geometry keeps its world size (it annotates world extents); text keeps a
 * fixed UI size (it exists to be read).
 *
 * Tests run a real M2D over a RecordingRenderer, so assertions are on the
 * exact screen-space draw calls the overlay emits.
 */

/**
 * A 1280x720 game with the camera parked so that world coordinates equal
 * screen coordinates: world (640, 360) is the view's centre. Assertions can
 * then reason in plain numbers.
 */
function makeGame(displayWidth = 1280, displayHeight = 720) {
  const renderer = new RecordingRenderer();
  const game = new M2D(displayCanvas(displayWidth, displayHeight), {
    // No frame-rate readout: it lives in the engine's debug layer and would
    // add its own draw calls to every sequence asserted below.
    width: 1280, height: 720, renderer, performanceStats: false
  });
  game.camera.x = 640;
  game.camera.y = 360;
  return { game, renderer, overlay: game.worldOverlay };
}

/** Wipe the recording and run the overlay pass. */
function redraw(game, renderer) {
  renderer.reset();
  game.drawOverlays();
}

describe('WorldOverlay', () => {
  beforeAll(stubDocumentListeners);

  beforeEach(() => {
    installWindowStub();
  });

  it('draws beneath the screens, so a menu covers its annotations', () => {
    // Annotations belong to the game, not to the chrome above it.
    const { game, renderer, overlay } = makeGame();
    game.ui.debug.add(new (class extends UIElement {
      draw() { this.paint.drawRect({ x: 0, y: 0, width: 1, height: 1, fillStyle: '#fff' }); }
    })({}));
    overlay.drawArc({ x: 640, y: 360, radius: 10 });

    redraw(game, renderer);

    const order = renderer.sequence();
    expect(order.indexOf('drawArc')).toBeLessThan(order.indexOf('drawRect'));
  });

  describe('geometry', () => {
    it('replays shapes in the screen pass, inside a clip and a transform', () => {
      const { game, renderer, overlay } = makeGame();
      overlay.drawArc({ x: 640, y: 360, radius: 50, strokeStyle: '#f00' });

      redraw(game, renderer);

      expect(renderer.sequence()).toEqual([
        'beginScreenFrame', 'pushClip', 'pushTransform', 'drawArc',
        'popTransform', 'popClip', 'endScreenFrame'
      ]);
      // Screen space: rasterized at display resolution, not the world's.
      expect(renderer.optionsFor('drawArc')[0].isScreenSpace).toBe(true);
    });

    it('keeps shapes in world coordinates and world sizes', () => {
      const { game, renderer, overlay } = makeGame();
      overlay.drawArc({ x: 500, y: 300, radius: 200, strokeStyle: '#f00' });

      redraw(game, renderer);

      // A 200-unit range ring has to stay glued to the 200 units of world it
      // describes, so coordinates and radius pass through untouched and the
      // transform does the placing.
      expect(renderer.optionsFor('drawArc')[0]).toMatchObject({ x: 500, y: 300, radius: 200 });
      expect(renderer.optionsFor('pushTransform')[0]).toMatchObject({
        isScreenSpace: true, scaleX: 1, scaleY: 1, x: 0, y: 0
      });
    });

    it('offsets the transform by the camera, so shapes track the world', () => {
      const { game, renderer, overlay } = makeGame();
      game.camera.x = 1000; // pan right: world 1000 is now the view's centre

      overlay.drawArc({ x: 1000, y: 360, radius: 10 });
      redraw(game, renderer);

      // World 1000 must land at the view's centre, so the transform shifts by
      // -(1000 - 640) = -360.
      const t = renderer.optionsFor('pushTransform')[0];
      expect(t.x).toBeCloseTo(-360, 5);
      expect(t.x + renderer.optionsFor('drawArc')[0].x).toBeCloseTo(640, 5);
    });

    it('supports the renderer shape vocabulary', () => {
      const { game, renderer, overlay } = makeGame();
      overlay.drawRect({ x: 0, y: 0, width: 10, height: 10 });
      overlay.drawLine({ x1: 0, y1: 0, x2: 10, y2: 10 });
      overlay.drawPath({ points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], closed: true });

      redraw(game, renderer);

      expect(renderer.sequence()).toEqual([
        'beginScreenFrame', 'pushClip', 'pushTransform',
        'drawRect', 'drawLine', 'drawPath',
        'popTransform', 'popClip', 'endScreenFrame'
      ]);
    });

    it('preserves submission order', () => {
      const { game, renderer, overlay } = makeGame();
      overlay.drawRect({ x: 1, y: 0, width: 1, height: 1 });
      overlay.drawRect({ x: 2, y: 0, width: 1, height: 1 });
      overlay.drawRect({ x: 3, y: 0, width: 1, height: 1 });

      redraw(game, renderer);

      expect(renderer.optionsFor('drawRect').map(o => o.x)).toEqual([1, 2, 3]);
    });

    it('draws text above geometry regardless of submission order', () => {
      const { game, renderer, overlay } = makeGame();
      overlay.drawText({ x: 640, y: 360, text: 'on top' });
      overlay.drawArc({ x: 640, y: 360, radius: 20 });

      redraw(game, renderer);

      const order = renderer.sequence();
      expect(order.indexOf('drawArc')).toBeLessThan(order.indexOf('drawText'));
    });
  });

  describe('text', () => {
    it('draws a submitted label at the projected position', () => {
      const { game, renderer, overlay } = makeGame();
      overlay.drawText({ x: 640, y: 360, text: 'centre', fontSize: '12px' });

      redraw(game, renderer);

      const [text] = renderer.optionsFor('drawText');
      expect(text).toMatchObject({ text: 'centre', x: 640, y: 360, isScreenSpace: true });
      // Projected individually, outside the world transform: its size must
      // not follow the transform, only its anchor.
      expect(renderer.sequence()).toEqual([
        'beginScreenFrame', 'pushClip', 'drawText', 'popClip', 'endScreenFrame'
      ]);
    });

    it('applies offsets in UI units on top of the world anchor', () => {
      const { game, renderer, overlay } = makeGame();
      overlay.drawText({ x: 600, y: 300, offsetX: 4, offsetY: -20, text: 'hp' });

      redraw(game, renderer);

      const [text] = renderer.optionsFor('drawText');
      expect(text.x).toBe(604);
      expect(text.y).toBe(280);
    });

    it('culls labels anchored far outside the view', () => {
      const { game, renderer, overlay } = makeGame();
      overlay.drawText({ x: 640 + 5000, y: 360, text: 'far away' });

      redraw(game, renderer);

      expect(renderer.callsTo('drawText')).toHaveLength(0);
    });
  });

  describe('resolution independence', () => {
    it('keeps labels at the same UI position and size at any world resolution', () => {
      const { game, renderer, overlay } = makeGame();

      const drawOnce = () => {
        overlay.drawText({ x: 400, y: 200, text: 'fixed', fontSize: '12px' });
        redraw(game, renderer);
        return renderer.optionsFor('drawText')[0];
      };

      const native = drawOnce();
      game.setResolution(0.25);
      const coarse = drawOnce();

      // The world got 4x coarser; the label moved and resized not at all.
      expect(coarse.x).toBe(native.x);
      expect(coarse.y).toBe(native.y);
      expect(coarse.fontSize).toBe(native.fontSize);
    });

    it('keeps geometry in the same place and size at any world resolution', () => {
      const { game, renderer, overlay } = makeGame();

      const drawOnce = () => {
        overlay.drawArc({ x: 400, y: 200, radius: 75, lineWidth: 1 });
        redraw(game, renderer);
        return {
          arc: renderer.optionsFor('drawArc')[0],
          transform: renderer.optionsFor('pushTransform')[0]
        };
      };

      const native = drawOnce();
      game.setResolution(0.25);
      const coarse = drawOnce();

      // The annotation still describes the same world region, and is still
      // submitted to the sharp pass — only the world behind it got coarser.
      expect(coarse.arc).toEqual(native.arc);
      expect(coarse.transform).toEqual(native.transform);
    });
  });

  describe('letterboxing', () => {
    it('projects through the content rect and clips to it', () => {
      // A wider display: the 1280x720 view sits centred with 320-unit bars.
      const { game, renderer, overlay } = makeGame(1920, 720);
      overlay.drawText({ x: 640, y: 360, text: 'centre' });
      overlay.drawArc({ x: 640, y: 360, radius: 10 });

      redraw(game, renderer);

      // World centre lands at the centre of the content rect, not the display.
      expect(renderer.optionsFor('drawText')[0].x).toBe(320 + 640);
      expect(renderer.optionsFor('pushTransform')[0].x).toBeCloseTo(320, 5);
      // The clip is the content rect, so nothing runs onto the bars.
      expect(renderer.optionsFor('pushClip')[0]).toMatchObject({
        x: 320, y: 0, width: 1280, height: 720
      });
    });
  });

  describe('frame lifecycle', () => {
    it('consumes the queue: each submission draws exactly once', () => {
      const { game, renderer, overlay } = makeGame();
      overlay.drawText({ x: 640, y: 360, text: 'once' });
      overlay.drawArc({ x: 640, y: 360, radius: 5 });

      game.drawOverlays();
      redraw(game, renderer);

      expect(renderer.callsTo('drawText')).toHaveLength(0);
      expect(renderer.callsTo('drawArc')).toHaveLength(0);
    });

    it('drops stale submissions at the top of the world pass', () => {
      const { game, renderer, overlay } = makeGame();
      // Submitted last frame, but drawOverlays never ran (a custom loop
      // skipped it). The next world pass must not inherit them.
      overlay.drawText({ x: 640, y: 360, text: 'stale' });
      overlay.drawArc({ x: 640, y: 360, radius: 5 });

      game.drawWorld({ draw() {} });
      redraw(game, renderer);

      expect(renderer.callsTo('drawText')).toHaveLength(0);
      expect(renderer.callsTo('drawArc')).toHaveLength(0);
    });

    it('emits nothing at all when nothing was submitted', () => {
      const { game, renderer } = makeGame();
      redraw(game, renderer);

      expect(renderer.callsTo('pushClip')).toHaveLength(0);
    });

    it('is torn down with the game', () => {
      const { game, overlay } = makeGame();
      game.destroy();
      expect(overlay.shapes).toHaveLength(0);
      expect(overlay.labels).toHaveLength(0);
    });
  });
});
