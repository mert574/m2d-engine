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
import { s } from 'm2d-engine/core/schema.js';
import { makeRng, range } from 'm2d-kit/random';
import { trackFor } from './track.js';
import { CarControl } from 'm2d-kit/controls';

/** Visual size of a car, px. The physics box is a whisker smaller. */
export const CAR = { width: 30, length: 54, bodyWidth: 26, bodyLength: 48 };

/** What each surface does to the tyres: grip as a multiple, drag in 1/s. */
const SURFACE = {
  road: { grip: 1, drag: 0 },
  grass: { grip: 0.45, drag: 0 },
  ice: { grip: 0.3, drag: 0 },
  oil: { grip: 0.16, drag: 1.1 }
};

/** Steepest hit on a barrier, from the wall, that scrapes along it rather than stopping. */
const SCRAPE_MAX_ANGLE = Math.PI / 4;
/** Share of the speed a scrape at that steepest angle costs; a shallower one costs less. */
const SCRAPE_LOSS = 0.45;
/** Share of the gap between heading and wall closed per tick of scraping. */
const SCRAPE_ALIGN = 0.35;

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

    this.image = options.image;
    this.track = options.track;
    this.marks = options.marks;
    /** Grip of the asphalt itself: 1 dry, less in the rain. */
    this.roadGrip = options.roadGrip ?? 1;
    /** What the asphalt is covered with at a point, if anything: `(x, y) => 'ice' | null`. */
    this.surfaceAt = options.surfaceAt ?? null;
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
    this.engineLoop = game.soundManager.loop('engine', { volume: 0.55, rate: 0.55 });
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
    // everything; otherwise it is grass outside the road width, and inside
    // it asphalt or whatever the circuit laid over it.
    const { x, y } = this.body.position;
    this.surface = this.oilCount > 0 ? 'oil'
      : !this.track.onRoad(x, y, 6) ? 'grass'
      : this.surfaceAt?.(x, y) ?? 'road';
    const surface = SURFACE[this.surface];
    this.drive.surfaceGrip = surface.grip * (this.surface === 'road' ? this.roadGrip : 1);
    this.drive.surfaceDrag = surface.drag;

    super.fixedUpdate(dt);
    this.#scrapeBarrier();

    this.braking = this.input.isDown(this.drive.keys.brake) || this.input.isDown(this.drive.keys.handbrake);

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

  /**
   * Left to the solver, a barrier met at any angle stops the car within a
   * second: the drive re-aims the velocity into the wall each tick and the
   * contact takes that part away again. A shallow hit scrapes along instead,
   * keeping the speed along the wall and turning the nose toward it.
   */
  #scrapeBarrier() {
    const { x, y } = this.body.position;
    const wall = this.track.samples[this.track.nearest(x, y)];
    const offset = (x - wall.x) * wall.nx + (y - wall.y) * wall.ny;
    const side = Math.sign(offset) || 1;
    const nose = this.body.angle;
    const toward = Math.abs(Math.cos(nose) * wall.nx + Math.sin(nose) * wall.ny);
    const reach = toward * CAR.bodyLength / 2 + Math.sqrt(1 - toward * toward) * CAR.bodyWidth / 2;
    if (Math.abs(offset) + reach < wall.w - 2) return;

    const v = this.body.velocity;
    const speed = Math.hypot(v.x, v.y);
    const into = (v.x * wall.nx + v.y * wall.ny) * side;
    if (into <= 0 || speed < 1) return;
    const incidence = Math.asin(Math.min(1, into / speed));
    if (incidence > SCRAPE_MAX_ANGLE) return;

    const forward = Math.sign(v.x * wall.tx + v.y * wall.ty) || 1;
    const kept = speed * (1 - SCRAPE_LOSS * incidence / SCRAPE_MAX_ANGLE);
    this.body.setVelocity({ x: wall.tx * forward * kept, y: wall.ty * forward * kept });

    const along = Math.atan2(wall.ty * forward, wall.tx * forward);
    const gap = Math.atan2(Math.sin(along - nose), Math.cos(along - nose));
    if (Math.abs(gap) < Math.PI / 2) this.body.setAngle(nose + gap * SCRAPE_ALIGN);
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
    // The loops sit under the sound volume like every effect, and the
    // music plays beside them, so they are mixed hot: the motor is the
    // thing the player hears most.
    this.engineLoop?.setRate(0.55 + revs * 1.15 + (drive.boostLeft > 0 ? 0.25 : 0));
    this.engineLoop?.setVolume(0.55 + revs * 0.45);
    this.roadLoop?.setRate(0.9 + revs * 0.4);
    this.roadLoop?.setVolume(revs * revs * 0.9 + (this.surface === 'grass' ? 0.3 : 0));
    // Tyres: loud while drifting or scrabbling, silent on a clean line.
    const slide = Math.min(1, Math.abs(drive.lateralSpeed) / 220);
    const scrabble = this.surface !== 'road' && drive.speed > 120 ? 0.4 : 0;
    this.tyreLoop?.setVolume(Math.max(slide, scrabble));
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
      image: this.image, x: pos.x, y: pos.y,
      tileWidth: this.image.width, tileHeight: this.image.height,
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
  constructor(game, image) {
    this.game = game;
    this.image = image;
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
      image: this.image,
      x: this.frames[i], y: this.frames[i + 1],
      tileWidth: this.image.width, tileHeight: this.image.height,
      width: CAR.width, height: CAR.length,
      rotation: this.frames[i + 2] + Math.PI / 2,
      globalAlpha: 0.45
    });
  }
}

/** A slow car patrolling a stretch of the track. Kinematic: it does not yield. */
export class TrafficCar extends Entity {
  static properties = { image: s.ref('image', { description: 'The car it is drawn as' }) };

  name = 'TrafficCar';

  constructor(body, sprite, game, options = {}) {
    body.bodyType = 'kinematic';
    super(body, sprite, game);
    this.image = options.image;
    // The stretch of road it shuttles is the scene's own path, walked by
    // the engine's PathFollow, which the scene attaches with `face`, so
    // `heading` follows the travel; 0 covers the first, standing frames.
    this.heading = 0;
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
  static properties = {
    up: s.ref('image', { description: 'Standing' }),
    down: s.ref('image', { description: 'Knocked over' })
  };

  name = 'Cone';

  constructor(body, sprite, game, options = {}) {
    body.setMass(0.08);
    super(body, sprite, game);
    this.art = { up: options.up, down: options.down };
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
    const image = this.down ? this.art.down : this.art.up;
    const pos = this.renderPosition;
    this.game.renderer.drawSprite({
      image, x: pos.x, y: pos.y,
      tileWidth: image.width, tileHeight: image.height,
      width: 15, height: 15 * (image.height / image.width),
      rotation: this.renderAngle,
      shadow: this.down ? undefined : { color: 'rgba(8, 8, 16, 0.4)', blur: 4, offsetX: 3, offsetY: 4 }
    });
    // A standing cone blocks the headlights; a flat one is below the beam.
    if (!this.down) this.game.renderer.drawShadowCaster({ x: pos.x, y: pos.y, radius: 5, z: 0.4 });
  }
}

/**
 * An oil barrel. Hit it hard and it topples along the impact direction,
 * and a beat later its oil is on the track — where it stays for every
 * following round, which is how a circuit gets dirtier the longer a
 * session goes.
 */
export class Barrel extends Entity {
  static properties = {
    blue: s.ref('image'), blueDown: s.ref('image'),
    red: s.ref('image'), redDown: s.ref('image'),
    rusted: s.boolean({ initial: false, description: 'The red barrel rather than the blue one' })
  };

  name = 'Barrel';

  constructor(body, sprite, game, options = {}) {
    body.setMass(2.2);
    super(body, sprite, game);
    this.art = options.rusted
      ? { up: options.red, down: options.redDown }
      : { up: options.blue, down: options.blueDown };
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
        radius: 40
      };
      this.game.soundManager.playSound('spill');
      this.onSpill?.(spill);
    });
  }

  draw() {
    if (this.dead) return;
    const pos = this.renderPosition;
    const renderer = this.game.renderer;
    const image = this.toppled ? this.art.down : this.art.up;
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
  static properties = {
    image: s.ref('image'),
    radius: s.number({ positive: true, initial: 40, unit: 'px', description: 'How far the slick spreads' })
  };

  name = 'OilSlick';

  constructor(body, sprite, game, options = {}) {
    body.isSensor = true;
    body.bodyType = 'static';
    super(body, sprite, game);
    this.image = options.image;
    // Placed at an angle on the road; the body carries it.
    this.angle = body.angle ?? 0;
    this.radius = options.radius ?? OilSlick.properties.radius.initial;
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
  static properties = { image: s.ref('image', { description: 'The arrow painted on the road' }) };

  name = 'BoostPad';

  constructor(body, sprite, game, options = {}) {
    body.isSensor = true;
    body.bodyType = 'static';
    super(body, sprite, game);
    this.image = options.image;
    // Which way it throws: along the road, which is how it was placed.
    this.direction = body.angle ?? 0;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    const car = other.entity;
    if (car?.name !== 'RaceCar') return;
    car.drive.applyBoost(PAD_BOOST);
    car.boosted('BOOST');
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
  static properties = { image: s.ref('image', { description: 'The barrier the beam is drawn as' }) };

  name = 'GateArm';

  constructor(body, sprite, game, options = {}) {
    body.bodyType = 'kinematic';
    body.friction = 0.2;
    super(body, sprite, game);
    this.image = options.image;
    // The beam is how it was placed: as long as the object is wide, lying
    // across the road. It shuttles along the scene's path, which the
    // prefab's PathFollow walks.
    this.beam = { length: this.size.x, angle: body.angle ?? 0 };
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
  static tool = { color: '#ff8a1c', label: 'checkpoint' };
  static properties = {
    index: s.integer({ min: 0, description: 'Its place in the lap order' }),
    finish: s.boolean({ initial: false, description: 'The line a lap is timed from' })
  };

  name = 'Checkpoint';

  constructor(body, sprite, game, options = {}) {
    body.isSensor = true;
    body.bodyType = 'static';
    super(body, sprite, game);
    this.index = options.index ?? 0;
    this.finish = options.finish ?? false;
    /** Set by the race director when it builds the round. */
    this.onCross = null;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name === 'RaceCar') this.onCross?.(this.index);
  }

  draw() {}
  setAnimation() {}
}

/** A stretch of the lap, as fractions of it, measured off the scene's road path. */
class RoadStretch extends Entity {
  static properties = {
    path: s.ref('path', { initial: 'road', description: 'The road it lies along' }),
    from: s.number({ min: 0, max: 1, required: true, description: 'Where it begins, as a fraction of the lap' }),
    to: s.number({ min: 0, max: 1, required: true, description: 'Where it ends; after `from`' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    // Scenery: drawn, never touched.
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.roadPath = options.path ?? 'road';
    this.from = options.from ?? 0;
    this.to = options.to ?? 0;
    if (!(this.to > this.from)) throw new Error(`${this.name}: 'to' (${this.to}) must come after 'from' (${this.from}) along the lap`);
    this.track = null;
  }

  /** The track, on the first ask: the scene is still being built in the constructor. */
  ready() {
    if (this.track) return true;
    const scene = this.game.sceneManager.getCurrentScene();
    if (!scene) return false;
    const track = trackFor(scene, this.roadPath);
    const span = track.samples.map((sample, i) => i).filter((i) => this.coversDistance(track, track.samples[i].s));
    if (span.length < 2) {
      // Shorter than the road's sampling: nothing to draw or drive on, said once.
      console.warn(`${this.name} ${this.from}..${this.to} on '${this.roadPath}' is shorter than one road sample; ignored`);
      this.visible = false;
      this.from = this.to = -1;
      return false;
    }
    this.track = track;
    this.span = span;
    this.prepare();
    return true;
  }

  /** Whether a distance along `track`'s lap lies in the stretch. */
  coversDistance(track, s) {
    return s >= this.from * track.length && s <= this.to * track.length;
  }

  /** Whether a world point is on the stretch: on its road, and inside it along the lap. */
  covers(x, y, margin = 0) {
    if (!this.ready()) return false;
    const sample = this.track.samples[this.track.nearest(x, y)];
    if (Math.hypot(sample.x - x, sample.y - y) > sample.w + margin) return false;
    return this.coversDistance(this.track, sample.s);
  }

  prepare() {}

  /** The visible pairs of consecutive samples in the stretch, for quads. */
  *pairs(area, margin = 60) {
    const samples = this.track.samples;
    for (let k = 0; k < this.span.length - 1; k++) {
      const a = samples[this.span[k]];
      const b = samples[this.span[k + 1]];
      if (this.span[k + 1] !== this.span[k] + 1) continue;
      if (a.x < area.left - margin && b.x < area.left - margin) continue;
      if (a.x > area.right + margin && b.x > area.right + margin) continue;
      if (a.y < area.top - margin && b.y < area.top - margin) continue;
      if (a.y > area.bottom + margin && b.y > area.bottom + margin) continue;
      yield [a, b];
    }
  }

  quad(a, b, widthA, widthB, fillStyle, inset = 0) {
    this.game.renderer.drawPath({
      points: [
        { x: a.x + a.nx * widthA, y: a.y + a.ny * widthA },
        { x: b.x + b.nx * widthB, y: b.y + b.ny * widthB },
        { x: b.x - b.nx * (widthB - inset), y: b.y - b.ny * (widthB - inset) },
        { x: a.x - a.nx * (widthA - inset), y: a.y - a.ny * (widthA - inset) }
      ],
      closed: true, fillStyle
    });
  }

  setAnimation() {}
}

/**
 * Ice over the asphalt: the car keeps its grip on the gas but little on
 * the wheel, so a corner taken on it is a slide whatever the driver does.
 * The race director hands the car the stretches to ask; this one draws.
 */
export class IceStretch extends RoadStretch {
  static properties = {
    tint: s.string({ editor: 'color', initial: 'rgba(168, 214, 255, 0.3)', description: 'The sheet over the road' }),
    seed: s.integer({ min: 0, initial: 1, description: 'Which scatter of cracks' })
  };

  name = 'IceStretch';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.tint = options.tint ?? IceStretch.properties.tint.initial;
    this.seed = options.seed ?? 1;
    this.zIndex = -900;
  }

  prepare() {
    const rng = makeRng(this.seed);
    this.cracks = [];
    for (let k = 0; k < this.span.length; k += 3) {
      const sample = this.track.samples[this.span[k]];
      const offset = range(rng, -sample.w * 0.8, sample.w * 0.8);
      this.cracks.push({
        x: sample.x + sample.nx * offset, y: sample.y + sample.ny * offset,
        angle: Math.atan2(sample.ty, sample.tx) + range(rng, -0.9, 0.9), length: range(rng, 14, 46)
      });
    }
    this.ends = [this.span[0], this.span[this.span.length - 1]].map((i) => this.track.samples[i]);
  }

  draw() {
    if (this.dead || !this.visible || !this.ready()) return;
    const renderer = this.game.renderer;
    const area = this.game.camera.getVisibleArea();
    for (const [a, b] of this.pairs(area)) this.quad(a, b, a.w - 2, b.w - 2, this.tint);
    for (const crack of this.cracks) {
      if (crack.x < area.left - 50 || crack.x > area.right + 50 || crack.y < area.top - 50 || crack.y > area.bottom + 50) continue;
      const dx = Math.cos(crack.angle) * crack.length / 2;
      const dy = Math.sin(crack.angle) * crack.length / 2;
      renderer.drawLine({ x1: crack.x - dx, y1: crack.y - dy, x2: crack.x + dx, y2: crack.y + dy, strokeStyle: 'rgba(235, 246, 255, 0.55)', lineWidth: 1.5 });
    }
    // The sheet catches the light at both ends, the warning a driver gets.
    for (const end of this.ends) {
      renderer.drawLight({ x: end.x, y: end.y, radius: 260, color: '#bfe3ff', intensity: 0.7 });
    }
  }
}

/**
 * A tunnel over a stretch of road. The roof hides the car: what shows is
 * the strip lights along the ceiling, the headlight pool the lights pass
 * still paints through, and the tail lights as two faint dots, enough to
 * know where it is and not enough to see the road.
 */
export class Tunnel extends RoadStretch {
  static properties = {
    roof: s.string({ editor: 'color', initial: 'rgba(9, 11, 20, 0.97)' }),
    lightColor: s.string({ editor: 'color', initial: '#9fd8ff', label: 'Light colour', description: 'The strip lights along the ceiling' }),
    lightEvery: s.number({ positive: true, initial: 130, unit: 'px', label: 'Light spacing' })
  };

  name = 'Tunnel';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, options);
    this.roof = options.roof ?? Tunnel.properties.roof.initial;
    this.lightColor = options.lightColor ?? Tunnel.properties.lightColor.initial;
    this.lightEvery = options.lightEvery ?? Tunnel.properties.lightEvery.initial;
    // Over the road's own over-layer, and over the cars.
    this.zIndex = 1200;
  }

  prepare() {
    this.strips = [];
    const first = this.track.samples[this.span[0]].s;
    const last = this.track.samples[this.span[this.span.length - 1]].s;
    for (let s = first + this.lightEvery / 2; s < last; s += this.lightEvery) {
      const sample = this.track.at(s);
      this.strips.push({ x: sample.x, y: sample.y, nx: sample.nx, ny: sample.ny });
    }
    this.portals = [this.span[0], this.span[this.span.length - 1]].map((i) => this.track.samples[i]);
  }

  /** The player's car, for the hint of it under the roof. */
  get car() {
    if (this.racer && !this.racer.dead) return this.racer;
    this.racer = [...this.game.entities].find((entity) => entity.name === 'RaceCar') ?? null;
    return this.racer;
  }

  draw() {
    if (this.dead || !this.visible || !this.ready()) return;
    const renderer = this.game.renderer;
    const area = this.game.camera.getVisibleArea();
    const additive = renderer.supports('blendModes') ? 'additive' : undefined;

    for (const [a, b] of this.pairs(area, 80)) {
      this.quad(a, b, a.w + 46, b.w + 46, '#04050a');          // the walls' tops
      this.quad(a, b, a.w + 34, b.w + 34, this.roof);         // the roof
    }
    for (const strip of this.strips) {
      if (strip.x < area.left - 200 || strip.x > area.right + 200 || strip.y < area.top - 200 || strip.y > area.bottom + 200) continue;
      renderer.drawLine({
        x1: strip.x - strip.nx * 14, y1: strip.y - strip.ny * 14, x2: strip.x + strip.nx * 14, y2: strip.y + strip.ny * 14,
        strokeStyle: this.lightColor, lineWidth: 3, blend: additive
      });
      renderer.drawLight({ x: strip.x, y: strip.y, radius: 110, color: this.lightColor, intensity: 0.55 });
    }
    // The mouths: a lit frame, so the dark ahead reads as a tunnel and not a hole.
    for (const portal of this.portals) {
      renderer.drawLine({
        x1: portal.x - portal.nx * (portal.w + 46), y1: portal.y - portal.ny * (portal.w + 46),
        x2: portal.x + portal.nx * (portal.w + 46), y2: portal.y + portal.ny * (portal.w + 46),
        strokeStyle: '#3a4160', lineWidth: 10
      });
      renderer.drawLight({ x: portal.x, y: portal.y, radius: 300, color: '#ffe2b8', intensity: 1.1 });
    }

    const car = this.car;
    if (!car || !this.covers(car.position.x, car.position.y, 34)) return;
    const pos = car.renderPosition;
    const angle = car.renderAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Under the roof: a glow where the headlights are and the tail lights behind.
    renderer.drawArc({
      x: pos.x + cos * 40, y: pos.y + sin * 40, radius: 70,
      fillStyle: {
        type: 'radial', x: pos.x + cos * 40, y: pos.y + sin * 40, r0: 0, r1: 70,
        stops: [{ offset: 0, color: 'rgba(255, 232, 196, 0.16)' }, { offset: 1, color: 'rgba(255, 232, 196, 0)' }]
      },
      blend: additive
    });
    const tailX = pos.x - cos * CAR.bodyLength * 0.5;
    const tailY = pos.y - sin * CAR.bodyLength * 0.5;
    for (const side of [-1, 1]) {
      renderer.drawArc({
        x: tailX - sin * side * CAR.bodyWidth * 0.36, y: tailY + cos * side * CAR.bodyWidth * 0.36,
        radius: 2.5, fillStyle: 'rgba(255, 80, 60, 0.75)', blend: additive
      });
    }
  }
}
