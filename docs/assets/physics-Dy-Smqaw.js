import { a as M2D, _ as __vitePreload } from "./m2d-DvcW-9SQ.js";
const options = {
  levelNames: ["physics.json"],
  currentLevel: "physics.json",
  levelsPath: "./levels/"
};
const K_SPACE = 32;
const canvas = document.getElementById("screen");
const game = new M2D(canvas, options);
const PHYSICS = {
  BALL: {
    RESTITUTION: 0.8,
    FRICTION: 5e-3,
    FRICTION_AIR: 1e-3,
    DENSITY: 1e-3
  },
  BOX: {
    RESTITUTION: 0.6,
    FRICTION: 0.1,
    FRICTION_AIR: 1e-3,
    DENSITY: 2e-3
  }
};
game.keys.addKey(K_SPACE);
const levelData = {
  title: "Physics Playground",
  gameType: "sideScroll",
  sprites: [
    [() => __vitePreload(() => import("./ball-B3Ql5l1k.js"), true ? [] : void 0), 32],
    [() => __vitePreload(() => import("./box-pd22jd6o.js"), true ? [] : void 0), 32],
    [() => __vitePreload(() => import("./platform-BMSBNjpN.js"), true ? [] : void 0), 32]
  ],
  player: [320, 50, 32, 32, 0, [["default", 0, 0]], {
    restitution: PHYSICS.BALL.RESTITUTION,
    friction: PHYSICS.BALL.FRICTION,
    frictionAir: PHYSICS.BALL.FRICTION_AIR,
    density: PHYSICS.BALL.DENSITY
  }],
  entities: [
    // Ground
    [320, 450, 640, 32, 2, [["default", 0, 0]], { isStatic: true }],
    // Angled platforms
    [150, 350, 200, 20, 2, [["default", 0, 0]], {
      isStatic: true,
      angle: Math.PI * 0.15
    }],
    [490, 350, 200, 20, 2, [["default", 0, 0]], {
      isStatic: true,
      angle: -Math.PI * 0.15
    }],
    // Invisible walls
    [16, 240, 32, 480, 2, [["default", 0, 0]], { isStatic: true, render: { visible: false } }],
    [624, 240, 32, 480, 2, [["default", 0, 0]], { isStatic: true, render: { visible: false } }],
    // Bouncy balls
    [100, 100, 32, 32, 0, [["default", 0, 0]], {
      restitution: PHYSICS.BALL.RESTITUTION,
      friction: PHYSICS.BALL.FRICTION,
      frictionAir: PHYSICS.BALL.FRICTION_AIR,
      density: PHYSICS.BALL.DENSITY,
      circleRadius: 16
    }],
    [200, 150, 32, 32, 0, [["default", 0, 0]], {
      restitution: PHYSICS.BALL.RESTITUTION,
      friction: PHYSICS.BALL.FRICTION,
      frictionAir: PHYSICS.BALL.FRICTION_AIR,
      density: PHYSICS.BALL.DENSITY,
      circleRadius: 16
    }],
    [400, 100, 40, 40, 1, [["default", 0, 0]], {
      restitution: PHYSICS.BOX.RESTITUTION,
      friction: PHYSICS.BOX.FRICTION,
      frictionAir: PHYSICS.BOX.FRICTION_AIR,
      density: PHYSICS.BOX.DENSITY
    }],
    [500, 150, 40, 40, 1, [["default", 0, 0]], {
      restitution: PHYSICS.BOX.RESTITUTION,
      friction: PHYSICS.BOX.FRICTION,
      frictionAir: PHYSICS.BOX.FRICTION_AIR,
      density: PHYSICS.BOX.DENSITY
    }]
  ]
};
game.levelManager.loadLevel = async () => levelData;
let spawnTimer = 0;
game.beforeUpdate = function update(deltaTime) {
  spawnTimer += deltaTime || 16.67;
  if (this.keys.pressedKeys().has(K_SPACE) && spawnTimer > 500) {
    spawnTimer = 0;
    const isBox = Math.random() > 0.5;
    const x = Math.random() * 400 + 120;
    if (isBox) {
      const boxData = [x, 50, 40, 40, 1, [["default", 0, 0]], {
        restitution: PHYSICS.BOX.RESTITUTION,
        friction: PHYSICS.BOX.FRICTION,
        frictionAir: PHYSICS.BOX.FRICTION_AIR,
        density: PHYSICS.BOX.DENSITY
      }];
      this.parseEntity(...boxData);
    } else {
      const ballData = [x, 50, 32, 32, 0, [["default", 0, 0]], {
        restitution: PHYSICS.BALL.RESTITUTION,
        friction: PHYSICS.BALL.FRICTION,
        frictionAir: PHYSICS.BALL.FRICTION_AIR,
        density: PHYSICS.BALL.DENSITY,
        circleRadius: 16
      }];
      this.parseEntity(...ballData);
    }
  }
};
game.start();
