import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CARS, selectedCar } from '../src/circuit/cars.js';
import { carOfAction } from '../src/circuit/menuParts.js';
import { sceneHooks } from '../src/circuit/hooks.js';

/** Night Circuit's garage: a line runs `car:<id>`, which picks the car and returns to the grid. */

beforeEach(() => {
  const stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value))
  });
});

describe('the garage', () => {
  it('reads a car from its line\'s action, and nothing else', () => {
    for (const car of CARS) expect(carOfAction(`car:${car.id}`)).toBe(car);
    expect(carOfAction('settings')).toBeNull();
    expect(carOfAction(undefined)).toBeNull();
  });

  it('keeps the car a line picks and goes back to the grid', () => {
    const switchTo = vi.fn();
    const { garage } = sceneHooks({ sceneManager: { switchTo } });
    const pick = CARS.find((car) => car !== selectedCar());
    garage.onAction(`car:${pick.id}`);
    expect(selectedCar()).toBe(pick);
    expect(switchTo).toHaveBeenCalledWith('mainMenu');
  });

  it('ignores an action that is not a car', () => {
    const switchTo = vi.fn();
    sceneHooks({ sceneManager: { switchTo } }).garage.onAction('settings');
    expect(switchTo).not.toHaveBeenCalled();
  });

  it('opens on the car already in it', () => {
    const lines = CARS.map((car) => ({ id: `car-${car.id}`, properties: { action: `car:${car.id}` } }));
    const built = new Map(lines.map((line) => [line.id, { id: line.id }]));
    const focus = vi.fn();
    const scene = { config: { elements: [{ id: 'title' }, ...lines] }, uiById: built, focus: { focus } };
    sceneHooks({ sceneManager: { getCurrentScene: () => scene } }).garage.onShow();
    expect(focus).toHaveBeenCalledWith(built.get(`car-${selectedCar().id}`));
  });
});
