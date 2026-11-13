/**
 * The three cars, as data.
 *
 * Same engine model, three tunings — the kart-racer trade: top speed
 * against handling. Every number is a `CarControl` option, so the choice is
 * configuration, not code, and the replay stores which car drove.
 *
 * Nothing here touches a screen: the race director reads it in the tick,
 * and `carSelect.js` is what shows it.
 */


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
