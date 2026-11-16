import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CARS, carById, chosenCar } from '../src/circuit/cars.js';
import { carOfLine } from '../src/circuit/menuParts.js';

/**
 * Night Circuit's garage: each line records the project's `car` choice and
 * returns to the grid, and the race reads the car off the player's state.
 */

const GARAGE = JSON.parse(readFileSync(new URL('../src/circuit/scenes/garage.json', import.meta.url), 'utf8'));
const PROJECT = JSON.parse(readFileSync(new URL('../src/circuit/m2d.project.json', import.meta.url), 'utf8'));

describe('the garage', () => {
  it('offers every car once, as the project declares them, and each line goes back to the grid', () => {
    const lines = GARAGE.elements.filter((element) => element.properties?.set?.choice === 'car');
    expect(lines.map((line) => line.properties.set.value)).toEqual(CARS.map((car) => car.id));
    expect(PROJECT.choices.car.values).toEqual(CARS.map((car) => car.id));
    expect(carById(PROJECT.choices.car.initial).name).toBe('Tourer');
    for (const line of lines) expect(line.properties.onClick).toBe('mainMenu');
  });

  it('reads a car from a line\'s set, and nothing else', () => {
    for (const car of CARS) expect(carOfLine({ properties: { set: { choice: 'car', value: car.id } } })).toBe(car);
    expect(carOfLine({ properties: { set: { choice: 'difficulty', value: 'sprint' } } })).toBeNull();
    expect(carOfLine({ properties: { onClick: 'mainMenu' } })).toBeNull();
    expect(carOfLine(undefined)).toBeNull();
  });

  it('races the car the player\'s state names, the Tourer until they choose', () => {
    const game = (car) => ({ players: { local: { state: car === undefined ? {} : { car } } } });
    expect(chosenCar(game(undefined)).name).toBe('Tourer');
    expect(chosenCar(game('drift')).name).toBe('Slider');
    expect(chosenCar(game('tank')).name).toBe('Tourer');
  });
});
