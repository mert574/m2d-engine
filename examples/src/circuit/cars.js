/**
 * The three cars, and the screen that picks one.
 *
 * Same engine model, three tunings — the kart-racer trade: top speed
 * against handling. Every number is a `CarControl` option, so the choice is
 * configuration, not code, and the replay stores which car drove.
 */
import { UIScreen } from 'm2d-engine/core/ui/screen.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIMenuItem } from 'm2d-engine/core/ui/menuItem.js';
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { Stack, Spacer } from 'm2d-engine/core/ui/layout/stack.js';

export const CARS = [
  {
    id: 'sprint',
    name: 'Sprint',
    blurb: 'top speed · slow to turn · drifts wide',
    sprite: 'carRed',
    stats: { speed: 0.95, handling: 0.45, drift: 0.55 },
    control: {
      maxSpeed: 640, acceleration: 430, grip: 15, steer: 2.1,
      driftGrip: 2.8, driftSteer: 3.2, nitroBoost: 1.3,
      driftBoostSpeed: [1.08, 1.18]
    }
  },
  {
    id: 'balanced',
    name: 'Tourer',
    blurb: 'even everywhere · the one to learn on',
    sprite: 'carBlue',
    stats: { speed: 0.7, handling: 0.7, drift: 0.7 },
    control: {}
  },
  {
    id: 'drift',
    name: 'Slider',
    blurb: 'quick steering · long drifts · big mini-turbos',
    sprite: 'carGreen',
    stats: { speed: 0.5, handling: 0.9, drift: 0.95 },
    control: {
      maxSpeed: 520, acceleration: 480, grip: 20, steer: 2.8,
      driftGrip: 1.9, driftSteer: 4.2, nitroBoost: 1.4,
      driftBoost: [0.5, 1.1], driftBoostSpeed: [1.18, 1.35]
    }
  }
];

const STORE_KEY = 'm2d-circuit:car';

/** The chosen car, remembered between sessions. */
export function selectedCar() {
  try {
    const id = localStorage.getItem(STORE_KEY);
    return CARS.find((car) => car.id === id) ?? CARS[1];
  } catch {
    return CARS[1];
  }
}

export function selectCar(car) {
  try { localStorage.setItem(STORE_KEY, car.id); } catch { /* storage blocked */ }
}

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
   * @param {Record<string, HTMLImageElement>} options.images
   * @param {(car: object) => void} options.onPick
   */
  constructor({ images, onPick }) {
    // Near-opaque: the main menu's type sits right where this list goes.
    super({ name: 'carSelect', blocking: true, scrim: true, scrimColor: 'rgba(6, 8, 18, 0.94)', transition: 'fade' });
    this.images = images;
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
      anchor: 'center', x: 220, y: -20, image: images[CARS[1].sprite]
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
      this.portrait.image = this.images[car.sprite];
    }
  }
}
