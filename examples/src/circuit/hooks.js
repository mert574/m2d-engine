import { selectCar, selectedCar } from './cars.js';
import { carOfAction } from './menuParts.js';

/**
 * The garage's lines run `car:<id>`. Which car a player drives is theirs,
 * kept between sessions, so it has no data form.
 */
export function sceneHooks(game) {
  return {
    garage: {
      onShow() {
        const scene = game.sceneManager.getCurrentScene();
        const line = scene.config.elements.find((element) => carOfAction(element.properties?.action) === selectedCar());
        if (line) scene.focus.focus(scene.uiById.get(line.id));
      },
      onAction(action) {
        const car = carOfAction(action);
        if (!car) return;
        selectCar(car);
        game.sceneManager.switchTo('mainMenu');
      }
    }
  };
}
