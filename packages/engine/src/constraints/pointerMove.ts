import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';
import { s } from '../core/schema.ts';
import { groundCircle } from '../core/ui/worldOverlay.ts';

/** A point either dimension's ground hands around. */
interface Point3ish { x: number; y: number; z?: number }

/** The members of `game.nav` the walk asks; core/nav is JavaScript until phase 6. */
interface NavRoutes {
  has(agent?: string): boolean;
  findPath(from: Point3ish, to: Point3ish, options: { agent?: string; maxLength?: number }): { points: Point3ish[] } | null;
  routeBlocked(points: Point3ish[]): boolean;
}

/**
 * Click to move: a press on the world sets a destination on the ground, and
 * the entity walks there and stops. With a navmesh loaded (the scene's
 * `assets.navmeshes`; see core/nav/nav.js) the walk follows a route around
 * the walls, and a click that cannot be reached — off the mesh, walled in,
 * or further along the route than `maxPathLength` — does nothing at all.
 * Without one, the walk is the straight line it always was.
 *
 * Reads the tick's input snapshot, so the destination is part of the
 * simulation and a replay walks the same way; the route is a pure function
 * of the baked mesh, so it is too. The snapshot's pointer is already in
 * ground coordinates under a projection, so the same code moves an
 * isometric hero and a top-down one; in a 3D scene the ground plane is
 * (x, z) — the pointer ray's landing on the floor — and the body keeps its
 * own vertical speed, so it still falls while it walks. The path is plain
 * points and an index, so a snapshot carries a walk mid-route.
 *
 * In debug view (`r_debug`) it draws the click: the route ahead, and a
 * ring on the destination.
 *
 * `speed` is px/s on the ground, or on screen under a projection with
 * `speedSpace: 'screen'` (the default), so the walk looks the same pace
 * whichever way it heads; `arrive` stops within that distance; `button`
 * is the pointer button as a bit index; `agent` the nav agent profile to
 * route as (the project's only one when unset); `maxPathLength` refuses a
 * longer route; `onArrive` and `onMove(dx, dy)` are bound to the entity.
 */
export class PointerMove extends Constraint {
  static override description = 'Click to move: a press on the world sets a destination to walk to, routed over the navmesh when the scene has one';
  /** Its debug drawing handles 3D itself, so the 3D frame runs it too. */
  static draws3D = true;
  static override params = {
    speed: s.number({ initial: 200, positive: true, unit: 'px/s' }),
    speedSpace: s.enumOf(['screen', 'world'], { initial: 'screen' }),
    arrive: s.number({ initial: 8, min: 0, unit: 'px' }),
    button: s.integer({ initial: 0, min: 0, label: 'Pointer button' }),
    agent: s.ref('navAgent', { label: 'Nav agent', description: "The agent profile the route is asked for (m2d.project.json navAgents); the only one when unset" }),
    maxPathLength: s.number({ positive: true, unit: 'px', label: 'Max path length', description: 'A click whose route is longer than this does nothing' })
  };

  speed: number;
  speedSpace: 'screen' | 'world';
  arrive: number;
  button: number;
  agent: string | undefined;
  maxPathLength: number | undefined;
  onArrive: (() => void) | undefined;
  onMove: ((dx: number, dy: number) => void) | undefined;
  destination: Point3ish | null;
  /** The route's remaining corners when a navmesh routed the walk, oldest first. */
  path: Point3ish[] | null;
  /** How far along `path` the walk is. */
  waypoint: number;
  /** Seconds the walk has made no headway: a collision shoved it off its route. */
  stalled: number;
  /** The clock on the obstacle check: is the route still clear? */
  obstacleWatch: number;

  constructor(entity: Entity, options: {
    speed?: number;
    speedSpace?: 'screen' | 'world';
    arrive?: number;
    button?: number;
    agent?: string;
    maxPathLength?: number;
    onArrive?: () => void;
    onMove?: (dx: number, dy: number) => void;
  } = {}) {
    super(entity);
    this.speed = options.speed ?? 200;
    this.speedSpace = options.speedSpace ?? 'screen';
    this.arrive = options.arrive ?? 8;
    this.button = options.button ?? 0;
    this.agent = options.agent;
    this.maxPathLength = options.maxPathLength;
    this.onArrive = options.onArrive?.bind(entity);
    this.onMove = options.onMove?.bind(entity);
    this.destination = null;
    this.path = null;
    this.waypoint = 0;
    this.stalled = 0;
    this.obstacleWatch = 0;
  }

  /**
   * Walk somewhere from code: routed like a click, and ignored like one
   * when no route exists. Returns whether the walk was taken. In a 3D
   * scene two arguments are a ground point — `goTo(x, z)`, as the pointer
   * gives one — and a third is the full position's height: `goTo(x, y, z)`.
   */
  goTo(x: number, y: number, z?: number): boolean {
    if (z !== undefined) return this.#head({ x, y, z });
    return this.#head(this.#solid ? { x, y: 0, z: y } : { x, y });
  }

  stop(): void {
    this.destination = null;
    this.path = null;
    this.waypoint = 0;
    this.stalled = 0;
  }

  get moving(): boolean {
    return this.destination !== null;
  }

  /** Whether this game's ground plane is (x, z): a 3D scene. */
  get #solid(): boolean {
    return ((this.entity.game.options as { dimensions?: number }).dimensions ?? 2) === 3;
  }

  /** A point's ground coordinates: (x, y) flat, (x, z) in 3D. */
  #ground(point: Point3ish): { x: number; y: number } {
    return { x: point.x, y: this.#solid ? (point.z ?? 0) : point.y };
  }

  /**
   * Set the walk's target: over the navmesh when one is loaded for the
   * agent, straight otherwise. An unreachable or over-budget target leaves
   * the current walk as it was.
   */
  #head(target: Point3ish): boolean {
    const nav = this.entity.game.nav as NavRoutes | null | undefined;
    if (nav?.has(this.agent)) {
      const route = nav.findPath(this.entity.position, target, { agent: this.agent, maxLength: this.maxPathLength });
      if (!route) return false;
      this.path = route.points;
      this.waypoint = 1;
      this.destination = route.points[route.points.length - 1]!;
      return true;
    }
    this.path = null;
    this.waypoint = 0;
    this.destination = this.#solid
      ? { x: target.x, y: target.y ?? 0, z: target.z ?? 0 }
      : { x: target.x, y: target.y };
    return true;
  }

  override fixedUpdate(dt: number): void {
    if (this.entity.dead) return;
    const input = this.entity.input;
    // The snapshot's pointer shape; core/input is JavaScript until phase 6.
    const pointer = input.pointer as { world: Point3ish; buttons: number; pressed?: boolean; pressedButtons?: number };
    // The press edge carries its buttons, so a click that was released
    // before this tick still counts.
    const pressedMask = pointer.pressedButtons ?? (pointer.pressed ? pointer.buttons : 0);
    if (pressedMask & (1 << this.button)) this.#head(pointer.world);

    if (!this.destination) return;
    const solid = this.#solid;
    const position = this.#ground(this.entity.position);

    // Along the route: a corner reached is the next corner's turn, and the
    // last one is the destination the arrive check below settles.
    while (this.path && this.waypoint < this.path.length - 1) {
      const corner = this.#ground(this.path[this.waypoint]!);
      if (Math.hypot(corner.x - position.x, corner.y - position.y) > this.arrive) break;
      this.waypoint++;
    }
    const target = this.#ground(this.path ? this.path[Math.min(this.waypoint, this.path.length - 1)]! : this.destination);

    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = Math.hypot(dx, dy);
    const last = !this.path || this.waypoint >= this.path.length - 1;
    if (last && distance <= this.arrive) {
      this.stop();
      const body = this.entity.body;
      body.setVelocity((solid ? { x: 0, y: body.velocity.y, z: 0 } : { x: 0, y: 0 }) as { x: number; y: number });
      this.onArrive?.();
      return;
    }
    if (!distance) return;
    const nx = dx / distance;
    const ny = dy / distance;
    const projection = this.entity.game.projection;
    const speed = this.speed * (projection && this.speedSpace === 'screen' ? projection.groundSpeedScale(nx, ny) : 1);
    const body = this.entity.body;

    // A moving obstacle rolled onto the route makes the walk stale before
    // it presses against anything: checked four times a second, re-planned
    // only when a remaining segment actually crosses a tracked box.
    if (this.path) {
      this.obstacleWatch += dt;
      if (this.obstacleWatch >= 0.25) {
        this.obstacleWatch = 0;
        const nav = this.entity.game.nav as NavRoutes | null | undefined;
        if (nav?.routeBlocked([this.entity.position, ...this.path.slice(this.waypoint)])) {
          const destination = this.destination;
          if (!this.#head(destination)) {
            this.stop();
            body.setVelocity((solid ? { x: 0, y: body.velocity.y, z: 0 } : { x: 0, y: 0 }) as { x: number; y: number });
            return;
          }
        }
      }
    }

    // A walk that makes no headway was shoved off its route — a collision,
    // a corner clipped too tight. After half a second it asks again from
    // where it actually stands; a destination no longer reachable stops it.
    const velocity = this.#ground(body.velocity);
    if (Math.hypot(velocity.x, velocity.y) < speed * 0.2) {
      this.stalled += dt;
      if (this.stalled >= 0.5) {
        const destination = this.destination;
        this.stalled = 0;
        if (!this.#head(destination)) {
          this.stop();
          body.setVelocity((solid ? { x: 0, y: body.velocity.y, z: 0 } : { x: 0, y: 0 }) as { x: number; y: number });
          return;
        }
      }
    } else {
      this.stalled = 0;
    }

    // On the ground plane: the walk never fights gravity in 3D.
    body.setVelocity((solid ? { x: nx * speed, y: body.velocity.y, z: ny * speed } : { x: nx * speed, y: ny * speed }) as { x: number; y: number });
    this.onMove?.(nx, ny);
  }

  override draw(): void {
    const game = this.entity.game;
    if (!this.destination || !game.renderer.isDebugEnabled()) return;
    const overlay = game.worldOverlay;
    const projection = game.projection;
    const solid = this.#solid;
    const lift = solid ? 0.06 : 0;
    const place = (p: Point3ish) => {
      if (solid) return { x: p.x, y: (p.y ?? 0) + lift, z: p.z ?? 0 };
      return projection ? projection.toScreen(p.x, p.y) : { x: p.x, y: p.y };
    };
    // The way still to walk, anchored at the walker's feet on the ground.
    const at = this.entity.renderPosition as Point3ish;
    const from = solid ? { x: at.x, y: 0, z: at.z ?? 0 } : { x: at.x, y: at.y };
    const ahead = [from, ...(this.path ? this.path.slice(this.waypoint) : [this.destination])];
    overlay.drawPath({ points: ahead.map(place), strokeStyle: 'rgba(122, 215, 255, 0.8)', lineWidth: solid ? 2.5 : 1.5 });
    const end = place(this.destination!);
    if (solid) {
      // Flat on the floor, as the walk is: a screen-space circle reads as
      // a marker floating at the camera, not a place on the ground.
      overlay.drawPath({
        points: groundCircle(end, Math.max(0.3, this.arrive)),
        strokeStyle: 'rgba(122, 215, 255, 0.9)', lineWidth: 2.5
      });
    } else {
      overlay.drawArc({
        ...end, radius: Math.max(5, this.arrive),
        startAngle: 0, endAngle: Math.PI * 2,
        strokeStyle: 'rgba(122, 215, 255, 0.9)', lineWidth: 1.5
      });
    }
  }
}
