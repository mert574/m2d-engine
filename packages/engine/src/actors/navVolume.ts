import { Entity } from '../core/entity.ts';
import type { M2D } from '../core/m2d.js';
import type { PhysicsBody } from '../core/physics/index.ts';
import type { SpriteSheet } from '../core/spriteSheet.ts';
import { s } from '../core/schema.ts';

/**
 * A nav area painted over the ground it covers: `blocked` keeps the bake
 * out (a flowerbed nothing walks through but a bullet crosses), any other
 * declared area weighs the paths over it by its cost (mud, a road). It is
 * data for the bake and the stamp, nothing at runtime: its body stands on
 * layer `none` and stops nothing. Drawn as a tool box, like a trigger.
 */
export class NavVolume extends Entity {
  static override description = 'A nav area over the ground it covers: blocked, or a declared costly area';
  /** Drawn as a violet box in the editor and under `r_showtools`; see core/toolVolumes.js. */
  static override tool = { color: '#9a6bff', label: 'nav' };
  /** What marks this class to the bake's geometry walk. */
  static navArea = true;
  override name = 'NavVolume';
  area: string;

  static override properties = {
    area: s.ref('navArea', { initial: 'blocked', description: "A nav area from m2d.project.json navAreas, or the engine's 'blocked'" })
  };

  constructor(body: PhysicsBody, sprite: SpriteSheet | null, game: M2D, options: { area?: string } = {}) {
    super(body, sprite, game);
    this.area = options.area ?? 'blocked';
  }

  override setAnimation(): void {
    // No sprite: its look is its tool box.
  }

  override draw(): void {}

  /** Its kind and its area, so the boxes read at a glance. */
  override get toolLabel(): string {
    return `nav ${this.area}`;
  }
}
