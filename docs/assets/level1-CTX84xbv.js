const version = 1;
const name = "level1";
const type = "level";
const gameType = "sideScroll";
const world = {
  width: 1920,
  height: 1440,
  gravity: {
    x: 0,
    y: 1
  }
};
const assets = {
  spritesheets: {
    platform: {
      url: "assets/platform.png",
      frameWidth: 32,
      frameHeight: 32
    },
    player: {
      url: "assets/player.png",
      frameWidth: 32,
      frameHeight: 32,
      animations: {
        idle: {
          frames: [
            [
              0,
              0
            ]
          ],
          loop: true
        },
        run: {
          frames: [
            [
              1,
              0
            ]
          ],
          loop: true
        },
        jump: {
          frames: [
            [
              2,
              0
            ]
          ],
          loop: false
        }
      }
    },
    enemy: {
      url: "assets/enemy.png",
      frameWidth: 32,
      frameHeight: 32,
      animations: {
        idle: {
          frames: [
            [
              0,
              0
            ]
          ],
          loop: true
        },
        left: {
          frames: [
            [
              1,
              0
            ]
          ],
          loop: true
        },
        right: {
          frames: [
            [
              2,
              0
            ]
          ],
          loop: true
        }
      }
    },
    coin: {
      url: "assets/coin.png",
      frameWidth: 32,
      frameHeight: 32
    },
    movingPlatform: {
      url: "assets/movingPlatform.png",
      frameWidth: 32,
      frameHeight: 32,
      animations: {
        "default": {
          frames: [
            [
              0,
              0
            ]
          ],
          loop: true
        }
      }
    }
  }
};
const prefabs = {
  player: {
    actor: "Player",
    spritesheet: "player",
    defaultAnimation: "idle",
    physics: {
      bodyType: "dynamic",
      friction: 5,
      frictionStatic: 5,
      frictionAir: 1e-3
    }
  },
  platform: {
    actor: "Platform",
    spritesheet: "platform",
    physics: {
      bodyType: "static",
      friction: 1,
      frictionStatic: 1
    }
  },
  movingPlatform: {
    actor: "MovingPlatform",
    spritesheet: "movingPlatform",
    defaultAnimation: "default",
    physics: {
      bodyType: "kinematic",
      friction: 1,
      frictionStatic: 1
    }
  },
  coin: {
    actor: "Coin",
    spritesheet: "coin",
    physics: {
      bodyType: "static",
      isSensor: true
    }
  },
  bee: {
    actor: "Bee",
    spritesheet: "enemy",
    defaultAnimation: "idle",
    physics: {
      bodyType: "dynamic",
      friction: 0.1,
      frictionAir: 0.01
    }
  },
  trigger: {
    actor: "Trigger",
    physics: {
      bodyType: "static",
      isSensor: true
    }
  }
};
const layers = [
  {
    name: "platforms",
    type: "static",
    objects: [
      {
        id: 1,
        prefab: "platform",
        x: 200,
        y: 1400,
        width: 400,
        height: 32
      },
      {
        id: 2,
        prefab: "movingPlatform",
        x: 400,
        y: 1200,
        width: 192,
        height: 32,
        properties: {
          path: {
            type: "linear",
            points: [
              {
                x: 400,
                y: 1200
              },
              {
                x: 800,
                y: 1200
              }
            ],
            speed: 300,
            waitTime: 1e3
          }
        }
      },
      {
        id: 3,
        prefab: "movingPlatform",
        x: 1200,
        y: 1e3,
        width: 192,
        height: 32,
        properties: {
          path: {
            type: "linear",
            points: [
              {
                x: 1200,
                y: 1e3
              },
              {
                x: 1200,
                y: 700
              }
            ],
            speed: 300,
            waitTime: 1e3
          }
        }
      },
      {
        id: 4,
        prefab: "platform",
        x: 600,
        y: 1e3,
        width: 192,
        height: 32
      },
      {
        id: 5,
        prefab: "platform",
        x: 900,
        y: 800,
        width: 192,
        height: 32
      },
      {
        id: 6,
        prefab: "platform",
        x: 1500,
        y: 600,
        width: 192,
        height: 32
      },
      {
        id: 7,
        prefab: "platform",
        x: 1700,
        y: 400,
        width: 256,
        height: 32
      },
      {
        id: 8,
        prefab: "platform",
        x: 1400,
        y: 300,
        width: 192,
        height: 32
      },
      {
        id: 9,
        prefab: "platform",
        x: 16,
        y: 720,
        width: 32,
        height: 1440
      },
      {
        id: 10,
        prefab: "platform",
        x: 1904,
        y: 720,
        width: 32,
        height: 1440
      }
    ]
  },
  {
    name: "entities",
    type: "dynamic",
    objects: [
      {
        id: 11,
        prefab: "player",
        x: 100,
        y: 1300,
        width: 32,
        height: 32
      },
      {
        id: 12,
        prefab: "coin",
        x: 600,
        y: 800,
        width: 24,
        height: 24
      },
      {
        id: 13,
        prefab: "coin",
        x: 900,
        y: 700,
        width: 24,
        height: 24
      },
      {
        id: 14,
        prefab: "coin",
        x: 1200,
        y: 600,
        width: 24,
        height: 24
      },
      {
        id: 15,
        prefab: "coin",
        x: 1500,
        y: 500,
        width: 24,
        height: 24
      },
      {
        id: 16,
        prefab: "bee",
        x: 650,
        y: 950,
        width: 32,
        height: 32
      },
      {
        id: 17,
        prefab: "bee",
        x: 1600,
        y: 550,
        width: 32,
        height: 32
      },
      {
        id: 18,
        prefab: "trigger",
        x: 1400,
        y: 268,
        width: 192,
        height: 32,
        properties: {
          visible: true,
          triggers: "levelComplete",
          active: true
        }
      }
    ]
  }
];
const level1 = {
  version,
  name,
  type,
  gameType,
  world,
  assets,
  prefabs,
  layers
};
export {
  assets,
  level1 as default,
  gameType,
  layers,
  name,
  prefabs,
  type,
  version,
  world
};
