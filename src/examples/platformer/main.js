import { M2D } from '../../core/m2d.js';
import { Player } from '../../actors/player.js';
import { Bee } from '../../actors/bee.js';
import { Platform } from '../../actors/platform.js';

const options = {
  levelNames: ['platformer.json'],
  currentLevel: 'platformer.json',
  levelsPath: './levels/'
};

const K_B = 66;
const K_F = 70;

const canvas = document.getElementById('screen');
const game = new M2D(canvas, options);
let debug = false;
let showFPS = true;

// Register actors
game.registerActor('player', Player);
game.registerActor('bee', Bee);
game.registerActor('platform', Platform);

// Create level data
const levelData = {
  title: "Simple Platformer",
  gameType: "sideScroll",
  sprites: [
    ["assets/player.png", 32],
    ["assets/platform.png", 32],
    ["assets/enemy.png", 32]
  ],
  player: {
    type: 'player',
    position: [100, 100],
    size: [32, 32],
    sprite: 0,
    animations: [
      ["idle", 0, 0, true],
      ["run", 1, 0],
      ["jump", 2, 0],
    ]
  },
  entities: [
    // Ground
    {
      type: 'platform',
      position: [320, 450],
      size: [640, 32],
      sprite: 1
    },
    // Platforms
    {
      type: 'platform',
      position: [100, 350],
      size: [128, 32],
      sprite: 1
    },
    {
      type: 'platform',
      position: [400, 250],
      size: [128, 32],
      sprite: 1
    },
    {
      type: 'platform',
      position: [200, 150],
      size: [128, 32],
      sprite: 1
    },
    // Invisible walls
    {
      type: 'platform',
      position: [16, 240],
      size: [32, 480],
      sprite: 1,
      render: { visible: false }
    },
    {
      type: 'platform',
      position: [624, 240],
      size: [32, 480],
      sprite: 1,
      render: { visible: false }
    },
    // Bees
    {
      type: 'bee',
      position: [300, 200],
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
      position: [500, 150],
      size: [32, 32],
      sprite: 2,
      animations: [
        ["idle", 0, 0, true],
        ["left", 1, 0],
        ["right", 2, 0]
      ]
    }
  ]
};

// Set up level loading
game.levelManager.setLevelData(levelData);

function setDebugState(enabled) {
  if (game.player) {
    game.player.getConstraint('debug').setWireframe(enabled);
  }
  for (let entity of game.entities) {
    entity.getConstraint('debug').setWireframe(enabled);
  }
}

function setFPSState(enabled) {
  if (game.player) {
    game.player.getConstraint('debug').setShowFPS(enabled);
  }
  for (let entity of game.entities) {
    entity.getConstraint('debug').setShowFPS(enabled);
  }
}

// Set up debug toggle
game.keys.addKey(K_B, pressed => {
  if (!pressed) {
    debug = !debug;
    setDebugState(debug);
  }
});

// Set up FPS toggle
game.keys.addKey(K_F, pressed => {
  if (!pressed) {
    showFPS = !showFPS;
    setFPSState(showFPS);
  }
});

// Set initial FPS state
setFPSState(showFPS);

game.start();