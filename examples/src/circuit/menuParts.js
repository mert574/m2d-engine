import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { CARS, selectedCar } from './cars.js';
import { loadBest } from './replay.js';

/**
 * The few things on Night Circuit's menus that the scene files cannot
 * say, because they are this player's: a circuit's best lap, the car in
 * the garage, and the car on show while choosing. Each is a UI component
 * the menus place by name (`scenes/mainMenu.json`, `scenes/garage.json`);
 * where it sits, and everything around it, is the scene's.
 */

/** A lap time as minutes and hundredths. */
export function lapTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
}

/** A small tracked caption, drawn from the element's frame. */
class Caption extends UIElement {
  constructor(options) {
    super({ pivot: 'left', width: 220, height: 16, ...options });
    this.color = options.properties?.color ?? '$color.text.muted';
  }

  get text() {
    return '';
  }

  draw() {
    const f = this.frame;
    this.paint.drawText({
      text: this.text, x: f.x, y: f.y + f.height / 2,
      fillStyle: this.color, fontSize: '$font.size.caption', letterSpacing: 2,
      textAlign: 'left', textBaseline: 'middle'
    });
  }
}

/** A circuit's best lap, under its grid slot: `properties.circuit` names the scene. */
export class BestLap extends Caption {
  constructor(scene, options) {
    super(options);
    this.circuit = options.properties?.circuit;
    this.fixedTimestep = scene.game.time.fixedTimestep;
  }

  get text() {
    const best = loadBest(this.circuit);
    return best ? `BEST  ${lapTime(best.lapTicks * this.fixedTimestep)}` : 'NO TIME YET';
  }
}

/** The car in the garage, beside the line that opens it. */
export class CarInGarage extends Caption {
  get text() {
    return selectedCar().name.toUpperCase();
  }
}

/** Three bars: speed, handling, drift. */
function drawStats(paint, x, y, car) {
  [['speed', car.stats.speed], ['handling', car.stats.handling], ['drift', car.stats.drift]].forEach(([label, value], i) => {
    const row = y + i * 18;
    paint.drawText({
      text: label.toUpperCase(), x, y: row + 6,
      fillStyle: '$color.text.muted', fontSize: '10px', letterSpacing: 2, textAlign: 'left', textBaseline: 'middle'
    });
    paint.drawRect({ x: x + 80, y: row + 2, width: 160, height: 8, fillStyle: 'rgba(255,255,255,0.08)', cornerRadius: 2 });
    paint.drawRect({ x: x + 80, y: row + 2, width: 160 * value, height: 8, fillStyle: '$color.accent.default', cornerRadius: 2 });
  });
}

/**
 * The car on show in the garage: whichever line has focus, on a slow
 * turntable, with its blurb and its stats. The lines are the scene's
 * `car-<id>` menu items; `properties.portraits` maps a car's sprite name
 * to an image of the scene's.
 */
export class CarOnShow extends UIElement {
  constructor(scene, options) {
    super({ pivot: 'center', width: 320, height: 300, ...options });
    this.scene = scene;
    this.portraits = options.properties?.portraits ?? {};
    this.spin = 0;
    this.started = false;
  }

  /** The car whose line has focus; the garage's car until one does. */
  get car() {
    const focused = this.scene.focus?.focused;
    for (const car of CARS) {
      if (this.scene.uiById?.get(`car-${car.id}`) === focused) return car;
    }
    return selectedCar();
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.spin += deltaTime * 0.6;
    // The garage opens on the car already in it, not on the first line.
    if (!this.started && this.scene.focus) {
      this.started = true;
      const line = this.scene.uiById?.get(`car-${selectedCar().id}`);
      if (line) this.scene.focus.focus(line);
    }
  }

  draw() {
    const f = this.frame;
    const car = this.car;
    const cx = f.x + f.width / 2;
    const cy = f.y + 90;
    this.paint.drawArc({ x: cx, y: cy, radius: 78, fillStyle: 'rgba(255,255,255,0.05)' });
    const image = this.scene.sprites.get(this.portraits[car.sprite]);
    if (image) {
      this.paint.drawSprite({
        image, x: cx, y: cy, tileWidth: image.width, tileHeight: image.height, width: 60, height: 110,
        rotation: Math.sin(this.spin) * 0.35,
        shadow: { color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 6, offsetY: 8 }
      });
    }
    this.paint.drawText({
      text: car.blurb, x: f.x + 40, y: f.y + 200, fillStyle: '$color.text.muted', fontSize: '13px',
      textAlign: 'left', textBaseline: 'middle'
    });
    drawStats(this.paint, f.x + 40, f.y + 226, car);
  }
}

/** Register the menus' widgets on a game. */
export function registerMenuParts(game) {
  game.registerUIComponent('bestLap', (scene, element) => new BestLap(scene, element));
  game.registerUIComponent('carInGarage', (scene, element) => new CarInGarage(element));
  game.registerUIComponent('carOnShow', (scene, element) => new CarOnShow(scene, element));
}
