import { Entity } from '../core/entity.js';
import { s } from '../core/schema.js';

/**
 * A nav area painted over the ground it covers: `blocked` keeps the bake
 * out (a flowerbed nothing walks through but a bullet crosses), any other
 * declared area weighs the paths over it by its cost (mud, a road). It is
 * data for the bake and the stamp, nothing at runtime: its body stands on
 * layer `none` and stops nothing. Drawn as a tool box, like a trigger.
 */
export class NavVolume extends Entity {
  static description = 'A nav area over the ground it covers: blocked, or a declared costly area';
  /** Drawn as a violet box in the editor and under `r_showtools`; see core/toolVolumes.js. */
  static tool = { color: '#9a6bff', label: 'nav' };
  /** What marks this class to the bake's geometry walk. */
  static navArea = true;
  name = 'NavVolume';

  static properties = {
    area: s.ref('navArea', { initial: 'blocked', description: "A nav area from m2d.project.json navAreas, or the engine's 'blocked'" })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.area = options.area ?? 'blocked';
  }

  setAnimation() {
    // No sprite: its look is its tool box.
  }

  draw() {}

  /** Its kind and its area, so the boxes read at a glance. */
  get toolLabel() {
    return `nav ${this.area}`;
  }
}
