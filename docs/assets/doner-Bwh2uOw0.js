import { a as M2D, _ as __vitePreload } from "./m2d-BqOTLTDi.js";
const INGREDIENTS = {
  bread: {
    name: "Bread",
    pattern: ["A", "A", "_"],
    color: "#D4A574",
    emoji: "🍞",
    sprite: "BreadOpen.png"
  },
  meat: {
    name: "Meat",
    pattern: ["A", "S", "D"],
    color: "#8B4513",
    emoji: "🥩",
    sprite: "MeatVeal.png"
  },
  salad: {
    name: "Salad",
    pattern: ["S", "S", "_"],
    color: "#90EE90",
    emoji: "🥬",
    sprite: "Salad.png"
  },
  onion: {
    name: "Onion",
    pattern: ["D", "D", "_"],
    color: "#DDA0DD",
    emoji: "🧅",
    sprite: "Onion.png"
  },
  sauce: {
    name: "Sauce",
    pattern: ["F", "F", "F"],
    color: "#FFFFFF",
    emoji: "🥛",
    sprite: "SauceA.png"
  },
  sauerkraut: {
    name: "Sauerkraut",
    pattern: ["S", "D", "F"],
    color: "#F0E68C",
    emoji: "🥗",
    sprite: "SauerKraut.png"
  },
  specialSalad: {
    name: "Special Salad",
    pattern: ["A", "S", "F"],
    color: "#32CD32",
    emoji: "🥗",
    sprite: "SpecialSalad.webp"
  },
  breadClosed: {
    name: "Bread Top",
    pattern: ["A", "A", "A"],
    color: "#D2691E",
    emoji: "🥖",
    sprite: "BreadClosed.webp"
  }
};
const NEGATIVE_ITEMS = {
  pills: {
    name: "Pills",
    color: "#FF4444",
    emoji: "💊",
    sprite: "Pills.webp",
    penalty: -30
  },
  book: {
    name: "Book",
    color: "#8B4513",
    emoji: "📖",
    sprite: "Book.webp",
    penalty: -25
  },
  fish: {
    name: "Fish",
    color: "#4169E1",
    emoji: "🐟",
    sprite: "Fish.webp",
    penalty: -20
  },
  key: {
    name: "Key",
    color: "#FFD700",
    emoji: "🔑",
    sprite: "Key.webp",
    penalty: -25
  },
  nails: {
    name: "Nails",
    color: "#808080",
    emoji: "🔩",
    sprite: "Nails.webp",
    penalty: -35
  },
  oil: {
    name: "Oil",
    color: "#2F4F4F",
    emoji: "🛢️",
    sprite: "Oil.webp",
    penalty: -30
  }
};
function getRandomNegativeItem() {
  const items = Object.entries(NEGATIVE_ITEMS);
  const [id, item] = items[Math.floor(Math.random() * items.length)];
  return { id, ...item };
}
const RECIPES = {
  classicDoner: {
    name: "Classic Doner",
    ingredients: ["bread", "meat", "salad", "sauce", "breadClosed"],
    points: 100,
    timeBonus: 50
  },
  meatDoner: {
    name: "Meat Lover",
    ingredients: ["bread", "meat", "meat", "sauce", "breadClosed"],
    points: 120,
    timeBonus: 60
  },
  germanDoner: {
    name: "German Style",
    ingredients: ["bread", "meat", "sauerkraut", "sauce", "breadClosed"],
    points: 125,
    timeBonus: 60
  },
  veggieDoner: {
    name: "Veggie Doner",
    ingredients: ["bread", "salad", "onion", "sauce", "breadClosed"],
    points: 100,
    timeBonus: 50
  },
  specialDoner: {
    name: "Special Doner",
    ingredients: ["bread", "meat", "specialSalad", "sauce", "breadClosed"],
    points: 150,
    timeBonus: 75
  },
  loadedDoner: {
    name: "Loaded Doner",
    ingredients: ["bread", "meat", "salad", "onion", "sauerkraut", "sauce", "breadClosed"],
    points: 200,
    timeBonus: 100
  }
};
function patternsMatch(pattern1, pattern2) {
  if (pattern1.length !== pattern2.length) return false;
  for (let i = 0; i < pattern1.length; i++) {
    if (pattern1[i] !== pattern2[i]) return false;
  }
  return true;
}
function findIngredientByPattern(pattern) {
  for (const [id, ingredient] of Object.entries(INGREDIENTS)) {
    if (patternsMatch(ingredient.pattern, pattern)) {
      return { id, ...ingredient };
    }
  }
  return null;
}
class RhythmInput {
  constructor(game2, options = {}) {
    this.game = game2;
    this.beatDuration = options.beatDuration || 1e3;
    this.patternLength = options.patternLength || 3;
    this.onPatternComplete = options.onPatternComplete || (() => {
    });
    this.onBeatInput = options.onBeatInput || (() => {
    });
    this.currentPattern = [];
    this.isPatternActive = false;
    this.lastBeatTime = 0;
    this.pendingInput = null;
    this.currentBeatIndex = 0;
    this.keys = ["a", "s", "d", "f"];
    this.keys.forEach((key) => this.game.keys.addKey(key));
    this.autoMode = false;
  }
  startAutoMode() {
    this.autoMode = true;
    this.startPattern(performance.now());
  }
  stopAutoMode() {
    this.autoMode = false;
    this.resetPattern();
  }
  update(deltaTime) {
    const now = performance.now();
    if (this.autoMode && !this.isPatternActive) {
      this.startPattern(now);
    }
    if (this.isPatternActive && this.pendingInput === null) {
      for (let i = 0; i < this.keys.length; i++) {
        if (this.game.keys.isJustPressed(this.keys[i])) {
          this.handleKeyPress(this.keys[i].toUpperCase(), now);
          break;
        }
      }
    }
    if (this.isPatternActive) {
      const timeSinceLastBeat = now - this.lastBeatTime;
      if (timeSinceLastBeat >= this.beatDuration) {
        this.finalizeCurrentSlot(now);
      }
    }
  }
  handleKeyPress(key, now) {
    this.pendingInput = key;
    this.onBeatInput(key, this.currentPattern.length, [...this.currentPattern, key]);
  }
  finalizeCurrentSlot(now) {
    const beat = this.pendingInput !== null ? this.pendingInput : "_";
    this.currentPattern.push(beat);
    if (this.pendingInput === null) {
      this.onBeatInput("_", this.currentPattern.length - 1, [...this.currentPattern]);
    }
    this.pendingInput = null;
    this.lastBeatTime = now;
    this.currentBeatIndex = this.currentPattern.length;
    if (this.currentPattern.length >= this.patternLength) {
      this.completePattern();
    }
  }
  startPattern(now) {
    this.isPatternActive = true;
    this.currentPattern = [];
    this.lastBeatTime = now;
    this.currentBeatIndex = 0;
    this.pendingInput = null;
  }
  completePattern() {
    const pattern = [...this.currentPattern];
    this.onPatternComplete(pattern);
    this.resetPattern();
  }
  resetPattern() {
    this.isPatternActive = false;
    this.currentPattern = [];
    this.currentBeatIndex = 0;
    this.pendingInput = null;
  }
  // Force complete the pattern (e.g., when player presses space to finalize)
  forceComplete() {
    if (this.currentPattern.length > 0 || this.pendingInput !== null) {
      if (this.pendingInput !== null) {
        this.currentPattern.push(this.pendingInput);
      }
      while (this.currentPattern.length < this.patternLength) {
        this.currentPattern.push("_");
      }
      this.completePattern();
    }
  }
  // Get current pattern state for UI
  getPatternState() {
    const now = performance.now();
    const timeSinceLastBeat = this.isPatternActive ? now - this.lastBeatTime : 0;
    const beatProgress = Math.min(1, timeSinceLastBeat / this.beatDuration);
    return {
      pattern: [...this.currentPattern],
      pendingInput: this.pendingInput,
      // The key pressed for current slot (if any)
      beatIndex: this.currentBeatIndex,
      isActive: this.isPatternActive,
      progress: this.currentPattern.length / this.patternLength,
      beatTimeRemaining: this.isPatternActive ? Math.max(0, this.beatDuration - timeSinceLastBeat) : this.beatDuration,
      beatProgress
      // 0 = just started, 1 = time's up
    };
  }
}
class OrderManager {
  constructor(options = {}) {
    this.maxOrders = options.maxOrders || 3;
    this.orderTimeout = options.orderTimeout || 6e4;
    this.difficultyLevel = options.difficultyLevel || 1;
    this.onOrderExpired = options.onOrderExpired || (() => {
    });
    this.onOrderComplete = options.onOrderComplete || (() => {
    });
    this.orders = [];
    this.completedOrders = 0;
    this.failedOrders = 0;
    this.nextOrderId = 1;
    this.orderSpawnInterval = options.orderSpawnInterval || 1e4;
    this.timeSinceLastOrder = 0;
    this.hasInitialOrder = false;
    this.availableRecipes = this.getRecipesForDifficulty(this.difficultyLevel);
  }
  getRecipesForDifficulty(level) {
    const recipeKeys = Object.keys(RECIPES);
    if (level <= 1) {
      return recipeKeys.filter((key) => RECIPES[key].ingredients.length <= 5);
    } else if (level <= 2) {
      return recipeKeys.filter((key) => RECIPES[key].ingredients.length <= 6);
    }
    return recipeKeys;
  }
  setDifficulty(level) {
    this.difficultyLevel = level;
    this.availableRecipes = this.getRecipesForDifficulty(level);
    this.orderTimeout = Math.max(3e4, 6e4 - (level - 1) * 1e4);
  }
  update(deltaTime) {
    const now = Date.now();
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const order = this.orders[i];
      order.timeRemaining = Math.max(0, order.expiresAt - now);
      if (order.timeRemaining <= 0) {
        this.orders.splice(i, 1);
        this.failedOrders++;
        this.onOrderExpired(order);
      }
    }
    if (!this.hasInitialOrder) {
      this.generateOrder();
      this.hasInitialOrder = true;
      this.timeSinceLastOrder = 0;
      return;
    }
    this.timeSinceLastOrder += deltaTime * 1e3;
    if (this.orders.length < this.maxOrders && this.timeSinceLastOrder >= this.orderSpawnInterval) {
      this.generateOrder();
      this.timeSinceLastOrder = 0;
    }
  }
  generateOrder() {
    if (this.availableRecipes.length === 0) return null;
    const recipeKey = this.availableRecipes[Math.floor(Math.random() * this.availableRecipes.length)];
    const recipe = RECIPES[recipeKey];
    const order = {
      id: this.nextOrderId++,
      recipeKey,
      recipe,
      ingredients: [...recipe.ingredients],
      createdAt: Date.now(),
      expiresAt: Date.now() + this.orderTimeout,
      timeRemaining: this.orderTimeout,
      points: recipe.points,
      timeBonus: recipe.timeBonus
    };
    this.orders.push(order);
    return order;
  }
  // Check if a sandwich matches any current order
  checkSandwich(sandwichIngredients) {
    for (let i = 0; i < this.orders.length; i++) {
      const order = this.orders[i];
      if (this.ingredientsMatch(sandwichIngredients, order.ingredients)) {
        const completedOrder = this.orders.splice(i, 1)[0];
        this.completedOrders++;
        const timeRatio = completedOrder.timeRemaining / this.orderTimeout;
        const bonus = Math.floor(completedOrder.timeBonus * timeRatio);
        const totalPoints = completedOrder.points + bonus;
        this.onOrderComplete(completedOrder, totalPoints, bonus);
        return {
          success: true,
          order: completedOrder,
          points: totalPoints,
          bonus
        };
      }
    }
    return { success: false };
  }
  ingredientsMatch(sandwich, required) {
    if (sandwich.length !== required.length) return false;
    for (let i = 0; i < sandwich.length; i++) {
      if (sandwich[i] !== required[i]) return false;
    }
    return true;
  }
  // Get order by index
  getOrder(index) {
    return this.orders[index] || null;
  }
  // Get all current orders
  getOrders() {
    return [...this.orders];
  }
  // Get stats
  getStats() {
    return {
      completed: this.completedOrders,
      failed: this.failedOrders,
      pending: this.orders.length
    };
  }
  // Reset for new game
  reset() {
    this.orders = [];
    this.completedOrders = 0;
    this.failedOrders = 0;
    this.nextOrderId = 1;
    this.timeSinceLastOrder = 0;
    this.hasInitialOrder = false;
  }
}
class DonerGame {
  constructor(game2) {
    this.game = game2;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentSandwich = [];
    this.lastAddedIngredient = null;
    this.lastAddedTime = 0;
    this.feedbackMessage = "";
    this.feedbackTime = 0;
    this.isGameActive = false;
    this.gameTime = 0;
    this.gameDuration = 120;
    this.beatVisuals = [];
    this.ingredientAnimations = [];
    this.particles = [];
    this.glowPulse = 0;
    this.sprites = {};
    this.spritesLoaded = false;
    this.loadSprites();
    this.sounds = {};
    this.loadSounds();
    this.game.keys.addKey(" ");
    this.game.keys.addKey("Backspace");
    this.rhythmInput = new RhythmInput(game2, {
      beatDuration: 1e3,
      // 1 second per beat
      patternLength: 3,
      onPatternComplete: (pattern) => this.handlePatternComplete(pattern),
      onBeatInput: (beat, index, pattern) => this.handleBeatInput(beat, index, pattern)
    });
    this.orderManager = new OrderManager({
      maxOrders: 3,
      orderTimeout: 45e3,
      onOrderExpired: (order) => this.handleOrderExpired(order),
      onOrderComplete: (order, points, bonus) => this.handleOrderComplete(order, points, bonus)
    });
  }
  loadSprites() {
    const basePath = this.game.options.basePath + "sprites/";
    const spriteFiles = {
      background: "new-bg.webp",
      plate: "Plate.png",
      // Regular ingredients
      bread: "BreadOpen.png",
      meat: "MeatVeal.png",
      salad: "Salad.png",
      onion: "Onion.png",
      sauce: "SauceA.png",
      sauerkraut: "SauerKraut.png",
      specialSalad: "SpecialSalad.webp",
      breadClosed: "BreadClosed.webp",
      // Negative items
      pills: "Pills.webp",
      book: "Book.webp",
      fish: "Fish.webp",
      key: "Key.webp",
      nails: "Nails.webp",
      oil: "Oil.webp"
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
    this.sounds.loop = new Audio(basePath + "bg.mp3");
    this.sounds.loop.loop = true;
    this.sounds.loop.volume = 0.15;
    this.sounds.keyPress = new Audio(basePath + "MJoneshot.wav");
    this.sounds.keyPress.volume = 0.7;
  }
  playKeySound() {
    const sound = this.sounds.keyPress.cloneNode();
    sound.volume = 0.7;
    sound.play().catch(() => {
    });
  }
  startMusic() {
    if (this.sounds.loop) {
      this.sounds.loop.currentTime = 0;
      this.sounds.loop.play().catch(() => {
      });
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
    if (options.shadow) {
      ctx.shadowColor = options.shadow.color || "rgba(0,0,0,0.5)";
      ctx.shadowBlur = options.shadow.blur || 10;
      ctx.shadowOffsetX = options.shadow.offsetX || 0;
      ctx.shadowOffsetY = options.shadow.offsetY || 4;
    }
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    if (options.gradient) {
      const grad = ctx.createLinearGradient(x, y, x, y + height);
      options.gradient.forEach((stop, i) => {
        grad.addColorStop(stop.pos !== void 0 ? stop.pos : i / (options.gradient.length - 1), stop.color);
      });
      ctx.fillStyle = grad;
    } else if (options.fill) {
      ctx.fillStyle = options.fill;
    }
    if (options.fill || options.gradient) {
      ctx.fill();
    }
    ctx.shadowColor = "transparent";
    if (options.stroke) {
      ctx.strokeStyle = options.stroke;
      ctx.lineWidth = options.strokeWidth || 2;
      ctx.stroke();
    }
    if (options.innerGlow) {
      ctx.save();
      ctx.clip();
      ctx.shadowColor = options.innerGlow.color || "rgba(255,255,255,0.3)";
      ctx.shadowBlur = options.innerGlow.blur || 15;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = options.innerGlow.color || "rgba(255,255,255,0.3)";
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
    const fontWeight = options.fontWeight || "normal";
    const fontFamily = options.fontFamily || '"Helvetica Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "top";
    if (options.glow) {
      ctx.shadowColor = options.glow.color || options.color || "#fff";
      ctx.shadowBlur = options.glow.blur || 10;
    }
    if (options.shadow) {
      ctx.shadowColor = options.shadow.color || "rgba(0,0,0,0.8)";
      ctx.shadowBlur = options.shadow.blur || 4;
      ctx.shadowOffsetX = options.shadow.offsetX || 2;
      ctx.shadowOffsetY = options.shadow.offsetY || 2;
    }
    if (options.stroke) {
      ctx.strokeStyle = options.stroke.color || "#000";
      ctx.lineWidth = options.stroke.width || 3;
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = options.color || "#fff";
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
        color: options.colors ? options.colors[Math.floor(Math.random() * options.colors.length)] : "#FFD700",
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
      p.vy += 200 * deltaTime;
      p.life -= deltaTime * p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }
  // Draw all particles
  drawParticles(ctx) {
    this.particles.forEach((p) => {
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
      "A": { main: "#FF6B6B", glow: "#FF4444" },
      "S": { main: "#6BFF6B", glow: "#44FF44" },
      "D": { main: "#6B8BFF", glow: "#4466FF" },
      "F": { main: "#FFD700", glow: "#FFAA00" },
      "_": { main: "#666666", glow: "#444444" }
    };
    return colors[key] || colors["_"];
  }
  start() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentSandwich = [];
    this.gameTime = 0;
    this.orderManager.reset();
    this.finalResults = null;
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
    this.showFeedback("GO!", 500);
  }
  stop() {
    this.isGameActive = false;
    this.stopMusic();
  }
  update(deltaTime) {
    this.glowPulse += deltaTime * 3;
    if (this.glowPulse > Math.PI * 2) this.glowPulse -= Math.PI * 2;
    this.updateParticles(deltaTime);
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
    if (this.gameTime >= this.gameDuration) {
      this.endGame();
      return;
    }
    this.rhythmInput.update(deltaTime);
    this.orderManager.update(deltaTime);
    if (this.game.keys.isJustPressed(" ")) {
      this.serveSandwich();
    }
    if (this.game.keys.isJustPressed("Backspace")) {
      this.clearSandwich();
    }
    if (this.feedbackTime > 0) {
      this.feedbackTime -= deltaTime * 1e3;
    }
    this.updateAnimations(deltaTime);
  }
  handleBeatInput(beat, index, pattern) {
    if (beat !== "_") {
      this.playKeySound();
    }
    this.beatVisuals.push({
      beat,
      index,
      time: 300,
      y: 0
    });
  }
  handlePatternComplete(pattern) {
    const isEmptyPattern = pattern.every((beat) => beat === "_");
    if (isEmptyPattern) {
      return;
    }
    const ingredient = findIngredientByPattern(pattern);
    if (ingredient) {
      this.addIngredient(ingredient.id);
      this.showFeedback(`+ ${ingredient.emoji} ${ingredient.name}!`, 1e3);
      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
    } else {
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
    this.ingredientAnimations.push({
      ingredient: INGREDIENTS[ingredientId],
      startY: 200,
      targetY: 400 + this.currentSandwich.length * 30,
      progress: 0,
      duration: 300
    });
    const width = this.game.options.width;
    const height = this.game.options.height;
    const ingredient = INGREDIENTS[ingredientId];
    this.spawnParticles(width / 2 - 60, height / 2 - 30, 15, {
      colors: [ingredient.color, "#FFD700", "#FFFFFF"],
      speed: 150,
      life: 0.8,
      upward: true
    });
  }
  addNegativeItem(item) {
    this.currentSandwich.push({ id: item.id, isNegative: true, item });
    this.lastAddedIngredient = item.id;
    this.lastAddedTime = Date.now();
    const width = this.game.options.width;
    const height = this.game.options.height;
    this.spawnParticles(width / 2 - 60, height / 2 - 30, 20, {
      colors: ["#FF0000", "#880000", "#440000"],
      speed: 180,
      life: 1,
      upward: false
    });
  }
  serveSandwich() {
    if (this.currentSandwich.length === 0) {
      this.showFeedback("Nothing to serve!", 800);
      return;
    }
    const ingredientIds = this.currentSandwich.filter((item) => !item.isNegative).map((item) => item.id);
    const result = this.orderManager.checkSandwich(ingredientIds);
    if (result.success) {
      this.score += result.points;
      const timeBonus = 10;
      this.gameTime = Math.max(0, this.gameTime - timeBonus);
      this.showFeedback(`Order complete! +${result.points} (+${timeBonus}s)`, 3e3);
    } else {
      this.showFeedback("Wrong order! Check the recipes.", 3e3);
      this.combo = 0;
    }
    this.currentSandwich = [];
  }
  clearSandwich() {
    if (this.currentSandwich.length > 0) {
      this.currentSandwich = [];
      this.showFeedback("Sandwich cleared", 500);
      this.combo = 0;
    }
  }
  handleOrderExpired(order) {
    this.showFeedback(`Order expired: ${order.recipe.name}`, 3e3);
    this.combo = 0;
  }
  handleOrderComplete(order, points, bonus) {
  }
  showFeedback(message, duration) {
    this.feedbackMessage = message;
    this.feedbackTime = duration;
  }
  updateAnimations(deltaTime) {
    for (let i = this.beatVisuals.length - 1; i >= 0; i--) {
      this.beatVisuals[i].time -= deltaTime * 1e3;
      this.beatVisuals[i].y += deltaTime * 100;
      if (this.beatVisuals[i].time <= 0) {
        this.beatVisuals.splice(i, 1);
      }
    }
    for (let i = this.ingredientAnimations.length - 1; i >= 0; i--) {
      const anim = this.ingredientAnimations[i];
      anim.progress += deltaTime * 1e3 / anim.duration;
      if (anim.progress >= 1) {
        this.ingredientAnimations.splice(i, 1);
      }
    }
  }
  endGame() {
    this.isGameActive = false;
    this.stopMusic();
    const stats = this.orderManager.getStats();
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
    if (this.spritesLoaded && this.sprites.background) {
      ctx.drawImage(this.sprites.background, 0, 0, width, height);
    } else {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#1a0f0a");
      bgGrad.addColorStop(0.5, "#2d1b0e");
      bgGrad.addColorStop(1, "#1a0f0a");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    }
    const vignetteGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.7);
    vignetteGrad.addColorStop(0, "rgba(0,0,0,0)");
    vignetteGrad.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, width, height);
    this.drawHeader(ctx, width, height);
    this.drawOrders(ctx, width, height);
    this.drawSandwichArea(ctx, width, height);
    this.drawIngredientGuide(ctx, width, height);
    this.drawRhythmIndicator(ctx, width, height);
    this.drawFeedback(ctx, width, height);
    this.drawParticles(ctx);
    if (this.isCountingDown) {
      this.drawCountdown(ctx, width, height);
    }
    if (!this.isGameActive && !this.isCountingDown && this.finalResults) {
      this.drawGameOver(ctx, width, height);
    }
  }
  drawCountdown(ctx, width, height) {
    const overlayGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.6);
    overlayGrad.addColorStop(0, "rgba(0, 0, 0, 0.6)");
    overlayGrad.addColorStop(1, "rgba(0, 0, 0, 0.9)");
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, width, height);
    const ringRadius = 120 + Math.sin(this.glowPulse * 2) * 10;
    ctx.save();
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 6;
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2 - 20, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const pulse = 1 + Math.sin(this.glowPulse * 4) * 0.05;
    this.drawStyledText(ctx, this.countdownValue.toString(), width / 2, height / 2 - 20, {
      fontSize: 150 * pulse,
      fontWeight: "bold",
      color: "#FFD700",
      align: "center",
      baseline: "middle",
      glow: { color: "#FFD700", blur: 30 },
      stroke: { color: "#000", width: 4 }
    });
    this.drawStyledText(ctx, "GET READY!", width / 2, height / 2 + 100, {
      fontSize: 42,
      fontWeight: "bold",
      color: "#FFFFFF",
      align: "center",
      baseline: "middle",
      shadow: { color: "rgba(0,0,0,0.8)", blur: 10, offsetY: 4 },
      glow: { color: "#FFFFFF", blur: 15 }
    });
  }
  drawHeader(ctx, width, height) {
    this.drawRoundedRect(ctx, 10, 10, width - 20, 55, 12, {
      gradient: [
        { pos: 0, color: "rgba(20, 10, 5, 0.9)" },
        { pos: 1, color: "rgba(40, 25, 15, 0.85)" }
      ],
      stroke: "rgba(255, 215, 0, 0.3)",
      strokeWidth: 2,
      shadow: { color: "rgba(0,0,0,0.5)", blur: 15, offsetY: 5 }
    });
    this.drawStyledText(ctx, `Score: ${this.score}`, 30, 38, {
      fontSize: 28,
      fontWeight: "bold",
      color: "#FFD700",
      align: "left",
      baseline: "middle",
      shadow: { color: "rgba(0,0,0,0.8)", blur: 4, offsetY: 2 },
      glow: { color: "#FFD700", blur: 8 }
    });
    if (this.combo > 1) {
      const comboPulse = 1 + Math.sin(this.glowPulse * 5) * 0.1;
      this.drawStyledText(ctx, `x${this.combo}`, 220, 38, {
        fontSize: 26 * comboPulse,
        fontWeight: "bold",
        color: "#FF6B6B",
        align: "left",
        baseline: "middle",
        glow: { color: "#FF6B6B", blur: 15 },
        stroke: { color: "rgba(0,0,0,0.5)", width: 2 }
      });
    }
    const timeLeft = Math.max(0, this.gameDuration - this.gameTime);
    const minutes = Math.floor(timeLeft / 60);
    const seconds = Math.floor(timeLeft % 60);
    const timeColor = timeLeft < 30 ? "#FF4444" : "#FFFFFF";
    const timeGlow = timeLeft < 30 ? { color: "#FF4444", blur: 15 } : null;
    this.drawStyledText(ctx, `${minutes}:${seconds.toString().padStart(2, "0")}`, width - 30, 38, {
      fontSize: 32,
      fontWeight: "bold",
      color: timeColor,
      align: "right",
      baseline: "middle",
      shadow: { color: "rgba(0,0,0,0.8)", blur: 4, offsetY: 2 },
      glow: timeGlow
    });
    const titlePulse = 1 + Math.sin(this.glowPulse) * 0.02;
    this.drawStyledText(ctx, "DONER RHYTHM", width / 2, 38, {
      fontSize: 32 * titlePulse,
      fontWeight: "bold",
      color: "#FFD700",
      align: "center",
      baseline: "middle",
      shadow: { color: "rgba(0,0,0,0.8)", blur: 6, offsetY: 3 },
      glow: { color: "#FFD700", blur: 12 }
    });
  }
  drawOrders(ctx, width, height) {
    const orders = this.orderManager.getOrders();
    const orderWidth = 290;
    const orderHeight = 140;
    const startX = 15;
    const startY = 80;
    this.drawRoundedRect(ctx, startX, startY - 10, orderWidth + 20, 3 * (orderHeight + 12) + 50, 16, {
      gradient: [
        { pos: 0, color: "rgba(30, 20, 10, 0.85)" },
        { pos: 1, color: "rgba(20, 10, 5, 0.9)" }
      ],
      stroke: "rgba(255, 215, 0, 0.2)",
      strokeWidth: 2,
      shadow: { color: "rgba(0,0,0,0.6)", blur: 20, offsetY: 8 }
    });
    this.drawStyledText(ctx, "ORDERS", startX + 15, startY + 10, {
      fontSize: 18,
      fontWeight: "bold",
      color: "#FFD700",
      shadow: { color: "rgba(0,0,0,0.8)", blur: 4 },
      glow: { color: "#FFD700", blur: 6 }
    });
    orders.forEach((order, index) => {
      const x = startX + 10;
      const y = startY + 40 + index * (orderHeight + 12);
      const timeRatio = order.timeRemaining / this.orderManager.orderTimeout;
      const isUrgent = timeRatio < 0.3;
      const cardGlow = isUrgent ? { color: "rgba(255,68,68,0.4)", blur: 15, width: 8 } : null;
      this.drawRoundedRect(ctx, x, y, orderWidth, orderHeight, 12, {
        gradient: [
          { pos: 0, color: isUrgent ? "rgba(80, 30, 30, 0.9)" : "rgba(60, 40, 25, 0.9)" },
          { pos: 1, color: isUrgent ? "rgba(50, 20, 20, 0.9)" : "rgba(40, 25, 15, 0.9)" }
        ],
        stroke: isUrgent ? "rgba(255, 100, 100, 0.5)" : "rgba(100, 80, 60, 0.5)",
        strokeWidth: 2,
        shadow: { color: "rgba(0,0,0,0.4)", blur: 10, offsetY: 4 },
        innerGlow: cardGlow
      });
      this.drawStyledText(ctx, order.recipe.name, x + 12, y + 15, {
        fontSize: 16,
        fontWeight: "bold",
        color: "#FFD700",
        shadow: { color: "rgba(0,0,0,0.6)", blur: 3 }
      });
      this.drawRoundedRect(ctx, x + orderWidth - 65, y + 8, 55, 24, 8, {
        gradient: [
          { pos: 0, color: "rgba(100, 180, 100, 0.9)" },
          { pos: 1, color: "rgba(60, 140, 60, 0.9)" }
        ],
        stroke: "rgba(150, 255, 150, 0.4)",
        strokeWidth: 1
      });
      this.drawStyledText(ctx, `${order.points}`, x + orderWidth - 38, y + 20, {
        fontSize: 14,
        fontWeight: "bold",
        color: "#FFFFFF",
        align: "center",
        baseline: "middle"
      });
      const ingredientY = y + 45;
      order.ingredients.forEach((id, i) => {
        const ingredient = INGREDIENTS[id];
        const badgeX = x + 12 + i * 44;
        this.drawRoundedRect(ctx, badgeX, ingredientY, 40, 40, 8, {
          fill: ingredient.color + "40",
          stroke: ingredient.color,
          strokeWidth: 2
        });
        const sprite = this.sprites[id];
        if (this.spritesLoaded && sprite) {
          ctx.drawImage(sprite, badgeX + 4, ingredientY + 4, 32, 32);
        } else {
          this.drawStyledText(ctx, ingredient.emoji, badgeX + 20, ingredientY + 20, {
            fontSize: 20,
            align: "center",
            baseline: "middle"
          });
        }
      });
      const barWidth = orderWidth - 24;
      const barHeight = 8;
      const barY = y + orderHeight - 20;
      this.drawRoundedRect(ctx, x + 12, barY, barWidth, barHeight, 4, {
        fill: "rgba(0,0,0,0.5)"
      });
      if (timeRatio > 0) {
        const fillWidth = barWidth * timeRatio;
        const barGrad = ctx.createLinearGradient(x + 12, 0, x + 12 + fillWidth, 0);
        if (isUrgent) {
          barGrad.addColorStop(0, "#FF6666");
          barGrad.addColorStop(1, "#FF4444");
        } else if (timeRatio < 0.6) {
          barGrad.addColorStop(0, "#FFAA44");
          barGrad.addColorStop(1, "#FF8800");
        } else {
          barGrad.addColorStop(0, "#66DD66");
          barGrad.addColorStop(1, "#44AA44");
        }
        this.drawRoundedRect(ctx, x + 12, barY, fillWidth, barHeight, 4, {
          fill: barGrad,
          innerGlow: isUrgent ? { color: "#FF4444", blur: 8 } : null
        });
      }
    });
  }
  drawSandwichArea(ctx, width, height) {
    const centerX = width / 2 - 60;
    const sandwichY = height / 2 - 120;
    const plateScale = 1.5;
    if (this.spritesLoaded && this.sprites.plate) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 10;
      const plateWidth = 300 * plateScale;
      const plateHeight = 90 * plateScale;
      ctx.drawImage(this.sprites.plate, centerX - plateWidth / 2, sandwichY + 200, plateWidth, plateHeight);
      ctx.restore();
    }
    if (this.currentSandwich.length === 0) {
      this.drawStyledText(ctx, "Press A/S/D/F to add ingredients!", centerX, sandwichY + 130, {
        fontSize: 16,
        color: "rgba(255,255,255,0.5)",
        align: "center",
        baseline: "middle"
      });
    } else {
      const baseY = sandwichY + 220;
      const ingredientWidth = 210 * plateScale;
      const ingredientHeight = 68 * plateScale;
      const layerSpacing = 42;
      this.currentSandwich.forEach((sandwichItem, index) => {
        const isNegative = sandwichItem.isNegative;
        const itemId = sandwichItem.id;
        const itemData = isNegative ? sandwichItem.item : INGREDIENTS[itemId];
        const layerY = baseY - index * layerSpacing;
        const sprite = this.sprites[itemId];
        ctx.save();
        if (isNegative) {
          ctx.shadowColor = "rgba(255,0,0,0.6)";
          ctx.shadowBlur = 15;
        } else {
          ctx.shadowColor = "rgba(0,0,0,0.4)";
          ctx.shadowBlur = 8;
        }
        ctx.shadowOffsetY = 4;
        if (this.spritesLoaded && sprite) {
          ctx.drawImage(sprite, centerX - ingredientWidth / 2, layerY - 30, ingredientWidth, ingredientHeight);
        } else {
          this.drawRoundedRect(ctx, centerX - ingredientWidth / 2 + 10, layerY - 25, ingredientWidth - 20, 55, 8, {
            gradient: [
              { pos: 0, color: itemData.color },
              { pos: 1, color: this.darkenColor(itemData.color, 30) }
            ],
            stroke: isNegative ? "rgba(255,0,0,0.5)" : "rgba(0,0,0,0.3)",
            strokeWidth: 2
          });
        }
        ctx.restore();
        this.drawStyledText(ctx, itemData.name, centerX + ingredientWidth / 2 + 20, layerY - 5, {
          fontSize: 18,
          fontWeight: "bold",
          color: isNegative ? "rgba(255,100,100,0.95)" : "rgba(255,255,255,0.9)",
          align: "left",
          baseline: "middle",
          shadow: { color: "rgba(0,0,0,0.8)", blur: 4, offsetY: 2 }
        });
      });
    }
  }
  // Helper to darken a color
  darkenColor(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, (num >> 8 & 255) - amt);
    const B = Math.max(0, (num & 255) - amt);
    return `rgb(${R},${G},${B})`;
  }
  drawIngredientGuide(ctx, width, height) {
    const guideX = width - 330;
    const guideY = 80;
    const lineHeight = 52;
    const panelWidth = 315;
    const panelHeight = Object.keys(INGREDIENTS).length * lineHeight + 55;
    this.drawRoundedRect(ctx, guideX - 10, guideY - 10, panelWidth, panelHeight, 16, {
      gradient: [
        { pos: 0, color: "rgba(30, 20, 10, 0.85)" },
        { pos: 1, color: "rgba(20, 10, 5, 0.9)" }
      ],
      stroke: "rgba(255, 215, 0, 0.2)",
      strokeWidth: 2,
      shadow: { color: "rgba(0,0,0,0.6)", blur: 20, offsetY: 8 }
    });
    this.drawStyledText(ctx, "INGREDIENTS", guideX + 5, guideY + 8, {
      fontSize: 18,
      fontWeight: "bold",
      color: "#FFD700",
      shadow: { color: "rgba(0,0,0,0.8)", blur: 4 },
      glow: { color: "#FFD700", blur: 6 }
    });
    const ingredients = Object.entries(INGREDIENTS);
    ingredients.forEach(([id, ingredient], index) => {
      const y = guideY + 45 + index * lineHeight;
      if (index % 2 === 0) {
        this.drawRoundedRect(ctx, guideX - 2, y - 5, panelWidth - 16, lineHeight - 4, 8, {
          fill: "rgba(255, 255, 255, 0.03)"
        });
      }
      const sprite = this.sprites[id];
      if (this.spritesLoaded && sprite) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.drawImage(sprite, guideX + 5, y, 45, 35);
        ctx.restore();
      }
      this.drawStyledText(ctx, ingredient.name, guideX + 60, y + 10, {
        fontSize: 15,
        fontWeight: "bold",
        color: "#FFFFFF",
        shadow: { color: "rgba(0,0,0,0.5)", blur: 2 }
      });
      const pattern = ingredient.pattern;
      const patternStartX = guideX + 170;
      pattern.forEach((beat, i) => {
        const keyColor = this.getKeyColor(beat);
        const badgeX = patternStartX + i * 38;
        this.drawRoundedRect(ctx, badgeX, y + 3, 32, 32, 6, {
          gradient: [
            { pos: 0, color: keyColor.main + "CC" },
            { pos: 1, color: keyColor.glow + "AA" }
          ],
          stroke: keyColor.main,
          strokeWidth: 2,
          shadow: { color: keyColor.glow, blur: 8, offsetY: 2 }
        });
        this.drawStyledText(ctx, beat, badgeX + 16, y + 19, {
          fontSize: 16,
          fontWeight: "bold",
          color: "#FFFFFF",
          align: "center",
          baseline: "middle",
          shadow: { color: "rgba(0,0,0,0.5)", blur: 2 }
        });
      });
    });
  }
  drawRhythmIndicator(ctx, width, height) {
    const indicatorY = height - 150;
    const centerX = width / 2;
    const panelWidth = 360;
    const panelHeight = 100;
    this.drawRoundedRect(ctx, centerX - panelWidth / 2, indicatorY, panelWidth, panelHeight, 16, {
      gradient: [
        { pos: 0, color: "rgba(20, 15, 10, 0.9)" },
        { pos: 1, color: "rgba(10, 5, 0, 0.95)" }
      ],
      stroke: "rgba(255, 215, 0, 0.3)",
      strokeWidth: 2,
      shadow: { color: "rgba(0,0,0,0.6)", blur: 20, offsetY: 8 }
    });
    this.drawStyledText(ctx, "RHYTHM INPUT", centerX, indicatorY + 12, {
      fontSize: 12,
      fontWeight: "bold",
      color: "rgba(255, 215, 0, 0.6)",
      align: "center",
      baseline: "top"
    });
    const patternState = this.rhythmInput.getPatternState();
    const slotWidth = 100;
    const slotStartX = centerX - slotWidth * 1.5;
    for (let i = 0; i < 3; i++) {
      const x = slotStartX + i * slotWidth;
      const y = indicatorY + 30;
      const slotW = slotWidth - 12;
      const slotH = 50;
      const isCurrentSlot = i === patternState.pattern.length && patternState.isActive;
      const isFilled = i < patternState.pattern.length;
      const hasPendingInput = isCurrentSlot && patternState.pendingInput !== null;
      if (isFilled) {
        const beat = patternState.pattern[i];
        const keyColor = this.getKeyColor(beat);
        this.drawRoundedRect(ctx, x, y, slotW, slotH, 10, {
          gradient: [
            { pos: 0, color: keyColor.main + "60" },
            { pos: 1, color: keyColor.glow + "40" }
          ],
          stroke: keyColor.main,
          strokeWidth: 3,
          shadow: { color: keyColor.glow, blur: 15 }
        });
        this.drawStyledText(ctx, beat, x + slotW / 2, y + slotH / 2, {
          fontSize: 28,
          fontWeight: "bold",
          color: keyColor.main,
          align: "center",
          baseline: "middle",
          glow: { color: keyColor.glow, blur: 12 },
          stroke: { color: "rgba(0,0,0,0.5)", width: 2 }
        });
      } else if (isCurrentSlot) {
        const pulseIntensity = 0.5 + Math.sin(this.glowPulse * 4) * 0.3;
        if (hasPendingInput) {
          const keyColor = this.getKeyColor(patternState.pendingInput);
          this.drawRoundedRect(ctx, x, y, slotW, slotH, 10, {
            gradient: [
              { pos: 0, color: keyColor.main + "80" },
              { pos: 1, color: keyColor.glow + "60" }
            ],
            stroke: keyColor.main,
            strokeWidth: 3,
            shadow: { color: keyColor.glow, blur: 20 }
          });
          this.drawStyledText(ctx, patternState.pendingInput, x + slotW / 2, y + 18, {
            fontSize: 26,
            fontWeight: "bold",
            color: keyColor.main,
            align: "center",
            baseline: "middle",
            glow: { color: keyColor.glow, blur: 12 },
            stroke: { color: "rgba(0,0,0,0.5)", width: 2 }
          });
        } else {
          this.drawRoundedRect(ctx, x, y, slotW, slotH, 10, {
            gradient: [
              { pos: 0, color: `rgba(80, 70, 40, ${pulseIntensity})` },
              { pos: 1, color: `rgba(50, 45, 25, ${pulseIntensity})` }
            ],
            stroke: "#FFD700",
            strokeWidth: 3,
            shadow: { color: "#FFD700", blur: 15 * pulseIntensity }
          });
          this.drawStyledText(ctx, "?", x + slotW / 2, y + 18, {
            fontSize: 20,
            fontWeight: "bold",
            color: "rgba(255, 215, 0, 0.7)",
            align: "center",
            baseline: "middle",
            glow: { color: "#FFD700", blur: 8 }
          });
        }
        const timeRemaining = 1 - patternState.beatProgress;
        const barWidth = slotW - 16;
        const barHeight = 6;
        const barY = y + slotH - 14;
        this.drawRoundedRect(ctx, x + 8, barY, barWidth, barHeight, 3, {
          fill: "rgba(0,0,0,0.5)"
        });
        if (timeRemaining > 0) {
          let barGrad;
          if (timeRemaining < 0.3) {
            barGrad = ctx.createLinearGradient(x + 8, 0, x + 8 + barWidth * timeRemaining, 0);
            barGrad.addColorStop(0, "#FF6666");
            barGrad.addColorStop(1, "#FF4444");
          } else if (timeRemaining < 0.6) {
            barGrad = ctx.createLinearGradient(x + 8, 0, x + 8 + barWidth * timeRemaining, 0);
            barGrad.addColorStop(0, "#FFCC44");
            barGrad.addColorStop(1, "#FF9900");
          } else {
            barGrad = ctx.createLinearGradient(x + 8, 0, x + 8 + barWidth * timeRemaining, 0);
            barGrad.addColorStop(0, "#66FF66");
            barGrad.addColorStop(1, "#44CC44");
          }
          this.drawRoundedRect(ctx, x + 8, barY, barWidth * timeRemaining, barHeight, 3, {
            fill: barGrad
          });
        }
      } else {
        this.drawRoundedRect(ctx, x, y, slotW, slotH, 10, {
          fill: "rgba(30, 25, 20, 0.6)",
          stroke: "rgba(80, 70, 60, 0.4)",
          strokeWidth: 2
        });
        this.drawStyledText(ctx, "-", x + slotW / 2, y + slotH / 2, {
          fontSize: 20,
          color: "rgba(100, 90, 80, 0.5)",
          align: "center",
          baseline: "middle"
        });
      }
    }
    const legendY = height - 35;
    const keys = ["A", "S", "D", "F"];
    const legendStartX = centerX - 100;
    keys.forEach((key, i) => {
      const keyColor = this.getKeyColor(key);
      const kx = legendStartX + i * 50;
      this.drawRoundedRect(ctx, kx, legendY - 10, 28, 22, 4, {
        fill: keyColor.main + "40",
        stroke: keyColor.main,
        strokeWidth: 1
      });
      this.drawStyledText(ctx, key, kx + 14, legendY + 1, {
        fontSize: 13,
        fontWeight: "bold",
        color: keyColor.main,
        align: "center",
        baseline: "middle"
      });
    });
    this.drawStyledText(ctx, "1s per beat", centerX + 90, legendY, {
      fontSize: 12,
      color: "rgba(150, 140, 130, 0.7)",
      align: "left",
      baseline: "middle"
    });
    this.beatVisuals.forEach((visual) => {
      const alpha = visual.time / 300;
      const keyColor = this.getKeyColor(visual.beat);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = keyColor.glow;
      ctx.shadowBlur = 15;
      this.drawStyledText(ctx, visual.beat, centerX + (visual.index - 1) * 100, indicatorY - visual.y - 15, {
        fontSize: 30,
        fontWeight: "bold",
        color: keyColor.main,
        align: "center",
        baseline: "middle",
        stroke: { color: "rgba(0,0,0,0.5)", width: 2 }
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
      const textWidth = this.feedbackMessage.length * 12;
      this.drawRoundedRect(ctx, width / 2 - textWidth / 2 - 20, height / 2 - 180, textWidth + 40, 50, 25, {
        fill: "rgba(0, 0, 0, 0.7)",
        stroke: "rgba(255, 215, 0, 0.5)",
        strokeWidth: 2
      });
      this.drawStyledText(ctx, this.feedbackMessage, width / 2, height / 2 - 155, {
        fontSize: 24 * scale,
        fontWeight: "bold",
        color: "#FFD700",
        align: "center",
        baseline: "middle",
        glow: { color: "#FFD700", blur: 15 },
        stroke: { color: "rgba(0,0,0,0.5)", width: 2 }
      });
      ctx.restore();
    }
  }
  drawGameOver(ctx, width, height) {
    const overlayGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.6);
    overlayGrad.addColorStop(0, "rgba(20, 10, 5, 0.85)");
    overlayGrad.addColorStop(1, "rgba(0, 0, 0, 0.95)");
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, width, height);
    const panelWidth = 450;
    const panelHeight = 380;
    this.drawRoundedRect(ctx, width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 24, {
      gradient: [
        { pos: 0, color: "rgba(50, 35, 20, 0.95)" },
        { pos: 1, color: "rgba(30, 20, 10, 0.98)" }
      ],
      stroke: "rgba(255, 215, 0, 0.4)",
      strokeWidth: 3,
      shadow: { color: "rgba(255, 215, 0, 0.2)", blur: 40 }
    });
    const pulse = 1 + Math.sin(this.glowPulse * 2) * 0.05;
    this.drawStyledText(ctx, "TIME UP!", width / 2, height / 2 - 140, {
      fontSize: 56 * pulse,
      fontWeight: "bold",
      color: "#FFD700",
      align: "center",
      baseline: "middle",
      glow: { color: "#FFD700", blur: 25 },
      stroke: { color: "#000", width: 4 }
    });
    this.drawStyledText(ctx, `${this.finalResults.score}`, width / 2, height / 2 - 60, {
      fontSize: 64,
      fontWeight: "bold",
      color: "#FFFFFF",
      align: "center",
      baseline: "middle",
      glow: { color: "#FFFFFF", blur: 15 },
      stroke: { color: "rgba(0,0,0,0.5)", width: 3 }
    });
    this.drawStyledText(ctx, "FINAL SCORE", width / 2, height / 2 - 15, {
      fontSize: 16,
      color: "rgba(255, 215, 0, 0.7)",
      align: "center",
      baseline: "middle"
    });
    const statsY = height / 2 + 40;
    const statBoxWidth = 120;
    const statSpacing = 140;
    this.drawRoundedRect(ctx, width / 2 - statSpacing - statBoxWidth / 2, statsY, statBoxWidth, 70, 12, {
      fill: "rgba(100, 200, 100, 0.2)",
      stroke: "rgba(100, 255, 100, 0.4)",
      strokeWidth: 2
    });
    this.drawStyledText(ctx, `${this.finalResults.ordersCompleted}`, width / 2 - statSpacing, statsY + 25, {
      fontSize: 32,
      fontWeight: "bold",
      color: "#88FF88",
      align: "center",
      baseline: "middle",
      glow: { color: "#88FF88", blur: 8 }
    });
    this.drawStyledText(ctx, "Completed", width / 2 - statSpacing, statsY + 55, {
      fontSize: 12,
      color: "rgba(150, 255, 150, 0.7)",
      align: "center",
      baseline: "middle"
    });
    this.drawRoundedRect(ctx, width / 2 - statBoxWidth / 2, statsY, statBoxWidth, 70, 12, {
      fill: "rgba(200, 100, 100, 0.2)",
      stroke: "rgba(255, 100, 100, 0.4)",
      strokeWidth: 2
    });
    this.drawStyledText(ctx, `${this.finalResults.ordersFailed}`, width / 2, statsY + 25, {
      fontSize: 32,
      fontWeight: "bold",
      color: "#FF8888",
      align: "center",
      baseline: "middle",
      glow: { color: "#FF8888", blur: 8 }
    });
    this.drawStyledText(ctx, "Failed", width / 2, statsY + 55, {
      fontSize: 12,
      color: "rgba(255, 150, 150, 0.7)",
      align: "center",
      baseline: "middle"
    });
    this.drawRoundedRect(ctx, width / 2 + statSpacing - statBoxWidth / 2, statsY, statBoxWidth, 70, 12, {
      fill: "rgba(100, 200, 255, 0.2)",
      stroke: "rgba(100, 200, 255, 0.4)",
      strokeWidth: 2
    });
    this.drawStyledText(ctx, `x${this.finalResults.maxCombo}`, width / 2 + statSpacing, statsY + 25, {
      fontSize: 32,
      fontWeight: "bold",
      color: "#88FFFF",
      align: "center",
      baseline: "middle",
      glow: { color: "#88FFFF", blur: 8 }
    });
    this.drawStyledText(ctx, "Max Combo", width / 2 + statSpacing, statsY + 55, {
      fontSize: 12,
      color: "rgba(150, 255, 255, 0.7)",
      align: "center",
      baseline: "middle"
    });
    const btnY = height / 2 + 140;
    const restartHover = 0.8 + Math.sin(this.glowPulse * 3) * 0.1;
    this.drawRoundedRect(ctx, width / 2 - 150, btnY, 130, 45, 10, {
      gradient: [
        { pos: 0, color: `rgba(80, 160, 80, ${restartHover})` },
        { pos: 1, color: `rgba(50, 120, 50, ${restartHover})` }
      ],
      stroke: "rgba(150, 255, 150, 0.5)",
      strokeWidth: 2,
      shadow: { color: "rgba(100, 255, 100, 0.3)", blur: 15 }
    });
    this.drawStyledText(ctx, "[R] Restart", width / 2 - 85, btnY + 22, {
      fontSize: 18,
      fontWeight: "bold",
      color: "#FFFFFF",
      align: "center",
      baseline: "middle"
    });
    this.drawRoundedRect(ctx, width / 2 + 20, btnY, 130, 45, 10, {
      gradient: [
        { pos: 0, color: "rgba(100, 100, 160, 0.8)" },
        { pos: 1, color: "rgba(60, 60, 120, 0.8)" }
      ],
      stroke: "rgba(150, 150, 255, 0.5)",
      strokeWidth: 2,
      shadow: { color: "rgba(100, 100, 255, 0.2)", blur: 10 }
    });
    this.drawStyledText(ctx, "[M] Menu", width / 2 + 85, btnY + 22, {
      fontSize: 18,
      fontWeight: "bold",
      color: "#FFFFFF",
      align: "center",
      baseline: "middle"
    });
  }
}
const canvas = document.getElementById("screen");
const game = new M2D(canvas, {
  initialScene: "mainMenu",
  width: 1280,
  height: 720,
  worldWidth: 1280,
  worldHeight: 720,
  basePath: "/m2d-engine/examples/doner/"
});
let donerGame = null;
game.sceneManager.addScene("mainMenu", {
  fetch: async () => (await __vitePreload(async () => {
    const { default: __vite_default__ } = await import("./mainMenu-BPtHCIdM.js");
    return { default: __vite_default__ };
  }, true ? [] : void 0)).default,
  onEnter() {
    donerGame = null;
  }
});
game.sceneManager.addScene("gameplay", {
  fetch: async () => (await __vitePreload(async () => {
    const { default: __vite_default__ } = await import("./gameplay-kstoMg4z.js");
    return { default: __vite_default__ };
  }, true ? [] : void 0)).default,
  onEnter() {
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
game.keys.addKey("r");
game.keys.addKey("m");
const menuButton = {
  x: 640 - 140,
  // width/2 - buttonWidth/2
  y: 340 - 32,
  // buttonY - buttonHeight/2
  width: 280,
  height: 65
};
function startGame() {
  donerGame = new DonerGame(game);
  donerGame.start();
}
function returnToMenu() {
  if (donerGame) {
    donerGame.stop();
    donerGame = null;
  }
}
document.addEventListener("click", (event) => {
  if (donerGame) return;
  const rect = game.canvas.getBoundingClientRect();
  const scaleX = game.canvas.width / rect.width;
  const scaleY = game.canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  console.log("Click at:", x, y, "Button:", menuButton);
  if (x >= menuButton.x && x <= menuButton.x + menuButton.width && y >= menuButton.y && y <= menuButton.y + menuButton.height) {
    console.log("Button clicked!");
    startGame();
  }
});
function drawRoundedRect(ctx, x, y, width, height, radius, options = {}) {
  ctx.save();
  if (options.shadow) {
    ctx.shadowColor = options.shadow.color || "rgba(0,0,0,0.5)";
    ctx.shadowBlur = options.shadow.blur || 10;
    ctx.shadowOffsetX = options.shadow.offsetX || 0;
    ctx.shadowOffsetY = options.shadow.offsetY || 4;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (options.gradient) {
    const grad = ctx.createLinearGradient(x, y, x, y + height);
    options.gradient.forEach((stop, i) => {
      grad.addColorStop(stop.pos !== void 0 ? stop.pos : i / (options.gradient.length - 1), stop.color);
    });
    ctx.fillStyle = grad;
  } else if (options.fill) {
    ctx.fillStyle = options.fill;
  }
  if (options.fill || options.gradient) ctx.fill();
  ctx.shadowColor = "transparent";
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
  const fontWeight = options.fontWeight || "normal";
  ctx.font = `${fontWeight} ${fontSize}px "Helvetica Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = options.align || "left";
  ctx.textBaseline = options.baseline || "top";
  if (options.glow) {
    ctx.shadowColor = options.glow.color || options.color || "#fff";
    ctx.shadowBlur = options.glow.blur || 10;
  }
  if (options.shadow) {
    ctx.shadowColor = options.shadow.color || "rgba(0,0,0,0.8)";
    ctx.shadowBlur = options.shadow.blur || 4;
    ctx.shadowOffsetX = options.shadow.offsetX || 2;
    ctx.shadowOffsetY = options.shadow.offsetY || 2;
  }
  if (options.stroke) {
    ctx.strokeStyle = options.stroke.color || "#000";
    ctx.lineWidth = options.stroke.width || 3;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = options.color || "#fff";
  ctx.fillText(text, x, y);
  ctx.restore();
}
let menuPulse = 0;
function drawMenu() {
  const width = game.options.width;
  const height = game.options.height;
  const ctx = game.uiRenderer.context;
  menuPulse += 0.03;
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, "#1a0f0a");
  bgGrad.addColorStop(0.5, "#2d1b0e");
  bgGrad.addColorStop(1, "#1a0f0a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);
  const vignetteGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.7);
  vignetteGrad.addColorStop(0, "rgba(0,0,0,0)");
  vignetteGrad.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignetteGrad;
  ctx.fillRect(0, 0, width, height);
  const titlePulse = 1 + Math.sin(menuPulse * 2) * 0.03;
  drawStyledText(ctx, "DONER RHYTHM", width / 2, 100, {
    fontSize: 72 * titlePulse,
    fontWeight: "bold",
    color: "#FFD700",
    align: "center",
    baseline: "middle",
    glow: { color: "#FFD700", blur: 30 },
    stroke: { color: "#000", width: 4 }
  });
  drawStyledText(ctx, "Build orders to the beat!", width / 2, 170, {
    fontSize: 26,
    color: "#F5DEB3",
    align: "center",
    baseline: "middle",
    shadow: { color: "rgba(0,0,0,0.8)", blur: 6 }
  });
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
    stroke: "rgba(150, 255, 150, 0.6)",
    strokeWidth: 3,
    shadow: { color: "rgba(100, 255, 100, 0.4)", blur: 25, offsetY: 5 }
  });
  drawStyledText(ctx, "START GAME", width / 2, 340, {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    align: "center",
    baseline: "middle",
    shadow: { color: "rgba(0,0,0,0.5)", blur: 4 }
  });
  const panelY = 420;
  const panelHeight = 200;
  drawRoundedRect(ctx, width / 2 - 350, panelY, 700, panelHeight, 20, {
    gradient: [
      { pos: 0, color: "rgba(30, 20, 10, 0.8)" },
      { pos: 1, color: "rgba(20, 10, 5, 0.85)" }
    ],
    stroke: "rgba(255, 215, 0, 0.2)",
    strokeWidth: 2,
    shadow: { color: "rgba(0,0,0,0.5)", blur: 20, offsetY: 8 }
  });
  drawStyledText(ctx, "HOW TO PLAY", width / 2, panelY + 25, {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFD700",
    align: "center",
    baseline: "middle",
    glow: { color: "#FFD700", blur: 8 }
  });
  const instructions = [
    "Press A, S, D, F in rhythm patterns to add ingredients",
    "Each ingredient has a unique 3-beat pattern (1s per beat)",
    "Match customer orders by building the right sandwich",
    "Press SPACE to serve, BACKSPACE to clear"
  ];
  instructions.forEach((text, i) => {
    drawStyledText(ctx, text, width / 2, panelY + 65 + i * 32, {
      fontSize: 17,
      color: "rgba(200, 190, 180, 0.9)",
      align: "center",
      baseline: "middle"
    });
  });
  drawStyledText(ctx, "Built with M2D Engine", width / 2, height - 30, {
    fontSize: 14,
    color: "rgba(100, 90, 80, 0.6)",
    align: "center",
    baseline: "middle"
  });
}
function donerUpdate(currentTime) {
  if (!game.lastTime) {
    game.lastTime = currentTime;
    requestAnimationFrame(donerUpdate);
    return;
  }
  const deltaTime = Math.min((currentTime - game.lastTime) / 1e3, 0.1);
  game.lastTime = currentTime;
  if (game.sceneManager.loading) {
    game.drawLoading();
    requestAnimationFrame(donerUpdate);
    return;
  }
  const currentScene = game.sceneManager.getCurrentScene();
  if (donerGame && !donerGame.isGameActive && donerGame.finalResults) {
    game.uiRenderer.clear("#2d1b0e");
    game.uiRenderer.beginFrame();
    donerGame.draw();
    game.uiRenderer.endFrame();
    if (game.keys.isJustPressed("r")) {
      donerGame.start();
    } else if (game.keys.isJustPressed("m")) {
      returnToMenu();
    }
    game.keys.update();
    requestAnimationFrame(donerUpdate);
    return;
  }
  if (currentScene) {
    if (donerGame && (donerGame.isGameActive || donerGame.isCountingDown)) {
      donerGame.update(deltaTime);
      game.uiRenderer.clear("#2d1b0e");
      game.uiRenderer.beginFrame();
      donerGame.draw();
      game.uiRenderer.endFrame();
    } else if (!donerGame) {
      game.uiRenderer.clear("#2d1b0e");
      game.uiRenderer.beginFrame();
      drawMenu();
      game.uiRenderer.endFrame();
    }
  }
  game.keys.update();
  requestAnimationFrame(donerUpdate);
}
game.update = donerUpdate;
game.start();
