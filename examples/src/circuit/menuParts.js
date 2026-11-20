import { UIElement } from 'm2d-engine/ui';
import { CARS, CAR_CHOICE, carById, chosenCar } from './cars.js';
import { loadBest } from './replay.js';

/**
 * What Night Circuit's menus show that is this player's, not the scene
 * file's: a circuit's best lap, the car in the garage, the car on show
 * while choosing. Each is a UI component the menus place by name. A menu
 * is built afresh each time it opens, so each reads its value once.
 */

/** A lap time as minutes and hundredths. */
export function lapTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
}

/** The car a garage line records, from its `set` of the project's `car` choice. */
export function carOfLine(element) {
  const set = element?.properties?.set;
  return set?.choice === CAR_CHOICE ? carById(set.value) : null;
}

class Caption extends UIElement {
  constructor(text, options) {
    super({ pivot: 'left', width: 220, height: 16, ...options });
    this.text = text;
    this.color = options.properties?.color ?? '$color.text.muted';
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

/** `properties.circuit` names the circuit's scene. */
function bestLap(scene, options) {
  const best = loadBest(options.properties?.circuit);
  const text = best ? `BEST  ${lapTime(best.lapTicks * scene.game.time.fixedTimestep)}` : 'NO TIME YET';
  return new Caption(text, options);
}

function carInGarage(scene, options) {
  return new Caption(chosenCar(scene.game).name.toUpperCase(), options);
}

/** The car whose garage line has focus, turning slowly, with its blurb and stats. */
export class CarOnShow extends UIElement {
  constructor(scene, options) {
    super({ pivot: 'center', width: 320, height: 300, ...options });
    this.scene = scene;
    this.fallback = chosenCar(scene.game);
    this.accent = options.properties?.accent ?? '$color.accent.default';
    this.spin = 0;
    for (const car of CARS) {
      if (!scene.sprites.has(car.sprite)) throw new Error(`Night Circuit: the garage has no image '${car.sprite}' for ${car.name}`);
    }
  }

  get car() {
    const focused = this.scene.focus?.focused;
    const line = this.scene.config.elements.find((element) => this.scene.uiById.get(element.id) === focused);
    return carOfLine(line) ?? this.fallback;
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.spin += deltaTime * 0.6;
  }

  draw() {
    const f = this.frame;
    const car = this.car;
    const cx = f.x + f.width / 2;
    const cy = f.y + 90;
    const image = this.scene.sprites.get(car.sprite);
    this.paint.drawRect({ x: f.x, y: f.y, width: f.width, height: f.height, fillStyle: 'rgba(8, 10, 22, 0.82)', cornerRadius: 6 });
    this.paint.drawArc({ x: cx, y: cy, radius: 78, fillStyle: 'rgba(255,255,255,0.05)' });
    this.paint.drawSprite({
      image, x: cx, y: cy, tileWidth: image.width, tileHeight: image.height, width: 60, height: 110,
      rotation: Math.sin(this.spin) * 0.35,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 6, offsetY: 8 }
    });
    this.paint.drawText({
      text: car.blurb, x: f.x + 40, y: f.y + 204, fillStyle: '$color.text.muted', fontSize: '13px',
      textAlign: 'left', textBaseline: 'middle'
    });
    this.#drawStats(f.x + 40, f.y + 230, car.stats);
  }

  #drawStats(x, y, stats) {
    Object.entries(stats).forEach(([label, value], i) => {
      const row = y + i * 18;
      this.paint.drawText({
        text: label.toUpperCase(), x, y: row + 6,
        fillStyle: '$color.text.muted', fontSize: '10px', letterSpacing: 2, textAlign: 'left', textBaseline: 'middle'
      });
      this.paint.drawRect({ x: x + 80, y: row + 2, width: 160, height: 8, fillStyle: 'rgba(255,255,255,0.08)', cornerRadius: 2 });
      this.paint.drawRect({ x: x + 80, y: row + 2, width: 160 * value, height: 8, fillStyle: this.accent, cornerRadius: 2 });
    });
  }
}

export function registerMenuParts(game) {
  game.registerUIComponent('bestLap', bestLap);
  game.registerUIComponent('carInGarage', carInGarage);
  game.registerUIComponent('carOnShow', (scene, options) => new CarOnShow(scene, options));
}
