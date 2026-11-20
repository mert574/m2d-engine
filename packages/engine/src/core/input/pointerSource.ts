/**
 * Raw DOM pointer input, normalized into a single ordered stream.
 *
 * Pointer Events are the only source. Mouse, touch and pen all arrive as
 * `pointer*` events carrying a `pointerId` and a `pointerType`, so there is
 * no second touch path to keep in sync with the first — which is the whole
 * reason the engine does not listen for `mouse*` or `touch*` at all.
 *
 * ## The canvas eats its input
 *
 * A game canvas is not a document: scrolling the page, selecting text,
 * long-press callouts, pull-to-refresh and the context menu are all hostile
 * to it. This source claims the surface unconditionally — `touch-action:
 * none` so the browser never steals a gesture to pan with, `overscroll-
 * behavior: contain` so a swipe cannot bounce the page, suppressed selection
 * and context menu, and `setPointerCapture` on every press so a drag that
 * leaves the canvas keeps reporting instead of silently dying.
 *
 * ## Ordering
 *
 * Records are pushed to a sink rather than dispatched here. High-frequency
 * `move` and `wheel` records are left in the queue for the engine to drain at
 * a frame boundary; presses and releases drain the queue immediately, inside
 * the DOM handler. That split is not an optimization — it is what keeps
 * `requestFullscreen()` and `requestPointerLock()` working, since both are
 * gated on running inside a real user gesture, and it still delivers every
 * record in the order it happened.
 */

/** Pixels one 'line' of scroll is worth (`WheelEvent.deltaMode === 1`). */
const LINE_HEIGHT = 16;

/** Pixels one 'page' of scroll is worth (`WheelEvent.deltaMode === 2`). */
const PAGE_HEIGHT = 800;

/** A normalized pointer record, as the input manager's queue takes it. */
export interface PointerRecord {
  kind: 'down' | 'move' | 'up' | 'cancel' | 'wheel';
  pointerId: number;
  pointerType: string;
  button: number;
  buttons: number;
  clientX: number | null;
  clientY: number | null;
  movementX: number;
  movementY: number;
  scrollX: number;
  scrollY: number;
  modifiers: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
  time: number;
}

/** Where pointer records go: the input manager's queue. */
interface PointerSink {
  push(record: PointerRecord): void;
  flush(): void;
}

/** CSS the canvas needs so the browser stops competing for pointer input. */
const CAPTURE_STYLES: Record<string, string> = {
  touchAction: 'none',
  overscrollBehavior: 'contain',
  userSelect: 'none',
  webkitUserSelect: 'none',
  webkitTouchCallout: 'none',
  webkitTapHighlightColor: 'transparent',
  // The canvas takes keyboard focus (see Keyboard), and a focus ring drawn
  // around the whole game is never what anyone wants.
  outline: 'none'
};

/** Which modifier keys were held, as plain data the rest of the engine reads. */
function modifiersOf(event: MouseEvent) {
  return {
    shift: event.shiftKey === true,
    ctrl: event.ctrlKey === true,
    alt: event.altKey === true,
    meta: event.metaKey === true
  };
}

/** Wheel deltas in whatever unit the browser chose, converted to pixels. */
function scrollPixels(event: WheelEvent) {
  const unit = event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? PAGE_HEIGHT : 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
}

export class PointerSource {
  /** Surface to claim. */
  canvas: HTMLCanvasElement;
  /** Receives normalized records; `flush` runs when one must be acted on inside the originating gesture. */
  sink: PointerSink;
  /** Teardown thunks, so destroy() can undo exactly what was registered. */
  listeners: (() => void)[];
  /** Pointer ids currently down, for synthesising cancels on focus loss. */
  active: Set<number>;

  constructor(canvas: HTMLCanvasElement, sink: PointerSink) {
    this.canvas = canvas;
    this.sink = sink;
    this.listeners = [];
    this.active = new Set();

    this.#applyCaptureStyles();
    // Headless tests construct a game around a @napi-rs/canvas surface, which has
    // no event target at all. Everything above still applies; there is simply
    // nothing to listen to.
    if (typeof canvas?.addEventListener === 'function') this.#listen();
  }

  #applyCaptureStyles() {
    const style = this.canvas?.style as unknown as Record<string, string> | undefined;
    if (!style) return;
    for (const [property, value] of Object.entries(CAPTURE_STYLES)) {
      style[property] = value;
    }
  }

  /** Register `handler` for `type` and remember how to remove it again. */
  #on(target: EventTarget, type: string, handler: (event: never) => void, options?: AddEventListenerOptions) {
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    this.listeners.push(() => target.removeEventListener(type, listener, options));
  }

  #listen() {
    const canvas = this.canvas;

    this.#on(canvas, 'pointerdown', (event: PointerEvent) => {
      this.active.add(event.pointerId);
      // Capture first: without it the browser stops delivering moves the
      // moment the pointer leaves the canvas, and every drag that overshoots
      // an edge freezes halfway through.
      // Pointer lock already routes mouse events to this canvas, and the
      // browser rejects pointer capture while locked. Capture can also fail
      // if the pointer became inactive; neither case should discard a press.
      if (canvas.ownerDocument?.pointerLockElement !== canvas) {
        try {
          canvas.setPointerCapture?.(event.pointerId);
        } catch (error) {
          if ((error as DOMException).name !== 'InvalidStateError' && (error as DOMException).name !== 'NotFoundError') throw error;
        }
      }
      // Suppressing the default also suppresses focus, so take it by hand.
      event.preventDefault();
      canvas.focus?.({ preventScroll: true });
      this.#push(event, 'down');
      this.sink.flush();
    });

    this.#on(canvas, 'pointermove', (event: PointerEvent) => {
      this.#push(event, 'move');
    });

    const release = (kind: 'up' | 'cancel') => (event: PointerEvent) => {
      this.active.delete(event.pointerId);
      canvas.releasePointerCapture?.(event.pointerId);
      this.#push(event, kind);
      this.sink.flush();
    };
    this.#on(canvas, 'pointerup', release('up'));
    this.#on(canvas, 'pointercancel', release('cancel'));

    // Non-passive, because the point is to prevent the page from scrolling.
    this.#on(canvas, 'wheel', (event: WheelEvent) => {
      event.preventDefault();
      const scroll = scrollPixels(event);
      this.sink.push({
        kind: 'wheel',
        pointerId: -1,
        pointerType: 'mouse',
        button: -1,
        buttons: event.buttons ?? 0,
        clientX: event.clientX,
        clientY: event.clientY,
        movementX: 0,
        movementY: 0,
        scrollX: scroll.x,
        scrollY: scroll.y,
        modifiers: modifiersOf(event),
        time: event.timeStamp
      });
    }, { passive: false });

    // Right-click belongs to the game, not to the browser.
    this.#on(canvas, 'contextmenu', (event: Event) => event.preventDefault());

    // A pointer held while the window loses focus never reports its release:
    // the button would stay stuck down forever. Cancel it instead.
    if (typeof window !== 'undefined') {
      this.#on(window, 'blur', () => this.cancelAll());
    }
  }

  #push(event: PointerEvent, kind: PointerRecord['kind']): void {
    this.sink.push({
      kind,
      pointerId: event.pointerId,
      pointerType: event.pointerType || 'mouse',
      button: event.button ?? -1,
      buttons: event.buttons ?? 0,
      clientX: event.clientX,
      clientY: event.clientY,
      // Only meaningful under pointer lock, where there is no position to
      // read and the virtual cursor is integrated from these instead.
      movementX: event.movementX ?? 0,
      movementY: event.movementY ?? 0,
      scrollX: 0,
      scrollY: 0,
      modifiers: modifiersOf(event),
      time: event.timeStamp
    });
  }

  /** Cancel every pointer currently down, e.g. when the window blurs. */
  cancelAll(): void {
    if (this.active.size === 0) return;
    for (const pointerId of this.active) {
      this.sink.push({
        kind: 'cancel',
        pointerId,
        pointerType: 'mouse',
        button: -1,
        buttons: 0,
        clientX: null,
        clientY: null,
        movementX: 0,
        movementY: 0,
        scrollX: 0,
        scrollY: 0,
        modifiers: { shift: false, ctrl: false, alt: false, meta: false },
        time: typeof performance !== 'undefined' ? performance.now() : Date.now()
      });
    }
    this.active.clear();
    this.sink.flush();
  }

  destroy(): void {
    for (const remove of this.listeners) remove();
    this.listeners = [];
    this.active.clear();
  }
}
