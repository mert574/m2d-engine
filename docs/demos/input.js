import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { Interactive } from 'm2d-engine/constraints/interactive.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

/** How hard a grabbed body is pulled toward the pointer, per second. */
const GRAB_STIFFNESS = 18;

class Block extends Entity {
  name = 'Block';

  draw() {
    const { x, y } = this.renderPosition;
    const renderer = this.game.renderer;
    const hovered = this.getConstraint('grab')?.isHovered;
    const fillStyle = this.body.bodyType === 'static' ? '#78909c' : hovered ? '#ffcc80' : '#ffa726';
    if (this.body.shape === 'circle') {
      renderer.drawArc({ x, y, radius: this.size.x / 2, fillStyle });
      return;
    }
    renderer.pushTransform({ x, y, rotation: this.renderAngle });
    renderer.drawRect({ x: -this.size.x / 2, y: -this.size.y / 2, width: this.size.x, height: this.size.y, fillStyle, cornerRadius: 3 });
    renderer.popTransform();
  }
}

const scene = {
  version: 4, type: 'level', name: 'main',
  world: { gravity: { x: 0, y: 1000 } },
  prefabs: {
    wall: { actor: 'Block', physics: { bodyType: 'static', friction: 0.5 } },
    box: { actor: 'Block', physics: { bodyType: 'dynamic', friction: 0.5, restitution: 0.2 } },
    ball: { actor: 'Block', physics: { bodyType: 'dynamic', shape: 'circle', restitution: 0.6 } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'wall', x: 320, y: 350, width: 640, height: 20 },
    { id: 'wall-left', prefab: 'wall', x: 10, y: 180, width: 20, height: 360 },
    { id: 'wall-right', prefab: 'wall', x: 630, y: 180, width: 20, height: 360 },
    { id: 'box-1', prefab: 'box', x: 200, y: 300, width: 40, height: 40 },
    { id: 'box-2', prefab: 'box', x: 250, y: 300, width: 40, height: 40 },
    { id: 'box-3', prefab: 'box', x: 225, y: 250, width: 40, height: 40 },
    { id: 'ball-1', prefab: 'ball', x: 420, y: 200, width: 36, height: 36 },
    { id: 'ball-2', prefab: 'ball', x: 480, y: 120, width: 28, height: 28 }
  ] }]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });
  game.camera.x = 320;
  game.camera.y = 180;
  game.registerActor('Block', Block);

  let eventLabel = null;
  let gravityLabel = null;
  const log = (type, event) => {
    const where = event?.world ? ` at ${Math.round(event.world.x)}, ${Math.round(event.world.y)}` : '';
    eventLabel.text = `${type}${where}`;
  };

  let gravity = 1000;
  const setGravity = (value) => {
    gravity = Math.min(Math.max(value, 0), 3000);
    game.physics.setGravity({ x: 0, y: gravity });
    gravityLabel.text = `gravity ${Math.round(gravity)} px/s² · scroll or pinch to change`;
  };

  const remove = (entity) => {
    game.entities.delete(entity);
    game.physics.remove(entity.body);
    entity.destroy();
  };

  // Opt an entity into pointer hit testing. Dragging steers the body with
  // velocity, so it still collides on the way and keeps its speed when released.
  const grabbable = (entity) => {
    entity.addConstraint('grab', new Interactive(entity, {
      draggable: true,
      cursor: 'grab',
      onClick(event) { log('click on a body', event); },
      onDragStart(event) { log('dragstart', event); },
      onDrag(event) {
        const { grabOffset } = this.getConstraint('grab');
        this.body.setVelocity({
          x: (event.world.x + grabOffset.x - this.body.position.x) * GRAB_STIFFNESS,
          y: (event.world.y + grabOffset.y - this.body.position.y) * GRAB_STIFFNESS
        });
      },
      onDragEnd(event) { log('dragend', event); },
      onRightClick(event) { log('rightclick', event); remove(this); }
    }));
  };

  const spawn = (x, y) => {
    const ball = game.rng.chance(0.5);
    const size = ball ? 32 : 40;
    const entity = game.createEntity({
      type: 'Block', x, y, width: size, height: size,
      physics: ball ? { shape: 'circle', restitution: 0.6 } : { friction: 0.5, restitution: 0.2 }
    });
    game.entities.add(entity);
    game.physics.add(entity.body);
    grabbable(entity);
  };

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      const ui = game.sceneManager.getCurrentScene().ui;
      eventLabel = ui.add(new UIText({
        x: 0,
        y: 10,
        text: 'waiting for input',
        anchor: 'top',
        align: 'center',
        fontSize: '15px',
        color: '#eceff1'
      }));
      gravityLabel = ui.add(new UIText({
        x: 0,
        y: 30,
        text: '',
        anchor: 'top',
        align: 'center',
        fontSize: '13px',
        color: '#90a4ae'
      }));
      setGravity(gravity);
      for (const entity of game.entities) {
        if (entity.body.bodyType === 'dynamic') grabbable(entity);
      }
    }
  });

  // Subscribers run after the target. A grabbable body consumes its click, so
  // this fires for clicks on empty space and on the walls.
  game.input.on('click', (event) => {
    if (!event.inContent) return;
    log('click on empty space', event);
    spawn(event.world.x, event.world.y);
  });
  game.input.on('doubleclick', (event) => log('doubleclick', event));
  game.input.on('scroll', (event) => {
    log(`scroll ${Math.round(event.scroll.y)}`, event);
    setGravity(gravity - event.scroll.y * 2);
  });
  game.input.on('pinch', (event) => {
    log(`pinch scale ${event.scale.toFixed(2)}`, event);
    setGravity(gravity * event.scaleDelta);
  });

  await game.start();
  return game;
}
