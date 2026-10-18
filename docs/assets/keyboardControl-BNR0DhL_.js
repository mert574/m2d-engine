var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { E as Entity } from "./entity-D3ytQWr6.js";
import { K as KEY_X, b as KEY_SPACE, c as KEY_DOWN, d as KEY_UP, e as KEY_RIGHT, f as KEY_LEFT, a as Matter } from "./m2d-BNRWOeom.js";
class Platform extends Entity {
  constructor(body, sprite, game, options = {}) {
    var _a;
    super(body, sprite, game);
    __publicField(this, "name", "Platform");
    this.visible = !((_a = body.render) == null ? void 0 : _a.visible) === false;
    this.setAnimation("default");
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
export {
  Constraint as C,
  KeyboardControl as K,
  Platform as P
};
