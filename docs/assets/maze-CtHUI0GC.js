import { f as M2D, _ as __vitePreload } from "./m2d-D7RYwzOZ.js";
const options = {
  levelNames: ["maze.json"],
  currentLevel: "maze.json",
  levelsPath: "./levels/"
};
const K_UP = 38, K_DOWN = 40, K_LEFT = 37, K_RIGHT = 39;
const canvas = document.getElementById("screen");
const game = new M2D(canvas, options);
const PHYSICS = {
  MOVE_FORCE: 0.01,
  FRICTION_FACTOR: 0.95
};
game.keys.addKey(K_UP);
game.keys.addKey(K_DOWN);
game.keys.addKey(K_LEFT);
game.keys.addKey(K_RIGHT);
const levelData = {
  title: "Maze Game",
  gameType: "topDown",
  sprites: [
    [() => __vitePreload(() => import("./player-C36SEKvB.js"), true ? [] : void 0), 32],
    [() => __vitePreload(() => import("./wall-CcYP7Ail.js"), true ? [] : void 0), 32],
    [() => __vitePreload(() => import("./floor-qTFM5NND.js"), true ? [] : void 0), 32]
  ],
  background: [2, 0, 0],
  // Floor tiles
  player: [50, 50, 32, 32, 0, [["default", 0, 0]], {
    frictionAir: 0.2,
    friction: 0.1,
    density: 1e-3
  }],
  entities: [
    // Outer walls
    [320, 16, 640, 32, 1, [["default", 0, 0]], { isStatic: true }],
    [320, 464, 640, 32, 1, [["default", 0, 0]], { isStatic: true }],
    [16, 240, 32, 480, 1, [["default", 0, 0]], { isStatic: true }],
    [624, 240, 32, 480, 1, [["default", 0, 0]], { isStatic: true }],
    // Maze walls
    [200, 150, 32, 200, 1, [["default", 0, 0]], { isStatic: true }],
    [400, 300, 32, 200, 1, [["default", 0, 0]], { isStatic: true }],
    [300, 200, 200, 32, 1, [["default", 0, 0]], { isStatic: true }],
    [100, 350, 200, 32, 1, [["default", 0, 0]], { isStatic: true }]
  ]
};
game.levelManager.loadLevel = async () => levelData;
game.beforeUpdate = function update() {
  const pos = this.player.body.position;
  for (let key of this.keys.pressedKeys()) {
    switch (key) {
      case K_LEFT:
        game.Body.applyForce(this.player.body, pos, { x: -PHYSICS.MOVE_FORCE, y: 0 });
        break;
      case K_RIGHT:
        game.Body.applyForce(this.player.body, pos, { x: PHYSICS.MOVE_FORCE, y: 0 });
        break;
      case K_UP:
        game.Body.applyForce(this.player.body, pos, { x: 0, y: -PHYSICS.MOVE_FORCE });
        break;
      case K_DOWN:
        game.Body.applyForce(this.player.body, pos, { x: 0, y: PHYSICS.MOVE_FORCE });
        break;
    }
  }
  if (!this.keys.pressedKeys().size) {
    game.Body.setVelocity(this.player.body, {
      x: this.player.body.velocity.x * PHYSICS.FRICTION_FACTOR,
      y: this.player.body.velocity.y * PHYSICS.FRICTION_FACTOR
    });
  }
};
game.start();
