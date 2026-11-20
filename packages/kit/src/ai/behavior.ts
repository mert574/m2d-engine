import { Constraint, canSee, Angle, type Entity } from 'm2d-engine';
import { s } from 'm2d-engine/schema';
import { groundCircle } from 'm2d-engine/ui';

/** A point, on whichever plane the game runs. */
interface Point {
  x: number;
  y: number;
  z?: number;
}

/** The ladder's rungs. */
export type BehaviorState = 'patrol' | 'alert' | 'telegraph' | 'attack' | 'recover' | 'return';

export interface BehaviorOptions {
  /** How far sight reaches on the ground, px. */
  sightRange?: number;
  /** Width of the view cone, radians; the default 2π sees all around. */
  sightCone?: number;
  /** Collision layers that block sight; unset, static geometry does. */
  sightBlockers?: string[];
  /** Seconds between looks. Sensing on an interval, never every tick. */
  senseInterval?: number;
  /** Seconds without a sighting before the hunt falls back to the last-seen point, and then home. */
  patience?: number;
  /** How far a heard event reaches, px; 0 (the default) is deaf. */
  hearingRange?: number;
  /** Event names that count as noise. */
  hears?: string[];
  /** Ground distance at which the strike is telegraphed; 0 takes the attack's own range. */
  strikeRange?: number;
  /** Seconds stood down after a swing before the hunt resumes. */
  recover?: number;
  /** How far from home the hunt may go, px; 0 is unleashed. */
  leash?: number;
  /** The behaviour's own walking speed (to a noise, the last-seen point, home), px/s. */
  speed?: number;
  /** The wander's pace, px/s; defaults to 60% of speed. */
  idleSpeed?: number;
  /** With no patrol path: wander this far around home, px; 0 stands still. */
  wander?: number;
  /** Seconds between wander targets. */
  wanderInterval?: number;
  /** The nav agent profile the behaviour's own walks route as. */
  agent?: string;
  /** The visible tell over its head on a state change; on unless turned off. */
  tell?: boolean;
}

/** Seconds of no headway before a walk asks for its route again. */
const STALL = 0.5;

/**
 * The NPC ladder — patrol, alert, telegraph, attack, recover, return — as
 * one constraint over the engine's capabilities, driven entirely by what
 * the NPC honestly senses.
 *
 * It conducts rather than performs. Patrol belongs to a `path` slot
 * (`PathFollow`) or a seeded wander; the hunt to the `chase` slot, routing
 * and pack separation included; the blow to the `attack` slot, whose
 * `windup` is the telegraph. The behaviour owns those slots' `suspended`
 * every tick it runs — a game that must take over (a ward repelling the
 * pack) suspends the behaviour itself, which freezes the arrangement. Its
 * own movement is only the walk to a point it knows — a noise, the
 * last-seen position, home — routed over the navmesh when one is loaded.
 *
 * Alert begins only from a sighting (`canSee`: range, cone, line of sight,
 * on `senseInterval`) or a heard world event within `hearingRange`.
 * Without an `attack` slot the telegraph rungs are skipped and contact
 * damage does the hurting. Every decision is a plain field, so a snapshot
 * mid-telegraph restores and replication carries the ladder to watchers.
 */
export class Behavior extends Constraint {
  static override description = 'The NPC ladder: patrol, alert, telegraph, attack, recover, return — over the chase, path and attack slots, from what is honestly seen and heard';
  static override params = {
    sightRange: s.number({ initial: 300, positive: true, unit: 'px', label: 'Sight range' }),
    sightCone: s.number({ initial: Math.PI * 2, positive: true, unit: 'rad', label: 'Sight cone', description: 'Centred on the way it last moved; 2π sees all around' }),
    sightBlockers: s.array(s.ref('layer'), { label: 'Sight blockers', description: 'Layers that hide the player; unset, static geometry does' }),
    senseInterval: s.number({ initial: 0.2, positive: true, unit: 's' }),
    patience: s.number({ initial: 2, positive: true, unit: 's', description: 'Seconds without a sighting before the hunt falls back to the last-seen point' }),
    hearingRange: s.number({ initial: 0, min: 0, unit: 'px', description: '0 is deaf' }),
    hears: s.array(s.string({ nonEmpty: true }), { description: "Event names that count as noise; 'step' unless set" }),
    strikeRange: s.number({ initial: 0, min: 0, unit: 'px', description: "0 takes the attack slot's own range" }),
    recover: s.number({ initial: 0.5, min: 0, unit: 's' }),
    leash: s.number({ initial: 0, min: 0, unit: 'px', description: 'How far from home the hunt may go; 0 is unleashed' }),
    speed: s.number({ initial: 60, positive: true, unit: 'px/s', description: 'Its own walks: to a noise, the last-seen point, home' }),
    idleSpeed: s.number({ positive: true, unit: 'px/s', label: 'Wander speed', description: 'Defaults to 60% of speed' }),
    wander: s.number({ initial: 0, min: 0, unit: 'px', description: 'With no patrol path: wander this far around home; 0 stands still' }),
    wanderInterval: s.number({ initial: 2, positive: true, unit: 's' }),
    agent: s.ref('navAgent', { label: 'Nav agent', description: "The profile its own walks route as (m2d.project.json navAgents); the only one when unset" }),
    tell: s.boolean({ initial: true, description: 'The tell over its head: ! on alarm, ? giving up — the state ladder made visible in plain play' })
  };

  static override replicated = ['state', 'stateTime', 'lastSeen', 'facing', 'sinceSeen'];

  /** Its debug drawing handles 3D itself, so the 3D frame runs it too. */
  static draws3D = true;

  declare entity: Entity;

  sightRange: number;
  sightCone: number;
  sightBlockers: string[] | null;
  senseInterval: number;
  patience: number;
  hearingRange: number;
  hears: string[];
  strikeRange: number;
  recover: number;
  leash: number;
  speed: number;
  idleSpeed: number;
  idleSpeedSet: boolean;
  wander: number;
  wanderInterval: number;
  agent?: string;
  tell: boolean;

  state: BehaviorState;
  /** Seconds in the current state. */
  stateTime: number;
  /** Where the quarry was last seen or heard, or null. */
  lastSeen: Point | null;
  /** The way it last moved, radians on the ground plane. */
  facing: number;
  /** Where patrol belongs and return ends; captured on the first tick. */
  home: Point | null;
  /** Seconds since the last look. */
  senseTime: number;
  /** Seconds since the quarry was last actually seen. */
  sinceSeen: number;
  /** The heard cursor into `game.events.raised`. */
  heardCount: number;
  /** Its own walk: the route's corners, how far along, and the goal. */
  route: Point[] | null;
  waypoint: number;
  goal: Point | null;
  /** Seconds the walk has made no headway. */
  stalled: number;
  /** Stalls in a row on the same goal, for the corner-wedge escape. */
  stallStrikes: number;
  /** The clock on the obstacle check: is the route still clear? */
  routeWatch: number;
  /** The wander clock and target, seeded like Chase's. */
  wanderTime: number;
  wanderTarget: Point | null;
  /** A refused combination is said once. */
  warned: boolean;

  constructor(entity: Entity, options: BehaviorOptions = {}) {
    super(entity);
    this.sightRange = options.sightRange ?? 300;
    this.sightCone = options.sightCone ?? Math.PI * 2;
    this.sightBlockers = options.sightBlockers ?? null;
    this.senseInterval = options.senseInterval ?? 0.2;
    this.patience = options.patience ?? 2;
    this.hearingRange = options.hearingRange ?? 0;
    this.hears = options.hears ?? ['step'];
    this.strikeRange = options.strikeRange ?? 0;
    this.recover = options.recover ?? 0.5;
    this.leash = options.leash ?? 0;
    this.speed = options.speed ?? 60;
    this.idleSpeed = options.idleSpeed ?? this.speed * 0.6;
    this.idleSpeedSet = options.idleSpeed !== undefined;
    this.wander = options.wander ?? 0;
    this.wanderInterval = options.wanderInterval ?? 2;
    this.agent = options.agent;
    this.tell = options.tell ?? true;

    this.state = 'patrol';
    this.stateTime = 0;
    this.lastSeen = null;
    this.facing = 0;
    this.home = null;
    // Look on the first tick, not an interval in.
    this.senseTime = this.senseInterval;
    this.sinceSeen = Infinity;
    this.heardCount = (entity.game as any).events?.raised ?? 0;
    this.route = null;
    this.waypoint = 0;
    this.goal = null;
    this.stalled = 0;
    this.stallStrikes = 0;
    this.routeWatch = 0;
    this.wanderTime = 0;
    this.wanderTarget = null;
    this.warned = false;

    // Take the slots over from the first tick: a chase constructed before
    // this (the usual actor order) would otherwise get one free shove in
    // before the first drive, nudging the guard and its facing off its post.
    this.#drive(false);
  }

  /** `idleSpeed` follows `speed` unless it was set, as Chase's does. */
  override configure(params: Record<string, unknown>): void {
    super.configure(params);
    if (params.idleSpeed !== undefined) this.idleSpeedSet = true;
    else if (params.speed !== undefined && !this.idleSpeedSet) this.idleSpeed = this.speed * 0.6;
  }

  /** Whether this game's ground plane is (x, z): a 3D scene. */
  get #solid(): boolean {
    return ((this.entity.game as any).options?.dimensions ?? 2) === 3;
  }

  /** A point's ground coordinates: (x, y) flat, (x, z) in 3D. */
  #ground(point: Point): { x: number; y: number } {
    return { x: point.x, y: this.#solid ? (point.z ?? 0) : point.y };
  }

  #groundDistance(a: Point, b: Point): number {
    const ga = this.#ground(a);
    const gb = this.#ground(b);
    return Math.hypot(gb.x - ga.x, gb.y - ga.y);
  }

  /** Whether a point is the guard's business. Unleashed, everything is. */
  #insideLeash(point: Point): boolean {
    return !this.leash || !this.home || this.#groundDistance(this.home, point) <= this.leash;
  }

  #chase() {
    return this.entity.getConstraint('chase') as any;
  }

  #path() {
    return this.entity.getConstraint('path') as any;
  }

  #attack() {
    return this.entity.getConstraint('attack') as any;
  }

  /** The strike's trigger distance: its own, or the attack slot's reach. */
  get #reach(): number {
    return this.strikeRange || (this.#attack()?.range ?? 0);
  }

  /**
   * How close counts as arrived: the body's own radius, at least a step —
   * 8 px flat, a quarter metre in 3D, where 8 world units swallow corners.
   */
  #arrive(): number {
    const size = (this.entity.body as any).size;
    const half = Math.max(size.x, this.#solid ? (size.z ?? size.x) : size.y) / 2;
    return Math.max(this.#solid ? 0.25 : 8, half);
  }

  #halt(): void {
    const body = this.entity.body as any;
    body.setVelocity(this.#solid ? { x: 0, y: body.velocity.y, z: 0 } : { x: 0, y: 0 });
  }

  /** `state`, with the clock reset and the walk forgotten on a change. */
  #enter(state: BehaviorState): void {
    if (this.state === state) return;
    // Patrol resumed after an absence re-anchors a path at its nearest
    // point rather than dragging the body back to where it left off.
    if (state === 'patrol') {
      const path = this.#path();
      if (path) {
        path.route = null;
        path.currentSpeed = 0;
      }
    }
    this.state = state;
    this.stateTime = 0;
    this.goal = null;
    this.route = null;
    this.waypoint = 0;
    this.stalled = 0;
    this.stallStrikes = 0;
    this.routeWatch = 0;
  }

  /**
   * Walk toward a known point: routed over the navmesh when one is loaded
   * for the agent, straight when not, re-asked after half a second of no
   * headway. Returns true when arrived. In 3D the body keeps its vertical
   * speed, so it still falls while it walks.
   */
  #walkTo(target: Point, dt: number, speed: number = this.speed): boolean {
    const game = this.entity.game as any;
    const body = this.entity.body as any;
    const position = this.#ground(this.entity.position as Point);
    const goalMoved = !this.goal || this.#groundDistance(this.goal, target) > this.#arrive();

    if (goalMoved) {
      this.goal = { ...target };
      const nav = game.nav;
      if (nav?.has?.(this.agent)) {
        const routed = nav.findPath(this.entity.position, target, { agent: this.agent });
        this.route = routed ? routed.points : null;
        this.waypoint = this.route ? 1 : 0;
      } else {
        this.route = null;
        this.waypoint = 0;
      }
      this.stalled = 0;
    }

    // A corner is accepted only within a step: accepted at the body's
    // radius it is swallowed from outside the door line, and the turn cuts
    // into the wall's face. Only the final goal gets the generous radius.
    const step = this.#solid ? 0.25 : 8;
    const arrive = this.#arrive();
    while (this.route && this.waypoint < this.route.length - 1) {
      const corner = this.#ground(this.route[this.waypoint]!);
      if (Math.hypot(corner.x - position.x, corner.y - position.y) > step) break;
      this.waypoint++;
    }
    const next = this.#ground(this.route
      ? this.route[Math.min(this.waypoint, this.route.length - 1)]!
      : target);

    const dx = next.x - position.x;
    const dy = next.y - position.y;
    const distance = Math.hypot(dx, dy);
    const last = !this.route || this.waypoint >= this.route.length - 1;
    if (last && distance <= arrive) {
      this.#halt();
      return true;
    }
    if (!distance) return false;

    // A moving obstacle rolled onto the route: stale before it presses
    // against anything. Checked four times a second against the tracked
    // obstacle list; a crossing forgets the goal, and the next tick plans
    // afresh from where it stands.
    if (this.route) {
      this.routeWatch += dt;
      if (this.routeWatch >= 0.25) {
        this.routeWatch = 0;
        if (game.nav?.routeBlocked?.([this.entity.position, ...this.route.slice(this.waypoint)])) {
          this.goal = null;
        }
      }
    }

    // Shoved off the route — a collision, a clipped corner — it asks again
    // from where it actually stands after half a second of no headway. A
    // re-route that stalls again is wedged on a corner the funnel grazes
    // (the route hugs walls at the agent's radius, which a body its own
    // size touches): give that corner up and aim past it, then alternate.
    const velocity = this.#ground(body.velocity as Point);
    if (Math.hypot(velocity.x, velocity.y) < speed * 0.2) {
      this.stalled += dt;
      if (this.stalled >= STALL) {
        this.stalled = 0;
        this.stallStrikes++;
        if (this.stallStrikes % 2 === 0 && this.route && this.waypoint < this.route.length - 1) {
          this.waypoint++;
        } else {
          this.goal = null; // re-route next tick
        }
      }
    } else {
      this.stalled = 0;
      this.stallStrikes = 0;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    body.setVelocity(this.#solid
      ? { x: nx * speed, y: body.velocity.y, z: ny * speed }
      : { x: nx * speed, y: ny * speed });
    return false;
  }

  /** Noise heard this tick: the newest qualifying event's `at`, or null. */
  #heard(): Point | null {
    const game = this.entity.game as any;
    const events = game.events;
    if (!events) return null;
    const raised = events.raised;
    if (raised === this.heardCount) return null;
    const fresh = events.sinceData(this.heardCount);
    this.heardCount = raised;
    if (!this.hearingRange) return null;
    let noise: Point | null = null;
    for (const { name, data } of fresh) {
      if (!this.hears.includes(name)) continue;
      const at = (data as any)?.at;
      if (!at || (data as any).id === (this.entity as any).netId) continue;
      if (this.#groundDistance(this.entity.position as Point, at) > this.hearingRange) continue;
      // Beyond the leash is not its business: investigating it would walk
      // the guard off its post.
      if (this.leash && this.home && this.#groundDistance(this.home, at) > this.leash) continue;
      noise = { ...at };
    }
    return noise;
  }

  /** The way it moves, kept as `facing` and mirrored to `entity.heading`. */
  #face(): void {
    const velocity = this.#ground((this.entity.body as any).velocity as Point);
    if (Math.hypot(velocity.x, velocity.y) < 1) return;
    this.facing = Math.atan2(velocity.y, velocity.x);
    const v = (this.entity.body as any).velocity;
    (this.entity as any).heading = this.#solid ? Math.atan2(v.x, v.z) : this.facing;
  }

  override fixedUpdate(dt: number): void {
    const entity = this.entity;
    if ((entity as any).dead) return;
    const game = entity.game as any;
    if (!this.home) this.home = { ...(entity.position as Point) };
    this.stateTime += dt;
    this.sinceSeen += dt;
    this.#face();

    if (this.strikeRange > 0 && !this.#attack() && !this.warned) {
      this.warned = true;
      console.warn(`M2D kit Behavior: '${(entity as any).name ?? 'entity'}' declares strikeRange with no 'attack' slot; it will never strike`);
    }

    // Look, on the interval.
    const quarry = game.players?.nearestAvatar?.(entity.position) ?? null;
    this.senseTime += dt;
    let seenNow = false;
    if (quarry && this.senseTime >= this.senseInterval - 1e-9) {
      this.senseTime = 0;
      seenNow = canSee(entity, quarry, {
        range: this.sightRange,
        cone: this.sightCone,
        facing: this.facing,
        blockers: this.sightBlockers ?? undefined
      });
      if (seenNow) {
        this.lastSeen = { ...(quarry.position as Point) };
        this.sinceSeen = 0;
      }
    }

    // Listen. A noise refreshes the trail in every state that may act on
    // it; mid-swing it would only re-aim a committed blow.
    const noise = (this.state === 'patrol' || this.state === 'alert' || this.state === 'return')
      ? this.#heard() : null;
    if (noise) this.lastSeen = noise;

    const fresh = this.sinceSeen < this.patience;
    switch (this.state) {
      case 'patrol': {
        // A quarry camped outside the leash is not its business: engaging
        // it would pace the guard at the leash line forever.
        if ((fresh && quarry && this.#insideLeash(quarry.position)) || noise) {
          this.#enter('alert');
          break;
        }
        if (!this.#path()) {
          // Its post: wander around home, or stand — a guard left with a
          // stray velocity (the chase's last shove) would drift forever.
          if (this.wander && this.home) this.#wanderTick(dt);
          else this.#halt();
        }
        break;
      }
      case 'alert': {
        const beyondLeash = this.leash && this.home
          && this.#groundDistance(this.home, entity.position as Point) > this.leash;
        if (beyondLeash) {
          this.#enter('return');
          break;
        }
        const attack = this.#attack();
        if (attack && quarry && fresh
          && this.#groundDistance(entity.position as Point, quarry.position) <= this.#reach
          && attack.currentCooldown <= 0 && !attack.isWindingUp) {
          this.#halt();
          this.facing = Angle.between(entity.position, quarry.position);
          // The pose turns with the aim; the attack itself is 2D-minded,
          // so this rung only runs flat.
          (entity as any).heading = this.facing;
          attack.startAttack(this.facing);
          this.#enter(attack.isWindingUp ? 'telegraph' : 'attack');
          break;
        }
        // The hunt is Chase's while the trail is warm and the quarry in its
        // reach; otherwise the behaviour walks the trail itself.
        const chase = this.#chase();
        const hunting = Boolean(chase && quarry && fresh
          && this.#groundDistance(entity.position as Point, quarry.position) < chase.detectionRange);
        if (!hunting) {
          if (!this.lastSeen || this.#walkTo(this.lastSeen, dt)) {
            // The trail ends here. Nothing seen in `patience`: go home.
            if (!fresh) this.#enter('return');
          }
        }
        this.#drive(hunting);
        return;
      }
      case 'telegraph': {
        this.#halt();
        const attack = this.#attack();
        if (!attack || !attack.isWindingUp) {
          this.#enter(attack?.isAttacking ? 'attack' : 'alert');
        }
        break;
      }
      case 'attack': {
        this.#halt();
        if (!this.#attack()?.isAttacking) this.#enter('recover');
        break;
      }
      case 'recover': {
        this.#halt();
        if (this.stateTime >= this.recover - 1e-9) this.#enter('alert');
        break;
      }
      case 'return': {
        if ((seenNow && quarry && this.#insideLeash(quarry.position)) || noise) {
          this.#enter('alert');
          break;
        }
        if (!this.home || this.#walkTo(this.home, dt)) this.#enter('patrol');
        break;
      }
    }
    this.#drive(false);
  }

  /** A seeded saunter around home, so a pathless guard still looks alive. */
  #wanderTick(dt: number): void {
    this.wanderTime += dt;
    if (!this.wanderTarget || this.wanderTime >= this.wanderInterval) {
      this.wanderTime = 0;
      const rng = (this.entity.game as any).rng;
      const home = this.home as Point;
      const dx = rng.range(-this.wander, this.wander);
      const dy = rng.range(-this.wander, this.wander);
      this.wanderTarget = this.#solid
        ? { x: home.x + dx, y: home.y, z: (home.z ?? 0) + dy }
        : { x: home.x + dx, y: home.y + dy };
    }
    this.#walkTo(this.wanderTarget!, dt, this.idleSpeed);
  }

  /**
   * The one place the cast's `suspended` is written: patrol belongs to the
   * path, the hunt to the chase, and both stand down everywhere else.
   */
  #drive(hunting: boolean): void {
    const chase = this.#chase();
    if (chase) chase.suspended = !hunting;
    const path = this.#path();
    if (path) path.suspended = this.state !== 'patrol';
  }

  /**
   * The tell, in plain play: an exclamation over the head while it is on
   * the hunt — red with the quarry in its senses, amber walking a cold
   * trail — and a grey question mark giving up. Replicated state drives
   * it, so a client shows the same ladder. Under `r_debug` the working
   * state joins it: the view cone and leash on the ground, the last-seen
   * mark, its own route, and the state's name.
   */
  override draw(): void {
    const entity = this.entity as any;
    if (entity.dead) return;
    const game = entity.game;
    const overlay = game.worldOverlay;
    const solid = this.#solid;
    const position = entity.renderPosition;

    if (this.tell && this.state !== 'patrol') {
      const engaged = this.state !== 'return';
      const glyph = engaged ? '!' : '?';
      const colour = !engaged ? 'rgba(158, 170, 184, 0.9)'
        : this.sinceSeen < this.patience ? '#ff5f52' : '#ffb35e';
      // A pop on the switch, settling in a third of a second.
      const pop = Math.max(0, 1 - this.stateTime / 0.35);
      const label = {
        text: glyph, fillStyle: colour,
        fontSize: `${Math.round(16 + 10 * pop)}px`, fontFamily: 'monospace',
        textAlign: 'center', textBaseline: 'bottom'
      };
      if (solid) {
        overlay.drawText({ ...label, x: position.x, y: position.y + entity.size.y * 0.75, z: position.z, offsetY: -4 });
      } else {
        overlay.drawText({ ...label, x: position.x, y: entity.overhead, offsetY: -6 });
      }
    }

    if (!game.renderer.isDebugEnabled()) return;
    const place = (p: Point) => (solid ? { x: p.x, y: 0.08, z: p.z ?? 0 } : { x: p.x, y: p.y });
    const pos = place(position);

    // The view cone: a wedge on the ground around the facing — or the full
    // circle when it sees all around.
    const cone = Math.min(this.sightCone, Math.PI * 2);
    const wedge: Point[] = [];
    const segments = 24;
    const from = this.facing - cone / 2;
    for (let i = 0; i <= segments; i++) {
      const a = from + (i / segments) * cone;
      const dx = Math.cos(a) * this.sightRange;
      const dy = Math.sin(a) * this.sightRange;
      wedge.push(solid ? { x: pos.x + dx, y: 0.08, z: (pos.z ?? 0) + dy } : { x: pos.x + dx, y: pos.y + dy });
    }
    if (cone < Math.PI * 2 - 1e-6) wedge.unshift({ ...pos }), wedge.push({ ...pos });
    overlay.drawPath({ points: wedge, strokeStyle: 'rgba(122, 215, 255, 0.5)', lineWidth: solid ? 2 : 1 });

    if (this.leash && this.home) {
      overlay.drawPath({
        points: groundCircle(place(this.home), this.leash),
        strokeStyle: 'rgba(158, 170, 184, 0.35)', lineWidth: 1
      });
    }

    if (this.lastSeen && this.state !== 'patrol') {
      const seen = place(this.lastSeen);
      const r = solid ? 0.3 : 8;
      const cross = solid
        ? [{ x: seen.x - r, y: seen.y, z: (seen.z ?? 0) - r }, { x: seen.x + r, y: seen.y, z: (seen.z ?? 0) + r },
          { x: seen.x, y: seen.y, z: seen.z }, { x: seen.x - r, y: seen.y, z: (seen.z ?? 0) + r }, { x: seen.x + r, y: seen.y, z: (seen.z ?? 0) - r }]
        : [{ x: seen.x - r, y: seen.y - r }, { x: seen.x + r, y: seen.y + r },
          { x: seen.x, y: seen.y }, { x: seen.x - r, y: seen.y + r }, { x: seen.x + r, y: seen.y - r }];
      overlay.drawPath({ points: cross, strokeStyle: '#ff5f52', lineWidth: solid ? 2 : 1.5 });
    }

    if (this.route) {
      overlay.drawPath({
        points: [pos, ...this.route.slice(this.waypoint).map(place)],
        strokeStyle: 'rgba(255, 179, 94, 0.7)', lineWidth: solid ? 2 : 1.5
      });
    }

    overlay.drawText({
      text: this.state, fillStyle: '#9eeaff',
      fontSize: '11px', fontFamily: 'monospace', textAlign: 'center', textBaseline: 'top',
      ...(solid
        ? { x: position.x, y: position.y + entity.size.y * 0.75, z: position.z, offsetY: 2 }
        : { x: position.x, y: entity.overhead, offsetY: 2 })
    });
  }
}
