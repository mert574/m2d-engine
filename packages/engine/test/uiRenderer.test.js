import { describe, it, expect, beforeEach } from 'vitest';

import { UIRenderer } from '../src/core/renderers/uiRenderer.js';
import { RecordingRenderer } from './helpers/recordingRenderer.js';
import { UIButton } from '../src/core/ui/button.js';
import { UIMenuItem } from '../src/core/ui/menuItem.js';
import { UIText } from '../src/core/ui/text.js';
import { UIImage } from '../src/core/ui/Image.js';
import { UIRectangle } from '../src/core/ui/Rectangle.js';
import { PerformanceStats } from '../src/core/ui/performanceStats.js';
import { Container } from '../src/core/ui/container.js';
import { makeTestGame } from './helpers/testGame.js';
import { click, pointerDown, pointerMove, pointerUp } from './helpers/input.js';

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
    it('maps clear onto the backend clear', () => {
      ui.clear('#123456');
      expect(backend.callsTo('clear')[0].args[0]).toBe('#123456');
    });

    it('forwards a transparent clear when no colour is given', () => {
      ui.clear();
      expect(backend.callsTo('clear')[0].args[0]).toBeUndefined();
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

  /**
   * Put an element into a scene container the input router hit-tests, so
   * tests drive widgets the way a player does — through `game.input` — and
   * exercise the real routing rather than calling handlers directly.
   */
  function mount(element) {
    const container = new Container(game);
    container.add(element);
    game.input.setUIContainer(container);
    return element;
  }

  describe('UIButton', () => {
    it('centres its label on the frame, not on its position', () => {
      // A layout pins its children's pivot to the top-left, so a label
      // centred on the position lands in the button's corner instead.
      const button = attach(new UIButton({
        x: 100, y: 50, width: 80, height: 30, text: 'Play', pivot: 'top-left'
      }));
      button.draw();

      expect(backend.optionsFor('drawRect')[0]).toMatchObject({ x: 100, y: 50 });
      expect(backend.optionsFor('drawText')[0]).toMatchObject({ x: 140, y: 65 });
    });

    it('draws a centred background and label', () => {
      attach(new UIButton({ x: 100, y: 50, width: 80, height: 30, text: 'Play' })).draw();

      expect(backend.optionsFor('drawRect')[0]).toMatchObject({
        x: 60, y: 35, width: 80, height: 30
      });
      expect(backend.optionsFor('drawText')[0]).toMatchObject({
        text: 'Play', x: 100, y: 50, textAlign: 'center', textBaseline: 'middle'
      });
    });

    it('sets text in the theme face without being told to', () => {
      attach(new UIButton({ x: 100, y: 50, text: 'Play' })).draw();

      expect(backend.optionsFor('drawText')[0].fontFamily)
        .toBe(game.theme.get('font.family'));
    });

    it('resolves variant colours through the theme', () => {
      const button = attach(new UIButton({ x: 100, y: 50, variant: 'primary', text: 'Play' }));
      button.draw();

      expect(backend.optionsFor('drawRect')[0].fillStyle)
        .toBe(game.theme.resolve('$color.accent.default'));
      expect(backend.optionsFor('drawText')[0].fillStyle)
        .toBe(game.theme.resolve('$color.accent.contrast'));
    });

    it('moves through resting, hover and pressed fills', () => {
      const button = attach(new UIButton({ x: 100, y: 50, variant: 'primary', text: 'Play' }));
      const fill = () => {
        backend.reset();
        button.draw();
        return backend.optionsFor('drawRect')[0].fillStyle;
      };

      expect(fill()).toBe(game.theme.resolve('$color.accent.default'));
      button.isHovered = true;
      expect(fill()).toBe(game.theme.resolve('$color.accent.hover'));
      button.isPressed = true;
      expect(fill()).toBe(game.theme.resolve('$color.accent.active'));
    });

    it('takes a literal colour in place of a token', () => {
      const button = attach(new UIButton({
        x: 100, y: 50, background: '#111111', textColor: '#eeeeee', text: 'Play'
      }));
      button.draw();

      expect(backend.optionsFor('drawRect')[0].fillStyle).toBe('#111111');
      expect(backend.optionsFor('drawText')[0].fillStyle).toBe('#eeeeee');
    });

    it('overriding the resting fill leaves the hover state intact', () => {
      // An override chooses the resting look. Flattening the state machine
      // onto it would mean one colour option silently killed the hover.
      const button = attach(new UIButton({
        x: 100, y: 50, variant: 'secondary', background: '#111111', text: 'Play'
      }));

      button.isHovered = true;
      button.draw();

      expect(backend.optionsFor('drawRect')[0].fillStyle)
        .toBe(game.theme.resolve('$color.surface.hover'));
    });

    it('updates the cursor on hover transitions', () => {
      mount(attach(new UIButton({ x: 100, y: 50, width: 80, height: 30, text: 'Play' })));

      pointerMove(game, 100, 50);
      expect(backend.cursor).toBe('pointer');

      pointerMove(game, 0, 0);
      expect(backend.cursor).toBe('default');
    });

    it('invokes the click handler only inside its bounds', () => {
      let clicks = 0;
      mount(attach(new UIButton({
        x: 100, y: 50, width: 80, height: 30, text: 'Play', onClick: () => { clicks++; }
      })));

      click(game, 100, 50);
      expect(clicks).toBe(1);

      click(game, 0, 0);
      expect(clicks).toBe(1);
    });

    it('fires on release, so sliding off a pressed button cancels it', () => {
      // What every real button does, and the reason a touch user can aim:
      // the finger covers the target, so the press has to be revocable.
      let clicks = 0;
      const button = mount(attach(new UIButton({
        x: 100, y: 50, width: 80, height: 30, text: 'Play', onClick: () => { clicks++; }
      })));

      pointerMove(game, 100, 50);
      pointerDown(game, 100, 50);
      expect(clicks).toBe(0);
      expect(button.isPressed).toBe(true);

      pointerMove(game, 400, 300);
      pointerUp(game, 400, 300);
      expect(clicks).toBe(0);
      expect(button.isPressed).toBe(false);
    });

    it('counts a press and release on opposite edges as one click', () => {
      // A slop radius would reject this; "same target" is the rule that
      // matches how wide a button actually is.
      let clicks = 0;
      mount(attach(new UIButton({
        x: 100, y: 50, width: 80, height: 30, text: 'Play', onClick: () => { clicks++; }
      })));

      pointerMove(game, 65, 50);
      pointerDown(game, 65, 50);
      pointerMove(game, 135, 50);
      pointerUp(game, 135, 50);

      expect(clicks).toBe(1);
    });

    it('a disabled button swallows the click without running the handler', () => {
      // It must still consume: a greyed-out control that let the click
      // through would fire whatever is behind the dialog.
      let clicks = 0;
      const button = mount(attach(new UIButton({
        x: 100, y: 50, width: 80, height: 30, text: 'Play',
        enabled: false, onClick: () => { clicks++; }
      })));
      const worldClicks = [];
      game.input.on('click', (event) => worldClicks.push(event));

      click(game, 100, 50);

      expect(clicks).toBe(0);
      expect(worldClicks).toHaveLength(0);
      expect(button.state).toBe('disabled');
    });
  });

  describe('UIMenuItem', () => {
    it('draws type, not a filled box', () => {
      // The reason a main menu stops reading as a web page: no chrome.
      attach(new UIMenuItem({ x: 0, y: 0, width: 200, text: 'Start' })).draw();

      expect(backend.callsTo('drawRect')).toHaveLength(0);
      expect(backend.optionsFor('drawText')[0].text).toBe('START');
    });

    it('tracks out its uppercase label', () => {
      attach(new UIMenuItem({ x: 0, y: 0, width: 200, text: 'Start' })).draw();

      expect(backend.optionsFor('drawText')[0].letterSpacing)
        .toBe(game.theme.get('font.tracking.wide'));
    });

    it('leaves the label alone when uppercase is off', () => {
      attach(new UIMenuItem({ x: 0, y: 0, width: 200, text: 'Start', uppercase: false })).draw();
      expect(backend.optionsFor('drawText')[0].text).toBe('Start');
    });

    it('shows a bar and brightens when selected', () => {
      const item = attach(new UIMenuItem({ x: 0, y: 0, width: 200, text: 'Start' }));
      item.isHovered = true;
      item.update(1);
      item.draw();

      const bar = backend.optionsFor('drawRect')[0];
      expect(bar).toMatchObject({ x: 0, width: 3 });
      expect(bar.fillStyle).toBe(game.theme.resolve('$color.accent.default'));
      expect(backend.optionsFor('drawText')[0].fillStyle)
        .toBe(game.theme.resolve('$color.text.primary'));
    });

    it('treats keyboard selection exactly like hover', () => {
      const item = attach(new UIMenuItem({ x: 0, y: 0, width: 200, text: 'Start' }));
      item.isFocused = true;
      expect(item.isSelected).toBe(true);
      item.update(1);
      item.draw();

      expect(backend.callsTo('drawRect')).toHaveLength(1);
    });

    it('steps the label right as it is selected', () => {
      const item = attach(new UIMenuItem({ x: 0, y: 0, width: 200, text: 'Start' }));
      item.draw();
      const resting = backend.optionsFor('drawText')[0].x;

      backend.reset();
      item.isHovered = true;
      item.update(1);
      item.draw();

      expect(backend.optionsFor('drawText')[0].x).toBeGreaterThan(resting);
    });

    it('eases back when the selection leaves', () => {
      const item = attach(new UIMenuItem({ x: 0, y: 0, width: 200, text: 'Start' }));
      item.isHovered = true;
      item.update(1);
      expect(item.selectedAmount).toBe(1);

      item.isHovered = false;
      item.update(0.05);
      expect(item.selectedAmount).toBeGreaterThan(0);
      expect(item.selectedAmount).toBeLessThan(1);

      item.update(1);
      expect(item.selectedAmount).toBe(0);
    });

    it('fires on click', () => {
      let picked = 0;
      mount(attach(new UIMenuItem({
        x: 100, y: 100, width: 200, pivot: 'center', text: 'Start',
        onSelect: () => { picked++; }
      })));

      click(game, 100, 100);

      expect(picked).toBe(1);
    });

    it('is dimmed and inert when disabled', () => {
      const item = attach(new UIMenuItem({
        x: 0, y: 0, width: 200, text: 'Start', enabled: false
      }));
      item.isHovered = true;

      expect(item.isSelected).toBe(false);
      item.draw();
      expect(backend.optionsFor('drawText')[0].fillStyle)
        .toBe(game.theme.resolve('$color.text.muted'));
    });
  });

  describe('UIText', () => {
    it('draws with the configured style', () => {
      attach(new UIText({
        x: 10, y: 20, text: 'Score', fontSize: '22px', color: '#abcdef', align: 'right'
      })).draw();

      expect(backend.optionsFor('drawText')[0]).toMatchObject({
        text: 'Score', x: 10, y: 20, fillStyle: '#abcdef', fontSize: '22px', textAlign: 'right'
      });
    });

    it('resolves type tokens', () => {
      attach(new UIText({ x: 0, y: 0, text: 'Title', fontSize: '$font.size.heading' })).draw();

      expect(backend.optionsFor('drawText')[0]).toMatchObject({
        fontSize: game.theme.get('font.size.heading'),
        fillStyle: game.theme.resolve('$color.text.primary')
      });
    });

    it('carries letter spacing through to the renderer', () => {
      attach(new UIText({
        x: 0, y: 0, text: 'CAPS', letterSpacing: '$font.tracking.widest'
      })).draw();

      expect(backend.optionsFor('drawText')[0].letterSpacing)
        .toBe(game.theme.get('font.tracking.widest'));
    });

    it('carries weight and italic through to the renderer', () => {
      attach(new UIText({
        x: 0, y: 0, text: 'Hi', fontWeight: '$font.weight.bold', fontStyle: 'italic'
      })).draw();

      expect(backend.optionsFor('drawText')[0]).toMatchObject({
        fontWeight: game.theme.get('font.weight.bold'),
        fontStyle: 'italic'
      });
    });

    it('measures itself, so it has a real box', () => {
      // Text used to report a zero size, which meant it could not be
      // centred in anything or take part in a layout.
      const label = attach(new UIText({ x: 10, y: 20, text: 'Score' }));
      label.measure();

      expect(label.width).toBeGreaterThan(0);
      expect(label.height).toBeGreaterThan(0);
    });

    it('keeps the pivot in step with its alignment', () => {
      const label = attach(new UIText({ x: 0, y: 0, text: 'x' }));
      expect(label.pivot).toBe('top-left');

      label.align = 'center';
      label.baseline = 'middle';
      expect(label.pivot).toBe('center');
    });

    it('is not a hit target unless asked', () => {
      const inert = attach(new UIText({ x: 100, y: 50, text: 'Score' }));
      const live = attach(new UIText({ x: 100, y: 50, text: 'Score', interactive: true }));
      inert.measure();
      live.measure();

      expect(inert.contains(102, 52)).toBe(false);
      expect(live.contains(102, 52)).toBe(true);
    });
  });

  describe('UIRectangle', () => {
    it('draws centred on its position', () => {
      attach(new UIRectangle({
        x: 100, y: 50, width: 40, height: 20, color: '#ff0000'
      })).draw();

      expect(backend.optionsFor('drawRect')[0]).toMatchObject({
        x: 80, y: 40, width: 40, height: 20, fillStyle: '#ff0000'
      });
    });

    it('only hit-tests when interactive', () => {
      const inert = attach(new UIRectangle({ x: 100, y: 50, width: 40, height: 20, color: '#f00' }));
      const live = attach(new UIRectangle({
        x: 100, y: 50, width: 40, height: 20, color: '#f00', interactive: true
      }));

      expect(inert.contains(100, 50)).toBe(false);
      expect(live.contains(100, 50)).toBe(true);
      expect(live.contains(0, 0)).toBe(false);
    });
  });

  describe('UIImage', () => {
    // Regression guard: this previously called drawImage positionally, so UI
    // images silently never rendered.
    it('draws through the options-object renderer API', () => {
      attach(new UIImage({ x: 100, y: 50, image: { width: 20, height: 10 } })).draw();

      const calls = backend.optionsFor('drawImage');
      expect(calls).toHaveLength(1);
      expect(calls[0].image).toBeTruthy();
      expect(calls[0]).toMatchObject({ x: 90, y: 45, width: 20, height: 10 });
    });

    it('honours explicit dimensions and scale', () => {
      attach(new UIImage({
        x: 100, y: 50, image: { width: 20, height: 10 },
        width: 40, height: 20, imageScale: 2
      })).draw();

      expect(backend.optionsFor('drawImage')[0]).toMatchObject({
        x: 60, y: 30, width: 80, height: 40
      });
    });
  });

  describe('PerformanceStats', () => {
    it('draws nothing while hidden', () => {
      attach(new PerformanceStats({ x: 10, y: 10, visible: false })).draw();
      expect(backend.calls).toHaveLength(0);
    });

    it('reports the frame rate on a themed surface', () => {
      attach(new PerformanceStats({ x: 10, y: 10 })).draw();

      expect(backend.optionsFor('drawRect')[0].fillStyle)
        .toBe(game.theme.resolve('$color.surface.default'));
      const labels = backend.optionsFor('drawText').map((call) => call.text);
      expect(labels).toContain('fps');
    });

    it('adds the renderer counters when expanded', () => {
      backend.drawRect({ x: 0, y: 0, width: 1, height: 1, fillStyle: '#fff' });
      backend.drawText({ text: 'x', x: 0, y: 0 });
      backend.reset();

      attach(new PerformanceStats({ x: 10, y: 10, expanded: true, graph: false })).draw();

      const texts = backend.optionsFor('drawText').map((call) => call.text);
      expect(texts).toContain('primitives');
      expect(texts).toContain('draw calls');
      // Two primitives were recorded above: one shape, one text.
      expect(texts).toContain('2');
    });

    it('is set in the theme mono face, so columns line up', () => {
      attach(new PerformanceStats({ x: 10, y: 10 })).draw();

      expect(backend.optionsFor('drawText')[0].fontFamily)
        .toBe(game.theme.get('font.mono'));
    });
  });
});
