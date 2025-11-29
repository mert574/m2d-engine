// DonerGame - Main game logic class for the Doner Rhythm Game

import { INGREDIENTS, NEGATIVE_ITEMS, RECIPES, findIngredientByPattern, getRandomNegativeItem, patternToString } from './ingredients.js';
import { RhythmInput } from './rhythmInput.js';
import { OrderManager } from './orderManager.js';

export class DonerGame {
  constructor(game) {
    this.game = game;

    // Game state
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentSandwich = [];
    this.lastAddedIngredient = null;
    this.lastAddedTime = 0;
    this.feedbackMessage = '';
    this.feedbackTime = 0;
    this.isGameActive = false;
    this.gameTime = 0;
    this.gameDuration = 120; // 2 minutes

    // Visual state
    this.beatVisuals = [];
    this.ingredientAnimations = [];
    this.particles = [];
    this.glowPulse = 0; // For animated glow effects

    // Sprites
    this.sprites = {};
    this.spritesLoaded = false;
    this.loadSprites();

    // Audio
    this.sounds = {};
    this.loadSounds();

    // Register additional keys
    this.game.keys.addKey(' '); // Space to serve
    this.game.keys.addKey('Backspace'); // Clear sandwich

    // Initialize rhythm input
    this.rhythmInput = new RhythmInput(game, {
      beatDuration: 1000, // 1 second per beat
      patternLength: 3,
      onPatternComplete: (pattern) => this.handlePatternComplete(pattern),
      onBeatInput: (beat, index, pattern) => this.handleBeatInput(beat, index, pattern)
    });

    // Initialize order manager
    this.orderManager = new OrderManager({
      maxOrders: 3,
      orderTimeout: 45000,
      onOrderExpired: (order) => this.handleOrderExpired(order),
      onOrderComplete: (order, points, bonus) => this.handleOrderComplete(order, points, bonus)
    });
  }

  loadSprites() {
    const basePath = this.game.options.basePath + 'sprites/';
    const spriteFiles = {
      background: 'new-bg.webp',
      plate: 'Plate.png',
      // Regular ingredients
      bread: 'BreadOpen.png',
      meat: 'MeatVeal.png',
      salad: 'Salad.png',
      onion: 'Onion.png',
      sauce: 'SauceA.png',
      sauerkraut: 'SauerKraut.png',
      specialSalad: 'SpecialSalad.webp',
      breadClosed: 'BreadClosed.webp',
      // Negative items
      pills: 'Pills.webp',
      book: 'Book.webp',
      fish: 'Fish.webp',
      key: 'Key.webp',
      nails: 'Nails.webp',
      oil: 'Oil.webp'
    };

    let loadedCount = 0;
    const totalSprites = Object.keys(spriteFiles).length;

    for (const [key, file] of Object.entries(spriteFiles)) {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        if (loadedCount === totalSprites) {
          this.spritesLoaded = true;
        }
      };
      img.src = basePath + file;
      this.sprites[key] = img;
    }
  }

  loadSounds() {
    const basePath = this.game.options.basePath;

    // Background loop music
    this.sounds.loop = new Audio(basePath + 'bg.mp3');
    this.sounds.loop.loop = true;
    this.sounds.loop.volume = 0.05; // 5% volume

    // Key press sound effect
    this.sounds.keyPress = new Audio(basePath + 'MJoneshot.wav');
    this.sounds.keyPress.volume = 0.7;
  }

  playKeySound() {
    // Clone and play to allow overlapping sounds
    const sound = this.sounds.keyPress.cloneNode();
    sound.volume = 0.7;
    sound.play().catch(() => {}); // Ignore autoplay errors
  }

  startMusic() {
    if (this.sounds.loop) {
      this.sounds.loop.currentTime = 0;
      this.sounds.loop.play().catch(() => {}); // Ignore autoplay errors
    }
  }

  stopMusic() {
    if (this.sounds.loop) {
      this.sounds.loop.pause();
      this.sounds.loop.currentTime = 0;
    }
  }

  // === ENHANCED GRAPHICS HELPERS ===

  // Draw a rounded rectangle with optional gradient, shadow, and glow
  drawRoundedRect(ctx, x, y, width, height, radius, options = {}) {
    ctx.save();

    // Shadow
    if (options.shadow) {
      ctx.shadowColor = options.shadow.color || 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = options.shadow.blur || 10;
      ctx.shadowOffsetX = options.shadow.offsetX || 0;
      ctx.shadowOffsetY = options.shadow.offsetY || 4;
    }

    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);

    // Fill with gradient or solid color
    if (options.gradient) {
      const grad = ctx.createLinearGradient(x, y, x, y + height);
      options.gradient.forEach((stop, i) => {
        grad.addColorStop(stop.pos !== undefined ? stop.pos : i / (options.gradient.length - 1), stop.color);
      });
      ctx.fillStyle = grad;
    } else if (options.fill) {
      ctx.fillStyle = options.fill;
    }

    if (options.fill || options.gradient) {
      ctx.fill();
    }

    // Reset shadow for stroke
    ctx.shadowColor = 'transparent';

    // Stroke/border
    if (options.stroke) {
      ctx.strokeStyle = options.stroke;
      ctx.lineWidth = options.strokeWidth || 2;
      ctx.stroke();
    }

    // Inner glow effect
    if (options.innerGlow) {
      ctx.save();
      ctx.clip();
      ctx.shadowColor = options.innerGlow.color || 'rgba(255,255,255,0.3)';
      ctx.shadowBlur = options.innerGlow.blur || 15;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = options.innerGlow.color || 'rgba(255,255,255,0.3)';
      ctx.lineWidth = options.innerGlow.width || 10;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // Draw text with shadow and optional glow
  drawStyledText(ctx, text, x, y, options = {}) {
    ctx.save();

    const fontSize = options.fontSize || 16;
    const fontWeight = options.fontWeight || 'normal';
    const fontFamily = options.fontFamily || '"Helvetica Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = options.align || 'left';
    ctx.textBaseline = options.baseline || 'top';

    // Glow effect
    if (options.glow) {
      ctx.shadowColor = options.glow.color || options.color || '#fff';
      ctx.shadowBlur = options.glow.blur || 10;
    }

    // Text shadow
    if (options.shadow) {
      ctx.shadowColor = options.shadow.color || 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = options.shadow.blur || 4;
      ctx.shadowOffsetX = options.shadow.offsetX || 2;
      ctx.shadowOffsetY = options.shadow.offsetY || 2;
    }

    // Stroke/outline
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

  // Create particles for effects
  spawnParticles(x, y, count, options = {}) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * (options.speed || 200),
        vy: (Math.random() - 0.5) * (options.speed || 200) - (options.upward ? 100 : 0),
        life: options.life || 1,
        maxLife: options.life || 1,
        size: options.size || 4 + Math.random() * 4,
        color: options.colors ? options.colors[Math.floor(Math.random() * options.colors.length)] : '#FFD700',
        decay: options.decay || 1
      });
    }
  }

  // Update particles
  updateParticles(deltaTime) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vy += 200 * deltaTime; // gravity
      p.life -= deltaTime * p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // Draw all particles
  drawParticles(ctx) {
    this.particles.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // Get key color based on key pressed
  getKeyColor(key) {
    const colors = {
      'A': { main: '#FF6B6B', glow: '#FF4444' },
      'S': { main: '#6BFF6B', glow: '#44FF44' },
      'D': { main: '#6B8BFF', glow: '#4466FF' },
      'F': { main: '#FFD700', glow: '#FFAA00' },
      '_': { main: '#666666', glow: '#444444' }
    };
    return colors[key] || colors['_'];
  }

  start() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentSandwich = [];
    this.gameTime = 0;
    this.orderManager.reset();
    this.finalResults = null;

    // Start countdown
    this.isCountingDown = true;
    this.countdownValue = 3;
    this.countdownTimer = 0;
    this.isGameActive = false;
  }

  finishCountdown() {
    this.isCountingDown = false;
    this.isGameActive = true;
    this.rhythmInput.startAutoMode();
    this.startMusic();
    this.showFeedback('GO!', 500);
  }

  stop() {
    this.isGameActive = false;
    this.stopMusic();
  }

  update(deltaTime) {
    // Update glow pulse animation
    this.glowPulse += deltaTime * 3;
    if (this.glowPulse > Math.PI * 2) this.glowPulse -= Math.PI * 2;

    // Update particles
    this.updateParticles(deltaTime);

    // Handle countdown
    if (this.isCountingDown) {
      this.countdownTimer += deltaTime;
      if (this.countdownTimer >= 1) {
        this.countdownTimer = 0;
        this.countdownValue--;
        if (this.countdownValue <= 0) {
          this.finishCountdown();
        }
      }
      return;
    }

    if (!this.isGameActive) return;

    this.gameTime += deltaTime;

    // Check game end
    if (this.gameTime >= this.gameDuration) {
      this.endGame();
      return;
    }

    // Update rhythm input
    this.rhythmInput.update(deltaTime);

    // Update order manager
    this.orderManager.update(deltaTime);

    // Check for serve (space)
    if (this.game.keys.isJustPressed(' ')) {
      this.serveSandwich();
    }

    // Check for clear (backspace)
    if (this.game.keys.isJustPressed('Backspace')) {
      this.clearSandwich();
    }

    // Update feedback message
    if (this.feedbackTime > 0) {
      this.feedbackTime -= deltaTime * 1000;
    }

    // Update ingredient animations
    this.updateAnimations(deltaTime);
  }

  handleBeatInput(beat, index, pattern) {
    // Play key sound (only for actual key presses, not empty beats)
    if (beat !== '_') {
      this.playKeySound();
    }

    // Add visual feedback for beat
    this.beatVisuals.push({
      beat,
      index,
      time: 300,
      y: 0
    });
  }

  handlePatternComplete(pattern) {
    // Skip empty patterns (all underscores)
    const isEmptyPattern = pattern.every(beat => beat === '_');
    if (isEmptyPattern) {
      return; // Don't count as wrong input
    }

    const ingredient = findIngredientByPattern(pattern);

    if (ingredient) {
      this.addIngredient(ingredient.id);
      this.showFeedback(`+ ${ingredient.emoji} ${ingredient.name}!`, 1000);
      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
    } else {
      // Wrong pattern - add a random negative item
      const negativeItem = getRandomNegativeItem();
      this.addNegativeItem(negativeItem);
      this.score = Math.max(0, this.score + negativeItem.penalty);
      this.showFeedback(`${negativeItem.emoji} ${negativeItem.name}! ${negativeItem.penalty} pts`, 1200);
      this.combo = 0;
    }
  }

  addIngredient(ingredientId) {
    this.currentSandwich.push({ id: ingredientId, isNegative: false });
    this.lastAddedIngredient = ingredientId;
    this.lastAddedTime = Date.now();

    // Add animation
    this.ingredientAnimations.push({
      ingredient: INGREDIENTS[ingredientId],
      startY: 200,
      targetY: 400 + this.currentSandwich.length * 30,
      progress: 0,
      duration: 300
    });

    // Spawn particles for visual feedback
    const width = this.game.options.width;
    const height = this.game.options.height;
    const ingredient = INGREDIENTS[ingredientId];
    this.spawnParticles(width / 2, height / 2 - 30, 15, {
      colors: [ingredient.color, '#FFD700', '#FFFFFF'],
      speed: 150,
      life: 0.8,
      upward: true
    });
  }

  addNegativeItem(item) {
    this.currentSandwich.push({ id: item.id, isNegative: true, item });
    this.lastAddedIngredient = item.id;
    this.lastAddedTime = Date.now();

    // Spawn red/dark particles for negative feedback
    const width = this.game.options.width;
    const height = this.game.options.height;
    this.spawnParticles(width / 2, height / 2 - 30, 20, {
      colors: ['#FF0000', '#880000', '#440000'],
      speed: 180,
      life: 1.0,
      upward: false
    });
  }

  serveSandwich() {
    if (this.currentSandwich.length === 0) {
      this.showFeedback('Nothing to serve!', 800);
      return;
    }

    // Extract just the IDs for checking (only non-negative items count)
    const ingredientIds = this.currentSandwich
      .filter(item => !item.isNegative)
      .map(item => item.id);

    const result = this.orderManager.checkSandwich(ingredientIds);

    if (result.success) {
      this.score += result.points;
      this.showFeedback(`Order complete! +${result.points} (bonus: +${result.bonus})`, 1500);
    } else {
      this.showFeedback('Wrong order! Check the recipes.', 1000);
      this.combo = 0;
    }

    this.currentSandwich = [];
  }

  clearSandwich() {
    if (this.currentSandwich.length > 0) {
      this.currentSandwich = [];
      this.showFeedback('Sandwich cleared', 500);
      this.combo = 0;
    }
  }

  handleOrderExpired(order) {
    this.showFeedback(`Order expired: ${order.recipe.name}`, 1500);
    this.combo = 0;
  }

  handleOrderComplete(order, points, bonus) {
    // Already handled in serveSandwich
  }

  showFeedback(message, duration) {
    this.feedbackMessage = message;
    this.feedbackTime = duration;
  }

  updateAnimations(deltaTime) {
    // Update beat visuals
    for (let i = this.beatVisuals.length - 1; i >= 0; i--) {
      this.beatVisuals[i].time -= deltaTime * 1000;
      this.beatVisuals[i].y += deltaTime * 100;
      if (this.beatVisuals[i].time <= 0) {
        this.beatVisuals.splice(i, 1);
      }
    }

    // Update ingredient animations
    for (let i = this.ingredientAnimations.length - 1; i >= 0; i--) {
      const anim = this.ingredientAnimations[i];
      anim.progress += (deltaTime * 1000) / anim.duration;
      if (anim.progress >= 1) {
        this.ingredientAnimations.splice(i, 1);
      }
    }
  }

  endGame() {
    this.isGameActive = false;
    this.stopMusic();
    const stats = this.orderManager.getStats();

    // Store final results for display
    this.finalResults = {
      score: this.score,
      ordersCompleted: stats.completed,
      ordersFailed: stats.failed,
      maxCombo: this.maxCombo
    };
  }

  // Drawing methods
  draw() {
    const renderer = this.game.uiRenderer;
    const ctx = renderer.context;
    const width = this.game.options.width;
    const height = this.game.options.height;

    // Draw background
    if (this.spritesLoaded && this.sprites.background) {
      ctx.drawImage(this.sprites.background, 0, 0, width, height);
    } else {
      // Gradient fallback background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#1a0f0a');
      bgGrad.addColorStop(0.5, '#2d1b0e');
      bgGrad.addColorStop(1, '#1a0f0a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    }

    // Add subtle vignette overlay
    const vignetteGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width * 0.7);
    vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, width, height);

    // Draw game area sections
    this.drawHeader(ctx, width, height);
    this.drawOrders(ctx, width, height);
    this.drawSandwichArea(ctx, width, height);
    this.drawIngredientGuide(ctx, width, height);
    this.drawRhythmIndicator(ctx, width, height);
    this.drawFeedback(ctx, width, height);

    // Draw particles on top
    this.drawParticles(ctx);

    // Draw countdown if counting down
    if (this.isCountingDown) {
      this.drawCountdown(ctx, width, height);
    }

    // Draw game over screen if ended
    if (!this.isGameActive && !this.isCountingDown && this.finalResults) {
      this.drawGameOver(ctx, width, height);
    }
  }

  drawCountdown(ctx, width, height) {
    // Semi-transparent overlay with gradient
    const overlayGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width * 0.6);
    overlayGrad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    overlayGrad.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, width, height);

    // Animated ring around countdown
    const ringRadius = 120 + Math.sin(this.glowPulse * 2) * 10;
    ctx.save();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2 - 20, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Countdown number with glow
    const pulse = 1 + Math.sin(this.glowPulse * 4) * 0.05;
    this.drawStyledText(ctx, this.countdownValue.toString(), width / 2, height / 2 - 20, {
      fontSize: 150 * pulse,
      fontWeight: 'bold',
      color: '#FFD700',
      align: 'center',
      baseline: 'middle',
      glow: { color: '#FFD700', blur: 30 },
      stroke: { color: '#000', width: 4 }
    });

    // "Get Ready" text with shadow
    this.drawStyledText(ctx, 'GET READY!', width / 2, height / 2 + 100, {
      fontSize: 42,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 10, offsetY: 4 },
      glow: { color: '#FFFFFF', blur: 15 }
    });
  }

  drawHeader(ctx, width, height) {
    // Header background with gradient
    this.drawRoundedRect(ctx, 10, 10, width - 20, 55, 12, {
      gradient: [
        { pos: 0, color: 'rgba(20, 10, 5, 0.9)' },
        { pos: 1, color: 'rgba(40, 25, 15, 0.85)' }
      ],
      stroke: 'rgba(255, 215, 0, 0.3)',
      strokeWidth: 2,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 15, offsetY: 5 }
    });

    // Score with glow
    this.drawStyledText(ctx, `Score: ${this.score}`, 30, 38, {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#FFD700',
      align: 'left',
      baseline: 'middle',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 4, offsetY: 2 },
      glow: { color: '#FFD700', blur: 8 }
    });

    // Combo with animation
    if (this.combo > 1) {
      const comboPulse = 1 + Math.sin(this.glowPulse * 5) * 0.1;
      this.drawStyledText(ctx, `x${this.combo}`, 220, 38, {
        fontSize: 26 * comboPulse,
        fontWeight: 'bold',
        color: '#FF6B6B',
        align: 'left',
        baseline: 'middle',
        glow: { color: '#FF6B6B', blur: 15 },
        stroke: { color: 'rgba(0,0,0,0.5)', width: 2 }
      });
    }

    // Time remaining
    const timeLeft = Math.max(0, this.gameDuration - this.gameTime);
    const minutes = Math.floor(timeLeft / 60);
    const seconds = Math.floor(timeLeft % 60);
    const timeColor = timeLeft < 30 ? '#FF4444' : '#FFFFFF';
    const timeGlow = timeLeft < 30 ? { color: '#FF4444', blur: 15 } : null;

    this.drawStyledText(ctx, `${minutes}:${seconds.toString().padStart(2, '0')}`, width - 30, 38, {
      fontSize: 32,
      fontWeight: 'bold',
      color: timeColor,
      align: 'right',
      baseline: 'middle',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 4, offsetY: 2 },
      glow: timeGlow
    });

    // Title with glow
    const titlePulse = 1 + Math.sin(this.glowPulse) * 0.02;
    this.drawStyledText(ctx, 'DONER RHYTHM', width / 2, 38, {
      fontSize: 32 * titlePulse,
      fontWeight: 'bold',
      color: '#FFD700',
      align: 'center',
      baseline: 'middle',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 6, offsetY: 3 },
      glow: { color: '#FFD700', blur: 12 }
    });
  }

  drawOrders(ctx, width, height) {
    const orders = this.orderManager.getOrders();
    const orderWidth = 290;
    const orderHeight = 140;
    const startX = 15;
    const startY = 80;

    // Orders panel background with glassmorphism
    this.drawRoundedRect(ctx, startX, startY - 10, orderWidth + 20, 3 * (orderHeight + 12) + 50, 16, {
      gradient: [
        { pos: 0, color: 'rgba(30, 20, 10, 0.85)' },
        { pos: 1, color: 'rgba(20, 10, 5, 0.9)' }
      ],
      stroke: 'rgba(255, 215, 0, 0.2)',
      strokeWidth: 2,
      shadow: { color: 'rgba(0,0,0,0.6)', blur: 20, offsetY: 8 }
    });

    // Panel title
    this.drawStyledText(ctx, 'ORDERS', startX + 15, startY + 10, {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#FFD700',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 4 },
      glow: { color: '#FFD700', blur: 6 }
    });

    orders.forEach((order, index) => {
      const x = startX + 10;
      const y = startY + 40 + index * (orderHeight + 12);
      const timeRatio = order.timeRemaining / this.orderManager.orderTimeout;
      const isUrgent = timeRatio < 0.3;

      // Order card with urgency indication
      const cardGlow = isUrgent ? { color: 'rgba(255,68,68,0.4)', blur: 15, width: 8 } : null;
      this.drawRoundedRect(ctx, x, y, orderWidth, orderHeight, 12, {
        gradient: [
          { pos: 0, color: isUrgent ? 'rgba(80, 30, 30, 0.9)' : 'rgba(60, 40, 25, 0.9)' },
          { pos: 1, color: isUrgent ? 'rgba(50, 20, 20, 0.9)' : 'rgba(40, 25, 15, 0.9)' }
        ],
        stroke: isUrgent ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 80, 60, 0.5)',
        strokeWidth: 2,
        shadow: { color: 'rgba(0,0,0,0.4)', blur: 10, offsetY: 4 },
        innerGlow: cardGlow
      });

      // Order name
      this.drawStyledText(ctx, order.recipe.name, x + 12, y + 15, {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFD700',
        shadow: { color: 'rgba(0,0,0,0.6)', blur: 3 }
      });

      // Points badge
      this.drawRoundedRect(ctx, x + orderWidth - 65, y + 8, 55, 24, 8, {
        gradient: [
          { pos: 0, color: 'rgba(100, 180, 100, 0.9)' },
          { pos: 1, color: 'rgba(60, 140, 60, 0.9)' }
        ],
        stroke: 'rgba(150, 255, 150, 0.4)',
        strokeWidth: 1
      });
      this.drawStyledText(ctx, `${order.points}`, x + orderWidth - 38, y + 20, {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#FFFFFF',
        align: 'center',
        baseline: 'middle'
      });

      // Ingredients as small icons/badges
      const ingredientY = y + 45;
      order.ingredients.forEach((id, i) => {
        const ingredient = INGREDIENTS[id];
        const badgeX = x + 12 + i * 44;

        // Ingredient badge
        this.drawRoundedRect(ctx, badgeX, ingredientY, 40, 40, 8, {
          fill: ingredient.color + '40',
          stroke: ingredient.color,
          strokeWidth: 2
        });

        // Draw sprite if available
        const sprite = this.sprites[id];
        if (this.spritesLoaded && sprite) {
          ctx.drawImage(sprite, badgeX + 4, ingredientY + 4, 32, 32);
        } else {
          this.drawStyledText(ctx, ingredient.emoji, badgeX + 20, ingredientY + 20, {
            fontSize: 20,
            align: 'center',
            baseline: 'middle'
          });
        }
      });

      // Time bar with gradient
      const barWidth = orderWidth - 24;
      const barHeight = 8;
      const barY = y + orderHeight - 20;

      // Bar background
      this.drawRoundedRect(ctx, x + 12, barY, barWidth, barHeight, 4, {
        fill: 'rgba(0,0,0,0.5)'
      });

      // Bar fill with gradient
      if (timeRatio > 0) {
        const fillWidth = barWidth * timeRatio;
        const barGrad = ctx.createLinearGradient(x + 12, 0, x + 12 + fillWidth, 0);
        if (isUrgent) {
          barGrad.addColorStop(0, '#FF6666');
          barGrad.addColorStop(1, '#FF4444');
        } else if (timeRatio < 0.6) {
          barGrad.addColorStop(0, '#FFAA44');
          barGrad.addColorStop(1, '#FF8800');
        } else {
          barGrad.addColorStop(0, '#66DD66');
          barGrad.addColorStop(1, '#44AA44');
        }
        this.drawRoundedRect(ctx, x + 12, barY, fillWidth, barHeight, 4, {
          fill: barGrad,
          innerGlow: isUrgent ? { color: '#FF4444', blur: 8 } : null
        });
      }
    });
  }

  drawSandwichArea(ctx, width, height) {
    const centerX = width / 2;
    const sandwichY = height / 2 - 50;
    const panelWidth = 300;
    const panelHeight = 380;

    // Panel title
    this.drawStyledText(ctx, 'YOUR SANDWICH', centerX, sandwichY - 15, {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#FFD700',
      align: 'center',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 6 },
      glow: { color: '#FFD700', blur: 10 },
      stroke: { color: 'rgba(0,0,0,0.6)', width: 3 }
    });

    // Draw plate
    if (this.spritesLoaded && this.sprites.plate) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 8;
      ctx.drawImage(this.sprites.plate, centerX - 100, sandwichY + 180, 200, 60);
      ctx.restore();
    }

    // Draw sandwich stack
    if (this.currentSandwich.length === 0) {
      this.drawStyledText(ctx, 'Press A/S/D/F to add ingredients!', centerX, sandwichY + 130, {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        align: 'center',
        baseline: 'middle'
      });
    } else {
      // Draw each ingredient as a sprite layer with shadows
      const baseY = sandwichY + 200;
      this.currentSandwich.forEach((sandwichItem, index) => {
        const isNegative = sandwichItem.isNegative;
        const itemId = sandwichItem.id;
        const itemData = isNegative ? sandwichItem.item : INGREDIENTS[itemId];
        const layerY = baseY - index * 28;
        const sprite = this.sprites[itemId];

        ctx.save();

        // Red tint for negative items
        if (isNegative) {
          ctx.shadowColor = 'rgba(255,0,0,0.6)';
          ctx.shadowBlur = 12;
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.4)';
          ctx.shadowBlur = 6;
        }
        ctx.shadowOffsetY = 3;

        if (this.spritesLoaded && sprite) {
          ctx.drawImage(sprite, centerX - 70, layerY - 20, 140, 45);
        } else {
          // Fallback to styled rectangle
          this.drawRoundedRect(ctx, centerX - 65, layerY - 18, 130, 36, 6, {
            gradient: [
              { pos: 0, color: itemData.color },
              { pos: 1, color: this.darkenColor(itemData.color, 30) }
            ],
            stroke: isNegative ? 'rgba(255,0,0,0.5)' : 'rgba(0,0,0,0.3)',
            strokeWidth: 2
          });
        }
        ctx.restore();

        // Ingredient label (red for negative items)
        this.drawStyledText(ctx, itemData.name, centerX + 85, layerY - 5, {
          fontSize: 11,
          color: isNegative ? 'rgba(255,100,100,0.9)' : 'rgba(255,255,255,0.7)',
          align: 'left',
          baseline: 'middle'
        });
      });
    }

    // Action buttons - positioned below the sandwich
    const btnY = sandwichY + 260;

    // Serve button
    this.drawRoundedRect(ctx, centerX - 120, btnY, 110, 35, 8, {
      gradient: [
        { pos: 0, color: 'rgba(80, 160, 80, 0.95)' },
        { pos: 1, color: 'rgba(50, 120, 50, 0.95)' }
      ],
      stroke: 'rgba(150, 255, 150, 0.5)',
      strokeWidth: 2,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 12, offsetY: 4 }
    });
    this.drawStyledText(ctx, '[SPACE] Serve', centerX - 65, btnY + 17, {
      fontSize: 13,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle',
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 3 }
    });

    // Clear button
    this.drawRoundedRect(ctx, centerX + 10, btnY, 110, 35, 8, {
      gradient: [
        { pos: 0, color: 'rgba(160, 80, 80, 0.95)' },
        { pos: 1, color: 'rgba(120, 50, 50, 0.95)' }
      ],
      stroke: 'rgba(255, 150, 150, 0.5)',
      strokeWidth: 2,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 12, offsetY: 4 }
    });
    this.drawStyledText(ctx, '[⌫] Clear', centerX + 65, btnY + 17, {
      fontSize: 13,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle',
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 3 }
    });
  }

  // Helper to darken a color
  darkenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return `rgb(${R},${G},${B})`;
  }

  drawIngredientGuide(ctx, width, height) {
    const guideX = width - 330;
    const guideY = 80;
    const lineHeight = 52;
    const panelWidth = 315;
    const panelHeight = Object.keys(INGREDIENTS).length * lineHeight + 55;

    // Background panel with glassmorphism
    this.drawRoundedRect(ctx, guideX - 10, guideY - 10, panelWidth, panelHeight, 16, {
      gradient: [
        { pos: 0, color: 'rgba(30, 20, 10, 0.85)' },
        { pos: 1, color: 'rgba(20, 10, 5, 0.9)' }
      ],
      stroke: 'rgba(255, 215, 0, 0.2)',
      strokeWidth: 2,
      shadow: { color: 'rgba(0,0,0,0.6)', blur: 20, offsetY: 8 }
    });

    // Panel title
    this.drawStyledText(ctx, 'INGREDIENTS', guideX + 5, guideY + 8, {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#FFD700',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 4 },
      glow: { color: '#FFD700', blur: 6 }
    });

    const ingredients = Object.entries(INGREDIENTS);
    ingredients.forEach(([id, ingredient], index) => {
      const y = guideY + 45 + index * lineHeight;

      // Row background on hover-like effect for alternate rows
      if (index % 2 === 0) {
        this.drawRoundedRect(ctx, guideX - 2, y - 5, panelWidth - 16, lineHeight - 4, 8, {
          fill: 'rgba(255, 255, 255, 0.03)'
        });
      }

      // Draw sprite with shadow
      const sprite = this.sprites[id];
      if (this.spritesLoaded && sprite) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.drawImage(sprite, guideX + 5, y, 45, 35);
        ctx.restore();
      }

      // Name
      this.drawStyledText(ctx, ingredient.name, guideX + 60, y + 10, {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#FFFFFF',
        shadow: { color: 'rgba(0,0,0,0.5)', blur: 2 }
      });

      // Pattern as key badges
      const pattern = ingredient.pattern;
      const patternStartX = guideX + 170;
      pattern.forEach((beat, i) => {
        const keyColor = this.getKeyColor(beat);
        const badgeX = patternStartX + i * 38;

        // Key badge
        this.drawRoundedRect(ctx, badgeX, y + 3, 32, 32, 6, {
          gradient: [
            { pos: 0, color: keyColor.main + 'CC' },
            { pos: 1, color: keyColor.glow + 'AA' }
          ],
          stroke: keyColor.main,
          strokeWidth: 2,
          shadow: { color: keyColor.glow, blur: 8, offsetY: 2 }
        });

        // Key letter
        this.drawStyledText(ctx, beat, badgeX + 16, y + 19, {
          fontSize: 16,
          fontWeight: 'bold',
          color: '#FFFFFF',
          align: 'center',
          baseline: 'middle',
          shadow: { color: 'rgba(0,0,0,0.5)', blur: 2 }
        });
      });
    });
  }

  drawRhythmIndicator(ctx, width, height) {
    const indicatorY = height - 150;
    const centerX = width / 2;
    const panelWidth = 360;
    const panelHeight = 100;

    // Background panel with glassmorphism
    this.drawRoundedRect(ctx, centerX - panelWidth / 2, indicatorY, panelWidth, panelHeight, 16, {
      gradient: [
        { pos: 0, color: 'rgba(20, 15, 10, 0.9)' },
        { pos: 1, color: 'rgba(10, 5, 0, 0.95)' }
      ],
      stroke: 'rgba(255, 215, 0, 0.3)',
      strokeWidth: 2,
      shadow: { color: 'rgba(0,0,0,0.6)', blur: 20, offsetY: 8 }
    });

    // Panel title
    this.drawStyledText(ctx, 'RHYTHM INPUT', centerX, indicatorY + 12, {
      fontSize: 12,
      fontWeight: 'bold',
      color: 'rgba(255, 215, 0, 0.6)',
      align: 'center',
      baseline: 'top'
    });

    // Beat slots
    const patternState = this.rhythmInput.getPatternState();
    const slotWidth = 100;
    const slotStartX = centerX - (slotWidth * 1.5);

    for (let i = 0; i < 3; i++) {
      const x = slotStartX + i * slotWidth;
      const y = indicatorY + 30;
      const slotW = slotWidth - 12;
      const slotH = 50;

      // Determine slot state
      const isCurrentSlot = i === patternState.pattern.length && patternState.isActive;
      const isFilled = i < patternState.pattern.length;
      const hasPendingInput = isCurrentSlot && patternState.pendingInput !== null;

      // Slot with different styles based on state
      if (isFilled) {
        const beat = patternState.pattern[i];
        const keyColor = this.getKeyColor(beat);

        // Filled slot with glow
        this.drawRoundedRect(ctx, x, y, slotW, slotH, 10, {
          gradient: [
            { pos: 0, color: keyColor.main + '60' },
            { pos: 1, color: keyColor.glow + '40' }
          ],
          stroke: keyColor.main,
          strokeWidth: 3,
          shadow: { color: keyColor.glow, blur: 15 }
        });

        // Beat letter with glow
        this.drawStyledText(ctx, beat, x + slotW / 2, y + slotH / 2, {
          fontSize: 28,
          fontWeight: 'bold',
          color: keyColor.main,
          align: 'center',
          baseline: 'middle',
          glow: { color: keyColor.glow, blur: 12 },
          stroke: { color: 'rgba(0,0,0,0.5)', width: 2 }
        });
      } else if (isCurrentSlot) {
        // Active slot - show pending input if any, otherwise show waiting state
        const pulseIntensity = 0.5 + Math.sin(this.glowPulse * 4) * 0.3;

        if (hasPendingInput) {
          // Show the pending input with a "locked in" style
          const keyColor = this.getKeyColor(patternState.pendingInput);

          this.drawRoundedRect(ctx, x, y, slotW, slotH, 10, {
            gradient: [
              { pos: 0, color: keyColor.main + '80' },
              { pos: 1, color: keyColor.glow + '60' }
            ],
            stroke: keyColor.main,
            strokeWidth: 3,
            shadow: { color: keyColor.glow, blur: 20 }
          });

          // Beat letter with glow
          this.drawStyledText(ctx, patternState.pendingInput, x + slotW / 2, y + 18, {
            fontSize: 26,
            fontWeight: 'bold',
            color: keyColor.main,
            align: 'center',
            baseline: 'middle',
            glow: { color: keyColor.glow, blur: 12 },
            stroke: { color: 'rgba(0,0,0,0.5)', width: 2 }
          });
        } else {
          // No input yet - show pulsing waiting state
          this.drawRoundedRect(ctx, x, y, slotW, slotH, 10, {
            gradient: [
              { pos: 0, color: `rgba(80, 70, 40, ${pulseIntensity})` },
              { pos: 1, color: `rgba(50, 45, 25, ${pulseIntensity})` }
            ],
            stroke: '#FFD700',
            strokeWidth: 3,
            shadow: { color: '#FFD700', blur: 15 * pulseIntensity }
          });

          // Prompt
          this.drawStyledText(ctx, '?', x + slotW / 2, y + 18, {
            fontSize: 20,
            fontWeight: 'bold',
            color: 'rgba(255, 215, 0, 0.7)',
            align: 'center',
            baseline: 'middle',
            glow: { color: '#FFD700', blur: 8 }
          });
        }

        // Timer bar with gradient (always show for current slot)
        const timeRemaining = 1 - patternState.beatProgress;
        const barWidth = slotW - 16;
        const barHeight = 6;
        const barY = y + slotH - 14;

        // Bar background
        this.drawRoundedRect(ctx, x + 8, barY, barWidth, barHeight, 3, {
          fill: 'rgba(0,0,0,0.5)'
        });

        // Bar fill with color based on time
        if (timeRemaining > 0) {
          let barGrad;
          if (timeRemaining < 0.3) {
            barGrad = ctx.createLinearGradient(x + 8, 0, x + 8 + barWidth * timeRemaining, 0);
            barGrad.addColorStop(0, '#FF6666');
            barGrad.addColorStop(1, '#FF4444');
          } else if (timeRemaining < 0.6) {
            barGrad = ctx.createLinearGradient(x + 8, 0, x + 8 + barWidth * timeRemaining, 0);
            barGrad.addColorStop(0, '#FFCC44');
            barGrad.addColorStop(1, '#FF9900');
          } else {
            barGrad = ctx.createLinearGradient(x + 8, 0, x + 8 + barWidth * timeRemaining, 0);
            barGrad.addColorStop(0, '#66FF66');
            barGrad.addColorStop(1, '#44CC44');
          }

          this.drawRoundedRect(ctx, x + 8, barY, barWidth * timeRemaining, barHeight, 3, {
            fill: barGrad
          });
        }
      } else {
        // Waiting slot
        this.drawRoundedRect(ctx, x, y, slotW, slotH, 10, {
          fill: 'rgba(30, 25, 20, 0.6)',
          stroke: 'rgba(80, 70, 60, 0.4)',
          strokeWidth: 2
        });

        this.drawStyledText(ctx, '-', x + slotW / 2, y + slotH / 2, {
          fontSize: 20,
          color: 'rgba(100, 90, 80, 0.5)',
          align: 'center',
          baseline: 'middle'
        });
      }
    }

    // Key legend
    const legendY = height - 35;
    const keys = ['A', 'S', 'D', 'F'];
    const legendStartX = centerX - 100;

    keys.forEach((key, i) => {
      const keyColor = this.getKeyColor(key);
      const kx = legendStartX + i * 50;

      this.drawRoundedRect(ctx, kx, legendY - 10, 28, 22, 4, {
        fill: keyColor.main + '40',
        stroke: keyColor.main,
        strokeWidth: 1
      });
      this.drawStyledText(ctx, key, kx + 14, legendY + 1, {
        fontSize: 13,
        fontWeight: 'bold',
        color: keyColor.main,
        align: 'center',
        baseline: 'middle'
      });
    });

    this.drawStyledText(ctx, '1s per beat', centerX + 90, legendY, {
      fontSize: 12,
      color: 'rgba(150, 140, 130, 0.7)',
      align: 'left',
      baseline: 'middle'
    });

    // Draw beat visuals (floating indicators with glow)
    this.beatVisuals.forEach(visual => {
      const alpha = visual.time / 300;
      const keyColor = this.getKeyColor(visual.beat);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = keyColor.glow;
      ctx.shadowBlur = 15;

      this.drawStyledText(ctx, visual.beat, centerX + (visual.index - 1) * 100, indicatorY - visual.y - 15, {
        fontSize: 30,
        fontWeight: 'bold',
        color: keyColor.main,
        align: 'center',
        baseline: 'middle',
        stroke: { color: 'rgba(0,0,0,0.5)', width: 2 }
      });

      ctx.restore();
    });
  }

  drawFeedback(ctx, width, height) {
    if (this.feedbackTime > 0) {
      const alpha = Math.min(1, this.feedbackTime / 300);
      const scale = 1 + (1 - alpha) * 0.2;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Background pill
      const textWidth = this.feedbackMessage.length * 12;
      this.drawRoundedRect(ctx, width / 2 - textWidth / 2 - 20, height / 2 - 180, textWidth + 40, 50, 25, {
        fill: 'rgba(0, 0, 0, 0.7)',
        stroke: 'rgba(255, 215, 0, 0.5)',
        strokeWidth: 2
      });

      this.drawStyledText(ctx, this.feedbackMessage, width / 2, height / 2 - 155, {
        fontSize: 24 * scale,
        fontWeight: 'bold',
        color: '#FFD700',
        align: 'center',
        baseline: 'middle',
        glow: { color: '#FFD700', blur: 15 },
        stroke: { color: 'rgba(0,0,0,0.5)', width: 2 }
      });

      ctx.restore();
    }
  }

  drawGameOver(ctx, width, height) {
    // Gradient overlay
    const overlayGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width * 0.6);
    overlayGrad.addColorStop(0, 'rgba(20, 10, 5, 0.85)');
    overlayGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, width, height);

    // Results panel
    const panelWidth = 450;
    const panelHeight = 380;
    this.drawRoundedRect(ctx, width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 24, {
      gradient: [
        { pos: 0, color: 'rgba(50, 35, 20, 0.95)' },
        { pos: 1, color: 'rgba(30, 20, 10, 0.98)' }
      ],
      stroke: 'rgba(255, 215, 0, 0.4)',
      strokeWidth: 3,
      shadow: { color: 'rgba(255, 215, 0, 0.2)', blur: 40 }
    });

    // "TIME UP!" with animated glow
    const pulse = 1 + Math.sin(this.glowPulse * 2) * 0.05;
    this.drawStyledText(ctx, 'TIME UP!', width / 2, height / 2 - 140, {
      fontSize: 56 * pulse,
      fontWeight: 'bold',
      color: '#FFD700',
      align: 'center',
      baseline: 'middle',
      glow: { color: '#FFD700', blur: 25 },
      stroke: { color: '#000', width: 4 }
    });

    // Final score with large display
    this.drawStyledText(ctx, `${this.finalResults.score}`, width / 2, height / 2 - 60, {
      fontSize: 64,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle',
      glow: { color: '#FFFFFF', blur: 15 },
      stroke: { color: 'rgba(0,0,0,0.5)', width: 3 }
    });

    this.drawStyledText(ctx, 'FINAL SCORE', width / 2, height / 2 - 15, {
      fontSize: 16,
      color: 'rgba(255, 215, 0, 0.7)',
      align: 'center',
      baseline: 'middle'
    });

    // Stats in styled boxes
    const statsY = height / 2 + 40;
    const statBoxWidth = 120;
    const statSpacing = 140;

    // Orders Completed
    this.drawRoundedRect(ctx, width / 2 - statSpacing - statBoxWidth / 2, statsY, statBoxWidth, 70, 12, {
      fill: 'rgba(100, 200, 100, 0.2)',
      stroke: 'rgba(100, 255, 100, 0.4)',
      strokeWidth: 2
    });
    this.drawStyledText(ctx, `${this.finalResults.ordersCompleted}`, width / 2 - statSpacing, statsY + 25, {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#88FF88',
      align: 'center',
      baseline: 'middle',
      glow: { color: '#88FF88', blur: 8 }
    });
    this.drawStyledText(ctx, 'Completed', width / 2 - statSpacing, statsY + 55, {
      fontSize: 12,
      color: 'rgba(150, 255, 150, 0.7)',
      align: 'center',
      baseline: 'middle'
    });

    // Orders Failed
    this.drawRoundedRect(ctx, width / 2 - statBoxWidth / 2, statsY, statBoxWidth, 70, 12, {
      fill: 'rgba(200, 100, 100, 0.2)',
      stroke: 'rgba(255, 100, 100, 0.4)',
      strokeWidth: 2
    });
    this.drawStyledText(ctx, `${this.finalResults.ordersFailed}`, width / 2, statsY + 25, {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#FF8888',
      align: 'center',
      baseline: 'middle',
      glow: { color: '#FF8888', blur: 8 }
    });
    this.drawStyledText(ctx, 'Failed', width / 2, statsY + 55, {
      fontSize: 12,
      color: 'rgba(255, 150, 150, 0.7)',
      align: 'center',
      baseline: 'middle'
    });

    // Max Combo
    this.drawRoundedRect(ctx, width / 2 + statSpacing - statBoxWidth / 2, statsY, statBoxWidth, 70, 12, {
      fill: 'rgba(100, 200, 255, 0.2)',
      stroke: 'rgba(100, 200, 255, 0.4)',
      strokeWidth: 2
    });
    this.drawStyledText(ctx, `x${this.finalResults.maxCombo}`, width / 2 + statSpacing, statsY + 25, {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#88FFFF',
      align: 'center',
      baseline: 'middle',
      glow: { color: '#88FFFF', blur: 8 }
    });
    this.drawStyledText(ctx, 'Max Combo', width / 2 + statSpacing, statsY + 55, {
      fontSize: 12,
      color: 'rgba(150, 255, 255, 0.7)',
      align: 'center',
      baseline: 'middle'
    });

    // Action buttons
    const btnY = height / 2 + 140;

    // Restart button
    const restartHover = 0.8 + Math.sin(this.glowPulse * 3) * 0.1;
    this.drawRoundedRect(ctx, width / 2 - 150, btnY, 130, 45, 10, {
      gradient: [
        { pos: 0, color: `rgba(80, 160, 80, ${restartHover})` },
        { pos: 1, color: `rgba(50, 120, 50, ${restartHover})` }
      ],
      stroke: 'rgba(150, 255, 150, 0.5)',
      strokeWidth: 2,
      shadow: { color: 'rgba(100, 255, 100, 0.3)', blur: 15 }
    });
    this.drawStyledText(ctx, '[R] Restart', width / 2 - 85, btnY + 22, {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle'
    });

    // Menu button
    this.drawRoundedRect(ctx, width / 2 + 20, btnY, 130, 45, 10, {
      gradient: [
        { pos: 0, color: 'rgba(100, 100, 160, 0.8)' },
        { pos: 1, color: 'rgba(60, 60, 120, 0.8)' }
      ],
      stroke: 'rgba(150, 150, 255, 0.5)',
      strokeWidth: 2,
      shadow: { color: 'rgba(100, 100, 255, 0.2)', blur: 10 }
    });
    this.drawStyledText(ctx, '[M] Menu', width / 2 + 85, btnY + 22, {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle'
    });
  }
}
