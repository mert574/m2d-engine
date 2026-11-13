/**
 * The race director: the circuit's own actor, placed once in its scene.
 *
 * A session on a map is a sequence of *rounds*. A round starts from the
 * grid with fresh cones and barrels, every oil slick the session has
 * accumulated, gates and traffic rebuilt at phase zero, and a 3-2-1
 * countdown. That rebuild is what makes a round a deterministic unit: the
 * recorder captures a round's inputs from the green light, and a replay is
 * just another round driven by the recording instead of the keyboard.
 *
 * Laps run inside a round: crossing the finish line arms the clock, three
 * checkpoints in order validate the lap, the next crossing scores it. The
 * clock is `game.time.steps` — ticks, not wall time — so a lap time means
 * the same thing on every machine.
 *
 * The props a round rebuilds are the scene's own: the objects of its
 * `props` layer, materialised again from the file each time, so what a
 * round starts from is what the editor shows and a person can move.
 *
 * Its three director keys — restart, replay, menu — are read from the
 * live keyboard rather than the tick's input, because during a replay the
 * tick's input *is* the recording, and the player must still be able to
 * stop watching it. They go through `game.actions`, so rebinding holds.
 */
import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
import { RaceCar, GhostCar, CAR } from './actors.js';
import { Recorder, Player, saveBest, loadBest } from './replay.js';
import { trackFor } from './track.js';
import { marksFor } from './road.js';
import { selectedCar, CARS } from './cars.js';

/** Seconds of countdown before the inputs go live: 3 · 2 · 1 · GO. */
const COUNTDOWN_SECONDS = 3.2;

/** The scene layer a round rebuilds: the cones, barrels, gates and the rest. */
const PROPS_LAYER = 'props';

/** Wall collision thickness, px — the barriers the round puts back. */
const WALL_THICKNESS = 18;

/** Session-wide oil: map name -> spills. Survives rounds, not reloads. */
const sessionSpills = new Map();

export class RaceDirector extends Entity {
  static properties = {
    path: s.ref('path', { initial: 'road', description: 'The centreline laps are measured along' }),
    cars: s.record(s.ref('image'), { description: 'The cars that may be driven, by the sprite name cars.js gives them' }),
    ghost: s.ref('image', { description: 'The personal-best ghost' }),
    roadGrip: s.number({ positive: true, initial: 1, description: 'Grip of the asphalt itself: 1 dry, less in the rain' }),
    countdown: s.number({ positive: true, initial: 3.2, unit: 's', description: 'Held on the grid before the inputs go live' })
  };

  name = 'RaceDirector';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    // The director stands in the world without being part of it.
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.visible = false;

    this.roadPath = options.path ?? 'road';
    this.art = options.cars ?? {};
    this.ghost = new GhostCar(game, options.ghost ?? null);
    this.roadGrip = options.roadGrip ?? 1;
    this.countdownSeconds = options.countdown ?? COUNTDOWN_SECONDS;

    this.carSpec = selectedCar();
    /** The car driving this round: the chosen one, or a replay's. */
    this.activeCar = this.carSpec;
    /** Every car pose since the green light, for the PB ghost. */
    this.roundFrames = [];

    this.car = null;
    this.roundEntities = [];
    this.timers = [];
    this.track = null;

    /** 'countdown' | 'live' | 'replay' | 'done' */
    this.mode = 'countdown';
    this.recorder = null;
    /** The recording driving this round, when one is: not the entity's owning player. */
    this.playback = null;

    /** What the HUD is showing, and whether it stays up. */
    this.announcement = '';
    /** A white flash, decayed per frame; the scene binds the post effect to it. */
    this.flash = 0;

    this.best = null;
    this.lastLapTicks = null;
    this.lapStartStep = null;
    this.nextCheckpoint = 0;
    this.lapFrames = [];
    this.wrongWayFor = 0;
    this.stopListening = null;
  }

  /** The circuit this director is on: its scene's name. */
  get circuit() {
    return this.game.sceneManager.getCurrentScene()?.config.name ?? 'circuit';
  }

  /** How many checkpoints a lap must take in order, as the scene placed them. */
  get checkpoints() {
    return this.roundEntities.filter((entity) => entity.name === 'Checkpoint' && !entity.finish).length;
  }

  get spills() {
    const name = this.circuit;
    if (!sessionSpills.has(name)) sessionSpills.set(name, []);
    return sessionSpills.get(name);
  }

  /** A line for the HUD; `sticky` keeps it up until the next one. */
  announce(text, sticky = false) {
    this.announcement = text;
    this.fadeTimer?.cancel();
    this.fadeTimer = sticky ? null
      : this.game.time.after(2.2, () => { this.announcement = ''; }, { unscaled: true });
  }

  get lapTicks() {
    return this.lapStartStep === null ? null : this.game.time.steps - this.lapStartStep;
  }

  /** Seconds, from ticks — the only clock a lap time is ever derived from. */
  ticksToSeconds(ticks) {
    return ticks * this.game.time.fixedTimestep;
  }

  // === Round lifecycle ===

  /**
   * Tear down and rebuild the round.
   * @param {object|null} replay - A stored best to play back instead of
   *   driving: `{ inputs, checks, spills }`.
   */
  newRound(replay = null) {
    const { game } = this;

    this.playback?.stop();
    this.playback = null;
    for (const cancel of this.timers) cancel.cancel?.();
    this.timers = [];
    for (const entity of this.roundEntities) {
      game.entities.delete(entity);
      game.physics.remove(entity.body);
      entity.destroy?.();
    }
    this.roundEntities = [];
    this.ghost.stop();
    // A fresh physics world per round. Removing and re-adding bodies leaves
    // Rapier's internal state behind, and a replay in a world that has
    // already run a round drifts from the lap it reproduces. What the
    // scene keeps across rounds — the road, this director — goes back in.
    game.physics.reset();
    for (const entity of game.entities) game.physics.add(entity.body);
    this.#buildWalls();

    this.mode = 'countdown';
    this.roundSpills = (replay ? replay.spills : this.spills).map((spill) => ({ ...spill }));
    this.roundFrames = [];
    this.activeCar = (replay?.car && CARS.find((car) => car.id === replay.car)) || this.carSpec;
    this.lapStartStep = null;
    this.nextCheckpoint = 0;
    this.lapFrames = [];
    this.wrongWayFor = 0;

    // Hold the wheel until the green light: an empty snapshot source means
    // the simulation sees no keys, in live rounds and replays alike.
    game.input.setSnapshotSource(() => null);

    this.#buildProps(this.roundSpills);
    this.#spawnCar();

    const beep = (n) => () => {
      this.announce(n > 0 ? String(n) : 'GO', n > 0);
      this.game.soundManager.playSound(n > 0 ? 'count' : 'go');
      if (n === 0) this.#greenLight(replay);
    };
    for (let n = 3; n >= 0; n--) {
      this.timers.push(game.time.after(this.countdownSeconds - 0.2 - n, beep(n)));
    }
  }

  /** The barriers: a static box per wall piece, into the fresh world. */
  #buildWalls() {
    for (const wall of this.track.walls) {
      this.game.physics.add(this.game.physics.createBox({
        x: wall.x, y: wall.y,
        width: wall.length, height: WALL_THICKNESS,
        angle: wall.angle, bodyType: 'static',
        friction: 0.05, restitution: 0.4
      }));
    }
  }

  #greenLight(replay) {
    const game = this.game;
    // The personal-best ghost sets off with you, every round it exists.
    if (this.best?.ghost?.length) this.ghost.start(this.best.ghost);
    if (replay) {
      this.mode = 'replay';
      this.playback = new Player(game, replay.inputs, replay.checks);
      this.playback.car = this.car;
      this.announce('REPLAY · the recording is driving', true);
    } else {
      this.mode = 'live';
      game.input.setSnapshotSource(null);
      this.recorder = new Recorder(game, this.car);
    }
  }

  #spawnCar() {
    const { game, track } = this;
    const scene = game.sceneManager.getCurrentScene();
    // On the grid, one car-length short of the line: the lap arms the
    // moment the nose crosses it.
    const pose = track.pose(1 - 90 / track.length, 0);
    const body = game.physics.createBox({
      x: pose.x, y: pose.y,
      width: CAR.bodyLength, height: CAR.bodyWidth,   // long side along +x
      angle: pose.angle,
      friction: 0.1, frictionAir: 0, restitution: 0.25, density: 0.004
    });
    this.car = new RaceCar(body, null, game, {
      image: this.art[this.activeCar?.sprite ?? 'carBlue'] ?? Object.values(this.art)[0],
      track, marks: marksFor(scene),
      control: this.activeCar?.control ?? {},
      roadGrip: this.roadGrip,
      // The boost shows itself: a flash the scene's post binding reads,
      // the streaks and the exhaust. No caption.
      onBoost: () => { this.flash = 1; }
    });
    this.#add(this.car);
  }

  #add(entity) {
    this.game.entities.add(entity);
    this.game.physics.add(entity.body);
    this.roundEntities.push(entity);
    return entity;
  }

  /**
   * The round's props: the objects of the scene's `props` layer, built
   * again from the file, plus every slick the session has spilled.
   *
   * Materialising the scene's own objects is what keeps the editor and
   * the race honest with each other — move a cone in the editor and the
   * next round starts with it moved.
   */
  #buildProps(spills) {
    const scene = this.game.sceneManager.getCurrentScene();
    const props = scene?.config.layers?.find((layer) => layer.name === PROPS_LAYER);
    for (const object of props?.objects ?? []) {
      const entity = scene.materializeObject(object);
      if (!entity) continue;
      this.roundEntities.push(entity);
      if (entity.name === 'Checkpoint') {
        entity.onCross = entity.finish ? () => this.#crossFinish() : (index) => this.#crossCheckpoint(index);
      } else if (entity.name === 'Barrel') {
        entity.onSpill = (spill) => this.#spill(spill);
      }
    }
    for (const spill of spills) this.#slick(spill);
  }

  /** A slick on the road: an oil prefab of the scene's, where the spill is. */
  #slick(spill) {
    const scene = this.game.sceneManager.getCurrentScene();
    const entity = scene?.spawnPrefab('oil', {
      x: spill.x, y: spill.y, angle: spill.angle ?? 0,
      width: spill.radius * 1.6, height: spill.radius * 1.6,
      properties: { radius: spill.radius }
    });
    if (entity) this.roundEntities.push(entity);
    return entity;
  }

  /**
   * A barrel has toppled. A live round dirties the track for the rest of
   * the session; a replay's spills belong to the round being replayed.
   */
  #spill(spill) {
    if (this.mode === 'live') this.spills.push(spill);
    this.roundSpills.push(spill);
    this.#slick(spill);
  }

  // === Lap logic ===

  #crossCheckpoint(index) {
    if (this.lapStartStep === null) return;
    if (index === this.nextCheckpoint) {
      this.nextCheckpoint++;
      this.game.soundManager.playSound('checkpoint');
      const split = this.ticksToSeconds(this.lapTicks);
      this.announce(`checkpoint ${index + 1} · ${split.toFixed(2)}s`);
    }
  }

  #crossFinish() {
    const steps = this.game.time.steps;
    if (this.lapStartStep === null) {
      this.lapStartStep = steps;
      this.lapFrames = [];
      this.nextCheckpoint = 0;
      this.announce('lap armed — go');
      return;
    }
    if (this.nextCheckpoint < this.checkpoints) return; // shortcut or spin

    const ticks = steps - this.lapStartStep;
    this.lastLapTicks = ticks;
    const seconds = this.ticksToSeconds(ticks);
    this.game.soundManager.playSound('lap');

    const isBest = this.mode === 'live' && (!this.best || ticks < this.best.lapTicks);
    if (isBest) {
      this.best = {
        lapTicks: ticks,
        lapStart: this.recorder.inputs.length - ticks,
        lapEnd: this.recorder.inputs.length,
        inputs: this.recorder.inputs.slice(),
        checks: this.recorder.checks.slice(),
        spills: this.roundSpills.map((spill) => ({ ...spill })),
        car: this.carSpec?.id ?? 'balanced',
        // The ghost is the whole round from the green light, so it sets off
        // alongside the player next time rather than waiting for the line.
        ghost: this.roundFrames.slice()
      };
      saveBest(this.circuit, this.best);
      this.announce(`★ best lap ${seconds.toFixed(2)}s — Enter replays it`, true);
    } else {
      this.announce(`lap ${seconds.toFixed(2)}s`, true);
    }

    // The next lap is already running (flying start).
    this.lapStartStep = steps;
    this.nextCheckpoint = 0;
    this.lapFrames = [];
  }

  // === Per-tick and per-frame work ===

  /**
   * The first tick sets the circuit up — by then the scene's objects
   * stand and its road path resolves — and every tick after it runs the
   * round.
   */
  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    if (!this.track) this.#begin();
    if (!this.car || this.car.dead) return;

    if (this.mode === 'live' && this.recorder) {
      this.recorder.tick();
      const pos = this.car.body.position;
      this.roundFrames.push(pos.x, pos.y, this.car.body.angle);
    }
    if (this.mode === 'replay' && this.playback) {
      this.playback.tick();
      if (this.playback.done) {
        this.mode = 'done';
        this.lastVerdict = this.playback.verdict;
        this.announce(this.playback.verdict, true);
        this.playback.stop();
        this.playback = null;
        this.timers.push(this.game.time.after(3, () => this.newRound()));
      }
    }
    this.ghost.tick();
    // The boost flash fades; the scene's post binding reads it.
    this.flash = Math.max(0, this.flash - dt * 3);

    // Wrong-way: velocity against the track's direction for a while.
    const velocity = this.car.body.velocity;
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed > 80 && this.mode === 'live') {
      const sample = this.track.samples[this.track.nearest(this.car.body.position.x, this.car.body.position.y)];
      const along = velocity.x * sample.tx + velocity.y * sample.ty;
      this.wrongWayFor = along < 0 ? this.wrongWayFor + this.game.time.fixedTimestep : 0;
    } else {
      this.wrongWayFor = 0;
    }
  }

  /**
   * Replay the best round — or, before a lap has ever been scored, the
   * round driven so far: an instant replay of whatever just happened,
   * cones and all.
   */
  startReplay() {
    if (this.mode === 'replay') {
      this.newRound();
      return;
    }
    if (this.best) {
      this.newRound(this.best);
      return;
    }
    if (this.recorder && this.recorder.inputs.length > 60) {
      this.newRound({
        inputs: this.recorder.inputs.slice(),
        checks: this.recorder.checks.slice(),
        spills: this.roundSpills
      });
      return;
    }
    this.announce('nothing to replay yet');
  }

  /**
   * Set the circuit up: the track off the scene's road path, the best lap
   * from storage, the camera on a point ahead of the car, the director
   * keys, and the first round.
   */
  #begin() {
    const game = this.game;
    const scene = game.sceneManager.getCurrentScene();
    this.track = trackFor(scene, this.roadPath);
    this.best = loadBest(this.circuit);

    // Follow a point ahead of the car, so the road coming at you is on
    // screen rather than behind the bumper.
    const director = this;
    game.camera.follow({
      body: {
        get renderPosition() {
          const car = director.car;
          if (!car) return { x: 0, y: 0 };
          const pos = car.renderPosition;
          const velocity = car.body.velocity;
          const speed = Math.hypot(velocity.x, velocity.y) || 1;
          const reach = Math.min(240, speed * 0.42);
          return { x: pos.x + (velocity.x / speed) * reach, y: pos.y + (velocity.y / speed) * reach };
        }
      }
    });

    this.stopListening = game.input.on('keydown', (event) => {
      const does = (action) => game.actions.codes(action).includes(event.code);
      if (does('restart')) this.newRound();
      else if (does('replay')) this.startReplay();
      else if (does('menu')) game.sceneManager.switchTo('mainMenu');
      else return;
      event.consume();
    });

    this.newRound();
    const start = this.car.body.position;
    game.camera.x = start.x;
    game.camera.y = start.y;
  }

  destroy() {
    super.destroy();
    this.stopListening?.();
    this.playback?.stop();
    this.game.input.setSnapshotSource(null);
  }
}
