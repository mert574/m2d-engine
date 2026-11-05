import { Entity } from 'm2d-engine/core/entity.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import { LENGTH, HEIGHT, SPEED, BAND } from './meadow.js';
import { progress } from './meadowScenery.js';

/**
 * Beeline's cast. The rule that shapes everything: the camera scrolls on
 * wall time and is presentation, so no `fixedUpdate` ever reads it. The
 * `ScrollFront` is the simulation's own copy of the window — advanced per
 * tick at the same `SPEED` from the same start — and every push and clamp
 * reads the front. See docs/contributing/determinism.md.
 *
 * The game in one breath: three wing hearts, a dash with a moment of
 * grace, pollen that chains into a combo while you keep collecting, wasps
 * that telegraph and dart, webs that hold you until you tear free.
 */

/** Half the view width: the front's reach either side of its centre. */
const HALF_VIEW = 480;

const DASH = { speed: 780, time: 0.22, cooldown: 1.0, grace: 0.36 };
/** Seconds the combo survives between grains. */
const COMBO_WINDOW = 2.4;

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
 * The bee. Acceleration flight with air friction for the glide; a dash on
 * Space or X that grants a grace window, tears webs and snatches chains;
 * three wing hearts; a combo that climbs while the collecting does not
 * stop.
 */
export class Bee extends Entity {
  name = 'Player';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    // Quick against a 130 px/s window: the bee must feel faster than the
    // world it is being carried through.
    this.addConstraint('movement', new KeyboardControl(this, {
      verticalMovement: true, continuous: true, acceleration: 2700, maxSpeed: 430
    }));
    this.dashDir = { x: 1, y: 0 };
    this.clock = 0;
    this.pollen = 0;
    this.hearts = 3;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboLeft = 0;
    this.invuln = 0;
    this.dashLeft = 0;
    this.dashCooldown = 0;
    this.hit = null;
    this.pop = null;
    /** Webs currently holding the bee. @type {Set<Web>} */
    this.webs = new Set();
    /** Recent drawn positions, for the dash's afterimages. */
    this.trail = [];
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashLeft = Math.max(0, this.dashLeft - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.comboLeft = Math.max(0, this.comboLeft - dt);
    if (this.comboLeft === 0) this.combo = 0;

    // The dash: a burst along the held direction (default: onward), a
    // short grace window, and the way out of a web.
    const input = this.input;
    if ((input.justPressed('Space') || input.justPressed('KeyX')) && this.dashCooldown === 0) {
      let dx = input.axis('ArrowLeft', 'ArrowRight');
      let dy = input.axis('ArrowUp', 'ArrowDown');
      if (dx === 0 && dy === 0) dx = 1;
      const norm = Math.hypot(dx, dy);
      this.dashDir = { x: dx / norm, y: dy / norm };
      this.dashLeft = DASH.time;
      this.dashCooldown = DASH.cooldown;
      this.invuln = Math.max(this.invuln, DASH.grace);
      this.game.soundManager.playSound('dash');
      for (const web of this.webs) web.tear();
      this.webs.clear();
    }
    // Hold the burst for the dash's whole window: set per tick, or the air
    // friction eats it before it is felt.
    if (this.dashLeft > 0) {
      this.body.setVelocity({ x: this.dashDir.x * DASH.speed, y: this.dashDir.y * DASH.speed });
    }

    // Held by a web: heavy drag until the dash tears it.
    if (this.webs.size > 0 && this.dashLeft === 0) {
      const v = this.body.velocity;
      this.body.setVelocity({ x: v.x * 0.8, y: v.y * 0.8 });
    }

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

  /** A grain taken: the combo climbs while the window holds. */
  collect() {
    this.combo = this.comboLeft > 0 ? this.combo + 1 : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboLeft = COMBO_WINDOW;
    this.pollen += 1;
    const points = 10 * this.combo;
    this.score += points;
    this.pop = { at: this.clock, text: this.combo > 1 ? `+${points}  ×${this.combo}` : `+${points}` };
  }

  /** A wasp or a thistle: lose a heart, scatter some pollen, flinch away. */
  sting(from) {
    if (this.invuln > 0) return;
    this.invuln = 1.5;
    this.hearts -= 1;
    this.combo = 0;
    this.comboLeft = 0;
    const lost = Math.min(this.pollen, Math.max(2, Math.ceil(this.pollen * 0.2)));
    this.pollen -= lost;
    this.hit = { at: this.clock, lost };
    this.game.soundManager.playSound('damage');
    const away = Math.sign(this.position.x - from.x) || -1;
    this.body.setVelocity({ x: away * 230, y: this.position.y > from.y ? 190 : -190 });
    if (this.hearts <= 0) {
      this.game.time.after(0.5, () => this.game.gameOver());
    }
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
    const pos = this.renderPosition;
    this.trail.unshift({ x: pos.x, y: pos.y });
    if (this.trail.length > 7) this.trail.pop();
  }

  draw() {
    if (this.dead || !this.visible) return;
    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const vy = this.body.velocity.y;
    const tilt = Math.max(-0.32, Math.min(0.32, vy * 0.0012)) + Math.sin(this.clock * 2.2) * 0.03;
    const blink = this.invuln > DASH.grace && Math.sin(this.clock * 30) > 0;
    const alpha = blink ? 0.4 : 1;
    const dashing = this.dashLeft > 0 || this.dashCooldown > DASH.cooldown - 0.18;

    // Afterimages while the dash burns.
    if (dashing) {
      for (let i = 2; i < this.trail.length; i += 2) {
        const ghost = this.trail[i];
        renderer.drawArc({
          x: ghost.x, y: ghost.y, radius: 9 - i,
          fillStyle: '#ffd37a', globalAlpha: 0.3 - i * 0.035, blend: 'additive'
        });
      }
    }

    // Pollen carried: gold grains strung out behind.
    const grains = Math.min(6, Math.ceil(this.pollen / 6));
    for (let i = 1; i <= grains; i++) {
      renderer.drawArc({
        x: pos.x - 24 - i * 7,
        y: pos.y + Math.sin(this.clock * 4 + i * 1.3) * 4,
        radius: 2.6, fillStyle: '#ffc83e', globalAlpha: 0.9
      });
    }

    // Petals scattering where a sting landed.
    if (this.hit && this.clock - this.hit.at < 0.6) {
      const t = (this.clock - this.hit.at) / 0.6;
      for (let i = 0; i < 7; i++) {
        const angle = i * (Math.PI * 2 / 7) + 0.5;
        renderer.drawArc({
          x: pos.x + Math.cos(angle) * 42 * t,
          y: pos.y + Math.sin(angle) * 42 * t + 24 * t * t,
          radius: 3 * (1 - t),
          fillStyle: i % 2 ? '#ffc83e' : '#f3a0ac'
        });
      }
    }

    // The combo pop, rising off the back.
    if (this.pop && this.clock - this.pop.at < 0.8) {
      const t = (this.clock - this.pop.at) / 0.8;
      renderer.drawText({
        text: this.pop.text,
        x: pos.x + 6, y: pos.y - 26 - t * 22,
        fontSize: 15, fontWeight: '700', textAlign: 'center',
        fillStyle: '#fff3c8', strokeStyle: 'rgba(90, 50, 0, 0.6)', lineWidth: 3,
        globalAlpha: 1 - t
      });
    }

    renderer.pushTransform({ x: pos.x, y: pos.y, rotation: tilt });

    // Wings over the back: two blurs trading angles too fast to see, with a
    // bright leading edge.
    const flap = Math.sin(this.clock * 44);
    for (const [ox, lean] of [[-3, -0.45], [5, -0.7]]) {
      renderer.pushTransform({ x: ox, y: -10, rotation: lean + flap * 0.55 });
      renderer.pushTransform({ x: 0, y: 0, scaleX: 0.45, scaleY: 1 });
      renderer.drawArc({ x: 0, y: -10, radius: 12, fillStyle: 'rgba(240, 248, 255, 0.55)', globalAlpha: alpha });
      renderer.drawArc({ x: 0, y: -13, radius: 7, fillStyle: 'rgba(255, 255, 255, 0.5)', globalAlpha: alpha });
      renderer.popTransform();
      renderer.popTransform();
    }

    // Antennae.
    const DARK = '#3b2d14';
    for (const side of [-1, 1]) {
      renderer.drawLine({
        x1: 14, y1: -6, x2: 22, y2: -14 + side * 3,
        strokeStyle: DARK, lineWidth: 1.6, globalAlpha: alpha
      });
      renderer.drawArc({ x: 22, y: -14 + side * 3, radius: 1.6, fillStyle: DARK, globalAlpha: alpha });
    }

    // The body, tail to head: paper-cut segments with a soft top light.
    const AMBER = '#f5b83a';
    renderer.drawPath({
      points: [{ x: -27, y: 0 }, { x: -18, y: -5 }, { x: -18, y: 5 }],
      fillStyle: DARK, globalAlpha: alpha
    });
    renderer.drawArc({ x: -14, y: 0, radius: 8, fillStyle: DARK, globalAlpha: alpha });
    renderer.drawArc({
      x: -7, y: 0, radius: 10,
      fillStyle: {
        type: 'radial', x: -9, y: -4, r0: 0, r1: 12,
        stops: [{ offset: 0, color: '#ffd468' }, { offset: 1, color: AMBER }]
      },
      globalAlpha: alpha
    });
    renderer.drawArc({ x: 2, y: 0, radius: 9.5, fillStyle: DARK, globalAlpha: alpha });
    renderer.drawArc({
      x: 9, y: 0, radius: 9,
      fillStyle: {
        type: 'radial', x: 7, y: -4, r0: 0, r1: 11,
        stops: [{ offset: 0, color: '#ffd468' }, { offset: 1, color: AMBER }]
      },
      globalAlpha: alpha
    });
    renderer.drawArc({ x: 16, y: -1, radius: 6.5, fillStyle: DARK, globalAlpha: alpha });
    const blinkEye = (this.clock % 3.7) < 0.12;
    renderer.drawArc({ x: 17.5, y: -3, radius: blinkEye ? 0.6 : 2, fillStyle: '#ffffff', globalAlpha: alpha });
    // Fuzz: the light catching the thorax.
    renderer.drawArc({ x: -7, y: -7, radius: 4.5, fillStyle: 'rgba(255, 240, 200, 0.4)', globalAlpha: alpha });

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
    this.clock = options.sway ?? 0;
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
    const t = progress(this.game.camera);

    // The flower's shadow pools at its roots and stretches as the sun sets.
    renderer.pushTransform({ x: pos.x - w * 0.12 - t * 14, y: HEIGHT - 5, scaleX: 1, scaleY: 0.2 });
    renderer.drawArc({ x: 0, y: 0, radius: w * (0.3 + t * 0.12), fillStyle: 'rgba(24, 34, 16, 0.32)' });
    renderer.popTransform();

    renderer.pushTransform({ x: pos.x, y: pos.y + h / 2, rotation: Math.sin(this.clock * 0.8) * 0.035 });
    renderer.drawSprite({
      image, x: 0, y: -h / 2,
      tileWidth: image.width, tileHeight: image.height,
      width: w, height: h,
      // A soft cast off the sun's side: the cheap half of a rim light.
      shadow: { color: 'rgba(40, 24, 48, 0.3)', blur: 6, offsetX: -(6 + t * 14), offsetY: 3 }
    });
    renderer.popTransform();
  }
}

/** A grain of pollen: a hot mote with its own light, hard against any sky. */
export class Pollen extends Entity {
  name = 'Pollen';

  /** Asked when drawing: a headless game has no renderer to ask at construction. */
  get lit() { return this.game.renderer.supports('lights'); }
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.clock = (body.position.x * 0.013) % (Math.PI * 2);
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name !== 'Player') return;
    other.entity.collect();
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
    const pulse = 0.8 + 0.2 * Math.sin(this.clock * 3.4);

    // A dark seat under the glow, so the grain reads on a bright sky too.
    renderer.drawArc({ x: pos.x, y, radius: 6.4, fillStyle: 'rgba(84, 48, 0, 0.42)' });
    renderer.drawArc({
      x: pos.x, y, radius: 15 * pulse,
      fillStyle: {
        type: 'radial', x: pos.x, y, r0: 0, r1: 15 * pulse,
        stops: [{ offset: 0, color: 'rgba(255, 196, 64, 0.65)' }, { offset: 1, color: 'rgba(255, 196, 64, 0)' }]
      },
      blend: this.blend
    });
    renderer.drawArc({ x: pos.x, y, radius: 4.6, fillStyle: '#ffb217' });
    renderer.drawArc({ x: pos.x - 1, y: y - 1.2, radius: 1.8, fillStyle: '#fff6d0' });
    // A slow four-point sparkle.
    const spin = this.clock * 0.9;
    for (let i = 0; i < 4; i++) {
      const angle = spin + i * Math.PI / 2;
      renderer.drawLine({
        x1: pos.x + Math.cos(angle) * 5.5, y1: y + Math.sin(angle) * 5.5,
        x2: pos.x + Math.cos(angle) * (8 + 2 * pulse), y2: y + Math.sin(angle) * (8 + 2 * pulse),
        strokeStyle: 'rgba(255, 240, 190, 0.8)', lineWidth: 1.2
      });
    }
    if (this.lit) {
      renderer.drawLight({ x: pos.x, y, radius: 70, color: '#ffce6e', intensity: 0.5 * pulse });
    }
  }
}

/** A burr head on a tall stem: the thistle the low route weaves through. */
export class Thistle extends Entity {
  name = 'Thistle';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.clock = options.sway ?? 0;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name !== 'Player') return;
    other.entity.sting(this.position);
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
  }

  draw() {
    const image = this.sprite?.image;
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const size = this.size.x;
    const sway = Math.sin(this.clock * 0.7) * 0.04;

    // The stem, down to the verge, with one leaf pair.
    const footY = HEIGHT - 8;
    const lean = Math.sin(this.clock * 0.7) * 6;
    const t = progress(this.game.camera);
    renderer.pushTransform({ x: pos.x - 10 - t * 12, y: footY + 2, scaleX: 1, scaleY: 0.2 });
    renderer.drawArc({ x: 0, y: 0, radius: size * (0.34 + t * 0.12), fillStyle: 'rgba(24, 34, 16, 0.35)' });
    renderer.popTransform();
    renderer.drawPath({
      points: [
        { x: pos.x - 2.5, y: footY }, { x: pos.x + 2.5, y: footY },
        { x: pos.x + lean + 1.5, y: pos.y }, { x: pos.x + lean - 1.5, y: pos.y }
      ],
      fillStyle: '#3c4a26'
    });
    const leafY = pos.y + (footY - pos.y) * 0.55;
    for (const side of [-1, 1]) {
      renderer.drawPath({
        points: [
          { x: pos.x + lean * 0.4, y: leafY },
          { x: pos.x + lean * 0.4 + side * 16, y: leafY - 7 },
          { x: pos.x + lean * 0.4 + side * 7, y: leafY + 3 }
        ],
        fillStyle: '#43532b'
      });
    }

    // The burr, swaying on its stem, with warning-red tips.
    renderer.pushTransform({ x: pos.x + lean, y: pos.y, rotation: sway + this.clock * 0.05 });
    if (image && image.width) {
      renderer.drawSprite({
        image, x: 0, y: 0,
        tileWidth: image.width, tileHeight: image.height,
        width: size * 1.6, height: size * 1.6
      });
    }
    for (let i = 0; i < 3; i++) {
      const angle = i * (Math.PI * 2 / 3) + 0.4;
      renderer.drawArc({
        x: Math.cos(angle) * size * 0.45, y: Math.sin(angle) * size * 0.45,
        radius: 3.2, fillStyle: '#c2453a'
      });
    }
    renderer.popTransform();
  }
}

/**
 * A wasp on its beat. Patrols a seeded loop; when the bee crosses into its
 * reach it holds still and rattles — the telegraph — then darts at where
 * the bee was, and swings back to its post. All of it per fixed tick, so
 * the hunt is the same at every frame rate.
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
    this.state = 'patrol';
    this.stateT = 0;
    this.cooldown = 0;
    this.from = null;
    this.dartV = null;
  }

  #loopPos() {
    const t = this.clock * this.rate * Math.PI * 2 + this.phase;
    return {
      x: this.anchor.x + Math.cos(t * 0.6) * this.drift,
      y: this.anchor.y + Math.sin(t) * this.amp,
      heading: Math.sign(-Math.sin(t * 0.6)) || 1
    };
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    this.clock += dt;
    this.stateT += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const player = this.game.player;
    const pos = this.body.position;

    if (this.state === 'patrol') {
      const loop = this.#loopPos();
      this.heading = loop.heading;
      this.body.setPosition({ x: loop.x, y: loop.y });
      if (this.cooldown === 0 && player && !player.dead) {
        const dx = player.position.x - loop.x;
        const dy = player.position.y - loop.y;
        if (Math.hypot(dx, dy) < 230) {
          this.state = 'telegraph';
          this.stateT = 0;
          this.from = { x: loop.x, y: loop.y };
        }
      }
    } else if (this.state === 'telegraph') {
      // Hold, rattling in place; commit to the bee's position at the end.
      this.body.setPosition({
        x: this.from.x + Math.sin(this.stateT * 60) * 2.5,
        y: this.from.y + Math.cos(this.stateT * 47) * 2
      });
      if (this.stateT >= 0.55) {
        const target = player && !player.dead ? player.position : { x: this.from.x - 100, y: this.from.y };
        const dx = target.x - this.from.x;
        const dy = target.y - this.from.y;
        const norm = Math.hypot(dx, dy) || 1;
        this.dartV = { x: (dx / norm) * 560, y: (dy / norm) * 560 };
        this.heading = Math.sign(dx) || 1;
        this.state = 'dart';
        this.stateT = 0;
      }
    } else if (this.state === 'dart') {
      this.body.setPosition({ x: pos.x + this.dartV.x * dt, y: pos.y + this.dartV.y * dt });
      if (this.stateT >= 0.5) {
        this.state = 'return';
        this.stateT = 0;
        this.from = { x: this.body.position.x, y: this.body.position.y };
      }
    } else if (this.state === 'return') {
      const loop = this.#loopPos();
      const t = Math.min(1, this.stateT / 1.1);
      const ease = t * t * (3 - 2 * t);
      this.body.setPosition({
        x: this.from.x + (loop.x - this.from.x) * ease,
        y: this.from.y + (loop.y - this.from.y) * ease
      });
      this.heading = Math.sign(loop.x - this.from.x) || 1;
      if (t >= 1) {
        this.state = 'patrol';
        this.cooldown = 2.4;
      }
    }
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name !== 'Player') return;
    other.entity.sting(this.position);
  }

  draw() {
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const clock = this.game.time.elapsed;
    const angry = this.state === 'telegraph' || this.state === 'dart';
    const flap = Math.sin(clock * (angry ? 70 : 52) + this.phase);

    // The telegraph everyone learns to read: a mark over its head.
    if (this.state === 'telegraph') {
      renderer.drawText({
        text: '!',
        x: pos.x, y: pos.y - 26 - Math.abs(Math.sin(this.stateT * 18)) * 4,
        fontSize: 20, fontWeight: '800', textAlign: 'center',
        fillStyle: '#e8422e', strokeStyle: 'rgba(60, 10, 0, 0.5)', lineWidth: 3
      });
    }
    // Speed streaks while it darts.
    if (this.state === 'dart' && this.dartV) {
      for (let i = 1; i <= 3; i++) {
        renderer.drawLine({
          x1: pos.x - this.dartV.x * 0.03 * i, y1: pos.y - this.dartV.y * 0.03 * i + (i - 2) * 4,
          x2: pos.x - this.dartV.x * 0.012 * i, y2: pos.y - this.dartV.y * 0.012 * i + (i - 2) * 4,
          strokeStyle: 'rgba(60, 50, 30, 0.35)', lineWidth: 2
        });
      }
    }

    renderer.pushTransform({ x: pos.x, y: pos.y, scaleX: this.heading, scaleY: 1 });
    renderer.pushTransform({ x: 0, y: -8, rotation: -0.6 + flap * 0.55 });
    renderer.pushTransform({ x: 0, y: 0, scaleX: 0.4, scaleY: 1 });
    renderer.drawArc({ x: 0, y: -8, radius: 9, fillStyle: 'rgba(235, 240, 245, 0.6)' });
    renderer.popTransform();
    renderer.popTransform();

    const DARK = '#2e2a20';
    const SULPHUR = angry ? '#e3c148' : '#d9c050';
    renderer.drawPath({
      points: [{ x: -22, y: 0 }, { x: -14, y: -3.5 }, { x: -14, y: 3.5 }],
      fillStyle: DARK
    });
    renderer.drawArc({ x: -10, y: 0, radius: 6, fillStyle: SULPHUR });
    renderer.drawArc({ x: -4.5, y: 0, radius: 6, fillStyle: DARK });
    renderer.drawArc({ x: 1, y: 0, radius: 5.5, fillStyle: SULPHUR });
    renderer.drawArc({ x: 7.5, y: -1, radius: 5, fillStyle: DARK });
    renderer.drawArc({ x: 9, y: -2, radius: angry ? 2 : 1.4, fillStyle: '#e8422e' });
    renderer.popTransform();
  }
}

/** An orb web across the lane: it holds whatever flies in until a dash tears it. */
export class Web extends Entity {
  name = 'Web';

  /** Asked when drawing: a headless game has no renderer to ask at construction. */
  get blend() { return this.game.renderer.supports('blendModes') ? 'additive' : undefined; }

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.torn = false;
    this.tornAt = 0;
    this.clock = options.sway ?? 0;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (this.torn || other.entity?.name !== 'Player') return;
    other.entity.webs.add(this);
    this.game.soundManager.playSound('web');
  }

  onCollisionEnd(other) {
    super.onCollisionEnd(other);
    if (other.entity?.name === 'Player') other.entity.webs.delete(this);
  }

  tear() {
    if (this.torn) return;
    this.torn = true;
    this.tornAt = this.clock;
    this.body.setCollisionFilter({ category: 0, mask: 0 });
    this.game.soundManager.playSound('tear');
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
  }

  draw() {
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const w = this.size.x;
    const h = this.size.y;
    const sway = Math.sin(this.clock * 0.5) * 3;
    const THREAD = 'rgba(255, 250, 238, 0.55)';

    // The two stalks the web is strung between, down to the verge.
    for (const side of [-1, 1]) {
      const topX = pos.x + side * (w / 2 + 8) + sway * side * 0.3;
      renderer.drawPath({
        points: [
          { x: pos.x + side * (w / 2 + 14), y: HEIGHT - 6 },
          { x: pos.x + side * (w / 2 + 20), y: HEIGHT - 6 },
          { x: topX + 2, y: pos.y - h / 2 - 14 },
          { x: topX - 2, y: pos.y - h / 2 - 14 }
        ],
        fillStyle: '#3a4826'
      });
    }

    if (this.torn) {
      // Sagging threads where the orb was.
      const droop = Math.min(1, (this.clock - this.tornAt) * 3);
      for (const side of [-1, 1]) {
        renderer.drawPath({
          points: [
            { x: pos.x + side * (w / 2 + 6), y: pos.y - h / 2 - 8 },
            { x: pos.x + side * w * 0.22, y: pos.y - h * 0.1 + droop * 36 },
            { x: pos.x + side * w * 0.3, y: pos.y + h * 0.3 + droop * 50 }
          ],
          strokeStyle: THREAD, lineWidth: 1.3, fill: false
        });
      }
      return;
    }

    const cx = pos.x + sway;
    const cy = pos.y;
    // Anchor lines, spokes, rings.
    for (const [ax, ay] of [[-w / 2 - 6, -h / 2 - 10], [w / 2 + 6, -h / 2 - 10], [-w / 2 - 10, h / 2], [w / 2 + 10, h / 2]]) {
      renderer.drawLine({ x1: cx, y1: cy, x2: pos.x + ax, y2: pos.y + ay, strokeStyle: THREAD, lineWidth: 1 });
    }
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + 0.2;
      renderer.drawLine({
        x1: cx, y1: cy,
        x2: cx + Math.cos(angle) * w * 0.48, y2: cy + Math.sin(angle) * h * 0.48,
        strokeStyle: THREAD, lineWidth: 1
      });
    }
    for (const r of [0.18, 0.33, 0.47]) {
      renderer.pushTransform({ x: cx, y: cy, scaleX: 1, scaleY: h / w });
      renderer.drawArc({ x: 0, y: 0, radius: w * r, strokeStyle: THREAD, lineWidth: 1.1, fill: false });
      renderer.popTransform();
    }
    // Dew, catching the low sun.
    for (let i = 0; i < 5; i++) {
      const angle = i * 1.26 + 0.5;
      const r = 0.33 + (i % 2) * 0.14;
      renderer.drawArc({
        x: cx + Math.cos(angle) * w * r, y: cy + Math.sin(angle) * h * r,
        radius: 2, fillStyle: 'rgba(255, 246, 220, 0.9)', blend: this.blend
      });
    }
  }
}

/** The hive on its post: the end of the lane. */
export class Hive extends Entity {
  name = 'Hive';

  /** Asked when drawing: a headless game has no renderer to ask at construction. */
  get lit() { return this.game.renderer.supports('lights'); }

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

    renderer.drawRect({
      x: pos.x - 5, y: pos.y + 30, width: 10, height: HEIGHT - (pos.y + 30) - 18,
      fillStyle: '#6b4c2c'
    });
    for (const [dy, rx, tone] of [[26, 26, '#c98f3e'], [12, 34, '#dba54c'], [-3, 37, '#e8b659'], [-18, 33, '#dba54c'], [-30, 24, '#c98f3e'], [-39, 13, '#b87d34']]) {
      renderer.pushTransform({ x: pos.x, y: pos.y + dy, scaleX: 1, scaleY: 0.55 });
      renderer.drawArc({ x: 0, y: 0, radius: rx, fillStyle: tone });
      renderer.popTransform();
    }
    // The doorway, warm from inside — the one lit window at dusk.
    renderer.drawArc({ x: pos.x, y: pos.y + 26, radius: 7, fillStyle: '#2e2008' });
    renderer.drawArc({ x: pos.x, y: pos.y + 26, radius: 4, fillStyle: '#ffb24a' });
    if (this.lit) {
      renderer.drawLight({ x: pos.x, y: pos.y + 24, radius: 150, color: '#ffc06a', intensity: 0.7 });
    }

    for (let i = 0; i < 2; i++) {
      const t = clock * (1.2 + i * 0.4) + i * 2.6;
      renderer.drawArc({
        x: pos.x + Math.cos(t) * (34 + i * 10),
        y: pos.y + 10 + Math.sin(t * 1.7) * 16,
        radius: 2.4, fillStyle: '#3b2d14'
      });
    }
  }
}
