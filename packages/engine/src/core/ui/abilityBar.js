import { UIElement } from './uiElement.js';

/**
 * The slots of an `Abilities` constraint: an icon or a colour disc, a
 * cooldown sweep with the seconds left, a lock mark, and the key and label
 * underneath. Reads the constraint each frame, so it needs no wiring.
 *
 * @param {() => import('../../constraints/abilities.js').Abilities|null} source -
 *   Where to find the constraint, e.g. `() => game.player?.getConstraint('abilities')`
 * @param {Object} [options] - `UIElement` options, plus:
 * @param {number} [options.slot=50] - Slot size
 * @param {number} [options.gap=8]
 * @param {Record<string, HTMLImageElement>} [options.icons] - By ability id
 */
export class UIAbilityBar extends UIElement {
  constructor(source, options = {}) {
    const slot = options.slot ?? 50;
    const gap = options.gap ?? 8;
    super({ anchor: 'bottom', pivot: 'bottom', x: 0, y: -14, width: slot, height: slot + 24, ...options });
    this.source = source;
    this.slot = slot;
    this.gap = gap;
    this.icons = options.icons ?? {};
    this.background = options.background ?? 'rgba(12, 18, 14, 0.84)';
    this.borderColor = options.borderColor ?? '$color.border.subtle';
  }

  /** The label under a slot. */
  #label(ability) {
    const key = ability.key ? ability.key.replace(/^Digit|^Key/, '') : '';
    return [key, ability.label ?? ability.id].filter(Boolean).join(' · ');
  }

  /** Distance between slot origins: the slot plus the gap, or the widest label. */
  get pitch() {
    const list = this.source()?.list ?? [];
    let widest = 0;
    for (const ability of list) {
      widest = Math.max(widest, this.paint.measureText(this.#label(ability), { fontSize: 12, letterSpacing: 1 }).width + 10);
    }
    return Math.max(this.slot + this.gap, widest);
  }

  layout() {
    const count = this.source()?.list.length ?? 0;
    this.width = Math.max(this.slot, count * this.pitch - this.gap);
  }

  draw() {
    const abilities = this.source();
    if (!abilities) return;
    const f = this.frame;
    const paint = this.paint;
    const size = this.slot;
    const pitch = this.pitch;
    abilities.list.forEach((ability, i) => {
      const x = f.x + i * pitch + (pitch - this.gap - size) / 2;
      const y = f.y;
      const cx = x + size / 2;
      const cy = y + size / 2;
      paint.drawRect({ x, y, width: size, height: size, fillStyle: this.background, strokeStyle: ability.locked ? 'rgba(120, 120, 120, 0.4)' : this.borderColor, lineWidth: 1.5, cornerRadius: 8 });
      const dim = ability.locked ? 0.35 : ability.remaining > 0 ? 0.5 : 1;
      const icon = this.icons[ability.id] ?? ability.icon;
      if (icon?.width) {
        paint.drawImage({ image: icon, x: x + 7, y: y + 7, width: size - 14, height: size - 14, globalAlpha: dim });
      } else {
        paint.drawArc({ x: cx, y: cy, radius: size * 0.28, fillStyle: ability.color ?? '$color.text.accent', globalAlpha: dim });
      }
      if (ability.remaining > 0 && ability.cooldown) {
        const k = ability.remaining / ability.cooldown;
        paint.drawArc({ x: cx, y: cy, radius: size * 0.4, startAngle: -Math.PI / 2, endAngle: -Math.PI / 2 + Math.PI * 2 * k, strokeStyle: 'rgba(255, 255, 255, 0.75)', lineWidth: 3, fill: false });
        paint.drawText({ x: cx, y: cy, text: Math.ceil(ability.remaining).toString(), fillStyle: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center', textBaseline: 'middle', strokeStyle: 'rgba(0, 0, 0, 0.6)', lineWidth: 3 });
      }
      if (ability.locked) {
        paint.drawText({ x: cx, y: cy, text: '?', fillStyle: 'rgba(220, 220, 220, 0.85)', fontSize: 18, fontWeight: '700', textAlign: 'center', textBaseline: 'middle' });
      }
      paint.drawText({
        x: cx, y: y + size + 4, text: this.#label(ability),
        fillStyle: ability.locked ? '$color.text.muted' : '$color.text.primary', fontSize: 12, letterSpacing: 1, textAlign: 'center', textBaseline: 'top'
      });
    });
  }
}
