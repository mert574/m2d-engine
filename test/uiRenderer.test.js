import { describe, it, expect, beforeEach } from 'vitest';

import { UIRenderer } from '../src/core/renderers/uiRenderer.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { UIButton } from '../src/core/ui/button.js';
import { UIText } from '../src/core/ui/text.js';
import { UIImage } from '../src/core/ui/Image.js';
import { UIRectangle } from '../src/core/ui/Rectangle.js';
import { PerformanceStats } from '../src/core/ui/performanceStats.js';
import { makeTestGame } from './helpers/testGame.js';

describe('UIRenderer', () => {
  let backend;
  let ui;

  beforeEach(() => {
    backend = new RecordingRenderer();
    ui = new UIRenderer(backend);
  });

  describe('screen-space forwarding', () => {
    const drawMethods = [
      ['drawRect', { x: 1, y: 2, width: 3, height: 4 }],
      ['drawText', { text: 'hi', x: 1, y: 2 }],
      ['drawImage', { image: {}, x: 1, y: 2 }],
      ['drawSprite', { image: {}, x: 1, y: 2, tileWidth: 8, tileHeight: 8 }],
      ['drawLine', { x1: 0, y1: 0, x2: 1, y2: 1 }],
      ['drawArc', { x: 1, y: 2, radius: 3 }],
      ['drawPath', { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]
    ];

    it.each(drawMethods)('%s forwards with isScreenSpace set', (method, options) => {
      ui[method](options);

      const forwarded = backend.optionsFor(method);
      expect(forwarded).toHaveLength(1);
      expect(forwarded[0].isScreenSpace).toBe(true);
      expect(forwarded[0]).toMatchObject(options);
    });

    it.each(drawMethods)('%s does not mutate the caller options', (method, options) => {
      const original = { ...options };
      ui[method](options);

      expect(options).toEqual(original);
      expect('isScreenSpace' in options).toBe(false);
    });

    it('marks clips and transforms as screen-space', () => {
      ui.pushClip({ x: 1, y: 2, width: 3, height: 4 });
      ui.pushTransform({ x: 5, y: 6 });

      expect(backend.optionsFor('pushClip')[0].isScreenSpace).toBe(true);
      expect(backend.optionsFor('pushTransform')[0].isScreenSpace).toBe(true);
    });

    it('supports pushTransform with no arguments', () => {
      expect(() => ui.pushTransform()).not.toThrow();
      expect(backend.optionsFor('pushTransform')[0].isScreenSpace).toBe(true);
    });
  });

  describe('lifecycle delegation', () => {
    it('maps clear onto the backend screen clear', () => {
      ui.clear('#123456');
      expect(backend.callsTo('clearScreen')[0].args[0]).toBe('#123456');
      expect(backend.callsTo('clear')).toHaveLength(0);
    });

    it('maps frame control onto the screen pass', () => {
      ui.beginFrame();
      ui.endFrame();
      expect(backend.sequence()).toEqual(['beginScreenFrame', 'endScreenFrame']);
    });

    it('reflects the backend dimensions', () => {
      backend.resize(640, 480);
      expect(ui.width).toBe(640);
      expect(ui.height).toBe(480);
    });

    it('delegates queries and cursor control', () => {
      expect(ui.measureText('abcd', { fontSize: '20px' }).width).toBeGreaterThan(0);
      expect(ui.hitTest(5, 5, { type: 'rect', x: 0, y: 0, width: 10, height: 10 })).toBe(true);

      ui.setCursor('pointer');
      expect(backend.cursor).toBe('pointer');
    });

    it('pops clips and transforms', () => {
      ui.popClip();
      ui.popTransform();
      expect(backend.sequence()).toEqual(['popClip', 'popTransform']);
    });
  });
});

describe('UI widgets', () => {
  let game;
  let backend;

  beforeEach(() => {
    game = makeTestGame();
    backend = game.renderer;
  });

  function attach(element) {
    element.setGame(game);
    return element;
  }

  describe('UIButton', () => {
    it('draws a centred background and label', () => {
      attach(new UIButton(100, 50, 80, 30, 'Play', () => {})).draw();

      expect(backend.optionsFor('drawRect')[0]).toMatchObject({
        x: 60, y: 35, width: 80, height: 30
      });
      expect(backend.optionsFor('drawText')[0]).toMatchObject({
        text: 'Play', x: 100, y: 50, textAlign: 'center', textBaseline: 'middle'
      });
    });

    it('uses the hover colour while hovered', () => {
      const button = attach(new UIButton(100, 50, 80, 30, 'Play', () => {}, {
        backgroundColor: '#111111',
        hoverColor: '#222222'
      }));

      button.draw();
      expect(backend.optionsFor('drawRect')[0].fillStyle).toBe('#111111');

      backend.reset();
      button.isHovered = true;
      button.draw();
      expect(backend.optionsFor('drawRect')[0].fillStyle).toBe('#222222');
    });

    it('updates the cursor on hover transitions', () => {
      const button = attach(new UIButton(100, 50, 80, 30, 'Play', () => {}));

      button.onMouseMove(100, 50);
      expect(backend.cursor).toBe('pointer');

      button.onMouseMove(0, 0);
      expect(backend.cursor).toBe('default');
    });

    it('invokes the click handler only inside its bounds', () => {
      let clicks = 0;
      const button = attach(new UIButton(100, 50, 80, 30, 'Play', () => { clicks++; }));

      button.onMouseDown(100, 50);
      expect(clicks).toBe(1);

      button.onMouseDown(0, 0);
      expect(clicks).toBe(1);
    });
  });

  describe('UIText', () => {
    it('draws with the configured style', () => {
      attach(new UIText(10, 20, 'Score', { fontSize: '22px', color: '#abcdef', align: 'right' })).draw();

      expect(backend.optionsFor('drawText')[0]).toMatchObject({
        text: 'Score', x: 10, y: 20, fillStyle: '#abcdef', fontSize: '22px', textAlign: 'right'
      });
    });
  });

  describe('UIRectangle', () => {
    it('draws centred on its position', () => {
      attach(new UIRectangle(100, 50, 40, 20, '#ff0000')).draw();

      expect(backend.optionsFor('drawRect')[0]).toMatchObject({
        x: 80, y: 40, width: 40, height: 20, fillStyle: '#ff0000'
      });
    });

    it('only hit-tests when interactive', () => {
      const inert = attach(new UIRectangle(100, 50, 40, 20, '#f00'));
      const live = attach(new UIRectangle(100, 50, 40, 20, '#f00', { interactive: true }));

      expect(inert.contains(100, 50)).toBe(false);
      expect(live.contains(100, 50)).toBe(true);
      expect(live.contains(0, 0)).toBe(false);
    });
  });

  describe('UIImage', () => {
    // Regression guard: this previously called drawImage positionally, so UI
    // images silently never rendered.
    it('draws through the options-object renderer API', () => {
      attach(new UIImage(100, 50, { width: 20, height: 10 })).draw();

      const calls = backend.optionsFor('drawImage');
      expect(calls).toHaveLength(1);
      expect(calls[0].image).toBeTruthy();
      expect(calls[0]).toMatchObject({ x: 90, y: 45, width: 20, height: 10 });
    });

    it('honours explicit dimensions and scale', () => {
      attach(new UIImage(100, 50, { width: 20, height: 10 }, {
        width: 40, height: 20, scale: 2
      })).draw();

      expect(backend.optionsFor('drawImage')[0]).toMatchObject({
        x: 60, y: 30, width: 80, height: 40
      });
    });
  });

  describe('PerformanceStats', () => {
    it('draws nothing unless shown', () => {
      new PerformanceStats(game, 10, 10, { show: false }).draw();
      expect(backend.calls).toHaveLength(0);
    });

    it('reports renderer counters when shown', () => {
      backend.drawRect({ x: 0, y: 0, width: 1, height: 1, fillStyle: '#fff' });
      backend.drawText({ text: 'x', x: 0, y: 0 });
      backend.reset();

      new PerformanceStats(game, 10, 10, { show: true }).draw();

      const text = backend.optionsFor('drawText')[0].text;
      expect(text).toMatch(/FPS:/);
      expect(text).toMatch(/Draw Calls: 2/);
      expect(text).toMatch(/Shapes: 1/);
      expect(text).toMatch(/Text: 1/);
    });
  });
});
