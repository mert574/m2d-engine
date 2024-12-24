export default {
  name: 'game',
  type: 'level',
  title: "Simple Platformer",
  gameType: "sideScroll",
  sprites: [
    ['assets/platform.png', 32],
    ['assets/player.png', 32],
    ['assets/enemy.png', 32],
    ['assets/coin.png', 32],
    ['assets/movingPlatform.png', 32]
  ],
  player: {
    type: 'player',
    position: [100, 1300],
    size: [32, 32],
    sprite: 1,
    animations: [
      ["idle", 0, 0, true],
      ["run", 1, 0],
      ["jump", 2, 0]
    ],
    options: {
      friction: 5.0,
      frictionStatic: 5.0,
      frictionAir: 0.001
    }
  },
  entities: [
    {
      type: 'platform',
      position: [200, 1400],
      size: [400, 32],
      sprite: 0,
      options: {
        friction: 1.0,
        frictionStatic: 1.0
      }
    },
    {
      type: 'movingPlatform',
      position: [400, 1200],
      size: [192, 32],
      sprite: 4,
      animations: [['default', 0, 0, true]],
      options: {
        points: [
          { x: 400, y: 1200 },
          { x: 800, y: 1200 }
        ],
        speed: 300,
        waitTime: 1000
      }
    },
    {
      type: 'movingPlatform',
      position: [1200, 1000],
      size: [192, 32],
      sprite: 4,
      animations: [['default', 0, 0, true]],
      options: {
        points: [
          { x: 1200, y: 1000 },
          { x: 1200, y: 700 }
        ],
        speed: 300,
        waitTime: 1000
      }
    },
    {
      type: 'platform',
      position: [600, 1000],
      size: [192, 32],
      sprite: 0
    },
    {
      type: 'platform',
      position: [900, 800],
      size: [192, 32],
      sprite: 0
    },
    {
      type: 'platform',
      position: [1500, 600],
      size: [192, 32],
      sprite: 0
    },
    {
      type: 'platform',
      position: [1700, 400],
      size: [256, 32],
      sprite: 0
    },
    {
      type: 'platform',
      position: [1400, 300],
      size: [192, 32],
      sprite: 0
    },
    {
      type: 'coin',
      position: [600, 800],
      size: [24, 24],
      sprite: 3
    },
    {
      type: 'coin',
      position: [900, 700],
      size: [24, 24],
      sprite: 3
    },
    {
      type: 'coin',
      position: [1200, 600],
      size: [24, 24],
      sprite: 3
    },
    {
      type: 'coin',
      position: [1500, 500],
      size: [24, 24],
      sprite: 3
    },
    {
      type: 'bee',
      position: [700, 850],
      size: [32, 32],
      sprite: 2,
      animations: [
        ["idle", 0, 0, true],
        ["left", 1, 0],
        ["right", 2, 0]
      ]
    },
    {
      type: 'bee',
      position: [1300, 750],
      size: [32, 32],
      sprite: 2,
      animations: [
        ["idle", 0, 0, true],
        ["left", 1, 0],
        ["right", 2, 0]
      ]
    },
    {
      type: 'platform',
      position: [16, 720],
      size: [32, 1440],
      sprite: 0,
    },
    {
      type: 'platform',
      position: [1904, 720],
      size: [32, 1440],
      sprite: 0,
    },
    {
      type: 'trigger',
      position: [1400, 268],
      size: [192, 32],
      sprite: 0,
      options: {
        category: 'levelComplete',
        visible: true,
        onEnter: (player, data) => {
          console.log('Level Complete!');
          player.game.sceneManager.switchTo('mainMenu');
        }
      }
    }
  ]
}; 