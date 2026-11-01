import { Entity } from '../core/entity.js';
import { Health } from '../constraints/health.js';
import { Attack } from '../constraints/attack.js';
import { Debug } from '../constraints/debug.js';
import { KeyboardControl } from '../constraints/keyboardControl.js';
import { WallSlip } from '../constraints/wallSlip.js';

export class Player extends Entity {
  name = 'Player';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);

    body.setMass(1);

    this.jumpVelocity = 720; // px/s
    this.facingDirection = 1;
    this.setAnimation('idle');

    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      onDeath: () => {
        console.log('Game Over!');
        this.game.gameOver();
      },
      onDamage: (amount) => {
        console.log(`Player took ${amount} damage!`);
        this.game.soundManager.playSound('damage');
      }
    }));

    this.addConstraint('attack', new Attack(this, {
      damage: 65,
      range: 50,
      cooldown: 22.5,
      onStart: () => {
        this.game.soundManager.playSound('attack');
      }
    }));

    this.addConstraint('control', new KeyboardControl(this, {
      acceleration: 3000,
      maxSpeed: 180,
      continuous: true,
      verticalMovement: false,
      onMove: (dx, dy) => {
        if (dx !== 0) {
          this.setAnimation('run');
        } else {
          this.setAnimation('idle');
        }
      },
      onDirectionChange: (direction) => {
        this.facingDirection = direction;
      },
      onJump: () => {
        if (this.isOnGround()) {
          this.body.setVelocity({ x: this.body.velocity.x, y: -this.jumpVelocity });
          this.setAnimation('jump');
          this.game.soundManager.playSound('jump');
        }
      },
      onAttack: () => {
        const attack = this.getConstraint('attack');
        if (attack) {
          attack.startAttack(this.facingDirection);
        }
      }
    }));

    // Walls must not be climbable by holding a direction into them; the
    // ground friction the tumbling depends on comes back on landing.
    this.addConstraint('wallSlip', new WallSlip(this));

    this.addConstraint('debug', new Debug(this, {
      boundsColor: '#00ff00',
      boundsFillColor: 'rgba(0, 255, 0, 0.1)',
      centerColor: '#ff0000',
      textColor: '#00ff00',
      healthyColor: '#00ff00',
      lowHealthColor: '#ff0000'
    }));
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);

    if (other.entity?.name === 'Coin') {
      this.game.soundManager.playSound('coin');
    }
  }

  draw() {
    super.draw();

    if (this.game.renderer.isDebugEnabled()) {
      // Debug annotations go to the world overlay: world coordinates, but
      // rasterized at display resolution so they stay sharp and legible
      // however coarse the world's render resolution is.
      const overlay = this.game.worldOverlay;

      // Draw facing direction
      const directionLength = 20;
      overlay.drawLine({
        x1: this.renderPosition.x,
        y1: this.renderPosition.y,
        x2: this.renderPosition.x + (directionLength * this.facingDirection),
        y2: this.renderPosition.y,
        strokeStyle: '#ff0000',
        lineWidth: 1
      });

      overlay.drawText({
        text: `ground: ${this.isOnGround()}`,
        x: this.renderBounds.min.x,
        y: this.renderBounds.max.y,
        offsetY: 5,
        fillStyle: '#00ff00',
        fontSize: '12px',
        fontFamily: 'monospace',
        textAlign: 'left',
        textBaseline: 'top'
      });
    }
  }
}
