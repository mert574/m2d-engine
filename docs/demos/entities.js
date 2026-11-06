import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { Constraint } from 'm2d-engine/core/constraint.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { DamageFlash } from 'm2d-engine/constraints/damageFlash.js';
import { Interactive } from 'm2d-engine/constraints/interactive.js';

/** A constraint: rocks the entity's drawn angle without touching the body. */
class Wobble extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.amount = options.amount ?? 0.08;
    this.time = Math.random() * 10;
  }

  update(deltaTime) {
    this.time += deltaTime;
    this.entity.renderAngleOffset = Math.sin(this.time * 3) * this.amount;
  }
}

/** An actor built from constraints: health, a hit flash, hover and click handling. */
class Crate extends Entity {
  name = 'Crate';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('wobble', new Wobble(this));
    const flash = new DamageFlash(this, { duration: 0.12 });
    this.addConstraint('flash', flash);
    this.addConstraint('health', new Health(this, {
      maxHealth: 100,
      invulnerableDuration: 0.15,
      onDamage: () => flash.flash(),
      onDeath: () => this.remove()
    }));
    this.addConstraint('click', new Interactive(this, {
      cursor: 'pointer',
      onClick() { this.getConstraint('health').takeDamage(34); }
    }));
  }

  remove() {
    this.game.entities.delete(this);
    this.game.physics.remove(this.body);
    this.destroy();   // releases the Interactive registration
  }

  draw(deltaTime) {
    const { x, y } = this.renderPosition;
    const renderer = this.game.renderer;
    renderer.pushTransform({ x, y, rotation: this.renderAngle });
    const hovered = this.getConstraint('click').isHovered;
    renderer.drawRect({ x: -this.size.x / 2, y: -this.size.y / 2, width: this.size.x, height: this.size.y, fillStyle: hovered ? '#d7ccc8' : '#a1887f', cornerRadius: 3 });
    renderer.drawRect({ x: -this.size.x / 2 + 4, y: -this.size.y / 2 + 4, width: this.size.x - 8, height: this.size.y - 8, strokeStyle: '#6d4c41', lineWidth: 2 });
    renderer.popTransform();
    // An overridden draw must draw the constraints itself: the health bar and the flash.
    for (const constraint of this.constraints.values()) constraint.draw(deltaTime);
  }
}

class Floor extends Entity {
  name = 'Floor';

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawRect({ x: x - this.size.x / 2, y: y - this.size.y / 2, width: this.size.x, height: this.size.y, fillStyle: '#78909c' });
  }
}

const CRATES = [[120, 318], [200, 318], [160, 270], [460, 318], [540, 318], [500, 270], [500, 222]];

const scene = {
  version: 1, type: 'level', name: 'main',
  world: { gravity: { x: 0, y: 1000 } },
  prefabs: {
    floor: { actor: 'Floor', physics: { bodyType: 'static' } },
    crate: { actor: 'Crate', physics: { bodyType: 'dynamic', friction: 0.8 } }
  },
  layers: [{ name: 'main', objects: [
    { prefab: 'floor', x: 320, y: 350, width: 640, height: 20 },
    ...CRATES.map(([x, y]) => ({ prefab: 'crate', x, y, width: 44, height: 44 }))
  ] }]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });
  game.camera.x = 320;
  game.camera.y = 180;
  game.registerActor('Floor', Floor);
  game.registerActor('Crate', Crate);

  let emptyFor = 0;
  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    // When every crate is gone, create new ones at runtime. Spawning is
    // simulation, so it runs per tick.
    onFixedUpdate(dt) {
      const crates = [...game.entities].filter((entity) => entity.name === 'Crate');
      emptyFor = crates.length === 0 ? emptyFor + dt : 0;
      if (emptyFor < 1) return;
      emptyFor = 0;
      for (const [x, y] of CRATES) {
        const crate = game.createEntity({ type: 'Crate', x, y: y - 200, width: 44, height: 44, physics: { friction: 0.8 } });
        game.entities.add(crate);
        game.physics.add(crate.body);
      }
    }
  });

  await game.start();
  return game;
}
