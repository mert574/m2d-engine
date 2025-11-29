var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { M as Matter, C as CollisionCategories, K as KEY_X, b as KEY_SPACE, c as KEY_DOWN, d as KEY_UP, e as KEY_RIGHT, f as KEY_LEFT } from "./m2d-BqOTLTDi.js";
class Entity {
  constructor(body, sprite, game) {
    __publicField(this, "name", "Entity");
    if (!body) {
      throw new Error("Physics body is required");
    }
    if (!game) {
      throw new Error("Game instance is required");
    }
    this.body = body;
    this.sprite = sprite;
    this.game = game;
    body.entity = this;
    this.constraints = /* @__PURE__ */ new Map();
    this.currentAnim = null;
    this.dead = false;
    this.size = {
      x: body.bounds.max.x - body.bounds.min.x,
      y: body.bounds.max.y - body.bounds.min.y
    };
    this._contacts = /* @__PURE__ */ new Set();
  }
  addConstraint(name, constraint) {
    this.constraints.set(name, constraint);
  }
  getConstraint(name) {
    return this.constraints.get(name);
  }
  onCollisionStart(other) {
    this._contacts.add(other);
    for (const constraint of this.constraints.values()) {
      constraint.onCollisionStart(other);
    }
  }
  onCollisionEnd(other) {
    this._contacts.delete(other);
    for (const constraint of this.constraints.values()) {
      constraint.onCollisionEnd(other);
    }
  }
  update(deltaTime) {
    if (this.dead) return;
    for (const constraint of this.constraints.values()) {
      constraint.update(deltaTime);
    }
  }
  draw(deltaTime) {
    if (this.dead) return;
    const pos = this.body.position;
    if (!this.sprite || !this.sprite.width) {
      this.game.renderer.drawRect({
        x: pos.x - this.size.x / 2,
        y: pos.y - this.size.y / 2,
        width: this.size.x,
        height: this.size.y,
        fillStyle: "#ff0000"
      });
      return;
    }
    const tileSize = this.sprite.width;
    const tilesNeededX = Math.ceil(this.size.x / tileSize);
    const tilesNeededY = Math.ceil(this.size.y / tileSize);
    for (let i = 0; i < tilesNeededX; i++) {
      for (let j = 0; j < tilesNeededY; j++) {
        const x = pos.x - this.size.x / 2 + i * tileSize + tileSize / 2;
        const y = pos.y - this.size.y / 2 + j * tileSize + tileSize / 2;
        this.sprite.draw(this.currentAnim, x, y, {
          rotation: this.body.angle
        });
      }
    }
    for (const constraint of this.constraints.values()) {
      constraint.draw(deltaTime);
    }
  }
  get position() {
    return this.body.position;
  }
  get velocity() {
    return this.body.velocity;
  }
  setAnimation(name) {
    if (!this.sprite) return;
    if (!name || !this.sprite.animations) {
      this.currentAnim = null;
      return;
    }
    if (this.sprite.animations.has(name)) {
      this.currentAnim = name;
    }
  }
  isFalling(threshold = 0.5) {
    return this.velocity.y > threshold;
  }
  isJumping(threshold = -0.5) {
    return this.velocity.y < threshold;
  }
  isMovingHorizontally(threshold = 0.1) {
    return Math.abs(this.velocity.x) > threshold;
  }
  isMovingLeft(threshold = 0.1) {
    return this.velocity.x < -threshold;
  }
  isMovingRight(threshold = 0.1) {
    return this.velocity.x > threshold;
  }
  isInAir() {
    return !this.isOnGround();
  }
  isOnGround() {
    const world = this.game.engine.world;
    const contacts = Matter.Query.collides(this.body, Matter.Composite.allBodies(world));
    for (const { bodyA, bodyB } of contacts) {
      const contact = bodyA === this.body ? bodyB : bodyA;
      if (!contact.entity) continue;
      if (contact.entity.name !== "Platform") continue;
      const dy = contact.position.y - this.position.y;
      if (dy > 0 && Math.abs(dy) < this.size.y) {
        return true;
      }
    }
    return false;
  }
}
class Constraint {
  constructor(entity) {
    this.entity = entity;
  }
  update() {
  }
  onCollisionStart(other) {
  }
  onCollisionEnd(other) {
  }
  draw() {
  }
}
class Health extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.maxHealth = options.maxHealth || 100;
    this.currentHealth = this.maxHealth;
    this.invulnerableTime = 0;
    this.invulnerableDuration = options.invulnerableDuration || 1;
    this.onDeath = options.onDeath || null;
    this.onDamage = options.onDamage || null;
  }
  update(deltaTime) {
    if (this.invulnerableTime > 0) {
      this.invulnerableTime -= deltaTime;
    }
  }
  isInvulnerable() {
    return this.invulnerableTime > 0;
  }
  takeDamage(amount) {
    if (this.isInvulnerable()) return;
    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.invulnerableTime = this.invulnerableDuration;
    if (this.onDamage) {
      this.onDamage(amount);
    }
    if (this.currentHealth === 0) {
      this.entity.dead = true;
      if (this.onDeath) {
        this.onDeath();
      }
    }
  }
  heal(amount) {
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
  }
  draw() {
    if (this.entity.dead) return;
    const pos = this.entity.position;
    const size = this.entity.size;
    const barWidth = size.x;
    const barHeight = 4;
    const barY = pos.y - size.y / 2 - 10;
    const barX = pos.x - barWidth / 2;
    const ctx = this.entity.game.renderer.worldContext;
    ctx.fillStyle = "#333";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = this.currentHealth > 30 ? "#2ecc71" : "#e74c3c";
    ctx.fillRect(
      barX,
      barY,
      barWidth * this.healthPercentage,
      barHeight
    );
  }
  get healthPercentage() {
    return this.currentHealth / this.maxHealth;
  }
  get isAlive() {
    return this.currentHealth > 0;
  }
}
const Vec2 = {
  distance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  },
  direction(from, to) {
    return {
      x: to.x - from.x,
      y: to.y - from.y
    };
  },
  normalize(vec) {
    const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
    return len > 0 ? { x: vec.x / len, y: vec.y / len } : { x: 0, y: 0 };
  },
  scale(vec, scalar) {
    return {
      x: vec.x * scalar,
      y: vec.y * scalar
    };
  }
};
const Angle = {
  // Returns angle in radians between -PI and PI
  between(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  },
  // Returns true if angle is within the half circle defined by direction
  inHalfCircle(angle, direction) {
    if (direction > 0) {
      return Math.abs(angle) < Math.PI / 2;
    } else {
      return Math.abs(angle) > Math.PI / 2;
    }
  }
};
class Attack extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.damage = options.damage || 10;
    this.range = options.range || 40;
    this.cooldown = (options.cooldown || 30) / 60;
    this.knockback = options.knockback || 0.02;
    this.onStart = options.onStart;
    this.isAttacking = false;
    this.currentCooldown = 0;
    this.direction = 1;
    this.hits = /* @__PURE__ */ new Set();
    this.attackDuration = 0.167;
    this.attackTime = 0;
    this.attackAnimEndTime = 0.333;
    this.hasCheckedHits = false;
    this.hitCircle = Matter.Bodies.circle(0, 0, this.range, {
      isSensor: true,
      isStatic: true,
      collisionFilter: { category: CollisionCategories.enemy }
    });
    Matter.Composite.add(this.entity.game.engine.world, this.hitCircle);
  }
  update(deltaTime) {
    var _a;
    if (this.currentCooldown > 0) {
      this.currentCooldown -= deltaTime;
    }
    Matter.Body.setPosition(this.hitCircle, this.entity.position);
    if (this.isAttacking) {
      if (!this.hasCheckedHits) {
        this.checkHits();
        this.hasCheckedHits = true;
      }
      this.attackTime += deltaTime;
      if (this.attackTime >= this.attackDuration) {
        this.isAttacking = false;
        this.attackTime = 0;
        this.hasCheckedHits = false;
      }
      if (this.attackTime >= this.attackAnimEndTime && ((_a = this.entity.currentAnim) == null ? void 0 : _a.includes("attack"))) {
        this.entity.setAnimation("idle");
      }
    }
  }
  checkHits() {
    const collisions = Matter.Query.collides(
      this.hitCircle,
      Matter.Composite.allBodies(this.entity.game.engine.world).filter((body) => body.collisionFilter.category === CollisionCategories.enemy)
    );
    for (const collision of collisions) {
      const body = collision.bodyA === this.hitCircle ? collision.bodyB : collision.bodyA;
      if (!body.entity || body.entity === this.entity || this.hits.has(body.entity)) continue;
      const attackPoint = {
        x: this.entity.position.x + this.direction * this.entity.size.x / 2,
        y: this.entity.position.y
      };
      const angle = Angle.between(attackPoint, body.position);
      if (Angle.inHalfCircle(angle, this.direction)) {
        this.hits.add(body.entity);
        const health = body.entity.getConstraint("health");
        if (health && !health.isInvulnerable()) {
          health.takeDamage(this.damage);
          Matter.Body.applyForce(
            body,
            body.position,
            { x: this.direction * 0.5, y: -0.3 }
          );
        }
      }
    }
  }
  startAttack(direction) {
    if (this.currentCooldown > 0) return;
    this.isAttacking = true;
    this.direction = direction;
    this.hits.clear();
    this.currentCooldown = this.cooldown;
    this.attackTime = 0;
    this.entity.setAnimation(direction > 0 ? "attackRight" : "attackLeft");
    if (this.onStart) {
      this.onStart();
    }
  }
  draw() {
    const pos = this.entity.position;
    this.entity.game.renderer.drawArc({
      x: pos.x,
      y: pos.y,
      radius: this.range,
      startAngle: 0,
      endAngle: Math.PI * 2,
      strokeStyle: "rgba(0, 150, 255, 0.3)",
      fill: false
    });
    if (this.isAttacking) {
      this.entity.game.renderer.drawArc({
        x: pos.x,
        y: pos.y,
        radius: this.range,
        startAngle: this.direction > 0 ? -Math.PI / 2 : Math.PI / 2,
        endAngle: this.direction > 0 ? Math.PI / 2 : 3 * Math.PI / 2,
        fillStyle: "rgba(255, 0, 0, 0.2)",
        strokeStyle: "rgba(255, 0, 0, 0.5)"
      });
    }
  }
}
class Debug extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.options = {
      showBounds: options.showBounds ?? true,
      showCenter: options.showCenter ?? true,
      showVelocity: options.showVelocity ?? true,
      showHealth: options.showHealth ?? true,
      boundsColor: options.boundsColor || "#00ff00",
      boundsFillColor: options.boundsFillColor || "rgba(0, 255, 0, 0.1)",
      centerColor: options.centerColor || "#ff0000",
      textColor: options.textColor || "#00ff00",
      healthyColor: options.healthyColor || "#00ff00",
      lowHealthColor: options.lowHealthColor || "#ff0000",
      lowHealthThreshold: options.lowHealthThreshold || 30,
      font: {
        size: options.fontSize || "12px",
        family: options.fontFamily || "monospace"
      }
    };
  }
  draw() {
    if (!this.entity.game.renderer.isDebugEnabled()) return;
    const bounds = this.entity.body.bounds;
    const renderer = this.entity.game.renderer;
    if (this.options.showBounds) {
      renderer.drawRect({
        x: bounds.min.x,
        y: bounds.min.y,
        width: bounds.max.x - bounds.min.x,
        height: bounds.max.y - bounds.min.y,
        strokeStyle: this.options.boundsColor,
        fillStyle: this.options.boundsFillColor,
        lineWidth: 1
      });
    }
    if (this.options.showCenter) {
      renderer.drawArc({
        x: this.entity.position.x,
        y: this.entity.position.y,
        radius: 2,
        startAngle: 0,
        endAngle: Math.PI * 2,
        fillStyle: this.options.centerColor
      });
    }
    let textY = bounds.min.y - 50;
    if (this.options.showVelocity) {
      const vx = Math.abs(this.entity.body.velocity.x) < 0.01 ? 0 : this.entity.body.velocity.x;
      const vy = Math.abs(this.entity.body.velocity.y) < 0.01 ? 0 : this.entity.body.velocity.y;
      renderer.drawText({
        text: `vel: ${vx.toFixed(1)}, ${vy.toFixed(1)}`,
        x: bounds.min.x,
        y: textY,
        fillStyle: this.options.textColor,
        fontSize: this.options.font.size,
        fontFamily: this.options.font.family,
        textAlign: "left",
        textBaseline: "top"
      });
      textY -= 15;
    }
    if (this.options.showHealth) {
      const health = this.entity.getConstraint("health");
      if (health) {
        renderer.drawText({
          text: `hp: ${health.currentHealth}/${health.maxHealth}`,
          x: bounds.min.x,
          y: textY,
          fillStyle: health.currentHealth > this.options.lowHealthThreshold ? this.options.healthyColor : this.options.lowHealthColor,
          fontSize: this.options.font.size,
          fontFamily: this.options.font.family,
          textAlign: "left",
          textBaseline: "top"
        });
        textY -= 15;
      }
    }
  }
  setOption(key, value) {
    if (key in this.options) {
      this.options[key] = value;
    }
  }
}
const norm = Math.sqrt(2);
class KeyboardControl extends Constraint {
  constructor(entity, options = {}) {
    var _a, _b, _c, _d;
    super(entity);
    this.keys = {
      left: KEY_LEFT,
      right: KEY_RIGHT,
      up: KEY_UP,
      down: KEY_DOWN,
      jump: KEY_SPACE,
      attack: KEY_X,
      ...options.keys
    };
    this.acceleration = options.acceleration || options.moveForce * 1e3 || 10;
    this.maxSpeed = options.maxSpeed || 5;
    this.continuous = options.continuous ?? true;
    this.verticalMovement = options.verticalMovement ?? true;
    Object.values(this.keys).forEach((key) => {
      this.entity.game.keys.addKey(key);
    });
    this.onMove = (_a = options.onMove) == null ? void 0 : _a.bind(entity);
    this.onDirectionChange = (_b = options.onDirectionChange) == null ? void 0 : _b.bind(entity);
    this.onJump = (_c = options.onJump) == null ? void 0 : _c.bind(entity);
    this.onAttack = (_d = options.onAttack) == null ? void 0 : _d.bind(entity);
  }
  update(deltaTime) {
    var _a, _b;
    if (this.entity.dead) return;
    const pressedKeys = this.entity.game.keys.pressedKeys();
    let dx = 0;
    let dy = 0;
    if (pressedKeys.has(this.keys.left)) dx -= 1;
    if (pressedKeys.has(this.keys.right)) dx += 1;
    if (this.verticalMovement) {
      if (pressedKeys.has(this.keys.up)) dy -= 1;
      if (pressedKeys.has(this.keys.down)) dy += 1;
    }
    if (dx !== 0 && dy !== 0) {
      dx /= norm;
      dy /= norm;
    }
    if (dx !== 0 || dy !== 0) {
      if (this.continuous) {
        const currentVel = this.entity.body.velocity;
        const accel = this.acceleration * deltaTime;
        Matter.Body.setVelocity(this.entity.body, {
          x: currentVel.x + dx * accel,
          y: currentVel.y + dy * accel
        });
      } else {
        Matter.Body.setVelocity(
          this.entity.body,
          { x: dx * this.maxSpeed, y: dy * this.maxSpeed }
        );
      }
    }
    if (this.onDirectionChange && dx !== 0) {
      this.onDirectionChange(dx > 0 ? 1 : -1);
    }
    if (this.onMove) {
      this.onMove(dx, dy);
    }
    if (pressedKeys.has(this.keys.jump)) {
      (_a = this.onJump) == null ? void 0 : _a.call(this);
    }
    if (pressedKeys.has(this.keys.attack)) {
      (_b = this.onAttack) == null ? void 0 : _b.call(this);
    }
    if (this.continuous) {
      const velocity = this.entity.velocity;
      const speed = Math.abs(velocity.x);
      if (speed > this.maxSpeed) {
        const scale = this.maxSpeed / speed;
        Matter.Body.setVelocity(this.entity.body, {
          x: velocity.x * scale,
          y: velocity.y
        });
      }
    }
  }
}
class ContactDamage extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.damage = options.damage ?? 33;
    this.knockbackStrength = options.knockbackStrength ?? 12;
    this.stunDuration = options.stunDuration ?? 0.5;
    this.stunTime = 0;
    this.collidingEntities = /* @__PURE__ */ new Set();
  }
  update(deltaTime) {
    if (this.stunTime > 0) {
      this.stunTime -= deltaTime;
    }
    for (const otherEntity of this.collidingEntities) {
      if (otherEntity.dead) {
        this.collidingEntities.delete(otherEntity);
        continue;
      }
      this.applyDamage(otherEntity);
    }
  }
  isStunned() {
    return this.stunTime > 0;
  }
  applyDamage(otherEntity) {
    const health = otherEntity.getConstraint("health");
    if (!health || health.isInvulnerable()) return;
    if (otherEntity.getConstraint("contactDamage")) return;
    health.takeDamage(this.damage);
    if (this.knockbackStrength > 0) {
      const dx = otherEntity.position.x - this.entity.position.x;
      const dy = otherEntity.position.y - this.entity.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;
      Matter.Body.setVelocity(otherEntity.body, {
        x: dirX * this.knockbackStrength,
        y: dirY * this.knockbackStrength
      });
      if (!this.entity.body.isStatic) {
        this.stunTime = this.stunDuration;
      }
    }
  }
  onCollisionStart(other) {
    const otherEntity = other.entity;
    if (!otherEntity) return;
    if (!otherEntity.getConstraint("contactDamage")) {
      this.collidingEntities.add(otherEntity);
    }
    this.applyDamage(otherEntity);
  }
  onCollisionEnd(other) {
    const otherEntity = other.entity;
    if (otherEntity) {
      this.collidingEntities.delete(otherEntity);
    }
  }
}
class Platform extends Entity {
  constructor(body, sprite, game, options = {}) {
    var _a;
    super(body, sprite, game);
    __publicField(this, "name", "Platform");
    this.visible = !((_a = body.render) == null ? void 0 : _a.visible) === false;
    this.setAnimation("default");
  }
}
class Coin extends Entity {
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    __publicField(this, "name", "Coin");
    this.floatOffset = 0;
    this.floatSpeed = 2;
    this.floatAmount = 5;
    this.baseY = body.position.y;
    this.rotation = 0;
    this.rotationSpeed = 2;
  }
  update(deltaTime) {
    this.floatOffset += this.floatSpeed * deltaTime;
    const newY = this.baseY + Math.sin(this.floatOffset) * this.floatAmount;
    this.rotation += this.rotationSpeed * deltaTime;
    Matter.Body.setPosition(this.body, {
      x: this.body.position.x,
      y: newY
    });
    Matter.Body.setAngle(this.body, this.rotation);
  }
  onCollisionStart(other) {
    if (other.entity && other.entity === this.game.player) {
      this.game.entities.delete(this);
      Matter.World.remove(this.game.engine.world, this.body);
    }
  }
}
class Trigger extends Entity {
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    __publicField(this, "name", "Trigger");
    this.active = options.active || false;
    this.visible = options.visible || false;
    this.triggers = options.triggers || [];
    this.debugColor = options.debugColor || "#e7693166";
  }
  onCollisionStart(other) {
    var _a;
    super.onCollisionStart(other);
    if (!this.active) return;
    if (((_a = other.entity) == null ? void 0 : _a.name) === "Player") {
      if (this.category === "levelComplete") {
        this.game.soundManager.playSound("levelComplete");
      }
      if (this.onEnter) {
        this.onEnter(other.entity, this.data);
      }
    }
  }
  onCollisionEnd(other) {
    var _a;
    super.onCollisionEnd(other);
    if (!this.active) return;
    if (((_a = other.entity) == null ? void 0 : _a.name) === "Player" && this.onExit) {
      this.onExit(other.entity, this.data);
    }
  }
  setAnimation() {
  }
  draw() {
    if (!this.visible) return;
    if (this.sprite) {
      super.draw();
    }
    const bounds = this.body.bounds;
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;
    const ctx = this.game.renderer.worldContext;
    ctx.save();
    ctx.fillStyle = this.debugColor;
    ctx.fillRect(
      this.body.position.x - width / 2,
      this.body.position.y - height / 2,
      width,
      height
    );
    ctx.fillStyle = "#ffffffaa";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(
      this.triggers,
      this.body.position.x,
      this.body.position.y + 3.5
    );
    ctx.restore();
  }
  setActive(active) {
    this.active = active;
  }
  setVisible(visible) {
    this.visible = visible;
  }
  onEnter(entity, data) {
    console.log("onEnter", entity, data);
    this.game.sceneManager.switchTo("mainMenu");
  }
}
export {
  Attack as A,
  ContactDamage as C,
  Debug as D,
  Entity as E,
  Health as H,
  KeyboardControl as K,
  Platform as P,
  Trigger as T,
  Vec2 as V,
  Coin as a
};
