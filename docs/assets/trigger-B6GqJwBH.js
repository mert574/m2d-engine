var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { C as Constraint } from "./keyboardControl-BNR0DhL_.js";
import { a as Matter, C as CollisionCategories } from "./m2d-BNRWOeom.js";
import { E as Entity } from "./entity-D3ytQWr6.js";
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
  Health as H,
  Trigger as T,
  Vec2 as V,
  Coin as a
};
