# Headless games

A headless game is the simulation with nothing that shows it. It has the clock, the seeded generator, physics, entities and scenes. It has no canvas, renderer, camera, UI, world overlay or audio. It runs in plain Node, which is what an authoritative server runs and what a test that only cares about the simulation needs.

```javascript
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { registerMyGame, levelScene } from './game.js';

await initPhysics();
const game = new M2D(null, { headless: true, worldWidth: 4000, worldHeight: 720, seed: 1 });
registerMyGame(game);
game.sceneManager.addScene('level', levelScene(game));
await game.sceneManager.switchTo('level');
game.setupCollisionHandlers();

game.step(60); // one second of simulation
```

Pass `null` for the canvas. A headless game has no frame loop, so `game.update()` throws. The caller owns the clock and calls `game.step(ticks)`, which runs whole ticks and returns how many ran. `step` stops early when a tick requests a scene switch. Await the switch, then step on. `game.start()` enters `initialScene` and returns without starting a loop.

## Splitting a game

A game that runs on a server and in the browser splits into two modules. `game.js` holds the simulation: the actors, the constraints, the scene definitions and their simulation hooks. `main.js` imports it and adds the camera, lights, HUD, menus and sounds. A server entry imports `game.js` alone.

Beeline is split this way. `examples/src/scroller/game.js` is the lane, `main.js` is what the player sees and `simulate.mjs` runs the lane headless from a scripted client:

```bash
node examples/src/scroller/simulate.mjs 600
```

`game.js` and everything it imports must run in Node. It cannot touch the DOM, use Vite-only imports such as `import.meta.glob`, or read the renderer outside `draw`. An actor that wants to know a renderer capability asks when it draws:

```javascript
class Pollen extends Entity {
  get lit() { return this.game.renderer.supports('lights'); }
}
```

In an editor project, `game.js` may export `sceneHooks(game)` with each scene's simulation hooks, and the hooks module exports the presentation ones. `bootProject` (see [The project file](./editor#the-project-file)), the editor's play and a server entry all run the definition's, and the page and the editor add the hooks module's on top:

```javascript
// game.js: simulation, run headless too
export function sceneHooks(game) {
  return { keep: { onEnter() { /* wire the stair, the purse */ } } };
}

// a server entry: the definition's hooks, no presentation
game.sceneManager.addScene('keep', { fetch: loadKeep, ...sceneHooks(game).keep });
```

Most presentation needs no hook at all: the camera, the light, the HUD, music and what the player is told are the scene's data. A game without a project adds its presentation hooks on top of the definition's itself:

```javascript
game.sceneManager.addScene('lane', {
  ...laneScene(game, { assetUrl: foliageUrl }),
  onShow() { /* what no scene field says */ }
});
```

| Hook | Headless | Holds |
| --- | --- | --- |
| `onEnter`, `onFixedUpdate`, `onExit` | Runs | Simulation: wiring entities, rules, win conditions |
| `onShow`, `onHide` | Skipped | Presentation setup and teardown: camera, lights, post effects, HUD, music |
| `onUpdate`, `onDraw`, `onDrawBackground`, `onResize`, `onAction` | Skipped | Per-frame presentation |

`onShow` runs right after `onEnter`. `onHide` runs right before `onExit`.

## What a headless game leaves out

A headless scene loads no sprite sheets and builds no tile layers or background. Entities get no sprite. A UI scene cannot load headless and its switch rejects.

Presentation is not stubbed quietly. Each part throws on first use, naming what was touched:

> M2D headless: read x on game.camera, which is presentation and does not exist in a headless game.

| Throws when used | Holds |
| --- | --- |
| `game.camera`, `game.renderer`, `game.uiRenderer`, `game.viewport` | The view |
| `game.ui`, `scene.ui`, `game.worldOverlay`, `game.motion`, `game.theme` | UI and overlays |
| `game.layers` | Tile layers |
| `game.cvars`, `game.commands`, `game.console` | The developer console |
| `game.input.isDown`, `game.input.on` and the rest of the live device API | Devices. Simulation code reads `game.input.snapshot` |

A simulation that reads one of these on the server would simulate a different game from the clients, so it fails instead.

`game.soundManager` is silent. Simulation code plays sounds as side effects, and every call is accepted and does nothing. `loop()` returns `null`, as it does for an unknown sound.

## Input

`game.input.snapshot` is the only input a headless game has. With no snapshot source every tick reads an empty snapshot. `game.input.setSnapshotSource(source)` feeds one per tick, as a replay does. On a server the source is an input gate.

## Players

`game.players` holds the players. Every game has `game.players.local`, the player at the keyboard, whose snapshot is `game.input.snapshot`. A server adds one player per connection:

```javascript
const player = game.players.add(connectionId, { meter });
player.setSnapshotSource(() => gate.take(game.time.steps));
hero.playerId = player.id;
player.avatar = hero;
```

| Member | Meaning |
| --- | --- |
| `players.add(id, { meter })` | Add a player. `meter` is a `ViolationMeter` shared with the player's input gate |
| `players.remove(id)` | Remove a player. Their entities keep their `playerId` and read empty input |
| `players.get(id)`, `players.has(id)`, `players.all` | Look players up. `all` is sorted by id |
| `players.turnOrder(tick)` | The order intents apply in on that tick: `all`, rotated so a different player goes first each tick |
| `players.avatars` | Every player's living avatar, or `game.player` when no player has claimed one. What simulation code means by "the player" |
| `players.nearestAvatar(position, range)` | The living avatar nearest a point within `range`, or null. Ties go to the lower player id |
| `players.isAvatar(entity)` | Whether an entity is one of the `avatars` |
| `player.id`, `player.local` | The id, and whether this is the player at the keyboard |
| `player.snapshot` | This tick's input |
| `player.setSnapshotSource(fn)` | Where a remote player's snapshots come from, called once per tick. The local player's source is `game.input` |
| `player.avatar` | The entity the game treats as the player's body, for distance rules |
| `player.state` | Any per-player state the game keeps: an inventory, gold, a score |
| `player.entities` | The entities whose `playerId` is this player's |
| `player.send(name, args)` | File an intent as this player. Resolves with `{ ok, reason }` once it has run |
| `player.intents` | The player's `IntentQueue`, once intents are registered |
| `player.notify(name, data)` | Tell this player's presentation that something happened. Simulation code. Alone, listeners hear it after the frame's ticks; online, on the player's client. `data` is plain data |
| `player.on(name, handler)` | Listen for `notify` events. Presentation code. Returns a function that stops listening |

Each tick, before anything updates, every player's snapshot is sampled and the intents filed for the tick are applied. An entity reads the owning player's snapshot through `entity.input`, so a player's input reaches only the entities that carry their id.

Simulation code never reads `game.player` to find "the player". On a server it is null, and every avatar belongs to someone, so an enemy that hunted `game.player` would stand still. `Chase`, `Turret` and `Coin` ask `game.players.nearestAvatar` and `isAvatar` instead, which alone come to the same thing. `game.player` stays what the camera follows and the HUD reads: presentation.

## World events

Simulation decides that something happened; presentation decides what it looks and sounds like. On a server those are different processes: a flash or a sound written in `fixedUpdate` would be lost, and the clients that never ran the tick would have no way to know. Replicated state does not cover it either: two hits in one send interval look like one change to `currentHealth`, and a blocked hit or a footstep changes no state at all.

So simulation raises them and presentation hears them:

```javascript
// Simulation, in a fixedUpdate or a collision handler:
game.events.emit('damage', { id: entity.netId, amount, at: { x, y } });

// Presentation, anywhere it is being drawn:
game.events.on('damage', ({ id, amount }) => { /* a HUD, a camera shake */ });
```

| Member | Meaning |
| --- | --- |
| `events.emit(name, data)` | Raise one. Plain data; `id` names the entity it is about, `at` is where on the ground it happened. A client raises none of its own |
| `events.on(name, handler)` | Listen for events that are not one entity's. Returns a function that stops listening |
| `events.take()` | The events raised since the last take. The frame loop and the match host call it |
| `events.dispatch(events)` | Deliver them. Called with the frame's own on a game alone, and with the server's on a client |

An event that names an entity reaches that entity's `onWorldEvent(name, data)`, which offers it to each of its constraints, the path `onCollisionStart` takes. That is how `DamageFlash` flashes and `Footsteps` makes its sound without subscribing to anything, and it costs one lookup per event rather than a call to every entity in the world.

Delivery is always **after** the tick that raised it, never inside it, so presentation cannot feed back into the simulation it is reacting to and a game behaves the same way alone and online. `Health` raises `damage`, `death` and `heal`; `Footsteps` raises `step` with the sound to play.

## Intents

Held input carries what a player does with the controls. It cannot carry a choice that exists only in the client's UI: which inventory slot to move an item to, which of a vendor's wares to buy, which dialogue answer to give. Those are intents: named, typed requests the game declares in the module both the browser and the server import. Settings, bindings, menus and hovering are local and are never sent.

```javascript
import { defineIntents, reject, slot, oneOf, entity } from 'm2d-engine/net/intents.js';

export const intents = defineIntents({
  moveItem: {
    args: { from: slot(SIZE), to: slot(SIZE) },
    rate: 10,
    run(player, { from, to }) {
      const inv = player.state.inventory;
      if (inv[from] === null) return reject('empty-slot');
      [inv[from], inv[to]] = [inv[to], inv[from]];
    }
  },
  sell: {
    args: { slot: slot(SIZE), vendor: entity({ actor: 'Vendor', within: 96 }) },
    run(player, { slot, vendor }) { /* price, gold, remove the item */ }
  }
});

game.registerIntents(intents);
const result = await game.players.local.send('sell', { slot: 3, vendor: shopkeeper.netId });
if (!result.ok) toast(result.reason);
```

An intent runs at the start of a tick, before entities update, in a deterministic order. Players take turns going first: `players.turnOrder(tick)` is the players by id, rotated by the tick. Within a player, intents run by sequence number. Because intents run one after another, a same-tick contest is decided by the game's own rule. Two players buying the last charm in one tick: the first to run takes it and the second is refused with `sold-out`. Cinder Keep's `examples/test/keepIntents.test.js` pins that. The server stamps the tick on arrival; the client never chooses it. The sender is the connection the message arrived on, never a field of the message.

| Declaration field | Default | Meaning |
| --- | --- | --- |
| `args` | `{}` | Argument names to types |
| `rate` | `5` | How many a player may send per second. Past it a submission is refused and counts as a violation |
| `run(player, args, { game, tick })` | required | The rule. Return `reject(reason)` to refuse; the client receives the reason |

| Argument type | Accepts |
| --- | --- |
| `int(min, max)` | A whole number in the range |
| `slot(size)` | A whole number from 0 to `size - 1` |
| `num(min, max)` | A finite number in the range |
| `bool()` | `true` or `false` |
| `str(maxLength)` | A string of at most that many characters |
| `oneOf(values)` | One of a fixed list of strings or numbers |
| `list(type, max)` | An array of at most `max` items of `type` |
| `entity({ actor, owned, within })` | A network id, resolved to the live entity when the intent runs. `actor` is a name or a list of names the entity must have, `owned` requires `entity.playerId` to be the sender's, `within` is the most pixels it may be from the sender's avatar: a number, or a function of the entity that reads its own reach on the server (`within: (vendor) => vendor.tradeRadius`), so the reach a prompt shows and the reach the server allows are one declared value. Fails with `no-such-entity`, `wrong-entity`, `not-owned`, `no-avatar` or `too-far` |

A message is `{ seq, name, args }`. `seq` counts up per connection. `IntentSet.decode(message)` checks it statically and never throws: a plain object with exactly those fields, a whole `seq` from 1 up, a declared name, exactly the declared argument fields, each of its type. An `IntentQueue` is one player's queue:

| Method | Meaning |
| --- | --- |
| `submit(message)` | File for the next tick. Returns `{ accepted, reason }`. Static failures and `rate` are violations on the shared meter; `duplicate` (a seq already filed) and `stale` (a seq far below the newest) are dropped and counted |
| `apply(tick, player, game)` | Run what was filed, in seq order. The engine calls it |
| `drainResults()` | `{ seq, ok, reason }` for each applied intent, for the connection to send back |
| `counts`, `exceeded` | Refusals by reason, and the shared meter's flag |

A refusal from `run` or from a reference rule is a result, not a violation: an honest client's view can be a tick stale. Chat, accounts, purchases and matchmaking are not intents. They belong to services outside the tick.

To play a split game online, see [Multiplayer](./multiplayer).

Cinder Keep's satchel and quartermaster are the worked example: `examples/src/iso/keepIntents.js` declares `buy`, `sell`, `moveItem` and `use`, and `satchelUI.js` sends them from screens that block input without pausing.

## The input gate

`m2d-engine/net/input.js` turns what clients send into snapshots. A client sends one message per tick:

```javascript
{ tick: 812, held: 0b1001, pointer: { x: 640.5, y: 212, buttons: 1 } }
```

`held` is a bit mask over the game's key list. `pointer` is in world coordinates on the ground plane and is present only in a game with a pointer. A message never carries press or release edges. The gate derives them from the held state of consecutive ticks, so a client cannot claim a press it never released.

`InputSchema` is the game's input alphabet:

```javascript
import { InputSchema, InputGate } from 'm2d-engine/net/input.js';

export const INPUT = new InputSchema({
  keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'],
  pointer: { bounds: { left: 0, top: 0, right: 4000, bottom: 720 }, buttons: 1 }
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `keys` | required | Physical key codes, at most 32. Their order defines the bits of `held` |
| `pointer` | `false` | `{ bounds, buttons }`: the world rectangle a pointer may point into and its button count, 1 to 5 (default 3) |

`schema.encode(tick, snapshot)` builds the message a client sends from the snapshot it sampled. `schema.decode(message)` checks one and never throws.

`InputGate` is one connection's queue. `submit(message)` decodes it and files it under its tick. `take(tick)` returns the tick's `InputSnapshot`, ticks in order, each once. A tick with no message repeats the last held state and produces no edges.

```javascript
const gate = new InputGate(INPUT);
socket.onmessage = (data) => gate.submit(JSON.parse(data));
game.input.setSnapshotSource(() => gate.take(game.time.steps));
```

| Option | Default | Meaning |
| --- | --- | --- |
| `maxAhead` | 30 | Furthest a message may be filed past the last tick taken, in ticks. Bounds the buffer |
| `maxViolations` | 20 | Violations tolerated within `violationWindow` before `exceeded` turns true |
| `violationWindow` | 60 | In ticks |
| `startTick` | 0 | The tick already simulated when the connection joins |

`submit` returns `{ accepted, reason }`. `gate.counts` counts each refusal by reason.

| Reason | When | Violation |
| --- | --- | --- |
| `shape` | Not a plain object with exactly the expected fields | Yes |
| `tick` | Not a whole number from 1 up | Yes |
| `held` | Not a whole number inside the key list's mask | Yes |
| `pointer` | Missing, extra, non-finite, out of bounds or bad buttons | Yes |
| `conflict` | A different message for a tick already filed. The first one stands | Yes |
| `duplicate` | The same message again | No |
| `late` | For a tick already taken | No |
| `early` | More than `maxAhead` ticks past the last one taken | No |

Late, early and duplicate messages are what a bad network produces. They are dropped and counted. Violations are what only a broken or hostile client sends. `gate.exceeded` turns true once there are more than `maxViolations` of them within `violationWindow` ticks, and stays true. Disconnecting the client is the caller's decision.

A snapshot from the gate has no UI position: `pointer.ui` is the origin. Simulation code reads `pointer.world`.
