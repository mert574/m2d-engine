import { Entity } from 'm2d-engine/core/entity.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { Attack } from 'm2d-engine/constraints/attack.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import { WallSlip } from '../controls/wallSlip.ts';
import { s } from 'm2d-engine/core/schema.js';
import type { M2D } from 'm2d-engine/core/m2d.js';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';

export interface PlayerOptions {
  /** How hard it jumps, px/s. */
  jumpVelocity?: number;
}


export class Player extends Entity {
  static override description = 'The side-view platformer player';
  override name = 'Player';

  static override properties = {
    jumpVelocity: s.number({ initial: 720, positive: true, unit: 'px/s', label: 'Jump velocity' })
  };

  jumpVelocity: number;
  /** 1 facing right, -1 facing left. */
  facingDirection: number;

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: PlayerOptions = {}) {
    super(body, sprite, game);

    body.setMass(1);

    this.jumpVelocity = options.jumpVelocity ?? 720;
    this.facingDirection = 1;
    this.setAnimation('idle');

    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      onDeath: () => this.game.gameOver(),
      onDamage: () => this.game.soundManager?.playSound('damage')
    }));

    this.addConstraint('attack', new Attack(this, {
      damage: 65,
      range: 50,
      cooldown: 22.5,
      onStart: () => {
        this.game.soundManager?.playSound('attack');
      }
    }));

    this.addConstraint('control', new KeyboardControl(this, {
      acceleration: 3000,
      maxSpeed: 180,
      continuous: true,
      verticalMovement: false,
      onMove: (dx: number, dy: number) => {
        if (dx !== 0) {
          this.setAnimation('run');
        } else {
          this.setAnimation('idle');
        }
      },
      onDirectionChange: (direction: number) => {
        this.facingDirection = direction;
      },
      onJump: () => {
        if (this.isOnGround()) {
          this.body.setVelocity({ x: this.body.velocity.x, y: -this.jumpVelocity });
          this.setAnimation('jump');
          this.game.soundManager?.playSound('jump');
        }
      },
      onAttack: () => {
        const attack = this.getConstraint('attack') as Attack | undefined;
        if (attack) {
          attack.startAttack(this.facingDirection);
        }
      }
    }));

    // Walls must not be climbable by holding a direction into them; the
    // ground friction the tumbling depends on comes back on landing.
    this.addConstraint('wallSlip', new WallSlip(this));
  }


  override draw(): void {
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
