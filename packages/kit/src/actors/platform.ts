import { Entity, type M2D } from 'm2d-engine';
import type { ActorBody, ActorSprite } from '../engineTypes.ts';


export class Platform extends Entity {
  static override description = 'A static platform or wall';
  override name = 'Platform';

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D) {
    super(body, sprite, game);
    this.setAnimation('default');
  }
}
