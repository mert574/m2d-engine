/**
 * Everything that drives, rolls, spills, shoves or glows on a circuit.
 *
 * Simulation runs in `fixedUpdate` on the tick; sprites, lights and shadow
 * casters are submitted in `draw`. The cars carry real headlights — spot
 * lights with shadow casting, so a barrel in the beam throws its shadow
 * across the asphalt — and the player's rear axle writes skid marks into
 * the shared mark buffer while drifting.
 */
import { Entity } from 'm2d-engine/core/entity.js';
import { CarControl } from 'm2d-engine/constraints/carControl.js';
import { PathFollow } from 'm2d-engine/constraints/pathFollow.js';

/** Visual size of a car, px. The physics box is a whisker smaller. */
export const CAR = { width: 30, length: 54, bodyWidth: 26, bodyLength: 48 };

/** Grip multipliers by surface. What the tyres believe. */
export const SURFACE = { road: 1, grass: 0.45, oil: 0.16 };

/** Seconds the boost streaks and the "BOOST" readout linger after a boost. */
const BOOST_FX_SECONDS = 0.9;

/** px/s a boost pad hurls the car to. */
const PAD_BOOST = 840;

/** Relative impact speed that knocks a barrel over, px/s. */
const BARREL_TOPPLE_SPEED = 240;

/**
 * The player's car: CarControl on the arrow keys, headlights, brake
 * lights, skid marks and surface detection against the track and the oil.
 */
export class RaceCar extends Entity {
  name = 'RaceCar';

  constructor(body, sprite, game, options = {}) {
    body.setCollisionFilter({ category: 0x0002 });
    body.bullet = true;              // gates and walls at 800 px/s: no tunnelling
    super(body, sprite, game);

    this.images = options.images;
    this.track = options.track;
    this.marks = options.marks;
    /** Grip of the asphalt itself: 1 dry, less in the rain. */
    this.roadGrip = options.roadGrip ?? 1;
    /** Oil slicks currently under the car, maintained by OilSlick. */
    this.oilCount = 0;
    /** Set each tick; the HUD and sounds read it. */
    this.surface = 'road';
    this.braking = false;
    /** Seconds of boost presentation left, and what caused it. */
    this.boostFx = 0;
    this.boostLabel = '';
    /** Called on any boost: pads, nitro, mini-turbo. The HUD flashes on it. */
    this.onBoost = options.onBoost ?? null;

    this.addConstraint('drive', new CarControl(this, {
      ...(options.control ?? {}),
      onDrift: (active) => { if (active) game.soundManager.playSound('drift'); },
      onNitro: () => this.boosted('NITRO'),
      onDriftBoost: (level) => this.boosted(level > 1 ? 'MINI-TURBO ×2' : 'MINI-TURBO')
    }));

    // The car's voice: an electric motor whine that climbs with speed and
    // tyres that squeal while it slides. One looping voice each, steered
    // per frame.
    this.engineLoop = game.soundManager.loop('engine', { volume: 0.2, rate: 0.55 });
    this.roadLoop = game.soundManager.loop('road', { volume: 0, rate: 1 });
    this.tyreLoop = game.soundManager.loop('tyres', { volume: 0, rate: 1 });
  }

  /** Register a boost for the presentation layer. */
  boosted(label) {
    this.boostFx = BOOST_FX_SECONDS;
    this.boostLabel = label;
    this.game.soundManager.playSound('boost');
    this.onBoost?.(label);
  }

  destroy() {
    this.engineLoop?.stop();
    this.roadLoop?.stop();
    this.tyreLoop?.stop();
    super.destroy();
  }

  get drive() {
    return this.getConstraint('drive');
  }

  fixedUpdate(dt) {
    if (this.dead) return;

    // The tyres ask the world what they are standing on. Oil wins over
    // everything; otherwise it is asphalt inside the road width, grass out.
    const { x, y } = this.body.position;
    this.surface = this.oilCount > 0 ? 'oil'
      : this.track.onRoad(x, y, 6) ? 'road' : 'grass';
    this.drive.surfaceGrip = SURFACE[this.surface] * (this.surface === 'road' ? this.roadGrip : 1);

    super.fixedUpdate(dt);

    this.braking = this.game.input.snapshot.isDown(this.drive.keys.brake);

    // Skid marks from the rear axle: drifting, or scrabbling on grass.
    if (this.marks && (this.drive.drifting || (this.surface !== 'road' && this.drive.speed > 120))) {
      const angle = this.body.angle;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rear = { x: x - cos * CAR.bodyLength * 0.33, y: y - sin * CAR.bodyLength * 0.33 };
      const axle = CAR.bodyWidth * 0.42;
      const step = this.game.time.steps;
      this.marks.push(
        { x: rear.x - sin * -axle, y: rear.y + cos * -axle, angle, step },
        { x: rear.x - sin * axle, y: rear.y + cos * axle, angle, step }
      );
      if (this.marks.length > 2600) this.marks.splice(0, this.marks.length - 2600);
    }
  }

  /** Per-frame presentation: the sound loops and the boost fade. */
  update(deltaTime) {
    super.update(deltaTime);
    if (this.boostFx > 0) this.boostFx = Math.max(0, this.boostFx - deltaTime);

    const drive = this.drive;
    const revs = Math.min(1, Math.abs(drive.forwardSpeed) / drive.maxSpeed);
    // An EV: a quiet whine at rest that climbs with speed and steps up
    // under nitro — kept under 2× so the loop never races. The road roar
    // comes in with the square of speed and carries the weight.
    this.engineLoop?.setRate(0.55 + revs * 1.15 + (drive.boostLeft > 0 ? 0.25 : 0));
    this.engineLoop?.setVolume(0.18 + revs * 0.42);
    this.roadLoop?.setRate(0.9 + revs * 0.4);
    this.roadLoop?.setVolume(revs * revs * 0.7 + (this.surface === 'grass' ? 0.25 : 0));
    // Tyres: loud while drifting or scrabbling, silent on a clean line.
    const slide = Math.min(1, Math.abs(drive.lateralSpeed) / 220);
    const scrabble = this.surface !== 'road' && drive.speed > 120 ? 0.35 : 0;
    this.tyreLoop?.setVolume(Math.max(slide * 0.8, scrabble));
    this.tyreLoop?.setRate(0.85 + slide * 0.3);
  }

  draw() {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const angle = this.renderAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const additive = renderer.supports('blendModes') ? 'additive' : undefined;

    // Drift charge: sparks at the rear wheels, yellow then blue as the
    // mini-turbo charges — the kart-racer tell that a release will pay out.
    if (this.drive.drifting && this.drive.driftLevel > 0) {
      const color = this.drive.driftLevel > 1 ? '#7fd4ff' : '#ffd34d';
      const rearX = pos.x - cos * CAR.bodyLength * 0.4;
      const rearY = pos.y - sin * CAR.bodyLength * 0.4;
      for (const side of [-1, 1]) {
        const wx = rearX - sin * side * CAR.bodyWidth * 0.45;
        const wy = rearY + cos * side * CAR.bodyWidth * 0.45;
        for (let i = 0; i < 3; i++) {
          const jitter = ((this.game.time.frame * 7 + i * 13 + side * 5) % 11) / 11;
          renderer.drawArc({
            x: wx - cos * (4 + jitter * 16), y: wy - sin * (4 + jitter * 16),
            radius: 1.5 + (1 - jitter) * 2, fillStyle: color, blend: additive
          });
        }
      }
      renderer.drawLight({ x: rearX, y: rearY, radius: 70, color, intensity: 0.9 });
    }

    // Speed streaks while a boost is fresh: lines racing past the car.
    if (this.boostFx > 0) {
      const strength = this.boostFx / BOOST_FX_SECONDS;
      for (let i = 0; i < 8; i++) {
        const phase = ((this.game.time.frame * 3 + i * 17) % 40) / 40;
        const side = (i % 2 === 0 ? 1 : -1) * (14 + (i % 4) * 9);
        const back = 30 + phase * 120;
        renderer.drawLine({
          x1: pos.x - cos * back - sin * side, y1: pos.y - sin * back + cos * side,
          x2: pos.x - cos * (back + 40) - sin * side, y2: pos.y - sin * (back + 40) + cos * side,
          strokeStyle: `rgba(170, 220, 255, ${0.7 * strength * (1 - phase)})`, lineWidth: 2, blend: additive
        });
      }
    }

    // The car, dropping its silhouette one layer down onto the road.
    renderer.drawSprite({
      image: this.images.car, x: pos.x, y: pos.y,
      tileWidth: this.images.car.width, tileHeight: this.images.car.height,
      width: CAR.width, height: CAR.length,
      rotation: angle + Math.PI / 2,   // the sprite art points up
      shadow: { color: 'rgba(8, 8, 16, 0.45)', blur: 8, offsetX: 5, offsetY: 7 }
    });

    // Headlights: two spot lights ahead of the nose, with shadow casting.
    const noseX = pos.x + cos * CAR.bodyLength * 0.45;
    const noseY = pos.y + sin * CAR.bodyLength * 0.45;
    const sep = CAR.bodyWidth * 0.32;
    for (const side of [-1, 1]) {
      renderer.drawLight({
        x: noseX - sin * sep * side, y: noseY + cos * sep * side,
        radius: 420, color: '#ffe8c4', intensity: 1.25,
        angle, cone: 0.75, shadows: true, z: 0.2
      });
    }
    // A soft pool around the car so it never sits in its own dark.
    renderer.drawLight({ x: pos.x, y: pos.y, radius: 130, color: '#8f95c0', intensity: 0.55 });

    if (this.braking || this.drive.boostLeft > 0) {
      const tailX = pos.x - cos * CAR.bodyLength * 0.5;
      const tailY = pos.y - sin * CAR.bodyLength * 0.5;
      const color = this.drive.boostLeft > 0 ? '#66c4ff' : '#ff4040';
      renderer.drawLight({ x: tailX, y: tailY, radius: 90, color, intensity: 1.4 });
      if (this.drive.boostLeft > 0) {
        // The exhaust flame while the nitro burns.
        renderer.drawArc({
          x: tailX, y: tailY, radius: 7 + (this.game.time.frame % 3),
          fillStyle: 'rgba(130, 200, 255, 0.8)',
          blend: renderer.supports('blendModes') ? 'additive' : undefined
        });
      }
    }
  }
}

/** The ghost: the best lap's recorded poses, played back as a translucent car. */
export class GhostCar {
  constructor(game, images) {
    this.game = game;
    this.images = images;
    /** Flat [x, y, angle, ...] per tick, set by the race director. */
    this.frames = null;
    this.at = -1;
  }

  start(frames) {
    this.frames = frames;
    this.at = 0;
  }

  stop() {
    this.frames = null;
    this.at = -1;
  }

  get running() {
    return this.frames !== null && this.at * 3 < this.frames.length;
  }

  tick() {
    if (this.frames) this.at++;
  }

  draw() {
    if (!this.running || this.at === 0) return;
    const i = Math.min(this.at, this.frames.length / 3 - 1) * 3;
    const renderer = this.game.renderer;
    renderer.drawSprite({
      image: this.images.ghost,
      x: this.frames[i], y: this.frames[i + 1],
      tileWidth: this.images.ghost.width, tileHeight: this.images.ghost.height,
      width: CAR.width, height: CAR.length,
      rotation: this.frames[i + 2] + Math.PI / 2,
      globalAlpha: 0.45
    });
  }
}

/** A slow car patrolling a stretch of the track. Kinematic: it does not yield. */
export class TrafficCar extends Entity {
  name = 'TrafficCar';

  constructor(body, sprite, game, options = {}) {
    body.bodyType = 'kinematic';
    super(body, sprite, game);
    this.image = options.image;
    this.addConstraint('path', new PathFollow(this, {
      points: options.points,
      speed: options.speed,
      waitTime: 900,
      acceleration: options.speed
    }));
    this.heading = 0;
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    const velocity = this.body.velocity;
    if (Math.hypot(velocity.x, velocity.y) > 5) {
      this.heading = Math.atan2(velocity.y, velocity.x);
    }
  }

  draw() {
    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    renderer.drawSprite({
      image: this.image, x: pos.x, y: pos.y,
      tileWidth: this.image.width, tileHeight: this.image.height,
      width: CAR.width, height: CAR.length,
      rotation: this.heading + Math.PI / 2,
      shadow: { color: 'rgba(8, 8, 16, 0.45)', blur: 8, offsetX: 5, offsetY: 7 }
    });
    // Its own headlights — plain spots, no shadow casting: there can be a
    // few of these and the player's lights carry the look.
    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);
    renderer.drawLight({
      x: pos.x + cos * 30, y: pos.y + sin * 30,
      radius: 240, color: '#ffe9b8', intensity: 1.1,
      angle: this.heading, cone: 0.7
    });
  }
}

/** A traffic cone: light, scattered by a touch, flat once knocked over. */
export class Cone extends Entity {
  name = 'Cone';

  constructor(body, sprite, game, options = {}) {
    body.setMass(0.08);
    super(body, sprite, game);
    this.images = options.images;
    this.down = false;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (this.down || !other.entity) return;
    const v = other.velocity ?? { x: 0, y: 0 };
    if (Math.hypot(v.x, v.y) > 90) {
      this.down = true;
      this.game.soundManager.playSound('cone');
    }
  }

  draw() {
    if (this.dead) return;
    const image = this.down ? this.images.coneDown : this.images.cone;
    const pos = this.renderPosition;
    this.game.renderer.drawSprite({
      image, x: pos.x, y: pos.y,
      tileWidth: image.width, tileHeight: image.height,
      width: 15, height: 15 * (image.height / image.width),
      rotation: this.renderAngle,
      shadow: this.down ? undefined : { color: 'rgba(8, 8, 16, 0.4)', blur: 4, offsetX: 3, offsetY: 4 }
    });
  }
}

/**
 * An oil barrel. Hit it hard and it topples along the impact direction,
 * and a beat later its oil is on the track — where it stays for every
 * following round, which is how a circuit gets dirtier the longer a
 * session goes.
 */
export class Barrel extends Entity {
  name = 'Barrel';

  constructor(body, sprite, game, options = {}) {
    body.setMass(2.2);
    super(body, sprite, game);
    this.images = options.images;
    this.red = options.red ?? false;
    /** Called once with the spill spec when the barrel topples. */
    this.onSpill = options.onSpill ?? null;
    this.toppled = false;
    this.spillAngle = 0;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (this.toppled || other.entity?.name !== 'RaceCar') return;
    const v = other.velocity;
    const speed = Math.hypot(v.x, v.y);
    if (speed < BARREL_TOPPLE_SPEED) return;

    this.toppled = true;
    // The spill follows the hit: the barrel goes over the way the car was
    // travelling, and the slick lands ahead of where it fell.
    this.spillAngle = Math.atan2(v.y, v.x);
    this.game.soundManager.playSound('barrel');
    this.game.time.after(0.8, () => {
      if (this.dead) return;
      const rest = this.body.position;
      const spill = {
        x: rest.x + Math.cos(this.spillAngle) * 46,
        y: rest.y + Math.sin(this.spillAngle) * 46,
        angle: this.spillAngle,
        radius: 52
      };
      this.game.soundManager.playSound('spill');
      this.onSpill?.(spill);
    });
  }

  draw() {
    if (this.dead) return;
    const pos = this.renderPosition;
    const renderer = this.game.renderer;
    const up = this.red ? this.images.barrelRed : this.images.barrel;
    const down = this.red ? this.images.barrelRedDown : this.images.barrelDown;
    const image = this.toppled ? down : up;
    renderer.drawSprite({
      image, x: pos.x, y: pos.y,
      tileWidth: image.width, tileHeight: image.height,
      width: 24, height: 24 * (image.height / image.width),
      rotation: this.toppled ? this.spillAngle + Math.PI / 2 : this.renderAngle,
      shadow: { color: 'rgba(8, 8, 16, 0.4)', blur: 5, offsetX: 3, offsetY: 5 }
    });
    // Standing barrels block headlights; a fallen one is below the beam.
    if (!this.toppled) {
      renderer.drawShadowCaster({ x: pos.x, y: pos.y, radius: 10, z: 0.5 });
    }
  }
}

/** The slick itself: a sensor that strips the tyres' grip while overlapped. */
export class OilSlick extends Entity {
  name = 'OilSlick';

  constructor(body, sprite, game, options = {}) {
    body.isSensor = true;
    body.bodyType = 'static';
    super(body, sprite, game);
    this.image = options.image;
    this.angle = options.angle ?? 0;
    this.radius = options.radius ?? 55;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name === 'RaceCar') other.entity.oilCount++;
  }

  onCollisionEnd(other) {
    super.onCollisionEnd(other);
    if (other.entity?.name === 'RaceCar') {
      other.entity.oilCount = Math.max(0, other.entity.oilCount - 1);
    }
  }

  draw() {
    const pos = this.renderPosition;
    // Stretched along the spill direction: the shape remembers the hit.
    this.game.renderer.drawSprite({
      image: this.image, x: pos.x, y: pos.y,
      tileWidth: this.image.width, tileHeight: this.image.height,
      width: this.radius * 2.3, height: this.radius * 1.7,
      rotation: this.angle,
      globalAlpha: 0.9
    });
  }
}

/** A boost pad: drive over it, get thrown along the track. */
export class BoostPad extends Entity {
  name = 'BoostPad';

  constructor(body, sprite, game, options = {}) {
    body.isSensor = true;
    body.bodyType = 'static';
    super(body, sprite, game);
    this.image = options.image;
    this.direction = options.direction ?? 0;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    const car = other.entity;
    if (car?.name !== 'RaceCar') return;
    car.drive.applyBoost(PAD_BOOST);
    this.game.soundManager.playSound('boost');
  }

  draw() {
    const pos = this.renderPosition;
    const renderer = this.game.renderer;
    const pulse = 0.65 + 0.35 * Math.sin(this.game.time.unscaledElapsed * 5);
    for (const step of [-1, 0, 1]) {
      renderer.drawSprite({
        image: this.image,
        x: pos.x + Math.cos(this.direction) * step * 26,
        y: pos.y + Math.sin(this.direction) * step * 26,
        tileWidth: this.image.width, tileHeight: this.image.height,
        width: 30, height: 30,
        rotation: this.direction + Math.PI / 2,
        globalAlpha: 0.9
      });
    }
    renderer.drawLight({
      x: pos.x, y: pos.y, radius: 150, color: '#39c2ff', intensity: 0.8 * pulse
    });
  }
}

/**
 * A sliding gate: a kinematic beam shuttling across the road. PathFollow
 * ramps it so being hit is a shove, not an execution — but it will shove.
 */
export class GateArm extends Entity {
  name = 'GateArm';

  constructor(body, sprite, game, options = {}) {
    body.bodyType = 'kinematic';
    body.friction = 0.2;
    super(body, sprite, game);
    this.image = options.image;
    this.beam = options.beam;       // { length, angle }
    this.addConstraint('path', new PathFollow(this, {
      points: options.points,
      speed: options.speed ?? 130,
      waitTime: 650,
      acceleration: 260
    }));
  }

  draw() {
    const pos = this.renderPosition;
    const renderer = this.game.renderer;
    const { length, angle } = this.beam;
    const segments = Math.max(2, Math.round(length / 28));
    for (let i = 0; i < segments; i++) {
      const at = (i + 0.5) / segments - 0.5;
      renderer.drawSprite({
        image: this.image,
        x: pos.x + Math.cos(angle) * at * length,
        y: pos.y + Math.sin(angle) * at * length,
        tileWidth: this.image.width, tileHeight: this.image.height,
        width: 30, height: 12,
        rotation: angle,
        shadow: { color: 'rgba(8, 8, 16, 0.4)', blur: 4, offsetX: 3, offsetY: 4 }
      });
    }
    // The hazard advertises itself.
    renderer.drawLight({ x: pos.x, y: pos.y, radius: 130, color: '#ff7043', intensity: 0.9 });
    renderer.drawShadowCaster({ x: pos.x, y: pos.y, width: length, height: 12, rotation: angle, z: 0.4 });
  }

  setAnimation() {}
}

/** An invisible line across the road; the race director counts crossings. */
export class Checkpoint extends Entity {
  name = 'Checkpoint';

  constructor(body, sprite, game, options = {}) {
    body.isSensor = true;
    body.bodyType = 'static';
    super(body, sprite, game);
    this.index = options.index;
    this.onCross = options.onCross;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name === 'RaceCar') this.onCross?.(this.index);
  }

  draw() {}
  setAnimation() {}
}
