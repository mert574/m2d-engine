import { M2D } from '../../core/m2d.js';
import { SettingsMenu } from '../../core/ui/settingsMenu.js';
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

// Register scenes. The menu scene is an empty shell: this example replaces
// the engine loop and paints its own menu (drawMenu below), so scene JSON
// elements would never be drawn — the scene exists only to anchor the
// mainMenu/gameplay switching and its onEnter/onExit hooks.
game.sceneManager.addScene('mainMenu', {
  fetch: async () => ({ version: 1, name: 'mainMenu', type: 'ui', assets: {}, elements: [] }),
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

// Single source of truth for the menu's geometry, shared by drawMenu() and
// the click handler, so the drawn button and its hit area cannot drift apart.
// The layout lives in a 1280x720 design box centred in UI space: width is read
// live (UI space widens with the display), and `top` shifts the whole column
// down when the display is taller than 16:9 instead of bunching it at the top.
function menuLayout() {
  const width = game.uiRenderer.width;
  const height = game.uiRenderer.height;
  const top = (height - 720) / 2;
  const buttonWidth = 280;
  const buttonHeight = 65;
  return {
    width,
    height,
    titleY: top + 100,
    subtitleY: top + 170,
    buttonCentreY: top + 340,
    button: {
      x: width / 2 - buttonWidth / 2,
      y: top + 340 - buttonHeight / 2,
      width: buttonWidth,
      height: buttonHeight
    },
    panelY: top + 420
  };
}

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

  // The engine maps the pointer: the canvas rect is not the drawn area once
  // the viewport letterboxes, and the backing store is in device pixels.
  const { x, y } = game.getUIPosition(event);

  const menuButton = menuLayout().button;
  console.log('Click at:', x, y, 'Button:', menuButton);

  // Check if click is within button bounds
  if (x >= menuButton.x && x <= menuButton.x + menuButton.width &&
      y >= menuButton.y && y <= menuButton.y + menuButton.height) {
    console.log('Button clicked!');
    startGame();
  }
});

// Enhanced menu drawing helpers

// Build a vertical linear-gradient descriptor from {pos, color} stops
function verticalGradient(stops, x, y, height) {
  return {
    type: 'linear',
    x0: x, y0: y, x1: x, y1: y + height,
    stops: stops.map((stop, i) => ({
      offset: stop.pos !== undefined ? stop.pos : i / (stops.length - 1),
      color: stop.color
    }))
  };
}

function drawRoundedRect(x, y, width, height, radius, options = {}) {
  game.uiRenderer.drawRect({
    x, y, width, height,
    cornerRadius: radius,
    fillStyle: options.gradient
      ? verticalGradient(options.gradient, x, y, height)
      : options.fill,
    strokeStyle: options.stroke,
    lineWidth: options.strokeWidth || 2,
    shadow: options.shadow && {
      color: options.shadow.color || 'rgba(0,0,0,0.5)',
      blur: options.shadow.blur || 10,
      offsetX: options.shadow.offsetX || 0,
      offsetY: options.shadow.offsetY || 4
    }
  });
}

function drawStyledText(text, x, y, options = {}) {
  let shadow;
  if (options.shadow) {
    shadow = {
      color: options.shadow.color || 'rgba(0,0,0,0.8)',
      blur: options.shadow.blur || 4,
      offsetX: options.shadow.offsetX ?? 2,
      offsetY: options.shadow.offsetY ?? 2
    };
  } else if (options.glow) {
    shadow = {
      color: options.glow.color || options.color || '#fff',
      blur: options.glow.blur || 10
    };
  }

  game.uiRenderer.drawText({
    text, x, y,
    fillStyle: options.color || '#fff',
    strokeStyle: options.stroke && (options.stroke.color || '#000'),
    lineWidth: options.stroke && (options.stroke.width || 3),
    fontSize: options.fontSize || 16,
    fontFamily: 'system-ui, sans-serif',
    fontWeight: options.fontWeight || 'normal',
    textAlign: options.align || 'left',
    textBaseline: options.baseline || 'top',
    shadow
  });
}

let menuPulse = 0;

// Draw main menu
function drawMenu() {
  // All geometry comes from menuLayout(), the same source the click handler
  // hit-tests against, resolved fresh so it tracks any aspect ratio.
  const l = menuLayout();
  const { width, height } = l;

  menuPulse += 0.03;

  // Background gradient
  game.uiRenderer.drawRect({
    x: 0, y: 0, width, height,
    fillStyle: {
      type: 'linear',
      x0: 0, y0: 0, x1: 0, y1: height,
      stops: [
        { offset: 0, color: '#1a0f0a' },
        { offset: 0.5, color: '#2d1b0e' },
        { offset: 1, color: '#1a0f0a' }
      ]
    }
  });

  // Vignette
  game.uiRenderer.drawRect({
    x: 0, y: 0, width, height,
    fillStyle: {
      type: 'radial',
      x: width / 2, y: height / 2, r1: width * 0.7,
      stops: [
        { offset: 0, color: 'rgba(0,0,0,0)' },
        { offset: 1, color: 'rgba(0,0,0,0.5)' }
      ]
    }
  });

  // Title with animated glow
  const titlePulse = 1 + Math.sin(menuPulse * 2) * 0.03;
  drawStyledText('DONER RHYTHM', width / 2, l.titleY, {
    fontSize: 72 * titlePulse,
    fontWeight: 'bold',
    color: '#FFD700',
    align: 'center',
    baseline: 'middle',
    glow: { color: '#FFD700', blur: 30 },
    stroke: { color: '#000', width: 4 }
  });

  // Subtitle
  drawStyledText('Build orders to the beat!', width / 2, l.subtitleY, {
    fontSize: 26,
    color: '#F5DEB3',
    align: 'center',
    baseline: 'middle',
    shadow: { color: 'rgba(0,0,0,0.8)', blur: 6 }
  });

  // Start button with glow, drawn from the same rect the click handler tests.
  const { x: btnX, y: btnY, width: buttonWidth, height: buttonHeight } = l.button;
  const btnGlow = 0.7 + Math.sin(menuPulse * 3) * 0.2;

  drawRoundedRect(btnX, btnY, buttonWidth, buttonHeight, 16, {
    gradient: [
      { pos: 0, color: `rgba(90, 180, 90, ${btnGlow})` },
      { pos: 1, color: `rgba(50, 130, 50, ${btnGlow})` }
    ],
    stroke: 'rgba(150, 255, 150, 0.6)',
    strokeWidth: 3,
    shadow: { color: 'rgba(100, 255, 100, 0.4)', blur: 25, offsetY: 5 }
  });

  drawStyledText('START GAME', width / 2, l.buttonCentreY, {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    align: 'center',
    baseline: 'middle',
    shadow: { color: 'rgba(0,0,0,0.5)', blur: 4 }
  });

  // Instructions panel
  const panelY = l.panelY;
  const panelHeight = 200;
  drawRoundedRect(width / 2 - 350, panelY, 700, panelHeight, 20, {
    gradient: [
      { pos: 0, color: 'rgba(30, 20, 10, 0.8)' },
      { pos: 1, color: 'rgba(20, 10, 5, 0.85)' }
    ],
    stroke: 'rgba(255, 215, 0, 0.2)',
    strokeWidth: 2,
    shadow: { color: 'rgba(0,0,0,0.5)', blur: 20, offsetY: 8 }
  });

  drawStyledText('HOW TO PLAY', width / 2, panelY + 25, {
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
    drawStyledText(text, width / 2, panelY + 65 + i * 32, {
      fontSize: 17,
      color: 'rgba(200, 190, 180, 0.9)',
      align: 'center',
      baseline: 'middle'
    });
  });

  // Footer
  drawStyledText('Built with M2D Engine', width / 2, height - 30, {
    fontSize: 14,
    color: 'rgba(100, 90, 80, 0.6)',
    align: 'center',
    baseline: 'middle'
  });
}

// Custom update function for doner game
function donerUpdate(currentTime) {
  // This example replaces the engine's loop, so it takes on the loop's
  // responsibility of applying coalesced display changes between frames.
  if (game.pendingResize) game.resize();

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
      // Update doner game (handles countdown and gameplay). Replacing the
      // engine loop means honouring the engine's pause flag here too — the
      // settings menu's Paused row toggles it.
      if (!game.paused) donerGame.update(deltaTime);

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

  // Replacing the engine loop also means drawing its overlays (settings menu).
  game.drawOverlays();

  game.keys.update();
  requestAnimationFrame(donerUpdate);
}

// Override the game's update method
game.update = donerUpdate;

// Settings overlay (O): resolution, fullscreen, aspect mode.
new SettingsMenu(game);

game.start();
