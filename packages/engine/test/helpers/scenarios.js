/**
 * The scenes the determinism suites run, shared so the same simulation can
 * be driven by a displayed game in one test and a headless one in another.
 * Plain data, actors and pure functions: nothing here touches a browser.
 */

import { Player } from '../../src/actors/player.js';
import { SCENE_VERSION } from '../../src/core/sceneLoader.js';
import { Bee } from '../../src/actors/bee.js';
import { Turret } from '../../src/actors/turret.js';
import { Platform } from '../../src/actors/platform.js';
import { MovingPlatform } from '../../src/actors/movingPlatform.js';
import { Entity } from '../../src/core/entity.js';
import { ObliquePlayer } from '../../src/actors/obliquePlayer.js';
import { TopDownPlayer } from '../../src/actors/topDownPlayer.js';
import { Ghost } from '../../src/actors/ghost.js';
import { Npc } from '../../src/actors/npc.js';
import { Coin } from '../../src/actors/coin.js';
import { Trigger } from '../../src/actors/trigger.js';
import { CarControl } from '../../src/constraints/carControl.js';
import { GlideControl } from '../../src/constraints/glideControl.js';
import { ThrustControl } from '../../src/constraints/thrustControl.js';
import { PointerMove } from '../../src/constraints/pointerMove.js';
import { Abilities } from '../../src/constraints/abilities.js';
import { Footsteps } from '../../src/constraints/footsteps.js';
import { InputSchema, InputGate } from '../../src/net/input.js';
import { Rng } from '../../src/core/rng.js';
import { InputSnapshot } from '../../src/core/input/snapshot.js';

/*
 * The arena: a player on KeyboardControl (input sampling, per-tick
 * acceleration), a Bee on Chase (seeded wander targets, contact damage,
 * stun timers), a Turret (cooldowns, raycasts, spawning rockets mid-run), a
 * MovingPlatform on PathFollow (kinematic velocity, waits).
 */
export const ARENA_ACTORS = [Player, Bee, Turret, Platform, MovingPlatform];

export const SCENE = {
  version: SCENE_VERSION, type: 'level', name: 'arena',
  world: { gravity: { x: 0, y: 900 } },
  prefabs: {
    floor: { actor: 'Platform', physics: { bodyType: 'static', friction: 0.6 } },
    player: { actor: 'Player', physics: { bodyType: 'dynamic', lockRotation: true, friction: 0.6 } },
    bee: { actor: 'Bee', physics: { bodyType: 'dynamic', frictionAir: 0.05 } },
    turret: { actor: 'Turret', physics: { bodyType: 'static' } },
    lift: { actor: 'MovingPlatform', physics: { bodyType: 'kinematic' } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'floor', x: 640, y: 700, width: 1280, height: 40 },
    { id: 'player', prefab: 'player', x: 200, y: 640, width: 32, height: 48 },
    { id: 'bee-1', prefab: 'bee', x: 420, y: 560, width: 32, height: 32 },
    { id: 'bee-2', prefab: 'bee', x: 700, y: 500, width: 32, height: 32 },
    { id: 'turret', prefab: 'turret', x: 1000, y: 660, width: 32, height: 32, properties: { fireRate: 0.4, detectionRange: 1200 } },
    { id: 'lift', prefab: 'lift', x: 500, y: 620, width: 120, height: 16, properties: {
      path: { points: [{ x: 500, y: 620 }, { x: 650, y: 520 }], speed: 120, waitTime: 300 }
    } }
  ] }]
};

export const OTHER = { version: SCENE_VERSION, type: 'level', name: 'other', layers: [{ name: 'main', objects: [] }] };

/** Everything the simulation is made of, as plain numbers, in a stable order. */
export function fingerprint(game) {
  const entities = [...game.entities].map((entity) => ({
    name: entity.name,
    x: entity.position.x, y: entity.position.y,
    vx: entity.velocity.x, vy: entity.velocity.y,
    angle: entity.body.angle,
    health: entity.getConstraint('health')?.currentHealth,
    wander: entity.getConstraint('chase')?.target,
    cooldown: entity.fireCooldown
  }));
  return {
    steps: game.time.steps,
    elapsed: game.time.elapsed,
    draws: game.rng.draws,
    entities
  };
}

/*
 * The rest of the engine's actors and constraints, driven by a scripted
 * input stream instead of the keyboard: the seam a replay uses, and the one
 * a network layer will. The script only says which keys are held on each
 * tick; press and release edges are derived between consecutive ticks,
 * which is how the server will treat a client's input.
 */

class Car extends Entity {
  name = 'Car';
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('car', new CarControl(this, {
      keys: { throttle: 'KeyW', brake: 'KeyS', left: 'KeyA', right: 'KeyD', handbrake: 'ShiftLeft', nitro: 'KeyN' },
      ...options
    }));
  }
}

class Ship extends Entity {
  name = 'Ship';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.boosts = 0;
    this.addConstraint('thrust', new ThrustControl(this, {
      keys: { thrust: 'KeyI', reverse: 'KeyK', left: 'KeyJ', right: 'KeyL', boost: 'KeyC', fire: 'KeyF' },
      boostCooldown: 1.5,
      onBoost: () => { this.boosts++; }
    }));
  }
}

class Glider extends Entity {
  name = 'Glider';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('glide', new GlideControl(this, { grid: 32, speed: 200 }));
  }
}

class Walker extends Entity {
  name = 'Walker';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.arrivals = 0;
    this.addConstraint('walk', new PointerMove(this, { speed: 160, onArrive: () => { this.arrivals++; } }));
  }
}

export const COVERAGE_ACTORS = [ObliquePlayer, TopDownPlayer, Ghost, Npc, Coin, Trigger, Platform, Car, Ship, Glider, Walker];

/**
 * A placed object. Every object in a scene needs a unique id, and these
 * fixtures have nothing to say about ids, so they are numbered per prefab
 * in placement order — the same scheme the demos' build scripts use.
 */
const counts = new Map();
const box = (prefab, x, y, width, height, properties) => {
  const n = (counts.get(prefab) ?? 0) + 1;
  counts.set(prefab, n);
  return { id: `${prefab}-${n}`, prefab, x, y, width, height, ...(properties && { properties }) };
};

export const GROVE = {
  version: SCENE_VERSION, type: 'level', name: 'grove',
  world: { gravity: { x: 0, y: 0 } },
  prefabs: {
    wall: { actor: 'Platform', physics: { bodyType: 'static' } },
    player: { actor: 'ObliquePlayer', physics: { bodyType: 'dynamic', lockRotation: true, frictionAir: 0.2, footprint: { height: 16 } } },
    ghost: { actor: 'Ghost', physics: { bodyType: 'dynamic', frictionAir: 0.05 } },
    npc: { actor: 'Npc', physics: { bodyType: 'static' } },
    coin: { actor: 'Coin', physics: { bodyType: 'static', isSensor: true } },
    gate: { actor: 'Trigger', physics: { bodyType: 'static', isSensor: true } },
    car: { actor: 'Car', physics: { bodyType: 'dynamic', frictionAir: 0 } },
    ship: { actor: 'Ship', physics: { bodyType: 'dynamic', frictionAir: 0 } },
    walker: { actor: 'Walker', physics: { bodyType: 'dynamic', lockRotation: true } }
  },
  layers: [{ name: 'main', objects: [
    box('wall', 640, 10, 1280, 20), box('wall', 640, 950, 1280, 20),
    box('wall', 10, 480, 20, 960), box('wall', 1270, 480, 20, 960),
    box('player', 200, 400, 32, 48),
    box('ghost', 520, 300, 32, 32), box('ghost', 900, 600, 32, 32),
    box('npc', 380, 470, 32, 48, { who: 'keeper', talkRadius: 120 }),
    box('coin', 260, 416, 20, 20), box('coin', 330, 416, 20, 20),
    box('gate', 400, 400, 30, 120, { active: true }),
    box('car', 300, 800, 48, 24),
    box('ship', 1000, 200, 36, 24),
    box('walker', 900, 850, 24, 24)
  ] }]
};

export const KEEP = {
  version: SCENE_VERSION, type: 'level', name: 'keep',
  world: { gravity: { x: 0, y: 0 }, projection: 'isometric' },
  prefabs: {
    wall: { actor: 'Platform', physics: { bodyType: 'static' } },
    player: { actor: 'TopDownPlayer', physics: { bodyType: 'dynamic', lockRotation: true, frictionAir: 0.2 } },
    glider: { actor: 'Glider', physics: { bodyType: 'character' } },
    walker: { actor: 'Walker', physics: { bodyType: 'dynamic', lockRotation: true } }
  },
  layers: [{ name: 'main', objects: [
    box('wall', 320, 8, 640, 16), box('wall', 320, 632, 640, 16),
    box('wall', 8, 320, 16, 640), box('wall', 632, 320, 16, 640),
    box('wall', 240, 240, 96, 32),
    box('player', 100, 100, 28, 28),
    box('glider', 336, 400, 28, 28),
    box('walker', 500, 120, 24, 24)
  ] }]
};

/** Held keys per tick. Each entry: [first tick, last tick, ...codes]. */
export const HELD = [
  [1, 80, 'ArrowRight'], [81, 140, 'ArrowDown'], [141, 200, 'ArrowLeft', 'ArrowUp'],
  [40, 42, 'Space'], [125, 127, 'Space'], [70, 72, 'KeyX'],
  [60, 60, 'Digit1'], [62, 62, 'Digit1'], [190, 190, 'Digit1'],
  [1, 160, 'KeyW'], [50, 100, 'KeyD'], [80, 92, 'ShiftLeft'], [30, 30, 'KeyN'], [170, 220, 'KeyS'],
  [1, 120, 'KeyI'], [20, 60, 'KeyJ'], [20, 20, 'KeyC'], [40, 40, 'KeyC'], [140, 140, 'KeyC'], [150, 210, 'KeyK']
];
/** Pointer presses per scene: [tick, world x, world y]. */
export const CLICKS = {
  grove: [[30, 640, 700], [150, 1100, 860], [200, 300, 150]],
  keep: [[10, 500, 220], [100, 400, 520], [200, 300, 520]]
};

export function heldAt(tick) {
  const down = new Set();
  for (const [from, to, ...codes] of HELD) if (tick >= from && tick <= to) for (const code of codes) down.add(code);
  return down;
}

/**
 * The scripted stream, as a snapshot source: held state in, edges derived.
 * A pure function of the tick, like a replay or a rollback client's input
 * buffer, so a rewound game is fed exactly what it was fed the first time.
 */
export function scriptedInput(game, clicks) {
  return () => {
    const tick = game.time.steps;
    const down = heldAt(tick);
    const previous = heldAt(tick - 1);
    const click = clicks.find(([at]) => at === tick);
    const last = clicks.filter(([at]) => at <= tick).at(-1);
    const pointer = last ? { x: last[1], y: last[2] } : { x: 0, y: 0 };
    return {
      down: [...down],
      pressed: [...down].filter((code) => !previous.has(code)),
      released: [...previous].filter((code) => !down.has(code)),
      pointer: {
        ui: { ...pointer }, world: { ...pointer },
        isDown: Boolean(click), pressed: Boolean(click), pressedButtons: click ? 1 : 0, buttons: click ? 1 : 0, type: 'mouse'
      }
    };
  };
}

/** Fingerprint taken from inside the tick, so it is the same tick whatever the frames did. */
export const CAPTURE_AT = 240;

/**
 * Register the coverage actors and scenes on a built game, enter one and
 * wire the scripted player. Works on a displayed game and a headless one.
 * @returns {() => object|null} The fingerprint taken at `CAPTURE_AT`, once it has run.
 */
export async function prepareCoverage(game, sceneName, { input = scriptedInput } = {}) {
  let captured = null;
  const gates = [];
  const hooks = {
    onFixedUpdate() {
      if (game.time.steps === CAPTURE_AT) captured = coverageFingerprint(game, gates);
    }
  };
  for (const actor of COVERAGE_ACTORS) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('grove', { fetch: async () => GROVE, ...hooks });
  game.sceneManager.addScene('keep', { fetch: async () => KEEP, ...hooks });
  await game.sceneManager.switchTo(sceneName);
  game.setupCollisionHandlers();
  // The gate log lives in this closure, outside any entity: snapshots carry it only if told.
  game.trackState?.('coverage.gates', { save: () => [...gates], load: (saved) => { gates.length = 0; gates.push(...saved); } });

  for (const entity of game.entities) {
    if (entity instanceof Trigger) entity.onEnter = () => gates.push(game.time.steps);
  }
  const player = game.player;
  if (player instanceof ObliquePlayer) {
    player.wards = 0;
    player.steps = 0;
    player.maxElevation = 0;
    player.addConstraint('abilities', new Abilities(player, {
      abilities: [{ id: 'ward', key: 'Digit1', cooldown: 1, cast: (entity) => { entity.wards++; } }],
      onCast: (ability, ok) => { if (!ok) player.refused = (player.refused ?? 0) + 1; }
    }));
    player.addConstraint('footsteps', new Footsteps(player, { sounds: ['step'], onStep: () => { player.steps++; } }));
    player.onLand = () => { player.landings = (player.landings ?? 0) + 1; };
  } else {
    // Under the isometric projection, the arrows move along the screen.
    player.getConstraint('control').inputSpace = 'screen';
  }
  game.input.setSnapshotSource(input(game, CLICKS[sceneName]));
  game.running = true;
  return () => captured;
}


export function coverageFingerprint(game, gates) {
  const round = (entity) => ({
    name: entity.name,
    x: entity.position.x, y: entity.position.y,
    vx: entity.velocity.x, vy: entity.velocity.y,
    angle: entity.body.angle,
    elevation: entity.elevation
  });
  const entities = [...game.entities].map((entity) => {
    const print = round(entity);
    const c = (name) => entity.getConstraint(name);
    if (c('health')) print.health = c('health').currentHealth;
    if (c('chase')) print.wander = c('chase').target;
    if (c('car')) Object.assign(print, { forward: c('car').forwardSpeed, lateral: c('car').lateralSpeed, drifting: c('car').drifting, nitro: c('car').nitroWait });
    if (c('thrust')) Object.assign(print, { boostLeft: c('thrust').boostLeft, boostWait: c('thrust').boostWait, boosts: entity.boosts });
    if (c('glide')) Object.assign(print, { dir: c('glide').dir, queued: c('glide').queued });
    if (c('walk')) Object.assign(print, { destination: c('walk').destination, arrivals: entity.arrivals });
    if (c('prompt')) print.near = c('prompt').isNear;
    if (c('abilities')) print.cooldowns = c('abilities').list.map((a) => a.remaining);
    if (c('footsteps')) Object.assign(print, { travelled: c('footsteps').travelled, stepIndex: c('footsteps').index });
    if (entity instanceof ObliquePlayer) Object.assign(print, { heading: entity.heading, lift: entity.lift, wards: entity.wards, refused: entity.refused, steps: entity.steps, landings: entity.landings });
    return print;
  });
  return { steps: game.time.steps, draws: game.rng.draws, gates: [...gates], entities };
}

/** Every key the script holds, as the game's input alphabet. */
export const COVERAGE_SCHEMA = new InputSchema({
  keys: [...new Set(HELD.flatMap(([, , ...codes]) => codes))],
  pointer: { bounds: { left: 0, top: 0, right: 1280, bottom: 2000 } }
});

/** What an honest client sends for a tick of the script. */
export function honestMessage(tick, clicks) {
  let pointer = { x: 0, y: 0, buttons: 0 };
  for (const [at, x, y] of clicks) if (at <= tick) pointer = { x, y, buttons: at === tick ? 1 : 0 };
  return COVERAGE_SCHEMA.encode(tick, InputSnapshot.from({ down: [...heldAt(tick)], pointer: { world: pointer, buttons: pointer.buttons } }));
}

/**
 * The script through a server's input gate. `chaos` delivers each honest
 * message up to five ticks early, in shuffled order, often twice, among
 * conflicting rewrites, late resends, messages from far ahead and junk.
 */
export function gatedInput({ chaos = false, gates = [] } = {}) {
  return (game, clicks) => {
    const gate = new InputGate(COVERAGE_SCHEMA);
    gates.push(gate);
    const rng = new Rng(99);
    let sent = 0;
    return () => {
      const tick = game.time.steps;
      if (!chaos) {
        gate.submit(honestMessage(tick, clicks));
      } else {
        const batch = [];
        while (sent < tick + 4) { sent++; batch.push(honestMessage(sent, clicks)); }
        for (let i = batch.length - 1; i > 0; i--) {
          const j = Math.floor(rng.next() * (i + 1));
          [batch[i], batch[j]] = [batch[j], batch[i]];
        }
        for (const message of batch) {
          gate.submit(message);
          if (rng.next() < 0.5) gate.submit(structuredClone(message));
        }
        const filed = honestMessage(tick + 1, clicks);
        gate.submit({ ...filed, held: filed.held ^ 1 });
        if (tick > 3) gate.submit({ ...honestMessage(tick - 3, clicks), held: 0xffff });
        gate.submit(honestMessage(tick + 200, clicks));
        gate.submit(rng.next() < 0.5 ? { tick, held: -1, pointer: null } : { ...filed, pointer: { x: NaN, y: 0, buttons: 0 } });
      }
      return gate.take(tick);
    };
  };
}
