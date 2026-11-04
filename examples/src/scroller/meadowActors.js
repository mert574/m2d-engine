import { Entity } from 'm2d-engine/core/entity.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import { LENGTH, HEIGHT, SPEED, BAND } from './meadow.js';

/**
 * Beeline's cast. The one rule that shapes everything here: the camera
 * scrolls on wall time and is presentation, so no `fixedUpdate` ever reads
 * it. The `ScrollFront` is the simulation's own copy of the window —
 * advanced per tick at the same `SPEED` from the same start — and the push
 * and clamp rules read the front. See docs/contributing/determinism.md.
 */

/** Half the view width: the front's reach either side of its centre. */
const HALF_VIEW = 480;

/**
 * The window the simulation believes in. Starts at the camera's starting
 * centre and advances at the scroll speed per fixed tick, so the two stay
 * aligned at any frame rate; the bee is kept inside it.
 */
export class ScrollFront extends Entity {
  name = 'ScrollFront';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.centre = HALF_VIEW;
    this.visible = false;
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    this.centre = Math.min(this.centre + SPEED * dt, LENGTH - HALF_VIEW);

    const player = this.game.player;
    if (!player || player.dead) return;
    const pos = player.position;
    // The trailing edge is a soft broom, the leading edge a firm pane.
    const left = this.centre - HALF_VIEW + 50;
    const right = this.centre + HALF_VIEW - 40;
    if (pos.x < left) {
      player.body.setPosition({ x: left, y: pos.y });
      if (player.body.velocity.x < 0) player.body.setVelocity({ x: 0, y: player.body.velocity.y });
    } else if (pos.x > right) {
      player.body.setPosition({ x: right, y: pos.y });
      if (player.body.velocity.x > 0) player.body.setVelocity({ x: 0, y: player.body.velocity.y });
    }
  }

  draw() {}
}

/**
 * The bee. Acceleration flight with air friction for the glide, a flight
 * band clamp, a pollen count, and a sting response that scatters some of
 * what it carries.
 */
export class Bee extends Entity {
  name = 'Player';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('movement', new KeyboardControl(this, {
      verticalMovement: true, continuous: true, acceleration: 1500, maxSpeed: 290
    }));
    this.clock = 0;
    this.pollen = 0;
    this.invuln = 0;
    this.hit = null;
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    this.invuln = Math.max(0, this.invuln - dt);

    // The flight band: sky above, verge below.
    const pos = this.position;
    if (pos.y < BAND.top) {
      this.body.setPosition({ x: pos.x, y: BAND.top });
      if (this.body.velocity.y < 0) this.body.setVelocity({ x: this.body.velocity.x, y: 0 });
    } else if (pos.y > BAND.bottom) {
      this.body.setPosition({ x: pos.x, y: BAND.bottom });
      if (this.body.velocity.y > 0) this.body.setVelocity({ x: this.body.velocity.x, y: 0 });
    }
  }

  /** A wasp or a thistle: scatter up to `strength` pollen, flinch away. */
  sting(strength, from) {
    if (this.invuln > 0) return;
    this.invuln = 1.4;
    const lost = Math.min(strength, this.pollen);
    this.pollen -= lost;
    this.hit = { at: this.clock, lost };
    this.game.soundManager.playSound('damage');
    const away = Math.sign(this.position.x - from.x) || -1;
    this.body.setVelocity({ x: away * 190, y: this.position.y > from.y ? 150 : -150 });
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
  }

  draw() {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const vy = this.body.velocity.y;
    const tilt = Math.max(-0.3, Math.min(0.3, vy * 0.0012)) + Math.sin(this.clock * 2.2) * 0.03;
    const blink = this.invuln > 0 && Math.sin(this.clock * 30) > 0;
    const alpha = blink ? 0.45 : 1;

    // Pollen carried: gold grains strung out behind, one per few collected.
    const grains = Math.min(6, Math.ceil(this.pollen / 5));
    for (let i = 1; i <= grains; i++) {
      renderer.drawArc({
        x: pos.x - 20 - i * 7,
        y: pos.y + Math.sin(this.clock * 4 + i * 1.3) * 4,
        radius: 2.4,
        fillStyle: '#f4ce56',
        globalAlpha: 0.85
      });
    }

    // Petals scattering where a sting landed.
    if (this.hit && this.clock - this.hit.at < 0.55) {
      const t = (this.clock - this.hit.at) / 0.55;
      for (let i = 0; i < 6; i++) {
        const angle = i * (Math.PI * 2 / 6) + 0.5;
        renderer.drawArc({
          x: pos.x + Math.cos(angle) * 36 * t,
          y: pos.y + Math.sin(angle) * 36 * t + 20 * t * t,
          radius: 2.6 * (1 - t),
          fillStyle: i % 2 ? '#f4ce56' : '#f3a0ac'
        });
      }
    }

    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: tilt });

    // Wings first, over the back: two blurs trading angles too fast to see.
    const flap = Math.sin(this.clock * 42);
    for (const [ox, lean] of [[-2, -0.45], [4, -0.7]]) {
      renderer.pushTransform({ x: ox, y: -8, rotation: lean + flap * 0.5 });
      renderer.pushTransform({ x: 0, y: 0, scaleX: 0.45, scaleY: 1 });
      renderer.drawArc({ x: 0, y: -8, radius: 9, fillStyle: 'rgba(240, 248, 255, 0.65)', globalAlpha: alpha });
      renderer.popTransform();
      renderer.popTransform();
    }

    // The body, tail to head: paper-cut segments.
    const DARK = '#3f3217';
    const AMBER = '#f2b53d';
    renderer.drawPath({
      points: [{ x: -22, y: 0 }, { x: -15, y: -4 }, { x: -15, y: 4 }],
      fillStyle: DARK, globalAlpha: alpha
    });
    renderer.drawArc({ x: -12, y: 0, radius: 6.5, fillStyle: DARK, globalAlpha: alpha });
    renderer.drawArc({ x: -6, y: 0, radius: 8.5, fillStyle: AMBER, globalAlpha: alpha });
    renderer.drawArc({ x: 1, y: 0, radius: 8, fillStyle: DARK, globalAlpha: alpha });
    renderer.drawArc({ x: 7, y: 0, radius: 7.5, fillStyle: AMBER, globalAlpha: alpha });
    renderer.drawArc({ x: 13, y: -1, radius: 5.5, fillStyle: DARK, globalAlpha: alpha });
    renderer.drawArc({ x: 14.5, y: -2.5, radius: 1.6, fillStyle: '#ffffff', globalAlpha: alpha });

    renderer.popTransform();

    for (const constraint of this.constraints.values()) {
      constraint.draw();
    }
  }
}

/** A flower on the verge, swaying from its base. The body is never solid. */
export class Flower extends Entity {
  name = 'Flower';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.sway = options.sway ?? 0;
    this.clock = this.sway;
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
  }

  draw() {
    const image = this.sprite?.image;
    if (!image || !image.width) return;
    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const w = this.size.x;
    const h = this.size.y;
    renderer.pushTransform({ x: pos.x, y: pos.y + h / 2, rotation: Math.sin(this.clock * 0.8) * 0.035 });
    renderer.drawSprite({
      image, x: 0, y: -h / 2,
      tileWidth: image.width, tileHeight: image.height,
      width: w, height: h
    });
    renderer.popTransform();
  }
}

/** A grain of pollen: a warm mote, bobbing where it was shed. */
export class Pollen extends Entity {
  name = 'Pollen';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.clock = (body.position.x * 0.013) % (Math.PI * 2);
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name !== 'Player') return;
    other.entity.pollen += 1;
    this.game.soundManager.playSound('collect');
    this.game.entities.delete(this);
    this.game.physics.remove(this.body);
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
  }

  draw() {
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const y = pos.y + Math.sin(this.clock * 1.8) * 4;
    const breathe = 0.85 + 0.15 * Math.sin(this.clock * 3.1);
    renderer.drawArc({
      x: pos.x, y, radius: 11 * breathe,
      fillStyle: {
        type: 'radial', x: pos.x, y, r0: 0, r1: 11 * breathe,
        stops: [{ offset: 0, color: 'rgba(255, 224, 120, 0.55)' }, { offset: 1, color: 'rgba(255, 224, 120, 0)' }]
      }
    });
    renderer.drawArc({ x: pos.x, y, radius: 3.4, fillStyle: '#ffdf6e' });
    renderer.drawArc({ x: pos.x - 1, y: y - 1, radius: 1.2, fillStyle: '#fff7d6' });
  }
}

/** A thistle head on the verge: brush it and the bee drops a little. */
export class Bramble extends Entity {
  name = 'Bramble';

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name !== 'Player') return;
    other.entity.sting(3, this.position);
  }
}

/**
 * A wasp on its beat: a seeded loop around its anchor, moved per fixed tick
 * so the patrol is the same at every frame rate.
 */
export class Wasp extends Entity {
  name = 'Wasp';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.anchor = { x: body.position.x, y: body.position.y };
    this.amp = options.amp ?? 80;
    this.rate = options.rate ?? 0.5;
    this.drift = options.drift ?? 30;
    this.phase = options.phase ?? 0;
    this.clock = 0;
    this.heading = 1;
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    this.clock += dt;
    const t = this.clock * this.rate * Math.PI * 2 + this.phase;
    const x = this.anchor.x + Math.cos(t * 0.6) * this.drift;
    this.heading = Math.sign(-Math.sin(t * 0.6)) || 1;
    this.body.setPosition({ x, y: this.anchor.y + Math.sin(t) * this.amp });
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name !== 'Player') return;
    other.entity.sting(5, this.position);
  }

  draw() {
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const clock = this.game.time.elapsed;
    const flap = Math.sin(clock * 52 + this.phase);

    renderer.pushTransform({ x: pos.x, y: pos.y, scaleX: this.heading, scaleY: 1 });
    renderer.pushTransform({ x: 0, y: -7, rotation: -0.6 + flap * 0.55 });
    renderer.pushTransform({ x: 0, y: 0, scaleX: 0.4, scaleY: 1 });
    renderer.drawArc({ x: 0, y: -7, radius: 8, fillStyle: 'rgba(235, 240, 245, 0.6)' });
    renderer.popTransform();
    renderer.popTransform();

    const DARK = '#2e2a20';
    const SULPHUR = '#d9c050';
    renderer.drawPath({
      points: [{ x: -19, y: 0 }, { x: -12, y: -3 }, { x: -12, y: 3 }],
      fillStyle: DARK
    });
    renderer.drawArc({ x: -9, y: 0, radius: 5.5, fillStyle: SULPHUR });
    renderer.drawArc({ x: -4, y: 0, radius: 5.5, fillStyle: DARK });
    renderer.drawArc({ x: 1, y: 0, radius: 5, fillStyle: SULPHUR });
    renderer.drawArc({ x: 7, y: -1, radius: 4.5, fillStyle: DARK });
    renderer.drawArc({ x: 8.5, y: -2, radius: 1.3, fillStyle: '#d04030' });
    renderer.popTransform();
  }
}

/** The hive on its post: the end of the lane. */
export class Hive extends Entity {
  name = 'Hive';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.reached = false;
    this.onReached = null;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (this.reached || other.entity?.name !== 'Player') return;
    this.reached = true;
    this.onReached?.(other.entity);
  }

  draw() {
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const clock = this.game.time.elapsed;

    // The post, down to the verge.
    renderer.drawRect({
      x: pos.x - 5, y: pos.y + 30, width: 10, height: HEIGHT - (pos.y + 30) - 18,
      fillStyle: '#7a5a36'
    });
    // The skep: stacked coils of amber straw.
    for (const [dy, rx, tone] of [[26, 26, '#c98f3e'], [12, 34, '#dba54c'], [-3, 37, '#e8b659'], [-18, 33, '#dba54c'], [-30, 24, '#c98f3e'], [-39, 13, '#b87d34']]) {
      renderer.pushTransform({ x: pos.x, y: pos.y + dy, scaleX: 1, scaleY: 0.55 });
      renderer.drawArc({ x: 0, y: 0, radius: rx, fillStyle: tone });
      renderer.popTransform();
    }
    renderer.drawArc({ x: pos.x, y: pos.y + 26, radius: 7, fillStyle: '#3f2e14' });

    // The hive's own bees, busy around the door.
    for (let i = 0; i < 2; i++) {
      const t = clock * (1.2 + i * 0.4) + i * 2.6;
      renderer.drawArc({
        x: pos.x + Math.cos(t) * (34 + i * 10),
        y: pos.y + 10 + Math.sin(t * 1.7) * 16,
        radius: 2.4,
        fillStyle: '#3f3217'
      });
    }
  }
}
