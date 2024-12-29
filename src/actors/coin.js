import { Entity } from '../core/entity.js';
import Matter from 'matter-js';

export class Coin extends Entity {
  name = 'Coin';
  
  constructor(ctx, body, sprite, game, options = {}) {
    super(ctx, body, sprite, game);
    
    this.floatOffset = 0;
    this.floatSpeed = 2;
    this.floatAmount = 5;
    this.baseY = body.position.y;
    
    this.rotation = 0;
    this.rotationSpeed = 2;
  }

  update(deltaTime) {
    this.floatOffset += this.floatSpeed * deltaTime;
    const newY = this.baseY + Math.sin(this.floatOffset) * this.floatAmount;
    
    this.rotation += this.rotationSpeed * deltaTime;
    
    Matter.Body.setPosition(this.body, {
      x: this.body.position.x,
      y: newY
    });
    
    Matter.Body.setAngle(this.body, this.rotation);
  }

  onCollisionStart(other) {
    if (other.entity && other.entity === this.game.player) {
      // TODO: Add score/collection logic
      this.game.entities.delete(this);
      Matter.World.remove(this.game.engine.world, this.body);
    }
  }
} 