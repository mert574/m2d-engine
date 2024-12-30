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
    const renderer = this.entity.game.renderer;

    // Draw bounds
    if (this.options.showBounds) {
      renderer.drawRect({
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
      renderer.drawArc({
        x: this.entity.position.x,
        y: this.entity.position.y,
        radius: 2,
        startAngle: 0,
        endAngle: Math.PI * 2,
        fillStyle: this.options.centerColor
      });
    }

    // Draw text info above the entity
    let textY = bounds.min.y - 50;  // Start higher up to avoid collision with entity-specific debug info

    // Draw velocity
    if (this.options.showVelocity) {
      const vx = Math.abs(this.entity.body.velocity.x) < 0.01 ? 0 : this.entity.body.velocity.x;
      const vy = Math.abs(this.entity.body.velocity.y) < 0.01 ? 0 : this.entity.body.velocity.y;
      renderer.drawText({
        text: `vel: ${vx.toFixed(1)}, ${vy.toFixed(1)}`,
        x: bounds.min.x,
        y: textY,
        fillStyle: this.options.textColor,
        fontSize: this.options.font.size,
        fontFamily: this.options.font.family,
        textAlign: 'left',
        textBaseline: 'top'
      });
      textY -= 15;
    }

    // Draw health
    if (this.options.showHealth) {
      const health = this.entity.getConstraint('health');
      if (health) {
        renderer.drawText({
          text: `hp: ${health.currentHealth}/${health.maxHealth}`,
          x: bounds.min.x,
          y: textY,
          fillStyle: health.currentHealth > this.options.lowHealthThreshold ? 
            this.options.healthyColor : this.options.lowHealthColor,
          fontSize: this.options.font.size,
          fontFamily: this.options.font.family,
          textAlign: 'left',
          textBaseline: 'top'
        });
        textY -= 15;
      }
    }
  }

  setOption(key, value) {
    if (key in this.options) {
      this.options[key] = value;
    }
  }
} 