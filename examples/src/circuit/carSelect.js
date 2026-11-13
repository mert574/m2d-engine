import { UIScreen } from 'm2d-engine/core/ui/screen.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIMenuItem } from 'm2d-engine/core/ui/menuItem.js';
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { Stack, Spacer } from 'm2d-engine/core/ui/layout/stack.js';
import { CARS, selectedCar, selectCar } from './cars.js';
import carRed from './textures/car_red_1.png';
import carBlue from './textures/car_blue_1.png';
import carGreen from './textures/car_green_1.png';

/**
 * Choosing a car: the screen over the main menu, and the portraits it
 * draws. The cars themselves are data (cars.js), which the race director
 * reads in the tick and must be able to load with no screen at all.
 */

/**
 * The portraits, loaded by the page rather than by a scene: the chooser
 * runs over the main menu, where no circuit is loaded. A circuit's own
 * cars are its scene's `assets.images`.
 */
const PORTRAITS = Object.fromEntries(Object.entries({ carRed, carBlue, carGreen }).map(([name, url]) => {
  const image = new Image();
  image.src = url;
  return [name, image];
}));

/** Three bars: speed, handling, drift. */
class StatBars extends UIElement {
  constructor(options) {
    super({ pivot: 'top-left', height: 54, ...options });
    this.car = options.car;
  }

  draw() {
    const f = this.frame;
    const rows = [['speed', this.car.stats.speed], ['handling', this.car.stats.handling], ['drift', this.car.stats.drift]];
    rows.forEach(([label, value], i) => {
      const y = f.y + i * 18;
      this.paint.drawText({
        text: label.toUpperCase(), x: f.x, y: y + 6,
        fillStyle: '$color.text.muted', fontSize: '10px', letterSpacing: 2,
        textAlign: 'left', textBaseline: 'middle'
      });
      this.paint.drawRect({ x: f.x + 80, y: y + 2, width: 160, height: 8, fillStyle: 'rgba(255,255,255,0.08)', cornerRadius: 2 });
      this.paint.drawRect({ x: f.x + 80, y: y + 2, width: 160 * value, height: 8, fillStyle: '$color.accent.default', cornerRadius: 2 });
    });
  }
}

/** The car shown large, from its sprite, with a slow turntable spin. */
class CarPortrait extends UIElement {
  constructor(options) {
    super({ pivot: 'center', width: 160, height: 160, ...options });
    this.image = options.image;
    this.spin = 0;
  }

  update(deltaTime) {
    this.spin += deltaTime * 0.6;
  }

  draw() {
    const f = this.frame;
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    this.paint.drawArc({ x: cx, y: cy, radius: 78, fillStyle: 'rgba(255,255,255,0.05)' });
    this.paint.drawSprite({
      image: this.image, x: cx, y: cy,
      tileWidth: this.image.width, tileHeight: this.image.height,
      width: 60, height: 110,
      rotation: Math.sin(this.spin) * 0.35,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 6, offsetY: 8 }
    });
  }
}

/**
 * A screen over the main menu: one line per car, the selected car's
 * portrait and stats beside the list. Enter picks, Escape keeps the current.
 */
export class CarSelectScreen extends UIScreen {
  /**
   * @param {object} options
   * @param {(car: object) => void} options.onPick
   */
  constructor({ onPick }) {
    // Near-opaque: the main menu's type sits right where this list goes.
    super({ name: 'carSelect', blocking: true, scrim: true, scrimColor: 'rgba(6, 8, 18, 0.94)', transition: 'fade' });
    this.onPick = onPick;

    const column = this.add(new Stack({
      anchor: 'left', pivot: 'left', x: 96, direction: 'column', width: 360, gap: 0, align: 'stretch'
    }));
    column.add(new UIText({
      text: 'Choose a car', fontSize: '$font.size.title', fontWeight: '$font.weight.thin',
      letterSpacing: '$font.tracking.tight', color: '$color.text.primary'
    }));
    column.add(new UIText({
      text: 'SPEED AGAINST HANDLING', fontSize: '$font.size.caption',
      fontWeight: '$font.weight.medium', letterSpacing: '$font.tracking.widest', color: '$color.text.accent'
    }));
    column.add(new Spacer({ size: '$space.lg' }));

    this.items = CARS.map((car) => column.add(new UIMenuItem({
      text: car.name,
      onSelect: () => { selectCar(car); this.onPick(car); this.close(); }
    })));
    column.add(new Spacer({ size: '$space.md' }));
    this.blurb = column.add(new UIText({ text: '', fontSize: '13px', color: '$color.text.muted' }));
    column.add(new Spacer({ size: '$space.md' }));
    this.bars = column.add(new StatBars({ car: CARS[1] }));

    this.portrait = this.add(new CarPortrait({
      anchor: 'center', x: 220, y: -20, image: PORTRAITS[CARS[1].sprite]
    }));
    this.add(new UIText({
      text: 'Enter picks · Esc keeps the current car', anchor: 'bottom-left', x: 96, y: -40,
      fontSize: '$font.size.caption', letterSpacing: '$font.tracking.wide', color: '$color.text.muted'
    }));
  }

  onEnter() {
    const current = selectedCar();
    const index = Math.max(0, CARS.findIndex((car) => car.id === current.id));
    this.focus.focus(this.items[index]);
  }

  update(deltaTime) {
    super.update(deltaTime);
    // Whatever line is focused is the car on show.
    const focused = this.focus.focused;
    const index = this.items.indexOf(focused);
    if (index >= 0) {
      const car = CARS[index];
      this.blurb.text = car.blurb;
      this.bars.car = car;
      this.portrait.image = PORTRAITS[car.sprite];
    }
  }
}
