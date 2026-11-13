import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
import { makeRng, range } from '../shared/rng.js';

/**
 * The playground as the machine the menu was running.
 *
 * The menu is a Galton board in warm brass; the level is the workshop the
 * board stands in. A lamp hangs over the machine, dust drifts through its
 * light, and the funnel, splitter and pegs are machined parts (see
 * machineActors.js) rather than tiled sprites. One screen, no camera
 * movement, so the backdrop is a still life: the motion belongs to the
 * bodies.
 *
 * It is scenery placed in the scene, twice: the `back` layer draws the
 * room — wall, lamp pool, lamp and panelling — under everything, and the
 * `front` layer the dust and the room's lights over it. The ambient light
 * and the film grade are `world.lighting` and `world.post`, so the editor
 * shows the workshop as it plays.
 *
 * Every optional capability is asked for when drawing: on Canvas the
 * lights and additive blends drop out and the painted colours carry the
 * room. Nothing here touches the renderer until it draws, so a headless
 * game builds the scene without one.
 */

export class WorkshopBackdrop extends Entity {
  static properties = {
    layer: s.enumOf(['back', 'front'], { initial: 'back', description: 'back: the room under everything; front: the dust and lamplight over it' }),
    seed: s.integer({ min: 0, initial: 5, description: 'Which scatter of dust; the menu\'s board is 5' })
  };

  name = 'WorkshopBackdrop';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    // Scenery: drawn, never touched.
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.layer = options.layer ?? 'back';
    this.zIndex = this.layer === 'front' ? 1000 : -1000;

    this.bounds = {
      width: game.options.worldWidth,
      height: game.options.worldHeight
    };
    this.time = 0;
    this.lamp = { x: this.bounds.width / 2, y: 34 };

    // Dust in the lamp's cone, rising and falling on slow sines: the front
    // layer's, over the machine.
    const rng = makeRng(options.seed ?? 5);
    this.dust = this.layer !== 'front' ? [] : Array.from({ length: 50 }, () => ({
      x: range(rng, 0.2, 0.8),
      y: range(rng, 0.05, 0.95),
      driftX: range(rng, -6, 6),
      driftY: range(rng, 2, 9),
      size: range(rng, 1, 2.4),
      alpha: range(rng, 0.1, 0.3),
      phase: range(rng, 0, Math.PI * 2)
    }));
  }

  /** @param {number} deltaTime - Seconds since the last frame */
  update(deltaTime) {
    super.update(deltaTime);
    this.time += deltaTime;
  }

  draw() {
    if (this.dead || !this.visible) return;
    const features = {
      blendModes: this.game.renderer.supports('blendModes'),
      lights: this.game.renderer.supports('lights')
    };
    if (this.layer === 'back') this.drawRoom(features);
    else this.drawDust(features);
  }

  /** The room. Under everything. */
  drawRoom(features) {
    const renderer = this.game.renderer;
    const { width, height } = this.bounds;

    renderer.drawRect({
      x: 0, y: 0, width, height,
      fillStyle: {
        type: 'linear', x0: 0, y0: 0, x1: 0, y1: height,
        stops: [
          { offset: 0, color: '#ddd6c8' },
          { offset: 0.55, color: '#ccc4b4' },
          { offset: 1, color: '#a89e8e' }
        ]
      }
    });

    // The lamp's pool on the back wall, warm over the machine.
    renderer.drawRect({
      x: 0, y: 0, width, height,
      fillStyle: {
        type: 'radial', x: this.lamp.x, y: this.lamp.y, r0: 0, r1: height * 1.1,
        stops: [
          { offset: 0, color: 'rgba(255, 205, 150, 0.22)' },
          { offset: 0.45, color: 'rgba(255, 190, 130, 0.08)' },
          { offset: 1, color: 'rgba(255, 180, 120, 0)' }
        ]
      }
    });

    // Shafts of lamplight through the dust, barely there.
    if (features.blendModes) {
      for (const side of [-1, 1]) {
        renderer.drawPath({
          points: [
            { x: this.lamp.x, y: this.lamp.y },
            { x: this.lamp.x + side * width * 0.34, y: height },
            { x: this.lamp.x + side * width * 0.16, y: height }
          ],
          closed: true,
          fillStyle: {
            type: 'linear', x0: 0, y0: this.lamp.y, x1: 0, y1: height,
            stops: [
              { offset: 0, color: 'rgba(255, 205, 150, 0.07)' },
              { offset: 1, color: 'rgba(255, 205, 150, 0)' }
            ]
          },
          blend: 'additive',
          globalAlpha: 0.8 + 0.2 * Math.sin(this.time * 0.4 + side)
        });
      }
    }

    // The lamp itself: cord, shade, bulb. The glow has to come from
    // somewhere the eye can find.
    renderer.drawLine({
      x1: this.lamp.x, y1: 0, x2: this.lamp.x, y2: this.lamp.y - 16,
      strokeStyle: '#060509', lineWidth: 3
    });
    renderer.drawPath({
      points: [
        { x: this.lamp.x - 26, y: this.lamp.y + 2 },
        { x: this.lamp.x - 8, y: this.lamp.y - 18 },
        { x: this.lamp.x + 8, y: this.lamp.y - 18 },
        { x: this.lamp.x + 26, y: this.lamp.y + 2 }
      ],
      closed: true,
      fillStyle: {
        type: 'linear', x0: 0, y0: this.lamp.y - 18, x1: 0, y1: this.lamp.y + 2,
        stops: [
          { offset: 0, color: '#131019' },
          { offset: 1, color: '#2e2733' }
        ]
      },
      strokeStyle: 'rgba(255, 205, 150, 0.25)',
      lineWidth: 1
    });
    renderer.drawArc({
      x: this.lamp.x, y: this.lamp.y, radius: 7,
      fillStyle: {
        type: 'radial', x: this.lamp.x, y: this.lamp.y, r0: 0, r1: 7,
        stops: [
          { offset: 0, color: '#fff4de' },
          { offset: 1, color: '#ffce92' }
        ]
      }
    });

    // Back-wall panelling: tall faint seams, and a wainscot line where the
    // wall meets the machine floor.
    for (let x = width / 8; x < width; x += width / 8) {
      renderer.drawLine({
        x1: x, y1: 0, x2: x, y2: height,
        strokeStyle: 'rgba(70, 60, 48, 0.12)', lineWidth: 1
      });
    }
    renderer.drawRect({
      x: 0, y: height - 120, width, height: 120,
      fillStyle: {
        type: 'linear', x0: 0, y0: height - 120, x1: 0, y1: height,
        stops: [
          { offset: 0, color: 'rgba(0, 0, 0, 0)' },
          { offset: 1, color: 'rgba(0, 0, 0, 0.22)' }
        ]
      }
    });
  }

  /** The dust and the frame's lights. Over the entities. */
  drawDust(features) {
    const renderer = this.game.renderer;
    const { width, height } = this.bounds;

    for (const mote of this.dust) {
      const x = mote.x * width + Math.sin(this.time * 0.3 + mote.phase) * mote.driftX * 4;
      const y = ((mote.y * height + this.time * mote.driftY) % height);
      // Brighter where the lamp pool is, gone at the room's edges.
      const beam = Math.max(0, 1 - Math.abs(x - this.lamp.x) / (width * 0.4));
      const twinkle = 0.6 + 0.4 * Math.sin(this.time * 1.3 + mote.phase * 2);
      renderer.drawArc({
        x, y, radius: mote.size,
        fillStyle: '#fff2da',
        globalAlpha: mote.alpha * beam * twinkle
      });
    }

    if (!features.lights) return;

    renderer.drawLight({
      x: this.lamp.x, y: this.lamp.y,
      radius: height * 1.35,
      color: '#ffcf96',
      intensity: 0.6
    });
    // Cool fill from the room, so the shadowed floor still reads.
    renderer.drawLight({
      x: width / 2, y: height * 0.8,
      radius: width,
      color: '#8f9ab8',
      intensity: 0.35
    });

    // Whatever the hand holds is the brightest thing in the room.
    for (const entity of this.game.entities) {
      const grab = entity.constraints?.get('grab');
      if (!grab?.isDragging) continue;
      const pos = entity.renderPosition;
      renderer.drawLight({
        x: pos.x, y: pos.y, radius: 200, color: '#ffe3b8', intensity: 0.6
      });
    }
  }
}
