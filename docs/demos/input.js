import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { Interactive } from 'm2d-engine/constraints/interactive.js';
import { GravityDial } from 'm2d-kit/actors';

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

// Gravity is a counter the handlers turn, held between its min and max;
// the kit's GravityDial makes the world's y gravity follow it, and the HUD shows it.
const scene = {
  version: 7, type: 'level', name: 'main',
  world: {
    width: 640, height: 360, gravity: { x: 0, y: 1000 }, camera: { bounds: 'world' },
    counters: { gravity: { initial: 1000, min: 0, max: 3000 } }
  },
  prefabs: {
    wall: { actor: 'Block', physics: { bodyType: 'static', friction: 0.5 } },
    box: { actor: 'Block', physics: { bodyType: 'dynamic', friction: 0.5, restitution: 0.2 } },
    ball: { actor: 'Block', physics: { bodyType: 'dynamic', shape: 'circle', restitution: 0.6 } },
    dial: { actor: 'GravityDial', physics: { bodyType: 'static', isSensor: true, layer: 'none' }, properties: { counter: 'gravity' } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'wall', x: 320, y: 350, width: 640, height: 20 },
    { id: 'wall-left', prefab: 'wall', x: 10, y: 180, width: 20, height: 360 },
    { id: 'wall-right', prefab: 'wall', x: 630, y: 180, width: 20, height: 360 },
    { id: 'box-1', prefab: 'box', x: 200, y: 300, width: 40, height: 40 },
    { id: 'box-2', prefab: 'box', x: 250, y: 300, width: 40, height: 40 },
    { id: 'box-3', prefab: 'box', x: 225, y: 250, width: 40, height: 40 },
    { id: 'ball-1', prefab: 'ball', x: 420, y: 200, width: 36, height: 36 },
    { id: 'ball-2', prefab: 'ball', x: 480, y: 120, width: 28, height: 28 },
    { id: 'gravity-dial', prefab: 'dial', x: 320, y: 20, width: 8, height: 8 }
  ] }],
  hud: [
    { type: 'text', id: 'event', anchor: 'top', x: 0, y: 10, properties: { text: 'waiting for input', align: 'center', fontSize: '15px', color: '#eceff1' } },
    { type: 'text', id: 'gravity', anchor: 'top', x: 0, y: 30, properties: { text: 'gravity {gravity} px/s² · scroll or pinch to change', align: 'center', fontSize: '13px', color: '#90a4ae' } }
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });
  game.registerActor('Block', Block);
  game.registerActor('GravityDial', GravityDial, { origin: 'kit' });

  const current = () => game.sceneManager.getCurrentScene();
  const log = (type, event) => {
    const where = event?.world ? ` at ${Math.round(event.world.x)}, ${Math.round(event.world.y)}` : '';
    current().hud.setText('event', `${type}${where}`);
  };
  const gravity = () => current().counters.get('gravity');
  const setGravity = (value) => current().counters.set('gravity', Math.round(value));

  const remove = (entity) => game.removeEntity(entity);

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

  // One more of the scene's own boxes or balls, from its prefab.
  const spawn = (x, y) => {
    const ball = game.rng.chance(0.5);
    const entity = current().spawnPrefab(ball ? 'ball' : 'box', { x, y, width: ball ? 32 : 40 });
    grabbable(entity);
  };

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
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
    setGravity(gravity() - event.scroll.y * 2);
  });
  game.input.on('pinch', (event) => {
    log(`pinch scale ${event.scale.toFixed(2)}`, event);
    setGravity(gravity() * event.scaleDelta);
  });

  await game.start();
  return game;
}
