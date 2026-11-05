/**
 * The race director: one instance per circuit visit.
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
 */
import {
  RaceCar, GhostCar, TrafficCar, Cone, Barrel, OilSlick, BoostPad, GateArm, Checkpoint, CAR
} from './actors.js';
import { Recorder, Player, saveBest, loadBest } from './replay.js';

/** Ticks of countdown before the inputs go live: 3 · 2 · 1 · GO. */
const COUNTDOWN_SECONDS = 3.2;

/** Session-wide oil: map name -> spills. Survives rounds, not reloads. */
const sessionSpills = new Map();

export class Race {
  /**
   * @param {import('m2d-engine/core/m2d.js').M2D} game
   * @param {object} map - The map definition
   * @param {import('./track.js').Track} track
   * @param {Record<string, HTMLImageElement>} images
   * @param {Array} marks - Shared skid-mark buffer
   * @param {(text: string, sticky?: boolean) => void} announce - HUD line
   * @param {object} [options]
   * @param {object} [options.car] - The chosen car (see cars.js)
   * @param {(label: string) => void} [options.onBoost] - Any boost fired
   * @param {() => void} [options.buildWalls] - Adds the track's static
   *   bodies to the fresh world each round starts with
   */
  constructor(game, map, track, images, marks, announce, options = {}) {
    this.game = game;
    this.map = map;
    this.track = track;
    this.images = images;
    this.marks = marks;
    this.announce = announce;
    this.carSpec = options.car ?? null;
    this.carById = options.carById ?? null;
    /** The car driving this round: the chosen one, or a replay's. */
    this.activeCar = this.carSpec;
    this.onBoost = options.onBoost ?? null;
    this.buildWalls = options.buildWalls ?? null;
    /** Every car pose since the green light, for the PB ghost. */
    this.roundFrames = [];

    this.car = null;
    this.ghost = new GhostCar(game, images);
    this.roundEntities = [];
    this.timers = [];

    /** 'countdown' | 'live' | 'replay' | 'done' */
    this.mode = 'countdown';
    this.recorder = null;
    this.player = null;

    this.best = loadBest(map.name);
    this.lastLapTicks = null;
    this.lapStartStep = null;
    this.nextCheckpoint = 0;
    this.lapFrames = [];
    this.wrongWayFor = 0;

    if (!sessionSpills.has(map.name)) sessionSpills.set(map.name, []);
  }

  get spills() {
    return sessionSpills.get(this.map.name);
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
    const { game, track, map } = this;

    this.player?.stop();
    this.player = null;
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
    // already run a round drifts from the lap it reproduces.
    game.physics.reset();
    this.buildWalls?.();

    this.mode = 'countdown';
    this.roundSpills = (replay ? replay.spills : this.spills).map((spill) => ({ ...spill }));
    this.roundFrames = [];
    this.activeCar = (replay?.car && this.carById?.(replay.car)) || this.carSpec;
    this.lapStartStep = null;
    this.nextCheckpoint = 0;
    this.lapFrames = [];
    this.wrongWayFor = 0;

    // Hold the wheel until the green light: an empty snapshot source means
    // the simulation sees no keys, in live rounds and replays alike.
    game.input.setSnapshotSource(() => null);

    this.#buildProps(replay ? replay.spills : this.spills);
    this.#spawnCar();

    const beep = (n) => () => {
      this.announce(n > 0 ? String(n) : 'GO', n > 0);
      this.game.soundManager.playSound(n > 0 ? 'count' : 'go');
      if (n === 0) this.#greenLight(replay);
    };
    for (let n = 3; n >= 0; n--) {
      this.timers.push(game.time.after(COUNTDOWN_SECONDS - 0.2 - n, beep(n)));
    }
  }

  #greenLight(replay) {
    const game = this.game;
    // The personal-best ghost sets off with you, every round it exists.
    if (this.best?.ghost?.length) this.ghost.start(this.best.ghost);
    if (replay) {
      this.mode = 'replay';
      this.player = new Player(game, replay.inputs, replay.checks);
      this.player.car = this.car;
      this.announce('REPLAY · the recording is driving', true);
    } else {
      this.mode = 'live';
      game.input.setSnapshotSource(null);
      this.recorder = new Recorder(game, this.car);
    }
  }

  #spawnCar() {
    const { game, track } = this;
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
      images: { car: this.images[this.activeCar?.sprite ?? 'carBlue'] ?? this.images.car },
      track, marks: this.marks,
      control: this.activeCar?.control ?? {},
      roadGrip: this.map.theme?.roadGrip ?? 1,
      onBoost: this.onBoost
    });
    this.#add(this.car);
  }

  #add(entity) {
    this.game.entities.add(entity);
    this.game.physics.add(entity.body);
    this.roundEntities.push(entity);
    return entity;
  }

  #buildProps(spills) {
    const { game, track, map, images } = this;
    const sensor = (pose, width, height) => game.physics.createBox({
      x: pose.x, y: pose.y, width, height, angle: pose.angle,
      bodyType: 'static', isSensor: true
    });

    // Boost pads first: everything else draws over them.
    for (const spec of map.props.boosts) {
      const pose = track.pose(spec.t, spec.o);
      const pad = new BoostPad(sensor(pose, 90, 54), null, game, {
        image: images.arrow, direction: pose.angle
      });
      this.#add(pad);
    }

    // Oil: the authored slicks, then everything the session has spilled.
    const slick = (spec) => {
      const body = game.physics.createCircle({
        x: spec.x, y: spec.y, radius: spec.radius * 0.8,
        bodyType: 'static', isSensor: true
      });
      this.#add(new OilSlick(body, null, game, {
        image: images.oil, angle: spec.angle ?? 0, radius: spec.radius
      }));
    };
    for (const spec of map.props.oil) {
      const pose = track.pose(spec.t, spec.o);
      slick({ x: pose.x, y: pose.y, angle: pose.angle, radius: spec.r });
    }
    for (const spill of spills) slick(spill);

    // Checkpoints and the finish line.
    map.checkpoints.forEach((t, index) => {
      const pose = track.pose(t, 0);
      this.#add(new Checkpoint(sensor(pose, 26, pose.width * 2 + 50), null, game, {
        index, onCross: (i) => this.#crossCheckpoint(i)
      }));
    });
    const finish = track.pose(0, 0);
    this.#add(new Checkpoint(sensor(finish, 26, finish.width * 2 + 50), null, game, {
      index: map.checkpoints.length, onCross: () => this.#crossFinish()
    }));

    // Traffic shuttles a stretch of road; gates shuttle across it.
    for (const spec of map.props.traffic) {
      const points = [];
      const step = 140 / track.length;
      for (let t = spec.t0; t <= spec.t1; t += step) {
        const pose = track.pose(t, spec.o);
        points.push({ x: pose.x, y: pose.y });
      }
      const back = points.slice(1, -1).reverse();
      const start = points[0];
      const body = game.physics.createBox({
        x: start.x, y: start.y, width: CAR.bodyLength, height: CAR.bodyWidth,
        friction: 0.2
      });
      this.#add(new TrafficCar(body, null, game, {
        image: images.traffic, points: points.concat(back), speed: spec.speed
      }));
    }
    for (const spec of map.props.gates) {
      const pose = track.pose(spec.t, 0);
      const w = pose.width;
      const across = pose.angle + Math.PI / 2;
      // The beam covers a third of the road and shuttles between the
      // shoulders, so there is always at least a car and a half of room
      // somewhere — the gate costs a line, never the lap.
      const beam = { length: w * 0.7, angle: across };
      const at = (offset) => ({
        x: pose.x + Math.cos(across) * offset,
        y: pose.y + Math.sin(across) * offset
      });
      const travel = w * 0.62;
      const body = game.physics.createBox({
        x: at(-travel).x, y: at(-travel).y,
        width: beam.length, height: 14, angle: across
      });
      this.#add(new GateArm(body, null, game, {
        image: images.gate, beam,
        points: [at(-travel), at(travel)], speed: 90 + w * 0.3
      }));
    }

    // Cones in rows, barrels in clusters.
    for (const row of map.props.cones) {
      for (let i = 0; i < row.n; i++) {
        const t = row.t + (i * row.spacing) / track.length;
        const pose = track.pose(t, row.o);
        const body = game.physics.createBox({
          x: pose.x, y: pose.y, width: 13, height: 13, angle: pose.angle,
          friction: 0.4, frictionAir: 0.06
        });
        this.#add(new Cone(body, null, game, { images }));
      }
    }
    for (const cluster of map.props.barrels) {
      for (let i = 0; i < cluster.n; i++) {
        const pose = track.pose(cluster.t + (i * 30) / track.length, cluster.o);
        const body = game.physics.createCircle({
          x: pose.x, y: pose.y, radius: 11,
          friction: 0.4, frictionAir: 0.05, restitution: 0.3
        });
        this.#add(new Barrel(body, null, game, {
          images, red: i % 2 === 1,
          onSpill: (spill) => {
            // A replayed barrel spills into its own round only; a live one
            // dirties the track for the rest of the session.
            if (this.mode === 'live') this.spills.push(spill);
            const pose2 = { x: spill.x, y: spill.y, angle: spill.angle };
            const body2 = game.physics.createCircle({
              x: pose2.x, y: pose2.y, radius: spill.radius * 0.8,
              bodyType: 'static', isSensor: true
            });
            this.#add(new OilSlick(body2, null, game, {
              image: images.oil, angle: spill.angle, radius: spill.radius
            }));
          }
        }));
      }
    }
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
    if (this.nextCheckpoint < this.map.checkpoints.length) return; // shortcut or spin

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
      saveBest(this.map.name, this.best);
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

  /** From the scene's onFixedUpdate: runs inside the simulation tick. */
  fixedTick() {
    if (!this.car || this.car.dead) return;

    if (this.mode === 'live' && this.recorder) {
      this.recorder.tick();
      const pos = this.car.body.position;
      this.roundFrames.push(pos.x, pos.y, this.car.body.angle);
    }
    if (this.mode === 'replay' && this.player) {
      this.player.tick();
      if (this.player.done) {
        this.mode = 'done';
        this.lastVerdict = this.player.verdict;
        this.announce(this.player.verdict, true);
        this.player.stop();
        this.player = null;
        this.timers.push(this.game.time.after(3, () => this.newRound()));
      }
    }
    this.ghost.tick();

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

  destroy() {
    this.player?.stop();
    this.game.input.setSnapshotSource(null);
  }
}
