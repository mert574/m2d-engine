var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { M as Matter, C as CollisionCategories, a as M2D, _ as __vitePreload } from "./m2d-DvcW-9SQ.js";
import { E as Entity, H as Health, A as Attack, K as KeyboardControl, D as Debug, C as ContactDamage, V as Vec2, P as Platform, a as Coin, T as Trigger } from "./trigger-54YWyxpt.js";
class TopDownPlayer extends Entity {
  constructor(body, sprite, game2, options = {}) {
    super(body, sprite, game2);
    __publicField(this, "name", "Player");
    Matter.Body.setMass(body, 1);
    this.facingDirection = 1;
    this.setAnimation("idle");
    this.addConstraint("health", new Health(this, {
      maxHealth: 100,
      onDeath: () => {
        console.log("Game Over!");
        this.game.gameOver();
      },
      onDamage: (amount) => {
        console.log(`Player took ${amount} damage!`);
        this.game.soundManager.playSound("damage");
      }
    }));
    this.addConstraint("attack", new Attack(this, {
      damage: 65,
      range: 50,
      cooldown: 22.5,
      onStart: () => {
        this.game.soundManager.playSound("attack");
      }
    }));
    this.addConstraint("control", new KeyboardControl(this, {
      acceleration: 50,
      maxSpeed: 3,
      continuous: true,
      verticalMovement: true,
      // Enable vertical movement for top-down
      onMove: (dx, dy) => {
        if (dx !== 0 || dy !== 0) {
          this.setAnimation("run");
        } else {
          this.setAnimation("idle");
        }
      },
      onDirectionChange: (direction) => {
        this.facingDirection = direction;
      },
      onAttack: () => {
        const attack = this.getConstraint("attack");
        if (attack) {
          attack.startAttack(this.facingDirection);
        }
      }
    }));
    this.addConstraint("debug", new Debug(this, {
      boundsColor: "#00ff00",
      boundsFillColor: "rgba(0, 255, 0, 0.1)",
      centerColor: "#ff0000",
      textColor: "#00ff00",
      healthyColor: "#00ff00",
      lowHealthColor: "#ff0000"
    }));
  }
  onCollisionStart(other) {
    var _a;
    super.onCollisionStart(other);
    if (((_a = other.entity) == null ? void 0 : _a.name) === "Coin") {
      this.game.soundManager.playSound("coin");
    }
  }
  draw() {
    super.draw();
    if (this.game.renderer.isDebugEnabled()) {
      const directionLength = 20;
      this.game.renderer.drawLine({
        x1: this.position.x,
        y1: this.position.y,
        x2: this.position.x + directionLength * this.facingDirection,
        y2: this.position.y,
        strokeStyle: "#ff0000",
        lineWidth: 1
      });
    }
  }
}
class Ghost extends Entity {
  constructor(body, sprite, game2, options = {}) {
    body.collisionFilter.category = CollisionCategories.enemy;
    super(body, sprite, game2);
    __publicField(this, "name", "Ghost");
    this.speed = 0.5;
    this.idleSpeed = 0.3;
    this.detectionRange = 400;
    this.animTime = 0;
    this.animSpeed = 6;
    this.setAnimation("idle");
    this.damageFlashTime = 0;
    this.damageFlashDuration = 0.167;
    const health = new Health(this, 40);
    health.invulnerableDuration = 0.5;
    health.onDeath = () => {
      this.game.entities.delete(this);
      Matter.Composite.remove(this.game.engine.world, this.body);
    };
    health.onDamage = () => {
      this.damageFlashTime = this.damageFlashDuration;
      this.setAnimation("idle");
      this.game.soundManager.playSound("damage");
    };
    this.addConstraint("health", health);
    this.addConstraint("debug", new Debug(this, {
      boundsColor: "#ff6b6b",
      boundsFillColor: "rgba(255, 107, 107, 0.1)",
      centerColor: "#ff6b6b",
      textColor: "#ff9999",
      healthyColor: "#ff9999",
      lowHealthColor: "#ff4d4d",
      lowHealthThreshold: 15
    }));
    this.addConstraint("contactDamage", new ContactDamage(this, {
      damage: 33,
      knockbackStrength: 8
    }));
    this.targetPoint = this.getNewTargetPoint();
    this.targetChangeTime = 0;
    this.targetChangeCooldown = 2;
  }
  getNewTargetPoint() {
    const range = 50;
    return {
      x: this.position.x + (Math.random() * range * 2 - range),
      y: this.position.y + (Math.random() * range * 2 - range)
    };
  }
  update(deltaTime) {
    if (this.dead) return;
    super.update(deltaTime);
    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= deltaTime;
    }
    if (!this.game.player) return;
    const contactDamage = this.getConstraint("contactDamage");
    if (contactDamage == null ? void 0 : contactDamage.isStunned()) return;
    const distance = Vec2.distance(this.position, this.game.player.position);
    if (distance < this.detectionRange) {
      const dir = Vec2.direction(this.position, this.game.player.position);
      const velocity = Vec2.scale(Vec2.normalize(dir), this.speed);
      Matter.Body.setVelocity(this.body, velocity);
    } else {
      this.targetChangeTime += deltaTime;
      if (this.targetChangeTime >= this.targetChangeCooldown) {
        this.targetPoint = this.getNewTargetPoint();
        this.targetChangeTime = 0;
      }
      const distance2 = Vec2.distance(this.position, this.targetPoint);
      if (distance2 > 1) {
        const dir = Vec2.direction(this.position, this.targetPoint);
        const velocity = Vec2.scale(Vec2.normalize(dir), this.idleSpeed);
        Matter.Body.setVelocity(this.body, velocity);
      }
    }
    if (this.sprite && this.sprite.image) {
      const frameCount = Math.floor(this.sprite.image.width / this.sprite.tileW);
      if (frameCount > 1) {
        this.animTime += this.animSpeed * deltaTime;
        if (this.animTime >= frameCount) {
          this.animTime = 0;
        }
        this.sprite.currentFrame = Math.floor(this.animTime);
      }
    }
  }
  draw() {
    if (this.dead) return;
    super.draw();
    if (this.damageFlashTime > 0) {
      const pos = this.position;
      this.game.renderer.drawRect({
        x: pos.x - this.size.x / 2,
        y: pos.y - this.size.y / 2,
        width: this.size.x,
        height: this.size.y,
        fillStyle: "rgba(255, 0, 0, 0.5)"
      });
    }
    if (this.game.renderer.isDebugEnabled()) {
      this.game.renderer.drawArc({
        x: this.position.x,
        y: this.position.y,
        radius: this.detectionRange,
        startAngle: 0,
        endAngle: Math.PI * 2,
        strokeStyle: "rgba(255, 214, 51, 0.4)",
        lineWidth: 1
      });
      this.game.renderer.drawArc({
        x: this.targetPoint.x,
        y: this.targetPoint.y,
        radius: 3,
        startAngle: 0,
        endAngle: Math.PI * 2,
        fillStyle: "#ffd633"
      });
      this.game.renderer.drawLine({
        x1: this.position.x,
        y1: this.position.y,
        x2: this.targetPoint.x,
        y2: this.targetPoint.y,
        strokeStyle: "rgba(255, 214, 51, 0.4)",
        lineWidth: 1
      });
      this.game.renderer.drawText({
        text: `target: ${this.targetChangeTime}/${this.targetChangeCooldown}`,
        x: this.body.bounds.min.x,
        y: this.body.bounds.max.y + 5,
        fillStyle: "#ff9999",
        fontSize: "12px",
        fontFamily: "monospace",
        textAlign: "left",
        textBaseline: "top"
      });
      if (this.game.player) {
        const distance = Vec2.distance(this.position, this.game.player.position);
        if (distance < this.detectionRange) {
          this.game.renderer.drawLine({
            x1: this.position.x,
            y1: this.position.y,
            x2: this.game.player.position.x,
            y2: this.game.player.position.y,
            strokeStyle: "rgba(255, 107, 107, 0.4)",
            lineWidth: 1
          });
        }
      }
    }
  }
}
class Projectile extends Entity {
  constructor(body, sprite, game2, options = {}) {
    body.collisionFilter.category = CollisionCategories.projectile;
    body.collisionFilter.mask = options.collisionMask ?? CollisionCategories.player | CollisionCategories.default;
    body.isSensor = options.isSensor ?? false;
    body.frictionAir = 0;
    body.friction = 0;
    body.frictionStatic = 0;
    super(body, sprite, game2);
    __publicField(this, "name", "Projectile");
    this.speed = options.speed ?? 4;
    this.damage = options.damage ?? 10;
    this.direction = Vec2.normalize(options.direction ?? { x: 1, y: 0 });
    this.lifetime = 0;
    this.maxLifetime = options.maxLifetime ?? 5;
    this.owner = options.owner ?? null;
    this.destroyOnWallHit = options.destroyOnWallHit ?? true;
    this.destroyOnEntityHit = options.destroyOnEntityHit ?? true;
    this.targetNames = options.targetNames ?? ["Player"];
    this.rotation = Math.atan2(this.direction.y, this.direction.x);
    this.applyVelocity();
  }
  applyVelocity() {
    const velocity = Vec2.scale(this.direction, this.speed);
    Matter.Body.setVelocity(this.body, velocity);
  }
  update(deltaTime) {
    if (this.dead) return;
    super.update(deltaTime);
    this.lifetime += deltaTime;
    if (this.lifetime >= this.maxLifetime) {
      this.destroy();
      return;
    }
    this.applyVelocity();
  }
  onCollisionStart(other) {
    var _a;
    super.onCollisionStart(other);
    if (this.owner && other.entity === this.owner) {
      return;
    }
    if (other.entity && this.targetNames.includes(other.entity.name)) {
      this.onHitTarget(other.entity);
      if (this.destroyOnEntityHit) {
        this.destroy();
      }
      return;
    }
    if (this.destroyOnWallHit && (((_a = other.entity) == null ? void 0 : _a.name) === "Platform" || other.isStatic)) {
      this.onHitWall(other);
      this.destroy();
    }
  }
  /**
   * Called when projectile hits a target entity.
   * Override to customize hit behavior.
   */
  onHitTarget(entity) {
    const health = entity.getConstraint("health");
    if (health) {
      health.takeDamage(this.damage);
    }
  }
  /**
   * Called when projectile hits a wall.
   * Override to add effects like explosions.
   */
  onHitWall(wall) {
  }
  /**
   * Remove projectile from the game.
   */
  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.game.entities.delete(this);
    Matter.Composite.remove(this.game.engine.world, this.body);
  }
  draw() {
    if (this.dead) return;
    const pos = this.position;
    const ctx = this.game.renderer.worldContext;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(-8, -2, 16, 4);
    ctx.restore();
  }
  setAnimation() {
  }
}
class Rocket extends Projectile {
  constructor(body, sprite, game2, options = {}) {
    super(body, sprite, game2, {
      speed: options.speed ?? 4,
      damage: options.damage ?? 25,
      direction: options.direction,
      maxLifetime: options.maxLifetime ?? 6,
      owner: options.owner,
      targetNames: ["Player"],
      ...options
    });
    __publicField(this, "name", "Rocket");
  }
  draw() {
    if (this.dead) return;
    const pos = this.position;
    const ctx = this.game.renderer.worldContext;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = "#E53935";
    ctx.fillRect(-12, -4, 20, 8);
    ctx.fillStyle = "#B71C1C";
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(14, 0);
    ctx.lineTo(8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#FF5722";
    ctx.beginPath();
    ctx.moveTo(-12, -4);
    ctx.lineTo(-16, -8);
    ctx.lineTo(-8, -4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.lineTo(-16, 8);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#FFC107";
    ctx.beginPath();
    ctx.moveTo(-12, -3);
    ctx.lineTo(-18 - Math.random() * 4, 0);
    ctx.lineTo(-12, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (this.game.renderer.isDebugEnabled()) {
      this.game.renderer.drawLine({
        x1: pos.x,
        y1: pos.y,
        x2: pos.x + this.direction.x * 30,
        y2: pos.y + this.direction.y * 30,
        strokeStyle: "rgba(255, 0, 0, 0.8)",
        lineWidth: 2
      });
    }
  }
}
class Turret extends Entity {
  constructor(body, sprite, game2, options = {}) {
    body.collisionFilter.category = CollisionCategories.enemy;
    body.isStatic = true;
    super(body, sprite, game2);
    __publicField(this, "name", "Turret");
    this.detectionRange = options.detectionRange || 350;
    this.fireRate = options.fireRate || 2;
    this.rocketSpeed = options.rocketSpeed || 3;
    this.rocketDamage = options.rocketDamage || 25;
    this.fireCooldown = 0;
    this.aimDirection = { x: 1, y: 0 };
    this.isPlayerInRange = false;
    this.hasLineOfSight = false;
    this.damageFlashTime = 0;
    this.damageFlashDuration = 0.167;
    const health = new Health(this, {
      maxHealth: options.health || 80
    });
    health.invulnerableDuration = 0.3;
    health.onDeath = () => {
      this.game.entities.delete(this);
      Matter.Composite.remove(this.game.engine.world, this.body);
    };
    health.onDamage = () => {
      this.damageFlashTime = this.damageFlashDuration;
      this.game.soundManager.playSound("damage");
    };
    this.addConstraint("health", health);
    this.addConstraint("debug", new Debug(this, {
      boundsColor: "#9C27B0",
      boundsFillColor: "rgba(156, 39, 176, 0.1)",
      centerColor: "#9C27B0",
      textColor: "#CE93D8",
      healthyColor: "#CE93D8",
      lowHealthColor: "#E91E63",
      lowHealthThreshold: 25
    }));
    this.addConstraint("contactDamage", new ContactDamage(this, {
      damage: 25,
      knockbackStrength: 6
    }));
  }
  update(deltaTime) {
    if (this.dead) return;
    super.update(deltaTime);
    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= deltaTime;
    }
    if (this.fireCooldown > 0) {
      this.fireCooldown -= deltaTime;
    }
    if (!this.game.player || this.game.player.dead) {
      this.isPlayerInRange = false;
      return;
    }
    const playerPos = this.game.player.position;
    const distance = Vec2.distance(this.position, playerPos);
    const inRange = distance < this.detectionRange;
    if (inRange) {
      this.aimDirection = Vec2.normalize(Vec2.direction(this.position, playerPos));
      this.hasLineOfSight = this.checkLineOfSight(playerPos);
      this.isPlayerInRange = this.hasLineOfSight;
      if (this.fireCooldown <= 0 && this.hasLineOfSight) {
        this.fireRocket();
        this.fireCooldown = this.fireRate;
      }
    } else {
      this.isPlayerInRange = false;
      this.hasLineOfSight = false;
    }
  }
  checkLineOfSight(targetPos) {
    const start = this.position;
    const bodies = Matter.Composite.allBodies(this.game.engine.world);
    const walls = bodies.filter(
      (body) => {
        var _a;
        return body.isStatic && body !== this.body && ((_a = body.entity) == null ? void 0 : _a.name) === "Platform";
      }
    );
    const collisions = Matter.Query.ray(walls, start, targetPos);
    return collisions.length === 0;
  }
  fireRocket() {
    const spawnOffset = 20;
    const spawnPos = {
      x: this.position.x + this.aimDirection.x * spawnOffset,
      y: this.position.y + this.aimDirection.y * spawnOffset
    };
    const rocketBody = Matter.Bodies.rectangle(
      spawnPos.x,
      spawnPos.y,
      24,
      8,
      {
        friction: 0,
        frictionAir: 0,
        frictionStatic: 0,
        restitution: 0,
        density: 1e-3
      }
    );
    const rocket = new Rocket(rocketBody, null, this.game, {
      speed: this.rocketSpeed,
      damage: this.rocketDamage,
      direction: { ...this.aimDirection },
      maxLifetime: 6
    });
    this.game.entities.add(rocket);
    Matter.Composite.add(this.game.engine.world, rocketBody);
  }
  draw() {
    if (this.dead) return;
    const pos = this.position;
    const ctx = this.game.renderer.worldContext;
    ctx.fillStyle = "#4A148C";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7B1FA2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    const barrelLength = 20;
    const barrelWidth = 6;
    const angle = Math.atan2(this.aimDirection.y, this.aimDirection.x);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.fillStyle = "#6A1B9A";
    ctx.fillRect(0, -barrelWidth / 2, barrelLength, barrelWidth);
    ctx.fillStyle = "#8E24AA";
    ctx.fillRect(barrelLength - 4, -barrelWidth / 2 - 2, 6, barrelWidth + 4);
    ctx.restore();
    ctx.fillStyle = this.isPlayerInRange ? "#E91E63" : "#9C27B0";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
    ctx.fill();
    if (this.damageFlashTime > 0) {
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.isPlayerInRange && this.fireCooldown > 0) {
      const cooldownPercent = this.fireCooldown / this.fireRate;
      ctx.strokeStyle = "rgba(255, 255, 0, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, -Math.PI / 2, -Math.PI / 2 + (1 - cooldownPercent) * Math.PI * 2);
      ctx.stroke();
    }
    if (this.game.renderer.isDebugEnabled()) {
      this.game.renderer.drawArc({
        x: pos.x,
        y: pos.y,
        radius: this.detectionRange,
        startAngle: 0,
        endAngle: Math.PI * 2,
        strokeStyle: "rgba(156, 39, 176, 0.3)",
        lineWidth: 1
      });
      if (this.isPlayerInRange) {
        this.game.renderer.drawLine({
          x1: pos.x,
          y1: pos.y,
          x2: pos.x + this.aimDirection.x * this.detectionRange,
          y2: pos.y + this.aimDirection.y * this.detectionRange,
          strokeStyle: "rgba(233, 30, 99, 0.5)",
          lineWidth: 1
        });
      }
      this.game.renderer.drawText({
        text: `fire: ${this.fireCooldown.toFixed(1)}s`,
        x: this.body.bounds.min.x,
        y: this.body.bounds.max.y + 5,
        fillStyle: "#CE93D8",
        fontSize: "12px",
        fontFamily: "monospace",
        textAlign: "left",
        textBaseline: "top"
      });
    }
  }
  setAnimation() {
  }
}
const canvas = document.getElementById("screen");
const game = new M2D(canvas, {
  initialScene: "mainMenu",
  width: 1280,
  height: 960,
  worldWidth: 3840,
  worldHeight: 2880,
  basePath: "/m2d-engine/examples/topdown/"
});
[TopDownPlayer, Ghost, Platform, Coin, Trigger, Turret].forEach((actor) => {
  game.registerActor(actor.name, actor);
});
game.sceneManager.addScene("mainMenu", {
  fetch: async () => (await __vitePreload(async () => {
    const { default: __vite_default__ } = await import("./mainMenu-B7MXsMah.js");
    return { default: __vite_default__ };
  }, true ? [] : void 0)).default
});
game.sceneManager.addScene("level1", {
  fetch: async () => (await __vitePreload(async () => {
    const { default: __vite_default__ } = await import("./level1-D-7s_kfV.js");
    return { default: __vite_default__ };
  }, true ? [] : void 0)).default
});
game.start();
