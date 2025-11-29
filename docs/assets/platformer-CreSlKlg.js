var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { M as Matter, C as CollisionCategories, a as M2D, _ as __vitePreload } from "./m2d-BqOTLTDi.js";
import { E as Entity, H as Health, A as Attack, K as KeyboardControl, D as Debug, C as ContactDamage, V as Vec2, P as Platform, a as Coin, T as Trigger } from "./trigger-jWeoQRfe.js";
class MovingPlatform extends Entity {
  constructor(body, sprite, game2, options = {}) {
    var _a, _b, _c;
    body.isStatic = true;
    body.friction = 1;
    body.frictionStatic = 1;
    body.restitution = 0;
    super(body, sprite, game2);
    __publicField(this, "name", "MovingPlatform");
    this.points = ((_a = options.path) == null ? void 0 : _a.points) || [];
    this.speed = ((_b = options.path) == null ? void 0 : _b.speed) || 3;
    this.waitTime = ((_c = options.path) == null ? void 0 : _c.waitTime) || 1e3;
    this.currentPoint = 0;
    this.waiting = false;
    this.waitStart = 0;
    this.lastPosition = this.points[0] ? { ...this.points[0] } : { x: body.position.x, y: body.position.y };
    this.ridingEntities = /* @__PURE__ */ new Set();
    if (this.points.length > 0) {
      Matter.Body.setPosition(this.body, this.points[0]);
    }
  }
  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.position.y < this.position.y && Math.abs(other.position.x - this.position.x) < this.size.x / 2 + other.bounds.max.x - other.bounds.min.x / 2) {
      this.ridingEntities.add(other);
    }
  }
  onCollisionEnd(other) {
    super.onCollisionEnd(other);
    this.ridingEntities.delete(other);
  }
  update(deltaTime) {
    if (this.points.length < 2) return;
    if (this.waiting) {
      const elapsedTime = Date.now() - this.waitStart;
      if (elapsedTime >= this.waitTime) {
        this.waiting = false;
        this.currentPoint = (this.currentPoint + 1) % this.points.length;
      }
      return;
    }
    const target = this.points[this.currentPoint];
    const dx = target.x - this.body.position.x;
    const dy = target.y - this.body.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1) {
      this.waiting = true;
      this.waitStart = Date.now();
      Matter.Body.setPosition(this.body, target);
      return;
    }
    const actualMove = Math.min(this.speed * deltaTime, distance);
    const vx = dx / distance * actualMove;
    const vy = dy / distance * actualMove;
    this.lastPosition = { x: this.body.position.x, y: this.body.position.y };
    Matter.Body.setPosition(this.body, {
      x: this.body.position.x + vx,
      y: this.body.position.y + vy
    });
    const delta = {
      x: this.body.position.x - this.lastPosition.x,
      y: this.body.position.y - this.lastPosition.y
    };
    for (const body of this.ridingEntities) {
      if (body.entity) {
        Matter.Body.translate(body, delta);
      }
    }
  }
}
class Player extends Entity {
  constructor(body, sprite, game2, options = {}) {
    super(body, sprite, game2);
    __publicField(this, "name", "Player");
    Matter.Body.setMass(body, 1);
    this.jumpVelocity = 12;
    this.facingDirection = 1;
    this.setAnimation("idle");
    this.groundContacts = /* @__PURE__ */ new Set();
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
      verticalMovement: false,
      onMove: (dx, dy) => {
        if (dx !== 0) {
          this.setAnimation("run");
        } else {
          this.setAnimation("idle");
        }
      },
      onDirectionChange: (direction) => {
        this.facingDirection = direction;
      },
      onJump: () => {
        if (this.isOnGround()) {
          Matter.Body.setVelocity(this.body, { x: this.body.velocity.x, y: -this.jumpVelocity });
          this.setAnimation("jump");
          this.game.soundManager.playSound("jump");
        }
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
    var _a, _b, _c;
    super.onCollisionStart(other);
    if (((_a = other.entity) == null ? void 0 : _a.name) === "Coin") {
      this.game.soundManager.playSound("coin");
    }
    if (other.position.y > this.position.y + this.size.y / 2) {
      if (((_b = other.entity) == null ? void 0 : _b.name) === "Platform" || ((_c = other.entity) == null ? void 0 : _c.name) === "MovingPlatform") {
        this.groundContacts.add(other.id);
      }
    }
  }
  onCollisionEnd(other) {
    super.onCollisionEnd(other);
    this.groundContacts.delete(other.id);
  }
  isOnGround() {
    return this.groundContacts.size > 0;
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
      this.game.renderer.drawText({
        text: `ground: ${this.isOnGround()}`,
        x: this.body.bounds.min.x,
        y: this.body.bounds.max.y + 5,
        fillStyle: "#00ff00",
        fontSize: "12px",
        fontFamily: "monospace",
        textAlign: "left",
        textBaseline: "top"
      });
    }
  }
}
class Bee extends Entity {
  constructor(body, sprite, game2, options = {}) {
    body.collisionFilter.category = CollisionCategories.enemy;
    super(body, sprite, game2);
    __publicField(this, "name", "Bee");
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
      knockbackStrength: 12
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
const jumpSound = "/m2d-engine/assets/jump-DbRpACDv.wav";
const coinSound = "/m2d-engine/assets/coin-icAG3rpw.wav";
const gameOverSound = "/m2d-engine/assets/gameover-DmpiVOiz.wav";
const levelCompleteSound = "/m2d-engine/assets/levelComplete-CQt4W0jU.wav";
const attackSound = "/m2d-engine/assets/attack-BnULeXjg.wav";
const damageSound = "/m2d-engine/assets/damage-BU-jNE3L.wav";
const menuMusic = "/m2d-engine/assets/menu-BqcfDrtw.mp3";
const gameMusic = "/m2d-engine/assets/game-C8rRGqtg.mp3";
const canvas = document.getElementById("screen");
const game = new M2D(canvas, {
  initialScene: "mainMenu",
  width: 1280,
  height: 960,
  worldWidth: 1920,
  worldHeight: 1440,
  basePath: "/m2d-engine/examples/platformer/",
  sounds: {
    jump: jumpSound,
    coin: coinSound,
    gameOver: gameOverSound,
    levelComplete: levelCompleteSound,
    attack: attackSound,
    damage: damageSound
  },
  music: {
    menu: menuMusic,
    game: gameMusic
  }
});
[Player, Bee, Platform, MovingPlatform, Coin, Trigger].forEach((actor) => {
  game.registerActor(actor.name, actor);
});
game.sceneManager.addScene("mainMenu", {
  fetch: async () => (await __vitePreload(async () => {
    const { default: __vite_default__ } = await import("./mainMenu-DFv_Y5ti.js");
    return { default: __vite_default__ };
  }, true ? [] : void 0)).default,
  onEnter() {
    game.soundManager.playMusic("menu");
  }
});
game.sceneManager.addScene("level1", {
  fetch: async () => (await __vitePreload(async () => {
    const { default: __vite_default__ } = await import("./level1-CTX84xbv.js");
    return { default: __vite_default__ };
  }, true ? [] : void 0)).default,
  onEnter() {
    game.soundManager.playMusic("game");
  }
});
game.start();
