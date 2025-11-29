// Ingredient definitions with rhythm patterns
// Each pattern is 3 beats, each beat can be 'A', 'S', 'D', 'F', or '_' (empty/rest)
// Beat timing: 1 second per beat

export const INGREDIENTS = {
  bread: {
    name: 'Bread',
    pattern: ['A', 'A', '_'],
    color: '#D4A574',
    emoji: '🍞',
    sprite: 'BreadOpen.png'
  },
  meat: {
    name: 'Meat',
    pattern: ['A', 'S', 'D'],
    color: '#8B4513',
    emoji: '🥩',
    sprite: 'MeatVeal.png'
  },
  salad: {
    name: 'Salad',
    pattern: ['S', 'S', '_'],
    color: '#90EE90',
    emoji: '🥬',
    sprite: 'Salad.png'
  },
  onion: {
    name: 'Onion',
    pattern: ['D', 'D', '_'],
    color: '#DDA0DD',
    emoji: '🧅',
    sprite: 'Onion.png'
  },
  sauce: {
    name: 'Sauce',
    pattern: ['F', 'F', 'F'],
    color: '#FFFFFF',
    emoji: '🥛',
    sprite: 'SauceA.png'
  },
  sauerkraut: {
    name: 'Sauerkraut',
    pattern: ['S', 'D', 'F'],
    color: '#F0E68C',
    emoji: '🥗',
    sprite: 'SauerKraut.png'
  }
};

// Recipe definitions - each recipe is a list of required ingredients in order
export const RECIPES = {
  classicDoner: {
    name: 'Classic Doner',
    ingredients: ['bread', 'meat', 'salad', 'sauce'],
    points: 100,
    timeBonus: 50
  },
  meatDoner: {
    name: 'Meat Lover',
    ingredients: ['bread', 'meat', 'meat', 'sauce'],
    points: 120,
    timeBonus: 60
  },
  germanDoner: {
    name: 'German Style',
    ingredients: ['bread', 'meat', 'sauerkraut', 'sauce'],
    points: 125,
    timeBonus: 60
  },
  veggieDoner: {
    name: 'Veggie Doner',
    ingredients: ['bread', 'salad', 'onion', 'sauce'],
    points: 100,
    timeBonus: 50
  },
  loadedDoner: {
    name: 'Loaded Doner',
    ingredients: ['bread', 'meat', 'salad', 'onion', 'sauerkraut', 'sauce'],
    points: 200,
    timeBonus: 100
  }
};

// Helper to get pattern string for display
export function patternToString(pattern) {
  return pattern.join(' ');
}

// Helper to check if two patterns match
export function patternsMatch(pattern1, pattern2) {
  if (pattern1.length !== pattern2.length) return false;
  for (let i = 0; i < pattern1.length; i++) {
    if (pattern1[i] !== pattern2[i]) return false;
  }
  return true;
}

// Find ingredient by pattern
export function findIngredientByPattern(pattern) {
  for (const [id, ingredient] of Object.entries(INGREDIENTS)) {
    if (patternsMatch(ingredient.pattern, pattern)) {
      return { id, ...ingredient };
    }
  }
  return null;
}
