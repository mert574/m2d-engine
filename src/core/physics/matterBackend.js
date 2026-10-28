import Matter from 'matter-js';
import { PhysicsWorldBase } from './worldBase.js';

/**
 * Matter.js backend for the physics contract described in ./index.js.
 *
 * This is the only module in the engine allowed to import matter-js. Every
 * other file goes through `PhysicsWorld` and `PhysicsBody`, so swapping in a
 * different solver means writing a sibling of this file and changing the
 * factory in ./index.js — nothing else.
 *
 * The contract speaks px/second; Matter speaks px per 1/60s reference frame.
 * All conversion happens here, at the boundary, so no Matter unit ever
 * reaches game code.
 */

/**
 * Back-pointer from a native Matter body to its wrapper. A Symbol so it cannot
 * collide with Matter's own fields. A backend whose bodies are opaque handles
 * (Rapier) would keep a `handle -> wrapper` Map here instead; the rest of the
 * engine never sees the difference.
 */
const WRAPPER = Symbol('m2d.physicsBody');

/**
 * Matter velocities are "px per 1/60s frame" (delta-normalized since 0.20, so
 * this holds at any timestep); the contract is px/second. Divide going in,
 * multiply coming out.
 */
const VELOCITY_SCALE = 60;

/**
 * Matter gravity of `{y: 1, scale: 0.001}` accelerates at ~1000 px/s²
 * (measured; delta-normalized like velocity). Setting scale to 1e-6 makes the
 * gravity vector read directly in px/s², so the contract value passes through.
 */
const GRAVITY_SCALE = 1e-6;

/** Material properties that pass through to the backend body unchanged. */
const MATERIAL_DEFAULTS = {
  friction: 0.1,
  frictionStatic: 0.5,
  frictionAir: 0.01,
  restitution: 0
};

function materialOptions(options) {
  const material = {};
  for (const key of Object.keys(MATERIAL_DEFAULTS)) {
    if (options[key] !== undefined) material[key] = options[key];
  }
  if (options.density !== undefined) material.density = options.density;
  return material;
}

function filterOptions(options) {
  const filter = {};
  if (options.category !== undefined) filter.category = options.category;
  if (options.mask !== undefined) filter.mask = options.mask;
  if (options.group !== undefined) filter.group = options.group;
  return Object.keys(filter).length ? { collisionFilter: filter } : {};
}

/**
 * A rigid body, independent of the solver that owns it.
 *
 * Position/velocity/angle are exposed as plain getters so call sites read the
 * same way they did against raw Matter bodies, but every *mutation* goes
 * through a named method. That asymmetry is deliberate: assignment has no
 * equivalent in a backend where bodies live behind a WASM boundary, whereas a
 * method call always does.
 */
export class PhysicsBody {
  constructor(native, { width, height, shape, world = null }) {
    this.native = native;
    this.shape = shape;
    this.width = width;
    this.height = height;
    this.world = world;
    native[WRAPPER] = this;

    /**
     * The transform as of the start of the current step, for render
     * interpolation. See `renderPosition`.
     */
    this.previous = { x: native.position.x, y: native.position.y, angle: native.angle };

    /**
     * The Entity this body belongs to, or null for bodies with no entity
     * (an attack's hit circle). Set by Entity's constructor; collision
     * callbacks and queries hand back bodies, and this is how game code gets
     * from one to the other.
     * @type {import('../entity.js').Entity|null}
     */
    this.entity = null;
  }

  /** @returns {{x: number, y: number}} Centre of mass, world coordinates. */
  get position() {
    return this.native.position;
  }

  /**
   * Where to *draw* this body: its position blended between the last two
   * solver steps by how far the current frame sits between them.
   *
   * The solver runs at a fixed rate, so on a display faster than that rate
   * several frames share one physics position and motion visibly stair-steps.
   * Interpolating removes the stepping without touching the simulation, at
   * the cost of drawing up to one step behind the latest state.
   *
   * Use this for rendering and `position` for logic — collision checks, AI
   * and queries all want the true current state.
   * @returns {{x: number, y: number}}
   */
  get renderPosition() {
    const alpha = this.world?.interpolation ?? 1;
    if (alpha >= 1) return this.native.position;

    const { x, y } = this.native.position;
    return {
      x: this.previous.x + (x - this.previous.x) * alpha,
      y: this.previous.y + (y - this.previous.y) * alpha
    };
  }

  /**
   * The body's bounds shifted to its drawn position, for annotations that
   * anchor to an edge or corner — health bars, debug boxes, labels. Using the
   * raw `bounds` for those makes them swim against the sprite, which reads
   * worse than the stair-stepping interpolation removes, because the error is
   * relative to something else on screen rather than absolute.
   * @returns {{min: {x, y}, max: {x, y}}}
   */
  get renderBounds() {
    const bounds = this.bounds;
    const alpha = this.world?.interpolation ?? 1;
    if (alpha >= 1) return bounds;

    const drawn = this.renderPosition;
    const dx = drawn.x - this.native.position.x;
    const dy = drawn.y - this.native.position.y;
    return {
      min: { x: bounds.min.x + dx, y: bounds.min.y + dy },
      max: { x: bounds.max.x + dx, y: bounds.max.y + dy }
    };
  }

  /** The angle to draw this body at. See `renderPosition`. */
  get renderAngle() {
    const alpha = this.world?.interpolation ?? 1;
    if (alpha >= 1) return this.native.angle;

    return this.previous.angle + (this.native.angle - this.previous.angle) * alpha;
  }

  /**
   * Record the current transform as the interpolation baseline. Called by the
   * world before each step, and whenever the body is moved directly — a
   * teleport has no "in between" worth drawing.
   */
  syncInterpolation() {
    this.previous.x = this.native.position.x;
    this.previous.y = this.native.position.y;
    this.previous.angle = this.native.angle;
  }

  /** @returns {{x: number, y: number}} Velocity in px/second. */
  get velocity() {
    const { x, y } = this.native.velocity;
    return { x: x * VELOCITY_SCALE, y: y * VELOCITY_SCALE };
  }

  /** @returns {number} Rotation in radians. */
  get angle() {
    return this.native.angle;
  }

  /**
   * Tight axis-aligned world bounds, derived from the body's vertices so
   * rotation is accounted for.
   *
   * Deliberately *not* Matter's `body.bounds`, which is a broadphase box
   * extended along the velocity vector: a moving body reports bounds wider
   * than it is, which stretches anything drawn from them and inflates any
   * half-width computed from them. Other backends report a tight AABB, so
   * tight is what this contract promises.
   * @returns {{min: {x, y}, max: {x, y}}}
   */
  get bounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const vertex of this.native.vertices) {
      if (vertex.x < minX) minX = vertex.x;
      if (vertex.y < minY) minY = vertex.y;
      if (vertex.x > maxX) maxX = vertex.x;
      if (vertex.y > maxY) maxY = vertex.y;
    }

    return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
  }

  /** @returns {{x: number, y: number}} The size the body was created at. */
  get size() {
    return { x: this.width, y: this.height };
  }

  get isStatic() {
    return this.native.isStatic;
  }

  /**
   * Static bodies are immovable and have infinite mass. Routed through
   * `Body.setStatic` rather than assigning the flag, because the flag alone
   * leaves the body with a finite inverse mass — it stops falling but can
   * still be shoved by collisions.
   */
  set isStatic(value) {
    Matter.Body.setStatic(this.native, value);
  }

  /** Sensors report collisions but do not resolve them. */
  get isSensor() {
    return this.native.isSensor;
  }

  set isSensor(value) {
    this.native.isSensor = value;
  }

  get friction() { return this.native.friction; }
  set friction(value) { this.native.friction = value; }

  /**
   * Advisory: Matter distinguishes static from kinetic friction; solvers with
   * a single coefficient (Rapier) ignore this and use `friction` alone.
   */
  get frictionStatic() { return this.native.frictionStatic; }
  set frictionStatic(value) { this.native.frictionStatic = value; }

  /** Velocity damping applied every step — Matter's air resistance. */
  get frictionAir() { return this.native.frictionAir; }
  set frictionAir(value) { this.native.frictionAir = value; }

  get restitution() { return this.native.restitution; }
  set restitution(value) { this.native.restitution = value; }

  /**
   * Advisory here: Matter has no continuous collision detection, so a bullet
   * body can still tunnel. Backends with CCD (Rapier) honour the flag.
   */
  get bullet() { return this._bullet ?? false; }
  set bullet(value) { this._bullet = value; }

  /**
   * A snapshot of the body's collision layers. Read-only by construction —
   * mutating the returned object changes nothing; use `setCollisionFilter`.
   * @returns {{category: number, mask: number, group: number}}
   */
  get collisionFilter() {
    const { category, mask, group } = this.native.collisionFilter;
    return { category, mask, group };
  }

  /**
   * Set which collision layers this body belongs to and which it tests
   * against. Omitted fields are left alone.
   * @param {{category?: number, mask?: number, group?: number}} filter
   */
  setCollisionFilter({ category, mask, group } = {}) {
    if (category !== undefined) this.native.collisionFilter.category = category;
    if (mask !== undefined) this.native.collisionFilter.mask = mask;
    if (group !== undefined) this.native.collisionFilter.group = group;
  }

  /** Teleport the body, leaving velocity untouched. */
  setPosition(position) {
    Matter.Body.setPosition(this.native, position);
    this.syncInterpolation();
  }

  /** @param {{x: number, y: number}} velocity - px/second. */
  setVelocity(velocity) {
    Matter.Body.setVelocity(this.native, {
      x: velocity.x / VELOCITY_SCALE,
      y: velocity.y / VELOCITY_SCALE
    });
  }

  setAngle(angle) {
    Matter.Body.setAngle(this.native, angle);
    this.syncInterpolation();
  }

  setMass(mass) {
    Matter.Body.setMass(this.native, mass);
  }

  /** Move by a delta, preserving the body's current velocity. */
  translate(delta) {
    Matter.Body.translate(this.native, delta);
    this.syncInterpolation();
  }

  /**
   * Kick the body: an instantaneous velocity change, in px/second.
   *
   * Deliberately mass-independent — "knock it back at 300 px/s" is what game
   * code means, and it ports across solvers with different force and mass
   * conventions, where a raw force would not. No effect on static bodies.
   * @param {{x: number, y: number}} delta
   */
  applyImpulse(delta) {
    if (this.native.isStatic) return;
    const { x, y } = this.native.velocity;
    Matter.Body.setVelocity(this.native, {
      x: x + delta.x / VELOCITY_SCALE,
      y: y + delta.y / VELOCITY_SCALE
    });
  }
}

/** The wrapper for a native body, for translating backend results back out. */
function wrapperOf(native) {
  return native[WRAPPER] ?? null;
}

export class MatterPhysicsWorld extends PhysicsWorldBase {
  /**
   * @param {object} [options] - PhysicsWorldBase options, plus:
   * @param {{x: number, y: number}} [options.gravity] - px/s².
   */
  constructor(options = {}) {
    super(options);
    this.engine = Matter.Engine.create();
    /** Contract-unit gravity, kept so the getter needs no back-conversion. */
    this.currentGravity = { x: 0, y: 1000 };
    this.setGravity(options.gravity ?? this.currentGravity);
  }

  // === Bodies ===

  /**
   * @param {{x, y, width, height}} spec - Centre and size.
   * @returns {PhysicsBody} Not yet in the world; pass it to `add`.
   */
  createBox({ x, y, width, height, ...options }) {
    const native = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: options.isStatic ?? false,
      isSensor: options.isSensor ?? false,
      ...MATERIAL_DEFAULTS,
      ...materialOptions(options),
      ...filterOptions(options)
    });
    return new PhysicsBody(native, { width, height, shape: 'box', world: this });
  }

  /**
   * @param {{x, y, radius}} spec - Centre and radius.
   * @returns {PhysicsBody} Not yet in the world; pass it to `add`.
   */
  createCircle({ x, y, radius, ...options }) {
    const native = Matter.Bodies.circle(x, y, radius, {
      isStatic: options.isStatic ?? false,
      isSensor: options.isSensor ?? false,
      ...MATERIAL_DEFAULTS,
      ...materialOptions(options),
      ...filterOptions(options)
    });
    return new PhysicsBody(native, {
      width: radius * 2, height: radius * 2, shape: 'circle', world: this
    });
  }

  /** Insert a body into the simulation. */
  add(body) {
    Matter.Composite.add(this.engine.world, body.native);
    return body;
  }

  /** Remove a body from the simulation. The wrapper stays usable. */
  remove(body) {
    Matter.Composite.remove(this.engine.world, body.native);
    return body;
  }

  /** @returns {PhysicsBody[]} Every body currently simulated. */
  get bodies() {
    return Matter.Composite.allBodies(this.engine.world)
      .map(wrapperOf)
      .filter(Boolean);
  }

  // === World state ===

  /**
   * Gravity as an acceleration in px/s². `{x: 0, y: 1000}` reads as "down at
   * 1000 px/s²" — the strength the engine's games were tuned against.
   * @param {{x: number, y: number}} gravity
   */
  setGravity({ x, y }) {
    this.currentGravity = { x, y };
    this.engine.gravity = { x, y, scale: GRAVITY_SCALE };
  }

  /** @returns {{x: number, y: number}} px/s². */
  get gravity() {
    return { ...this.currentGravity };
  }

  /** Remove every body, leaving the world configured but empty. */
  clear() {
    Matter.Composite.clear(this.engine.world);
  }

  /**
   * Drop cached collision state (contact pairs, the broadphase grid) without
   * touching the bodies. Used after repopulating a world, so contacts left
   * over from the previous scene cannot fire against the new one. A backend
   * with no such cache may make this a no-op.
   */
  clearContacts() {
    Matter.Engine.clear(this.engine);
    Matter.Engine.update(this.engine, 0);
  }

  /**
   * Tear the simulation down to a fresh, empty world. Gravity and collision
   * handlers are retained, since they belong to the engine, not the scene.
   */
  reset() {
    Matter.Events.off(this.engine);
    Matter.Composite.clear(this.engine.world);
    Matter.Engine.clear(this.engine);

    this.engine = Matter.Engine.create();
    this.setGravity(this.currentGravity);
    this.accumulator = 0;
    this.bindHandlers();
  }

  /** Release everything. The world is unusable afterwards. */
  destroy() {
    Matter.Events.off(this.engine);
    Matter.Composite.clear(this.engine.world);
    Matter.Engine.clear(this.engine);
    this.handlers = { onStart: null, onEnd: null };
  }

  // === Stepping ===

  /** Run the Matter solver for one step. Called by the base class's step(). */
  stepOnce(dt) {
    Matter.Engine.update(this.engine, dt * 1000);
  }

  // === Collision events ===

  /** Attach the stored handlers to Matter's event system. */
  bindHandlers() {
    Matter.Events.off(this.engine);

    const forward = (callback) => (event) => {
      for (const { bodyA, bodyB } of event.pairs) {
        const a = wrapperOf(bodyA);
        const b = wrapperOf(bodyB);
        if (a && b) callback(a, b);
      }
    };

    if (this.handlers.onStart) {
      Matter.Events.on(this.engine, 'collisionStart', forward(this.handlers.onStart));
    }
    if (this.handlers.onEnd) {
      Matter.Events.on(this.engine, 'collisionEnd', forward(this.handlers.onEnd));
    }
  }

  // === Queries ===

  /**
   * Bodies currently overlapping `body`.
   * @param {PhysicsBody} body
   * @param {(other: PhysicsBody) => boolean} [filter] - Narrows the candidates
   *   *before* the overlap test, so it is a cost saver as well as a filter.
   * @returns {PhysicsBody[]} The others, never `body` itself.
   */
  contactsWith(body, filter) {
    const candidates = Matter.Composite.allBodies(this.engine.world).filter((native) => {
      if (native === body.native) return false;
      if (!filter) return true;
      const wrapper = wrapperOf(native);
      return wrapper ? filter(wrapper) : false;
    });

    return Matter.Query.collides(body.native, candidates)
      .map(({ bodyA, bodyB }) => wrapperOf(bodyA === body.native ? bodyB : bodyA))
      .filter(Boolean);
  }

  /**
   * Bodies intersecting the segment from `start` to `end`.
   * @param {{x, y}} start
   * @param {{x, y}} end
   * @param {(body: PhysicsBody) => boolean} [filter]
   * @returns {PhysicsBody[]} Hits, unordered — this answers "is anything in
   *   the way", not "what is nearest".
   */
  raycast(start, end, filter) {
    const candidates = Matter.Composite.allBodies(this.engine.world).filter((native) => {
      if (!filter) return true;
      const wrapper = wrapperOf(native);
      return wrapper ? filter(wrapper) : false;
    });

    return Matter.Query.ray(candidates, start, end)
      .map((collision) => wrapperOf(collision.body ?? collision.bodyA))
      .filter(Boolean);
  }
}
