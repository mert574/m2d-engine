export class Constraint {
  constructor(entity) {
    this.entity = entity;
    this.context = entity.context;
  }

  update() {
    // Override in child classes
  }

  onCollisionStart(other) {
    // Override in child classes
  }

  onCollisionEnd(other) {
    // Override in child classes
  }

  draw() {
    // Override in child classes
  }
} 