import { Entity } from 'm2d-engine/core/entity.js';
import type { M2D } from 'm2d-engine/core/m2d.js';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';


export class Platform extends Entity {
  static override description = 'A static platform or wall';
  override name = 'Platform';

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D) {
    super(body, sprite, game);
    this.setAnimation('default');
  }
}
