// OrderManager - Generates and manages customer orders

import { RECIPES } from './ingredients.js';

export class OrderManager {
  constructor(options = {}) {
    this.maxOrders = options.maxOrders || 3;
    this.orderTimeout = options.orderTimeout || 60000; // 60 seconds per order
    this.difficultyLevel = options.difficultyLevel || 1;
    this.onOrderExpired = options.onOrderExpired || (() => {});
    this.onOrderComplete = options.onOrderComplete || (() => {});

    this.orders = [];
    this.completedOrders = 0;
    this.failedOrders = 0;
    this.nextOrderId = 1;

    // Order spawn timing
    this.orderSpawnInterval = options.orderSpawnInterval || 10000; // 10 seconds between new orders
    this.timeSinceLastOrder = 0;
    this.hasInitialOrder = false;

    // Available recipe keys based on difficulty
    this.availableRecipes = this.getRecipesForDifficulty(this.difficultyLevel);
  }

  getRecipesForDifficulty(level) {
    const recipeKeys = Object.keys(RECIPES);

    if (level <= 1) {
      // Easy: only simple recipes (fewer ingredients)
      return recipeKeys.filter(key => RECIPES[key].ingredients.length <= 5);
    } else if (level <= 2) {
      // Medium: all except the hardest
      return recipeKeys.filter(key => RECIPES[key].ingredients.length <= 6);
    }
    // Hard: all recipes
    return recipeKeys;
  }

  setDifficulty(level) {
    this.difficultyLevel = level;
    this.availableRecipes = this.getRecipesForDifficulty(level);

    // Adjust timeout based on difficulty
    this.orderTimeout = Math.max(30000, 60000 - (level - 1) * 10000);
  }

  update(deltaTime) {
    const now = Date.now();

    // Check for expired orders
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const order = this.orders[i];
      order.timeRemaining = Math.max(0, order.expiresAt - now);

      if (order.timeRemaining <= 0) {
        this.orders.splice(i, 1);
        this.failedOrders++;
        this.onOrderExpired(order);
      }
    }

    // Generate initial order immediately
    if (!this.hasInitialOrder) {
      this.generateOrder();
      this.hasInitialOrder = true;
      this.timeSinceLastOrder = 0;
      return;
    }

    // Generate new orders on interval if below max
    this.timeSinceLastOrder += deltaTime * 1000; // deltaTime is in seconds
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
        // Order completed!
        const completedOrder = this.orders.splice(i, 1)[0];
        this.completedOrders++;

        // Calculate score with time bonus
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
