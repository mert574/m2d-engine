import { CARS, selectCar } from './cars.js';

/**
 * Night Circuit's one hook: picking a car in the garage. The garage is a
 * scene file (`scenes/garage.json`) whose lines run `car:<id>`; which car
 * a player drives is theirs, kept between sessions, so it has no data
 * form — the line picks it and the player is back on the grid.
 */
export function sceneHooks(game) {
  return {
    garage: {
      onAction(action) {
        const car = CARS.find((each) => action === `car:${each.id}`);
        if (!car) return;
        selectCar(car);
        game.sceneManager.switchTo('mainMenu');
      }
    }
  };
}
