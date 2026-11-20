import { Constraint } from '../core/constraint.js';
import { s } from '../core/schema.ts';
import { Vec2 } from '../core/math.ts';
import { groundCircle } from '../core/ui/worldOverlay.ts';

/**
 * Enemy movement: chase the nearest player while one is within range,
 * otherwise wander between random points near home. "The player" is any
 * of `game.players.avatars`: alone that is `game.player`; on a server it
 * is every connected player's avatar. Movement pauses while the
 * entity's `contactDamage` constraint reports it stunned, so a knockback
 * can play out instead of being immediately steered against.
 *
 * With a navmesh loaded (see core/nav/nav.js) the hunt routes around the
 * walls: the path is asked for again every `repath` seconds while the
 * quarry strays from its end, and its corners are plain fields a snapshot
 * carries. An unreachable quarry is seeked straight, as ever. With
 * `separation` set, nearby fellow chasers push the heading apart, so a
 * pack arrives as a half-circle instead of a stack.
 *
 * In a 3D scene the hunt walks the (x, z) ground plane and leaves the
 * body its vertical speed, so it still falls while it closes in.
 *
 * In debug view it draws its own working state — detection radius, the
 * current wander target, the route and the pursuit line — through the
 * world overlay.
 *
 * @param {object} options
 * @param {number} [options.speed] - Pursuit speed, px/s.
 * @param {number} [options.idleSpeed] - Wander speed, px/s.
 * @param {number} [options.detectionRange] - Pursuit radius, px.
 * @param {number} [options.wanderRadius] - How far a wander target may land
 *   from the current position, px.
 * @param {number} [options.wanderInterval] - Seconds between wander targets.
 * @param {string} [options.agent] - The nav agent profile to route as; the
 *   project's only one when unset.
 * @param {number} [options.repath] - Seconds between route refreshes while
 *   the quarry moves.
 * @param {number} [options.separation] - Keep this far from fellow chasers,
 *   px; 0 (the default) steers alone.
 */
export class Chase extends Constraint {
  static description = 'Chase the nearest player while one is in range, routed over the navmesh when the scene has one, else wander or stand';
  /** Its debug drawing handles 3D itself, so the 3D frame runs it too. */
  static draws3D = true;
  static params = {
    speed: s.number({ initial: 60, positive: true, unit: 'px/s', label: 'Pursuit speed' }),
    idleSpeed: s.number({ positive: true, unit: 'px/s', label: 'Wander speed', description: 'Defaults to 60% of speed' }),
    detectionRange: s.number({ initial: 400, positive: true, unit: 'px' }),
    wanderRadius: s.number({ initial: 50, positive: true, unit: 'px' }),
    wanderInterval: s.number({ initial: 2, positive: true, unit: 's' }),
    agent: s.ref('navAgent', { label: 'Nav agent', description: "The agent profile the route is asked for (m2d.project.json navAgents); the only one when unset" }),
    repath: s.number({ initial: 0.4, positive: true, unit: 's', description: 'How often the route is asked for again while the quarry moves' }),
    separation: s.number({ initial: 0, min: 0, unit: 'px', description: 'Keep this far from fellow chasers; 0 steers alone' })
  };

  constructor(entity, options = {}) {
    super(entity);
    this.speed = options.speed ?? 60;
    this.idleSpeed = options.idleSpeed ?? this.speed * 0.6;
    this.idleSpeedSet = options.idleSpeed !== undefined;
    this.detectionRange = options.detectionRange ?? 400;
    this.wanderRadius = options.wanderRadius ?? 50;
    this.wanderInterval = options.wanderInterval ?? 2;
    this.agent = options.agent;
    this.repath = options.repath ?? 0.4;
    this.separation = options.separation ?? 0;

    this.wanderTime = 0;
    this.target = this.#newWanderTarget();
    /** The route's corners while the hunt goes around a wall. @type {{x: number, y: number}[]|null} */
    this.path = null;
    /** How far along `path` the hunt is. */
    this.waypoint = 0;
    /** Seconds since the route was asked for. */
    this.repathTime = 0;
  }

  /**
   * `idleSpeed` follows `speed` unless it was set explicitly, so a scene
   * that retunes `speed` alone does not leave a stale `idleSpeed` behind.
   */
  configure(params) {
    super.configure(params);
    if (params.idleSpeed !== undefined) this.idleSpeedSet = true;
    else if (params.speed !== undefined && !this.idleSpeedSet) this.idleSpeed = this.speed * 0.6;
  }

  /** Whether this game's ground plane is (x, z): a 3D scene. */
  get #solid() {
    return (this.entity.game.options.dimensions ?? 2) === 3;
  }

  /** A point's ground coordinates: (x, y) flat, (x, z) in 3D. */
  #ground(point) {
    return { x: point.x, y: this.#solid ? (point.z ?? 0) : point.y };
  }

  #groundDistance(a, b) {
    const ga = this.#ground(a);
    const gb = this.#ground(b);
    return Math.hypot(gb.x - ga.x, gb.y - ga.y);
  }

  /** Walk the ground at `speed` along the unit ground direction. */
  #setGroundVelocity(dir, speed) {
    const body = this.entity.body;
    body.setVelocity(this.#solid
      ? { x: dir.x * speed, y: body.velocity.y, z: dir.y * speed }
      : { x: dir.x * speed, y: dir.y * speed });
  }

  #newWanderTarget() {
    const r = this.wanderRadius;
    const position = this.entity.position;
    // Seeded: a wander target is simulation state, and a restart with the
    // same seed has to pick the same one.
    const rng = this.entity.game.rng;
    const dx = rng.range(-r, r);
    const dy = rng.range(-r, r);
    return this.#solid
      ? { x: position.x + dx, y: position.y, z: (position.z ?? 0) + dy }
      : { x: position.x + dx, y: position.y + dy };
  }

  /**
   * The avatar to hunt: the nearest one inside the detection range, or
   * null. A hunt that holds a route keeps its quarry out to twice the
   * range — a detour around a wall walks away from the quarry before it
   * closes in, and giving up at the range line would pace the detour's
   * mouth forever.
   */
  #quarry() {
    const { entity } = this;
    const reach = this.path ? this.detectionRange * 2 : this.detectionRange;
    const quarry = entity.game.players.nearestAvatar(entity.position, this.#solid ? Infinity : reach);
    // Strictly inside the range, on the ground plane — nearestAvatar's own
    // (x, y) cut cannot judge that in 3D.
    return quarry && this.#groundDistance(entity.position, quarry.position) < reach ? quarry : null;
  }

  /**
   * Where the hunt heads this tick: straight at the quarry, or the next
   * corner of a route the navmesh gave. The route is refreshed every
   * `repath` seconds while the quarry has strayed from its end, so a pack
   * does not ask every tick; an unreachable quarry clears it and the
   * straight seek stands, which is what a wall-bumping mob always did.
   */
  #huntTarget(quarry, dt) {
    const { entity } = this;
    const nav = entity.game.nav;
    if (!nav?.has(this.agent)) return quarry.position;

    this.repathTime += dt;
    const end = this.path?.[this.path.length - 1];
    const strayed = !end || this.#groundDistance(end, quarry.position) > this.#arrive() * 2;
    // Once the repath clock has run out, also stale: a route a moving
    // obstacle rolled onto, even while the quarry stands still.
    const blocked = this.path && this.repathTime >= this.repath
      && nav.routeBlocked([entity.position, ...this.path.slice(this.waypoint)]);
    if (!this.path || (this.repathTime >= this.repath && (strayed || blocked))) {
      this.repathTime = 0;
      const route = nav.findPath(entity.position, quarry.position, { agent: this.agent });
      if (route) {
        this.path = route.points;
        this.waypoint = 1;
      } else {
        this.path = null;
      }
    }
    if (!this.path) return quarry.position;
    const arrive = this.#arrive();
    while (this.waypoint < this.path.length - 1
      && this.#groundDistance(entity.position, this.path[this.waypoint]) <= arrive) {
      this.waypoint++;
    }
    return this.path[Math.min(this.waypoint, this.path.length - 1)];
  }

  /**
   * How close a corner is "reached": the body's own radius, at least a
   * step — a step being 8 px flat and a quarter metre in 3D, where 8 of
   * the world's units would swallow whole corners.
   */
  #arrive() {
    const size = this.entity.body.size;
    const half = Math.max(size.x, this.#solid ? (size.z ?? size.x) : size.y) / 2;
    return Math.max(this.#solid ? 0.25 : 8, half);
  }

  /**
   * A push apart from fellow chasers within `separation`, strongest when
   * overlapping: what keeps a pack from arriving as one stack. Fellow
   * chasers are entities carrying a Chase, read in entity order, so the
   * push is the same on every run.
   */
  #separationPush() {
    const { entity } = this;
    if (!this.separation) return { x: 0, y: 0 };
    const push = { x: 0, y: 0 };
    const mine = this.#ground(entity.position);
    for (const other of entity.game.entities) {
      if (other === entity || other.dead || !other.getConstraint?.('chase')) continue;
      const theirs = this.#ground(other.position);
      const dx = mine.x - theirs.x;
      const dy = mine.y - theirs.y;
      const distance = Math.hypot(dx, dy);
      if (!distance || distance >= this.separation) continue;
      // Up to three times the pursuit pull when overlapping, so inside the
      // ring the push wins and the pack spreads instead of pressing in.
      const weight = 3 * (this.separation - distance) / this.separation / distance;
      push.x += dx * weight;
      push.y += dy * weight;
    }
    return push;
  }

  fixedUpdate(dt) {
    const { entity } = this;
    if (entity.getConstraint('contactDamage')?.isStunned()) return;

    const quarry = this.#quarry();
    if (quarry) {
      const target = this.#huntTarget(quarry, dt);
      const dir = Vec2.normalize(Vec2.direction(this.#ground(entity.position), this.#ground(target)));
      const push = this.#separationPush();
      const heading = Vec2.normalize({ x: dir.x + push.x, y: dir.y + push.y });
      this.#setGroundVelocity(heading.x || heading.y ? heading : dir, this.speed);
      return;
    }
    if (this.path) {
      this.path = null;
      this.waypoint = 0;
      this.repathTime = 0;
    }

    this.wanderTime += dt;
    if (this.wanderTime >= this.wanderInterval) {
      this.target = this.#newWanderTarget();
      this.wanderTime = 0;
    }
    // "There" is within a step, which is not one px in a metre world.
    if (this.#groundDistance(entity.position, this.target) > (this.#solid ? 0.1 : 1)) {
      const dir = Vec2.direction(this.#ground(entity.position), this.#ground(this.target));
      this.#setGroundVelocity(Vec2.normalize(dir), this.idleSpeed);
    }
  }

  draw() {
    const { entity } = this;
    if (!entity.game.renderer.isDebugEnabled()) return;

    // Annotations on top of the game, so they go to the world overlay:
    // world coordinates and sizes, rasterized at display resolution. The
    // 3-unit target dot in particular would vanish at a low render
    // resolution if it were drawn into the world surface. In 3D everything
    // lies on the ground, lifted a hair above the floor.
    const overlay = entity.game.worldOverlay;
    const solid = this.#solid;
    // On the floor, a hair up against z-fighting; body centres are grounded.
    const place = (p) => (solid ? { x: p.x, y: 0.06, z: p.z ?? 0 } : { x: p.x, y: p.y });
    const pos = place(entity.renderPosition);

    if (solid) {
      overlay.drawPath({
        points: groundCircle(pos, this.detectionRange),
        strokeStyle: 'rgba(255, 214, 51, 0.4)', lineWidth: 1
      });
    } else {
      overlay.drawArc({
        x: pos.x, y: pos.y, radius: this.detectionRange,
        startAngle: 0, endAngle: Math.PI * 2,
        strokeStyle: 'rgba(255, 214, 51, 0.4)', lineWidth: 1
      });
    }

    const target = place(this.target);
    overlay.drawArc({
      ...target, radius: 3,
      startAngle: 0, endAngle: Math.PI * 2, fillStyle: '#ffd633',
      ...(solid && { screenRadius: true })
    });
    overlay.drawLine({
      x1: pos.x, y1: pos.y, z1: pos.z, x2: target.x, y2: target.y, z2: target.z,
      strokeStyle: 'rgba(255, 214, 51, 0.4)', lineWidth: 1
    });

    if (!solid) {
      overlay.drawText({
        text: `target: ${this.wanderTime.toFixed(2)}/${this.wanderInterval}`,
        x: entity.renderBounds.min.x,
        y: entity.renderBounds.max.y,
        offsetY: 5,
        fillStyle: '#ff9999',
        fontSize: '12px', fontFamily: 'monospace',
        textAlign: 'left', textBaseline: 'top'
      });
    }

    if (this.path) {
      overlay.drawPath({
        points: [pos, ...this.path.slice(this.waypoint).map(place)],
        strokeStyle: 'rgba(107, 199, 255, 0.6)', lineWidth: 1.5
      });
    }

    const quarry = this.#quarry();
    if (quarry) {
      const player = place(quarry.renderPosition);
      overlay.drawLine({
        x1: pos.x, y1: pos.y, z1: pos.z, x2: player.x, y2: player.y, z2: player.z,
        strokeStyle: 'rgba(255, 107, 107, 0.4)', lineWidth: 1
      });
    }
  }
}
