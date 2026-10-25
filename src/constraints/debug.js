import { Constraint } from '../core/constraint.js';

export class Debug extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.options = {
      showBounds: options.showBounds ?? true,
      showCenter: options.showCenter ?? true,
      showVelocity: options.showVelocity ?? true,
      showHealth: options.showHealth ?? true,
      boundsColor: options.boundsColor || '#00ff00',
      boundsFillColor: options.boundsFillColor || 'rgba(0, 255, 0, 0.1)',
      centerColor: options.centerColor || '#ff0000',
      textColor: options.textColor || '#00ff00',
      healthyColor: options.healthyColor || '#00ff00',
      lowHealthColor: options.lowHealthColor || '#ff0000',
      lowHealthThreshold: options.lowHealthThreshold || 30,
      font: {
        size: options.fontSize || '12px',
        family: options.fontFamily || 'monospace'
      }
    };
  }

  draw() {
    if (!this.entity.game.renderer.isDebugEnabled()) return;

    const bounds = this.entity.body.bounds;
    // Everything here is an annotation on top of the game, not world content,
    // so all of it goes through the world overlay and is rasterized at
    // display resolution. A 2-unit centre dot would not survive a low render
    // resolution otherwise.
    const overlay = this.entity.game.worldOverlay;

    // Draw bounds
    if (this.options.showBounds) {
      overlay.drawRect({
        x: bounds.min.x,
        y: bounds.min.y,
        width: bounds.max.x - bounds.min.x,
        height: bounds.max.y - bounds.min.y,
        strokeStyle: this.options.boundsColor,
        fillStyle: this.options.boundsFillColor,
        lineWidth: 1
      });
    }

    // Draw center point
    if (this.options.showCenter) {
      overlay.drawArc({
        x: this.entity.position.x,
        y: this.entity.position.y,
        radius: 2,
        startAngle: 0,
        endAngle: Math.PI * 2,
        fillStyle: this.options.centerColor
      });
    }

    // Readouts are anchored to the entity but sized in UI units, so they stay
    // equally legible at any resolution. The offset stacks upward, starting
    // clear of entity-specific debug info.
    let offsetY = -50;
    const label = (text, fillStyle) => {
      overlay.drawText({
        x: bounds.min.x,
        y: bounds.min.y,
        offsetY,
        text,
        fillStyle,
        fontSize: this.options.font.size,
        fontFamily: this.options.font.family,
        textAlign: 'left',
        textBaseline: 'top'
      });
      offsetY -= 15;
    };

    if (this.options.showVelocity) {
      const vx = Math.abs(this.entity.body.velocity.x) < 0.01 ? 0 : this.entity.body.velocity.x;
      const vy = Math.abs(this.entity.body.velocity.y) < 0.01 ? 0 : this.entity.body.velocity.y;
      label(`vel: ${vx.toFixed(1)}, ${vy.toFixed(1)}`, this.options.textColor);
    }

    if (this.options.showHealth) {
      const health = this.entity.getConstraint('health');
      if (health) {
        label(
          `hp: ${health.currentHealth}/${health.maxHealth}`,
          health.currentHealth > this.options.lowHealthThreshold ?
            this.options.healthyColor : this.options.lowHealthColor
        );
      }
    }
  }

  setOption(key, value) {
    if (key in this.options) {
      this.options[key] = value;
    }
  }
} 