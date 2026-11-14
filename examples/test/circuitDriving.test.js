import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { register } from '../src/circuit/game.js';
import { RaceCar, CAR } from '../src/circuit/actors.js';
import { trackFor } from '../src/circuit/track.js';

/**
 * How Night Circuit's car meets the circuit: a barrier touched at a
 * shallow angle is scraped along, not crashed into, and oil costs grip
 * and a little speed. A headless round of circuit 2, without the race
 * director, with one car placed by hand.
 */

const SCENE = JSON.parse(readFileSync(new URL('../src/circuit/scenes/circuit2.json', import.meta.url), 'utf8'));

beforeAll(async () => {
  await initPhysics();
});

async function circuit() {
  const scene = structuredClone(SCENE);
  for (const layer of scene.layers) layer.objects = layer.objects.filter((object) => object.prefab === 'road');
  const game = new M2D(null, { headless: true, seed: 1 });
  register(game);
  game.sceneManager.addScene('c', { fetch: async () => scene });
  await game.sceneManager.switchTo('c');
  game.input.setSnapshotSource(() => ({ down: ['ArrowUp'] }));
  const track = trackFor(game.sceneManager.getCurrentScene());
  const body = game.physics.createBox({ x: 0, y: 0, width: CAR.bodyLength, height: CAR.bodyWidth, friction: 0.1, frictionAir: 0, restitution: 0.25, density: 0.004 });
  const car = new RaceCar(body, null, game, { track, marks: null });
  game.entities.add(car);
  game.physics.add(body);
  return { game, car, track };
}

/** The car aimed `degrees` off the road toward its right-hand barrier, at speed. */
function aim(car, track, degrees, speed = 500) {
  const sample = track.pose(0.12).sample;
  const heading = Math.atan2(sample.ty, sample.tx) + degrees * Math.PI / 180;
  car.body.setPosition({ x: sample.x + sample.nx * (sample.w - 40), y: sample.y + sample.ny * (sample.w - 40) });
  car.body.setAngle(heading);
  car.body.setVelocity({ x: Math.cos(heading) * speed, y: Math.sin(heading) * speed });
  return Math.atan2(sample.ty, sample.tx);
}

const speedOf = (car) => Math.hypot(car.body.velocity.x, car.body.velocity.y);

describe('Night Circuit\'s car', () => {
  it('scrapes along a barrier met at a shallow angle, keeping its speed and turning parallel', async () => {
    const { game, car, track } = await circuit();
    const along = aim(car, track, 12);
    let slowest = Infinity;
    for (let i = 0; i < 40; i++) {
      game.step(1);
      slowest = Math.min(slowest, speedOf(car));
    }
    expect(slowest).toBeGreaterThan(400);
    const gap = Math.atan2(Math.sin(car.body.angle - along), Math.cos(car.body.angle - along));
    expect(Math.abs(gap)).toBeLessThan(0.1);
    game.destroy();
  });

  it('loses a little speed on oil as well as its grip', async () => {
    const { game, car, track } = await circuit();
    aim(car, track, 0, 450);
    game.step(10);
    const before = speedOf(car);
    car.oilCount = 1;
    game.step(10);
    expect(car.surface).toBe('oil');
    const after = speedOf(car);
    expect(after).toBeLessThan(before * 0.95);
    expect(after).toBeGreaterThan(before * 0.6);
    game.destroy();
  });
});
