/**
 * The three cars, as data.
 *
 * Same engine model, three tunings — the kart-racer trade: top speed
 * against handling. Every number is a `CarControl` option, so the choice is
 * configuration, not code, and the replay stores which car drove.
 *
 * Nothing here touches a screen: the race director reads the chosen one
 * in the tick, and the garage scene's parts show them.
 */

/** The project's choice that holds the car (m2d.project.json `choices`). */
export const CAR_CHOICE = 'car';

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

/** A car by its id, or null. */
export function carById(id) {
  return CARS.find((car) => car.id === id) ?? null;
}

/**
 * The car the player chose in the garage, carried as the local player's
 * state; the Tourer, the project's initial, when the state has none.
 */
export function chosenCar(game) {
  return carById(game.players.local.state[CAR_CHOICE]) ?? CARS[1];
}
