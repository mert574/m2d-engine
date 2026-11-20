import { UIElement, UIKeyButton } from 'm2d-engine/ui';

/**
 * Night Circuit on a touchscreen: the left and right halves of the screen
 * steer, and two buttons do the driving — BRAKE (the handbrake, which
 * slows the car and sets it drifting) and BOOST (the nitro); a quiet row
 * at the top right restarts, replays and leaves. The throttle is the
 * car's own. Every control is a `UIKeyButton`, so what a thumb does
 * reaches the car as the key it stands for and a lap driven by touch
 * replays like any other.
 *
 * Built where a scene's HUD places it; on a screen without touch it stays
 * out of the way entirely, and the keyboard hint stays up.
 */
export class TouchControls extends UIElement {
  constructor(scene, options = {}) {
    super({ anchor: 'top-left', pivot: 'top-left', x: 0, y: 0, width: 0, height: 0 });
    this.scene = scene;
    this.active = TouchControls.wanted();
    if (!this.active) {
      this.visible = false;
      this.enabled = false;
      return;
    }
    const keys = options.properties?.keys ?? {};
    /** The HUD text written for a keyboard, hidden while the thumbs drive. */
    this.hintId = options.properties?.hint ?? 'hint';
    this.left = this.add(new UIKeyButton({ code: keys.left ?? 'ArrowLeft', zone: true, anchor: 'left', pivot: 'left', x: 0, y: 0 }));
    this.right = this.add(new UIKeyButton({ code: keys.right ?? 'ArrowRight', zone: true, anchor: 'right', pivot: 'right', x: 0, y: 0 }));
    const button = { width: 104, height: 104, fontSize: '$font.size.caption', background: 'rgba(12, 14, 26, 0.55)' };
    this.add(new UIKeyButton({ ...button, code: keys.brake ?? 'Space', label: 'BRAKE', heldBackground: '#e5483d', anchor: 'bottom-left', x: 92, y: -92 }));
    this.add(new UIKeyButton({ ...button, code: keys.boost ?? 'KeyX', label: 'BOOST', heldBackground: '#3fb4ff', anchor: 'bottom-right', x: -92, y: -92 }));
    // The director's keys, which nothing else on a touchscreen could press:
    // each button pushes the first key its action is bound to, so a rebinding holds.
    const actions = scene.game.actions;
    [['restart', 'RESTART', 'KeyR'], ['replay', 'REPLAY', 'Enter'], ['menu', 'MENU', 'Escape']].forEach(([action, label, fallback], i) => {
      this.add(new UIKeyButton({
        code: actions?.codes(action)[0] ?? fallback, label, shape: 'rect', width: 84, height: 30,
        fontSize: '$font.size.micro', background: 'rgba(12, 14, 26, 0.55)', heldBackground: 'rgba(255, 255, 255, 0.3)',
        anchor: 'top-right', x: -66 - i * 94, y: 30
      }));
    });
  }

  /** Whether this screen is touched rather than pointed at. */
  static wanted() {
    if (typeof matchMedia === 'function') return matchMedia('(pointer: coarse)').matches;
    return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  }

  update(deltaTime) {
    super.update(deltaTime);
    if (!this.active) return;
    // The halves follow the screen; the hint written for a keyboard goes.
    const box = this.parentBox;
    this.width = box.width;
    this.height = box.height;
    for (const zone of [this.left, this.right]) {
      zone.width = box.width / 2;
      zone.height = box.height;
    }
    const hint = this.scene.hud?.elements.get(this.hintId);
    if (hint) hint.visible = false;
  }
}
