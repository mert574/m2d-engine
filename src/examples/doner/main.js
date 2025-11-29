import { M2D } from '../../core/m2d.js';
import { DonerGame } from './donerGame.js';

const canvas = document.getElementById('screen');
const game = new M2D(canvas, {
  initialScene: 'mainMenu',
  width: 1280,
  height: 720,
  worldWidth: 1280,
  worldHeight: 720,
  basePath: import.meta.env.DEV ? '/examples/doner/' : '/m2d-engine/examples/doner/'
});

// Doner game instance (initialized when entering gameplay scene)
let donerGame = null;

// Register scenes
game.sceneManager.addScene('mainMenu', {
  fetch: async () => (await import('./scenes/mainMenu.json')).default,
  onEnter() {
    donerGame = null;
  }
});

game.sceneManager.addScene('gameplay', {
  fetch: async () => (await import('./scenes/gameplay.json')).default,
  onEnter() {
    // Create and start the doner game
    donerGame = new DonerGame(game);
    donerGame.start();
  },
  onExit() {
    if (donerGame) {
      donerGame.stop();
      donerGame = null;
    }
  }
});

// Register R and M keys for restart/menu
game.keys.addKey('r');
game.keys.addKey('m');

// Menu button bounds (updated for enhanced button)
const menuButton = {
  x: 640 - 140,  // width/2 - buttonWidth/2
  y: 340 - 32,   // buttonY - buttonHeight/2
  width: 280,
  height: 65
};

// Start the doner game
function startGame() {
  donerGame = new DonerGame(game);
  donerGame.start();
}

// Return to menu
function returnToMenu() {
  if (donerGame) {
    donerGame.stop();
    donerGame = null;
  }
}

// Add click handler for menu
document.addEventListener('click', (event) => {
  if (donerGame) return; // Only handle clicks when on menu

  const rect = game.canvas.getBoundingClientRect();
  const scaleX = game.canvas.width / rect.width;
  const scaleY = game.canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  console.log('Click at:', x, y, 'Button:', menuButton);

  // Check if click is within button bounds
  if (x >= menuButton.x && x <= menuButton.x + menuButton.width &&
      y >= menuButton.y && y <= menuButton.y + menuButton.height) {
    console.log('Button clicked!');
    startGame();
  }
});

// Enhanced menu drawing helpers
function drawRoundedRect(ctx, x, y, width, height, radius, options = {}) {
  ctx.save();
  if (options.shadow) {
    ctx.shadowColor = options.shadow.color || 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = options.shadow.blur || 10;
    ctx.shadowOffsetX = options.shadow.offsetX || 0;
    ctx.shadowOffsetY = options.shadow.offsetY || 4;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (options.gradient) {
    const grad = ctx.createLinearGradient(x, y, x, y + height);
    options.gradient.forEach((stop, i) => {
      grad.addColorStop(stop.pos !== undefined ? stop.pos : i / (options.gradient.length - 1), stop.color);
    });
    ctx.fillStyle = grad;
  } else if (options.fill) {
    ctx.fillStyle = options.fill;
  }
  if (options.fill || options.gradient) ctx.fill();
  ctx.shadowColor = 'transparent';
  if (options.stroke) {
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth || 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStyledText(ctx, text, x, y, options = {}) {
  ctx.save();
  const fontSize = options.fontSize || 16;
  const fontWeight = options.fontWeight || 'normal';
  ctx.font = `${fontWeight} ${fontSize}px "Helvetica Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = options.align || 'left';
  ctx.textBaseline = options.baseline || 'top';
  if (options.glow) {
    ctx.shadowColor = options.glow.color || options.color || '#fff';
    ctx.shadowBlur = options.glow.blur || 10;
  }
  if (options.shadow) {
    ctx.shadowColor = options.shadow.color || 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = options.shadow.blur || 4;
    ctx.shadowOffsetX = options.shadow.offsetX || 2;
    ctx.shadowOffsetY = options.shadow.offsetY || 2;
  }
  if (options.stroke) {
    ctx.strokeStyle = options.stroke.color || '#000';
    ctx.lineWidth = options.stroke.width || 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = options.color || '#fff';
  ctx.fillText(text, x, y);
  ctx.restore();
}

let menuPulse = 0;

// Draw main menu
function drawMenu() {
  const width = game.options.width;
  const height = game.options.height;
  const ctx = game.uiRenderer.context;

  menuPulse += 0.03;

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#1a0f0a');
  bgGrad.addColorStop(0.5, '#2d1b0e');
  bgGrad.addColorStop(1, '#1a0f0a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Vignette
  const vignetteGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width * 0.7);
  vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vignetteGrad;
  ctx.fillRect(0, 0, width, height);

  // Title with animated glow
  const titlePulse = 1 + Math.sin(menuPulse * 2) * 0.03;
  drawStyledText(ctx, 'DONER RHYTHM', width / 2, 100, {
    fontSize: 72 * titlePulse,
    fontWeight: 'bold',
    color: '#FFD700',
    align: 'center',
    baseline: 'middle',
    glow: { color: '#FFD700', blur: 30 },
    stroke: { color: '#000', width: 4 }
  });

  // Subtitle
  drawStyledText(ctx, 'Build orders to the beat!', width / 2, 170, {
    fontSize: 26,
    color: '#F5DEB3',
    align: 'center',
    baseline: 'middle',
    shadow: { color: 'rgba(0,0,0,0.8)', blur: 6 }
  });

  // Start button with glow
  const buttonWidth = 280;
  const buttonHeight = 65;
  const btnX = width / 2 - buttonWidth / 2;
  const btnY = 340 - buttonHeight / 2;
  const btnGlow = 0.7 + Math.sin(menuPulse * 3) * 0.2;

  drawRoundedRect(ctx, btnX, btnY, buttonWidth, buttonHeight, 16, {
    gradient: [
      { pos: 0, color: `rgba(90, 180, 90, ${btnGlow})` },
      { pos: 1, color: `rgba(50, 130, 50, ${btnGlow})` }
    ],
    stroke: 'rgba(150, 255, 150, 0.6)',
    strokeWidth: 3,
    shadow: { color: 'rgba(100, 255, 100, 0.4)', blur: 25, offsetY: 5 }
  });

  drawStyledText(ctx, 'START GAME', width / 2, 340, {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    align: 'center',
    baseline: 'middle',
    shadow: { color: 'rgba(0,0,0,0.5)', blur: 4 }
  });

  // Instructions panel
  const panelY = 420;
  const panelHeight = 200;
  drawRoundedRect(ctx, width / 2 - 350, panelY, 700, panelHeight, 20, {
    gradient: [
      { pos: 0, color: 'rgba(30, 20, 10, 0.8)' },
      { pos: 1, color: 'rgba(20, 10, 5, 0.85)' }
    ],
    stroke: 'rgba(255, 215, 0, 0.2)',
    strokeWidth: 2,
    shadow: { color: 'rgba(0,0,0,0.5)', blur: 20, offsetY: 8 }
  });

  drawStyledText(ctx, 'HOW TO PLAY', width / 2, panelY + 25, {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFD700',
    align: 'center',
    baseline: 'middle',
    glow: { color: '#FFD700', blur: 8 }
  });

  const instructions = [
    'Press A, S, D, F in rhythm patterns to add ingredients',
    'Each ingredient has a unique 3-beat pattern (1s per beat)',
    'Match customer orders by building the right sandwich',
    'Press SPACE to serve, BACKSPACE to clear'
  ];

  instructions.forEach((text, i) => {
    drawStyledText(ctx, text, width / 2, panelY + 65 + i * 32, {
      fontSize: 17,
      color: 'rgba(200, 190, 180, 0.9)',
      align: 'center',
      baseline: 'middle'
    });
  });

  // Footer
  drawStyledText(ctx, 'Built with M2D Engine', width / 2, height - 30, {
    fontSize: 14,
    color: 'rgba(100, 90, 80, 0.6)',
    align: 'center',
    baseline: 'middle'
  });
}

// Custom update function for doner game
function donerUpdate(currentTime) {
  if (!game.lastTime) {
    game.lastTime = currentTime;
    requestAnimationFrame(donerUpdate);
    return;
  }

  const deltaTime = Math.min((currentTime - game.lastTime) / 1000, 0.1);
  game.lastTime = currentTime;

  if (game.sceneManager.loading) {
    game.drawLoading();
    requestAnimationFrame(donerUpdate);
    return;
  }

  const currentScene = game.sceneManager.getCurrentScene();

  // Handle game over state (doner game finished)
  if (donerGame && !donerGame.isGameActive && donerGame.finalResults) {
    // Clear and draw game over screen
    game.uiRenderer.clear('#2d1b0e');
    game.uiRenderer.beginFrame();
    donerGame.draw();
    game.uiRenderer.endFrame();

    if (game.keys.isJustPressed('r')) {
      donerGame.start();
    } else if (game.keys.isJustPressed('m')) {
      returnToMenu();
    }

    game.keys.update();
    requestAnimationFrame(donerUpdate);
    return;
  }

  // Normal game update
  if (currentScene) {
    if (donerGame && (donerGame.isGameActive || donerGame.isCountingDown)) {
      // Update doner game (handles countdown and gameplay)
      donerGame.update(deltaTime);

      // Draw doner game UI - clear first, then draw
      game.uiRenderer.clear('#2d1b0e');
      game.uiRenderer.beginFrame();
      donerGame.draw();
      game.uiRenderer.endFrame();
    } else if (!donerGame) {
      // Draw menu manually since we're not using the standard scene system
      game.uiRenderer.clear('#2d1b0e');
      game.uiRenderer.beginFrame();
      drawMenu();
      game.uiRenderer.endFrame();
    }
  }

  game.keys.update();
  requestAnimationFrame(donerUpdate);
}

// Override the game's update method
game.update = donerUpdate;

game.start();
