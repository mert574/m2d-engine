import { describe, it, expect, beforeEach } from 'vitest';
import { InputSnapshot } from '../src/core/input/inputManager.js';

import { makeTestGame, makeBody } from './helpers/testGame.js';
import { Entity } from '../src/core/entity.js';
import { Interactive } from '../src/constraints/interactive.js';
import { Container } from '../src/core/ui/container.js';
import { UIElement } from '../src/core/ui/uiElement.js';
import { UIScreen } from '../src/core/ui/screen.js';
import { UIRectangle } from '../src/core/ui/Rectangle.js';
import {
  advanceInputClock, click, drag, holdKeys, keyDown, keyUp, pointerDown, pointerMove, releaseKeys,
  pointerUp, resetInputClock, scroll
} from './helpers/input.js';

/**
 * The input system: gesture recognition, routing and world hit testing.
 *
 * Everything here drives `game.input` through the same queue the DOM pushes
 * into, so the recognizers, the router and the coordinate mapping are all
 * the real ones — only the browser is missing. The test game's camera is
 * centred so that world and UI coordinates coincide, which keeps the
 * assertions about *behaviour* rather than about arithmetic already covered
 * by the viewport tests.
 */

/** Record every event of these types, in order. */
function record(game, ...types) {
  const seen = [];
  for (const type of types) {
    game.input.on(type, (event) => seen.push({ type, event }));
  }
  return seen;
}

/** An entity with an Interactive constraint, added to the physics world. */
function interactiveEntity(game, { x = 100, y = 100, size = 40, ...options } = {}) {
  const body = makeBody(game, x, y, size, size, { bodyType: 'static' });
  game.physics.add(body);
  const entity = new Entity(body, null, game);
  const interactive = new Interactive(entity, options);
  entity.addConstraint('interactive', interactive);
  return { entity, interactive, body };
}

describe('input', () => {
  let game;

  beforeEach(() => {
    game = makeTestGame();
    resetInputClock();
  });

  describe('clicks', () => {
    it('keeps quick moving presses as clicks even when drag listeners exist', () => {
      const seen = record(game, 'click', 'rightclick', 'dragstart');
      for (const button of [0, 2]) {
        pointerDown(game, 100, 100, { button });
        advanceInputClock(50);
        pointerMove(game, 140, 100);
        advanceInputClock(49);
        pointerUp(game, 160, 100, { button });
      }
      expect(seen.map((s) => s.type)).toEqual(['click', 'rightclick']);
    });

    it('allows 16 units of movement after pressing for either mouse button', () => {
      const seen = record(game, 'click', 'rightclick', 'dragstart');
      for (const button of [0, 2]) {
        pointerDown(game, 100, 100, { button });
        pointerMove(game, 116, 100);
        pointerUp(game, 116, 100, { button });
      }
      expect(seen.map((s) => s.type)).toEqual(['click', 'rightclick']);
    });

    it('fires click on release, not on press', () => {
      const seen = record(game, 'pointerdown', 'click');

      pointerDown(game, 100, 100);
      expect(seen.map((s) => s.type)).toEqual(['pointerdown']);

      pointerUp(game, 100, 100);
      expect(seen.map((s) => s.type)).toEqual(['pointerdown', 'click']);
    });

    it('carries UI and world coordinates on every event', () => {
      const seen = record(game, 'click');
      click(game, 250, 150);

      const { event } = seen[0];
      expect(event.ui).toEqual({ x: 250, y: 150 });
      expect(event.world).toEqual({ x: 250, y: 150 });
      expect(event.view).toEqual({ x: 250, y: 150 });
    });

    it('fires click and doubleclick on the second of a pair', () => {
      // Waiting to tell them apart would put the double-click interval on
      // the latency of every single click, so both fire.
      const seen = record(game, 'click', 'doubleclick');

      click(game, 100, 100);
      click(game, 100, 100);

      expect(seen.map((s) => s.type)).toEqual(['click', 'click', 'doubleclick']);
    });

    it('does not pair clicks that are too far apart in time', () => {
      const seen = record(game, 'doubleclick');

      click(game, 100, 100);
      advanceInputClock(400);
      click(game, 100, 100);

      expect(seen).toHaveLength(0);
    });

    it('does not pair clicks that are too far apart in space', () => {
      const seen = record(game, 'doubleclick');

      click(game, 100, 100);
      click(game, 300, 100);

      expect(seen).toHaveLength(0);
    });

    it('starts a fresh pair after a double, instead of firing on every click', () => {
      const seen = record(game, 'doubleclick');

      click(game, 100, 100);
      click(game, 100, 100);
      click(game, 100, 100);

      expect(seen).toHaveLength(1);
    });

    it('fires rightclick for the secondary button, and no click', () => {
      const seen = record(game, 'click', 'rightclick');

      pointerMove(game, 100, 100);
      pointerDown(game, 100, 100, { button: 2 });
      pointerUp(game, 100, 100, { button: 2 });

      expect(seen.map((s) => s.type)).toEqual(['rightclick']);
    });

    it('does not fire a click when the pointer swept somewhere else', () => {
      const seen = record(game, 'click');

      pointerDown(game, 100, 100);
      advanceInputClock(120);
      pointerUp(game, 400, 400);

      expect(seen).toHaveLength(0);
    });
  });

  describe('long press', () => {
    it('stands in for a right click on touch', () => {
      const seen = record(game, 'rightclick');

      pointerDown(game, 100, 100, { pointerType: 'touch' });
      game.input.beginFrame(advanceInputClock(600));

      expect(seen).toHaveLength(1);
      expect(seen[0].event.pointerType).toBe('touch');
    });

    it('suppresses the tap that would otherwise follow', () => {
      const seen = record(game, 'click', 'rightclick');

      pointerDown(game, 100, 100, { pointerType: 'touch' });
      game.input.beginFrame(advanceInputClock(600));
      pointerUp(game, 100, 100, { pointerType: 'touch' });

      expect(seen.map((s) => s.type)).toEqual(['rightclick']);
    });

    it('does not fire when nothing is listening for right clicks', () => {
      // Lazy recognition is behavioural here, not just cheap: a game that
      // never asked for right clicks must keep its ordinary tap.
      const seen = record(game, 'click');

      pointerDown(game, 100, 100, { pointerType: 'touch' });
      game.input.beginFrame(advanceInputClock(600));
      pointerUp(game, 100, 100, { pointerType: 'touch' });

      expect(seen.map((s) => s.type)).toEqual(['click']);
    });

    it('does not fire for a mouse held in place', () => {
      const seen = record(game, 'rightclick');

      pointerDown(game, 100, 100, { pointerType: 'mouse' });
      game.input.beginFrame(advanceInputClock(2000));

      expect(seen).toHaveLength(0);
    });
  });

  describe('drag', () => {
    it('requires both 100 ms held and movement beyond 16 units to start dragging', () => {
      const seen = record(game, 'dragstart', 'drag', 'dragend', 'drop', 'click');

      pointerDown(game, 100, 100);
      pointerMove(game, 102, 100);     // inside the slop: still a press
      expect(seen).toHaveLength(0);

      advanceInputClock(99);
      pointerMove(game, 130, 100);
      expect(seen).toHaveLength(0);
      advanceInputClock(1);
      pointerMove(game, 140, 100);
      pointerMove(game, 180, 100);
      pointerUp(game, 180, 100);

      expect(seen.map((s) => s.type))
        .toEqual(['dragstart', 'drag', 'dragend', 'drop']);
    });

    it('reports deltas since the last event and since the start', () => {
      const seen = record(game, 'drag');

      drag(game, [{ x: 100, y: 100 }, { x: 150, y: 100 }, { x: 170, y: 120 }]);

      const last = seen[seen.length - 1].event;
      expect(last.start.world).toEqual({ x: 100, y: 100 });
      expect(last.delta.world).toEqual({ x: 20, y: 20 });
      expect(last.total.world).toEqual({ x: 70, y: 20 });
    });

    it('is not recognized when nothing listens for it', () => {
      const seen = record(game, 'click');

      drag(game, [{ x: 100, y: 100 }, { x: 300, y: 100 }]);

      // No drag, and the sweep is still not a click.
      expect(seen).toHaveLength(0);
    });
  });

  describe('pinch', () => {
    function twoFingers(game) {
      pointerDown(game, 100, 100, { pointerId: 1, pointerType: 'touch' });
      pointerDown(game, 200, 100, { pointerId: 2, pointerType: 'touch' });
      advanceInputClock(120);
      pointerMove(game, 50, 100, { pointerId: 1, pointerType: 'touch' });
      pointerMove(game, 250, 100, { pointerId: 2, pointerType: 'touch' });
    }

    it('reports scale, centre and rotation while two fingers move', () => {
      const seen = record(game, 'pinchstart', 'pinch', 'pinchend');

      twoFingers(game);
      pointerUp(game, 250, 100, { pointerId: 2, pointerType: 'touch' });

      expect(seen.map((s) => s.type))
        .toEqual(['pinchstart', 'pinch', 'pinch', 'pinchend']);
      const last = seen[2].event;
      // Fingers went from 100 apart to 200 apart, around the same centre.
      expect(last.scale).toBeCloseTo(2, 5);
      expect(last.centre.world).toEqual({ x: 150, y: 100 });
      expect(last.rotation).toBeCloseTo(0, 5);
    });

    it('leaves two fingers as two independent drags when nobody listens', () => {
      // This is the point of lazy recognition: twin-stick touch controls
      // work by default, and subscribing to pinch is what claims the
      // second finger. Note that this test must *not* subscribe to pinch —
      // doing so is exactly what would switch the recognizer on.
      const seen = record(game, 'dragstart');

      twoFingers(game);

      expect(game.input.recognizer.pinch).toBeNull();
      expect(new Set(seen.map((s) => s.event.pointerId))).toEqual(new Set([1, 2]));
    });

    it('cancels a drag already under way when the second finger lands', () => {
      const seen = record(game, 'dragstart', 'dragend', 'drop', 'pinchstart');

      pointerDown(game, 100, 100, { pointerId: 1, pointerType: 'touch' });
      advanceInputClock(120);
      pointerMove(game, 160, 100, { pointerId: 1, pointerType: 'touch' });
      pointerDown(game, 300, 100, { pointerId: 2, pointerType: 'touch' });

      expect(seen.map((s) => s.type)).toEqual(['dragstart', 'dragend', 'pinchstart']);
      // Cancelled, so nothing was dropped anywhere.
      expect(seen[1].event.cancelled).toBe(true);
    });
  });

  describe('scroll', () => {
    it('delivers wheel deltas with the position they happened at', () => {
      const seen = record(game, 'scroll');

      scroll(game, 120, 80, { dy: -240 });

      expect(seen[0].event.scroll).toEqual({ x: 0, y: -240 });
      expect(seen[0].event.world).toEqual({ x: 120, y: 80 });
    });
  });

  describe('routing', () => {
    function mountUI(game, element) {
      const container = new Container(game);
      container.add(element);
      game.input.setUIContainer(container);
      return element;
    }

    it('stops at the first band that consumes the event', () => {
      const element = mountUI(game, new UIElement({ x: 100, y: 100, width: 40, height: 40 }));
      element.setGame(game);
      let uiClicks = 0;
      element.onClick = () => { uiClicks++; };

      const worldClicks = [];
      game.input.on('click', (event) => worldClicks.push(event));

      click(game, 100, 100);

      expect(uiClicks).toBe(1);
      expect(worldClicks).toHaveLength(0);
    });

    it('lets an event through to the world when UI does not want it', () => {
      const element = mountUI(game, new UIElement({ x: 600, y: 400, width: 40, height: 40 }));
      element.setGame(game);

      const worldClicks = [];
      game.input.on('click', (event) => worldClicks.push(event));

      click(game, 100, 100);

      expect(worldClicks).toHaveLength(1);
    });

    it('gives a blocking screen the event before anything else', () => {
      // The engine's UI band sits above the scene's. A blocking screen is
      // what makes an open menu modal, with no global capture listeners.
      const seen = [];
      const screen = new UIScreen({ name: 'test' });
      screen.handleInput = (event) => { seen.push(event.type); event.consume(); };
      game.ui.push(screen);

      const element = mountUI(game, new UIElement({ x: 100, y: 100, width: 40, height: 40 }));
      element.setGame(game);
      let uiClicks = 0;
      element.onClick = () => { uiClicks++; };

      click(game, 100, 100);

      expect(seen).toContain('click');
      expect(uiClicks).toBe(0);
    });

    it('lets a non-blocking screen pass the event down to scene UI', () => {
      const seen = [];
      const screen = new UIScreen({ name: 'hud', blocking: false });
      screen.handleInput = (event) => { seen.push(event.type); };
      game.ui.push(screen);

      const element = mountUI(game, new UIElement({ x: 100, y: 100, width: 40, height: 40 }));
      element.setGame(game);
      let uiClicks = 0;
      element.onClick = () => { uiClicks++; };

      click(game, 100, 100);

      expect(seen).toContain('click');
      expect(uiClicks).toBe(1);
    });
  });

  describe('world hit testing', () => {
    it('resolves the entity under the pointer through its physics body', () => {
      const clicked = [];
      interactiveEntity(game, { x: 100, y: 100, size: 40, onClick: (e) => clicked.push(e) });

      click(game, 100, 100);
      expect(clicked).toHaveLength(1);

      click(game, 300, 300);
      expect(clicked).toHaveLength(1);
    });

    it('never asks physics anything when no entity is interactive', () => {
      let queries = 0;
      const real = game.physics.queryPoint.bind(game.physics);
      game.physics.queryPoint = (...args) => { queries++; return real(...args); };

      click(game, 100, 100);

      expect(queries).toBe(0);
    });

    it('tests an explicit hit area without involving physics at all', () => {
      let queries = 0;
      const real = game.physics.queryPoint.bind(game.physics);
      game.physics.queryPoint = (...args) => { queries++; return real(...args); };

      const hits = [];
      interactiveEntity(game, {
        x: 100, y: 100,
        hitArea: { radius: 30 },
        onClick: (e) => hits.push(e)
      });

      click(game, 120, 100);
      click(game, 160, 100);

      expect(hits).toHaveLength(1);
      expect(queries).toBe(0);
    });

    it('picks the higher priority entity where two overlap', () => {
      const hit = [];
      interactiveEntity(game, {
        x: 100, y: 100, hitArea: { width: 80, height: 80 },
        priority: 0, onClick: () => hit.push('low')
      });
      interactiveEntity(game, {
        x: 100, y: 100, hitArea: { width: 80, height: 80 },
        priority: 5, onClick: () => hit.push('high')
      });

      click(game, 100, 100);

      expect(hit).toEqual(['high']);
    });

    it('fires hover and hoverend as the pointer crosses an entity', () => {
      const seen = [];
      interactiveEntity(game, {
        x: 100, y: 100,
        onHover: () => seen.push('hover'),
        onHoverEnd: () => seen.push('hoverend')
      });

      pointerMove(game, 100, 100);
      pointerMove(game, 105, 100);   // still inside: no repeat
      pointerMove(game, 400, 400);

      expect(seen).toEqual(['hover', 'hoverend']);
    });

    it('does not hover on touch, which has no such state', () => {
      const seen = [];
      interactiveEntity(game, { x: 100, y: 100, onHover: () => seen.push('hover') });

      pointerMove(game, 100, 100, { pointerType: 'touch' });

      expect(seen).toEqual([]);
    });

    it('stops hit testing an entity whose constraint was destroyed', () => {
      const clicked = [];
      const { interactive } = interactiveEntity(game, {
        x: 100, y: 100, onClick: () => clicked.push(1)
      });

      interactive.destroy();
      click(game, 100, 100);

      expect(clicked).toHaveLength(0);
    });
  });

  describe('drag capture', () => {
    it('keeps delivering to whatever the drag started on', () => {
      const events = [];
      interactiveEntity(game, {
        x: 100, y: 100, draggable: true,
        onDragStart: () => events.push('start'),
        onDrag: () => events.push('drag'),
        onDragEnd: () => events.push('end')
      });

      // The drag leaves the entity entirely; capture is what keeps it.
      // The move that passes the slop radius is the dragstart, so two moves
      // after the press make one start and one drag.
      drag(game, [{ x: 100, y: 100 }, { x: 400, y: 400 }, { x: 700, y: 500 }]);

      expect(events).toEqual(['start', 'drag', 'end']);
    });

    it('reports what a drop landed on, excluding the thing being dragged', () => {
      let dropped = null;
      const { interactive: dragged } = interactiveEntity(game, {
        x: 100, y: 100, draggable: true,
        onDrop: (event) => { dropped = event.dropTarget; }
      });
      const { interactive: zone } = interactiveEntity(game, {
        x: 400, y: 400, size: 120, priority: -1
      });

      drag(game, [{ x: 100, y: 100 }, { x: 400, y: 400 }]);

      expect(dropped).toBe(zone);
      expect(dropped).not.toBe(dragged);
    });

    it('moves the body with the pointer when follow is set', () => {
      const { body, entity } = interactiveEntity(game, { x: 100, y: 100, follow: true });

      // Grabbed off-centre: the offset has to survive the drag, or the
      // entity would snap its centre to the cursor on the first move.
      drag(game, [{ x: 110, y: 100 }, { x: 300, y: 200 }]);
      // Pointer events only aim the hold; the body moves on the tick.
      expect(body.position.x).toBeCloseTo(100, 5);
      entity.fixedUpdate(1 / 60);

      expect(body.position.x).toBeCloseTo(290, 5);
      expect(body.position.y).toBeCloseTo(200, 5);
    });
  });

  describe('a blocking screen owns the keys', () => {
    it('samples an empty snapshot while one is up, and the keys again once it is gone', () => {
      keyDown(game, 'ArrowRight');
      expect(game.input.sample().isDown('ArrowRight')).toBe(true);
      const screen = game.ui.push(new UIScreen({ name: 'inventory' }));
      expect(game.ui.capturesInput).toBe(true);
      const held = game.input.sample();
      expect(held.down.size).toBe(0);
      expect(held.pointer.isDown).toBe(false);
      screen.close();
      game.ui.update(0);
      expect(game.input.sample().isDown('ArrowRight')).toBe(true);
    });

    it('a click the menu took never reaches the world, during or after it', () => {
      const screen = game.ui.push(new UIScreen({ name: 'inventory' }));
      pointerDown(game, 300, 200);
      expect(game.input.sample().pointer.pressed).toBe(false);
      // The click that closes it, then the menu is gone before the next tick.
      screen.close();
      game.ui.update(1);
      game.input.beginFrame(0);
      const after = game.input.sample();
      expect(after.pointer.pressed).toBe(false);
      // Still held: the world does not see that button down until it is released.
      expect(after.pointer.isDown).toBe(false);
      expect(after.pointer.buttons).toBe(0);
      pointerUp(game, 300, 200);
      game.input.beginFrame(16);
      pointerDown(game, 320, 220);
      game.input.beginFrame(32);
      expect(game.input.sample().pointer).toMatchObject({ pressed: true, isDown: true });
    });

    it('a click on a scene UI element is the UI\'s, not the world\'s', () => {
      const container = new Container(game);
      container.add(new UIRectangle({ x: 300, y: 200, width: 100, height: 60, anchor: 'top-left', pivot: 'center', interactive: true }));
      game.input.setUIContainer(container);
      pointerDown(game, 300, 200);
      game.input.beginFrame(0);
      expect(game.input.sample().pointer.pressed).toBe(false);
      pointerUp(game, 300, 200);
      pointerDown(game, 700, 500);
      game.input.beginFrame(16);
      expect(game.input.sample().pointer.pressed).toBe(true);
    });

    it('a non-blocking screen with nothing to focus lets the arrows and Escape through', () => {
      const toast = game.ui.push(new UIScreen({ name: 'toast', blocking: false }));
      keyDown(game, 'ArrowRight');
      keyDown(game, 'Escape');
      const snapshot = game.input.sample();
      expect(snapshot.isDown('ArrowRight')).toBe(true);
      expect(snapshot.isDown('Escape')).toBe(true);
      expect(game.ui.has('toast')).toBe(true);
      expect(toast.isExiting).toBe(false);
    });

    it('a non-blocking screen (a HUD) does not take them', () => {
      keyDown(game, 'ArrowRight');
      game.ui.push(new UIScreen({ name: 'hud', blocking: false }));
      expect(game.input.sample().isDown('ArrowRight')).toBe(true);
    });
  });

  describe('keyboard', () => {
    it('tracks held keys by physical code', () => {
      keyDown(game, 'KeyW');

      expect(game.input.isDown('KeyW')).toBe(true);
      expect(game.input.justPressed('KeyW')).toBe(true);

      game.input.endFrame();
      expect(game.input.isDown('KeyW')).toBe(true);
      expect(game.input.justPressed('KeyW')).toBe(false);

      keyUp(game, 'KeyW');
      expect(game.input.isDown('KeyW')).toBe(false);
      expect(game.input.justReleased('KeyW')).toBe(true);
    });

    it('ignores a repeated press of a key already held', () => {
      const seen = record(game, 'keydown');

      keyDown(game, 'KeyW');
      keyDown(game, 'KeyW');

      expect(seen).toHaveLength(1);
    });

    it('builds an axis and a normalized vector', () => {
      keyDown(game, 'KeyD');
      expect(game.input.axis('KeyA', 'KeyD')).toBe(1);

      keyDown(game, 'KeyA');
      expect(game.input.axis('KeyA', 'KeyD')).toBe(0);

      keyUp(game, 'KeyA');
      keyDown(game, 'KeyW');
      const vector = game.input.vector('KeyW', 'KeyS', 'KeyA', 'KeyD');
      expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1, 5);
    });

    it('releases everything when focus is lost, so no key sticks', () => {
      keyDown(game, 'KeyW');
      game.input.keyboard.releaseAll();

      expect(game.input.isDown('KeyW')).toBe(false);
      expect(game.input.justReleased('KeyW')).toBe(true);
    });
  });

  describe('delivery', () => {
    it('coalesces buffered moves into one per pointer per frame', () => {
      const seen = record(game, 'pointermove');

      for (let x = 100; x <= 140; x += 10) {
        game.input.push({
          kind: 'move', pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0,
          clientX: x, clientY: 100, movementX: 10, movementY: 0,
          scrollX: 0, scrollY: 0,
          modifiers: { shift: false, ctrl: false, alt: false, meta: false },
          time: 1000
        });
      }
      game.input.beginFrame(1000);

      expect(seen).toHaveLength(1);
      expect(seen[0].event.ui.x).toBe(140);
    });

    it('delivers a press immediately, with everything queued before it', () => {
      // Presses cannot wait for the frame: the browser only grants
      // fullscreen and pointer lock inside the originating gesture. The
      // moves before them must still arrive first.
      const seen = record(game, 'pointermove', 'pointerdown');

      game.input.push({
        kind: 'move', pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0,
        clientX: 100, clientY: 100, movementX: 0, movementY: 0,
        scrollX: 0, scrollY: 0,
        modifiers: { shift: false, ctrl: false, alt: false, meta: false },
        time: 1000
      });
      expect(seen).toHaveLength(0);

      pointerDown(game, 100, 100);

      expect(seen.map((s) => s.type)).toEqual(['pointermove', 'pointerdown']);
    });
  });

  describe('pointer lock', () => {
    /**
     * Put the engine in the state the browser leaves it in once the canvas
     * holds the lock: no absolute coordinates, only relative motion.
     */
    function lock(game) {
      game.input.cursor.enabled = true;
      game.input.cursor.locked = true;
      return game.input.cursor;
    }

    /** A move reported the way a locked pointer reports one. */
    function moveBy(game, movementX, movementY) {
      game.input.push({
        kind: 'move', pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0,
        clientX: null, clientY: null, movementX, movementY,
        scrollX: 0, scrollY: 0,
        modifiers: { shift: false, ctrl: false, alt: false, meta: false },
        time: 1000
      });
      game.input.flush();
    }

    it('integrates relative motion into a virtual cursor', () => {
      const cursor = lock(game);
      cursor.setUI(100, 100);

      moveBy(game, 40, -25);

      expect(cursor.ui).toEqual({ x: 140, y: 75 });
    });

    it('confines the virtual cursor to UI space', () => {
      const cursor = lock(game);
      cursor.setUI(10, 10);

      moveBy(game, -500, -500);
      expect(cursor.ui).toEqual({ x: 0, y: 0 });

      moveBy(game, 5000, 5000);
      expect(cursor.ui).toEqual({ x: game.viewport.uiWidth, y: game.viewport.uiHeight });
    });

    it('still resolves world coordinates with no absolute position', () => {
      const cursor = lock(game);
      cursor.setUI(0, 0);
      const seen = record(game, 'pointermove');

      moveBy(game, 250, 150);

      expect(seen[0].event.world).toEqual({ x: 250, y: 150 });
    });

    it('hit-tests the world through the virtual cursor', () => {
      const cursor = lock(game);
      cursor.setUI(0, 0);
      const seen = [];
      interactiveEntity(game, { x: 200, y: 200, onHover: () => seen.push('hover') });

      moveBy(game, 200, 200);

      expect(seen).toEqual(['hover']);
    });

    it('draws a cursor only while locked, since the system one is hidden', () => {
      const cursor = game.input.cursor;
      game.renderer.reset();
      game.input.draw();
      expect(game.renderer.optionsFor('drawPath')).toHaveLength(0);

      cursor.locked = true;
      game.renderer.reset();
      game.input.draw();
      expect(game.renderer.optionsFor('drawPath')).toHaveLength(1);
    });

    it('reports lock changes to subscribers', () => {
      const seen = record(game, 'pointerlockchange');

      game.input.emitLockChange(true);
      game.input.emitLockChange(false);

      expect(seen.map((s) => s.event.locked)).toEqual([true, false]);
    });

    it('is off unless the game opts in, and never requests it', () => {
      expect(game.input.cursor.enabled).toBe(false);

      game.input.cursor.request();

      expect(game.input.cursor.pending).toBe(false);
      expect(game.input.pointerLocked).toBe(false);
    });
  });

  describe('pointer position', () => {
    it('recomputes the world position when the camera moves under it', () => {
      pointerMove(game, 100, 100);
      expect(game.input.pointer.world).toEqual({ x: 100, y: 100 });

      game.camera.x += 200;

      expect(game.input.pointer.world).toEqual({ x: 300, y: 100 });
    });
  });

  describe('snapshot recording and replay', () => {
    it('round-trips a snapshot through JSON', () => {
      holdKeys(game, 'KeyW', 'Space');
      pointerMove(game, 120, 80);
      const live = game.input.sample();

      const revived = InputSnapshot.from(JSON.parse(JSON.stringify(live)));

      expect(revived.isDown('KeyW')).toBe(true);
      expect(revived.justPressed('Space')).toBe(true);
      expect(revived.axis('KeyA', 'KeyD')).toBe(0);
      expect(revived.pointer.world).toEqual(live.pointer.world);
      releaseKeys(game);
    });

    it('a snapshot source replaces the devices for the simulation', () => {
      // The replay seam: recorded ticks drive sample(), the keyboard does not.
      holdKeys(game, 'KeyW');
      const log = [{ down: ['ArrowLeft'] }, { down: ['ArrowRight'], pressed: ['Space'] }];
      let at = 0;
      game.input.setSnapshotSource(() => log[at++] ?? null);

      const first = game.input.sample();
      expect(first.isDown('ArrowLeft')).toBe(true);
      expect(first.isDown('KeyW')).toBe(false);

      const second = game.input.sample();
      expect(second.isDown('ArrowRight')).toBe(true);
      expect(second.justPressed('Space')).toBe(true);

      // Past the log's end: nothing held, rather than stale state.
      expect(game.input.sample().isDown('ArrowRight')).toBe(false);

      // Hand the devices back.
      game.input.setSnapshotSource(null);
      expect(game.input.sample().isDown('KeyW')).toBe(true);
      releaseKeys(game);
    });

    it('feeding recorded ticks back reproduces the recorded snapshots', () => {
      holdKeys(game, 'ArrowUp');
      const recorded = [JSON.parse(JSON.stringify(game.input.sample()))];
      holdKeys(game, 'ArrowRight');
      recorded.push(JSON.parse(JSON.stringify(game.input.sample())));
      releaseKeys(game);

      let at = 0;
      game.input.setSnapshotSource(() => recorded[at++]);
      expect(game.input.sample().isDown('ArrowUp')).toBe(true);
      const replayedSecond = game.input.sample();
      expect(replayedSecond.isDown('ArrowRight')).toBe(true);
      expect(replayedSecond.isDown('ArrowUp')).toBe(true);
      game.input.setSnapshotSource(null);
    });
  });
});
