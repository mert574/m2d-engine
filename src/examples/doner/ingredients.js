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
  },
  specialSalad: {
    name: 'Special Salad',
    pattern: ['A', 'S', 'F'],
    color: '#32CD32',
    emoji: '🥗',
    sprite: 'SpecialSalad.webp'
  },
  breadClosed: {
    name: 'Bread Top',
    pattern: ['A', 'A', 'A'],
    color: '#D2691E',
    emoji: '🥖',
    sprite: 'BreadClosed.webp'
  }
};

// Negative/junk items - added when player enters wrong pattern
export const NEGATIVE_ITEMS = {
  pills: {
    name: 'Pills',
    color: '#FF4444',
    emoji: '💊',
    sprite: 'Pills.webp',
    penalty: -30
  },
  book: {
    name: 'Book',
    color: '#8B4513',
    emoji: '📖',
    sprite: 'Book.webp',
    penalty: -25
  },
  fish: {
    name: 'Fish',
    color: '#4169E1',
    emoji: '🐟',
    sprite: 'Fish.webp',
    penalty: -20
  },
  key: {
    name: 'Key',
    color: '#FFD700',
    emoji: '🔑',
    sprite: 'Key.webp',
    penalty: -25
  },
  nails: {
    name: 'Nails',
    color: '#808080',
    emoji: '🔩',
    sprite: 'Nails.webp',
    penalty: -35
  },
  oil: {
    name: 'Oil',
    color: '#2F4F4F',
    emoji: '🛢️',
    sprite: 'Oil.webp',
    penalty: -30
  }
};

// Get a random negative item
export function getRandomNegativeItem() {
  const items = Object.entries(NEGATIVE_ITEMS);
  const [id, item] = items[Math.floor(Math.random() * items.length)];
  return { id, ...item };
}

// Recipe definitions - each recipe is a list of required ingredients in order
export const RECIPES = {
  classicDoner: {
    name: 'Classic Doner',
    ingredients: ['bread', 'meat', 'salad', 'sauce', 'breadClosed'],
    points: 100,
    timeBonus: 50
  },
  meatDoner: {
    name: 'Meat Lover',
    ingredients: ['bread', 'meat', 'meat', 'sauce', 'breadClosed'],
    points: 120,
    timeBonus: 60
  },
  germanDoner: {
    name: 'German Style',
    ingredients: ['bread', 'meat', 'sauerkraut', 'sauce', 'breadClosed'],
    points: 125,
    timeBonus: 60
  },
  veggieDoner: {
    name: 'Veggie Doner',
    ingredients: ['bread', 'salad', 'onion', 'sauce', 'breadClosed'],
    points: 100,
    timeBonus: 50
  },
  specialDoner: {
    name: 'Special Doner',
    ingredients: ['bread', 'meat', 'specialSalad', 'sauce', 'breadClosed'],
    points: 150,
    timeBonus: 75
  },
  loadedDoner: {
    name: 'Loaded Doner',
    ingredients: ['bread', 'meat', 'salad', 'onion', 'sauerkraut', 'sauce', 'breadClosed'],
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
