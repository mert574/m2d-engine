import { Entity } from '../core/entity.ts';
import type { M2D } from '../core/m2d.js';
import type { PhysicsBody } from '../core/physics/index.ts';
import type { SpriteSheet } from '../core/spriteSheet.ts';
import { s } from '../core/schema.ts';

/**
 * Scenery: a placed thing that only stands there. It draws its prefab's
 * sprite, or in 3D its mesh; a 2D prop with no sprite draws a block in its
 * `color` instead of the engine's red placeholder, which is what a
 * blockout, a template or a quick level wants. No behaviour of its own —
 * the actor an editor gives a model or an image dropped into a scene.
 */
export class Prop extends Entity {
  static override description = 'Scenery: a placed thing that stands there, drawing its sprite or mesh';
  static override properties = {
    color: s.string({ editor: 'color', initial: '#8b95a3', description: 'Fill of a 2D prop with no sprite' }),
    radius: s.number({ min: 0, unit: 'px', initial: 4, description: 'Corner rounding of that fill' })
  };

  override name = 'Prop';
  color: string;
  radius: number;

  constructor(body: PhysicsBody, sprite: SpriteSheet | null, game: M2D, options: { color?: string; radius?: number } = {}) {
    super(body, sprite, game);
    this.color = options.color ?? '#8b95a3';
    this.radius = options.radius ?? 4;
    if (sprite) this.setAnimation('default');
  }

  override draw(deltaTime: number): void {
    if (this.sprite?.width) {
      super.draw(deltaTime);
      return;
    }
    if (this.dead || !this.visible) return;
    const { x, y } = this.renderPosition;
    this.game.renderer.drawRect({
      x: x - this.size.x / 2,
      y: y - this.size.y / 2,
      width: this.size.x,
      height: this.size.y,
      cornerRadius: this.radius,
      fillStyle: this.color
    });
  }
}
