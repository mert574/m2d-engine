# Multiplayer

An online game runs on an authoritative server. The server simulates the match; each browser shows what the server sends and sends back what its player does. Nobody writes networking code. The game is split into a shared module, a browser entry and a server entry, and the engine and `m2d-server` do the rest.

| Module | Runs in | Holds |
| --- | --- | --- |
| `game.js` | Browser and server | Actors, constraints, scene definitions with their simulation hooks, intents, the input schema. See [Splitting a game](./headless#splitting-a-game) |
| `main.js` | Browser | Camera, lights, HUD, screens, sound, and the connection |
| `match.js` | Server | `defineMatch(...)`: what happens when a player joins and leaves |
| `server.mjs` | Server | `createServer(...)`: ports, the ticket secret, origins, limits |

Cinder Keep is built this way. Run its server and open the keep twice:

```bash
node examples/src/iso/server.mjs
npm run dev    # then open /iso/?online=ws://127.0.0.1:8787 in two windows
```

A player's own knight moves on the tick they press a key; everyone else's is drawn between the server's states. See [Prediction](#prediction) and [Interpolation](#interpolation).

On the server `game.player` is null: every knight is somebody's. Simulation code that needs "the player" asks `game.players.nearestAvatar(position, range)` or `game.players.isAvatar(entity)` (see [Players](./headless#players)); the engine's `Chase`, `Turret` and `Coin` do.

## The match

```javascript
// keepMatch.js
import { defineMatch } from 'm2d-server';
import { KEEP_INPUT, KEEP_GAME, registerKeep, keepScene, spawnKnight } from './game.js';

export default defineMatch({
  input: KEEP_INPUT,
  game: KEEP_GAME,
  maxPlayers: 4,
  async setup(game) {
    registerKeep(game);
    game.sceneManager.addScene('keep', keepScene(game, { loadScene }));
    await game.sceneManager.switchTo('keep');
  },
  join(game, player) {
    spawnKnight(game, player, arrivals++);
  }
});
```

| Field | Default | Meaning |
| --- | --- | --- |
| `input` | required | The game's `InputSchema`. Every player's input goes through an `InputGate` built from it |
| `setup(game, { matchId })` | required | Register everything on the headless game and enter the first scene |
| `join(game, player)` | required | A player arrived. Give them an avatar (`player.avatar`), usually spawned with `game.spawn` and owned by `player.id`, and any `player.state` |
| `leave(game, player)` | removes the player's entities | The player is gone for good |
| `game` | `{}` | `M2D` options for the headless game |
| `maxPlayers` | `8` | A player past this is turned away with `full` |
| `sendEvery` | `2` | Ticks between state messages |
| `reconnectSeconds` | `10` | How long a dropped player's avatar waits for them to come back |
| `maxEntities` | `5000` | A match that grows past this is ended |
| `interest` | none | `{ radius }`: send each client only what its player is near. See [Interest](#interest) |

Each match runs in its own worker thread with its own headless game at the fixed tick. A match whose code throws, loops or runs out of memory ends alone; its players are told and every other match carries on.

## The server

```javascript
import { createServer } from 'm2d-server';

const server = createServer({
  match: new URL('./keepMatch.js', import.meta.url),
  secret: process.env.TICKET_SECRET,
  origins: ['https://play.example.com']
});
await server.start();
```

| Option | Default | Meaning |
| --- | --- | --- |
| `match` | required | URL of the match module |
| `secret` | required | Shared with the lobby. At least 32 bytes |
| `port`, `host` | `0`, `'0.0.0.0'` | Where to listen. `start()` resolves with the bound port |
| `path` | `'/play'` | The WebSocket path |
| `origins` | none | Allowed `Origin` headers. A connection without one (a non-browser client) is allowed; tickets, not cookies, authenticate |
| `trustProxy` | `false` | Read the client address from `X-Forwarded-For`. Only behind a proxy that sets it |
| `maxConnections` | `1000` | Across the server |
| `maxConnectionsPerIp` | `8` | |
| `upgradesPerIpPerMinute` | `30` | Connection attempts, refused or not |
| `maxMatches` | `50` | Matches running at once |
| `maxMessageBytes` | `4096` | Largest frame a client may send |
| `messagesPerSecond`, `messageBurst` | `120`, `240` | Per connection. Past it the connection is closed |
| `maxEnvelopeErrors` | `5` | Frames that are not envelopes, tolerated before closing |
| `idleMs` | `15000` | Silence before a connection is closed |
| `pingMs` | `10000` | Between WebSocket pings. A peer that misses one is cut off |
| `maxBufferedBytes` | `1048576` | Unsent data allowed per connection. A client that does not read is disconnected, not buffered for |
| `compress` | `true` | `permessage-deflate`. Safe alongside `maxMessageBytes`, which `ws` enforces against the *decompressed* size, so a frame that inflates enormously is refused with `1009` like any other oversized one. Contexts are not carried between messages, so a connection costs a zlib window per message rather than one held open for its life |
| `compressThreshold` | `256` | Frames smaller than this are sent uncompressed, since the header costs more than the saving |
| `memoryMb` | `256` | Heap limit per match worker |
| `watchdogMs` | `5000` | Silence before a match worker is ended. At least `1000` |
| `devTickets` | `false` | Serve `GET /dev/ticket?player=&match=` to anyone, for local play. Never in production |

`server.stop()` closes every connection and match. The server emits `matchEnded` with `{ id, reason }`.

## Tickets

A client connects to `ws://host/play?ticket=...`. The ticket comes from the game's lobby, which signs it with the secret the match servers share. A server checks it with no database and before the WebSocket upgrade completes, so a bad ticket never becomes a connection.

```javascript
import { issueTicket } from 'm2d-server/tickets.js';
const ticket = issueTicket(secret, { player: account.id, match: room.id, ttl: 60 });
```

The ticket names the player and the match, expires (the server refuses one good for longer than five minutes) and works once. A player id that connects again replaces their older connection.

## The client

```javascript
import { NetClient } from 'm2d-engine/net/client.js';

const net = await NetClient.connect(game, { url: 'wss://play.example.com/play', ticket, schema: KEEP_INPUT });
net.on('close', ({ code, reason }) => { /* back to the menu */ });
```

Connecting makes the game a replica (`game.replica`). It loads the match's scene from its own `game.js` and checks that it built the same entities as the server (`game.sceneSignature`); a client running a different version is refused. From then on a level's simulation hooks, entities' `fixedUpdate`, timers and physics do not run on the client: the server's state is drawn instead. Presentation hooks (`onShow`, `onUpdate`, the draw hooks) and UI scenes run as ever.

Each tick the client encodes its input snapshot for the server tick it will arrive in time for. A key or button pressed during a tick counts as held for that tick, so a tap shorter than a tick still arrives. `game.players.local.send(name, args)` goes to the server and resolves with its answer, or `{ ok: false, reason: 'offline' }` once the connection is gone. `game.player` follows the player's avatar.

How far ahead to send is measured, not guessed. The server's input gate reports how many ticks early a client's input arrived, and the client steers a `lead` to keep a small margin: enough to absorb jitter, no more, since every extra tick of lead is input the server holds before using. A connection that improves gives the margin back.

`NetClient.connect` takes any object shaped like a `WebSocket` — `send`, `close`, `onmessage`, `onclose`, `readyState` — so a different transport is an adapter, not a change to the client.

## Prediction

The client runs its own avatar's movement as it sends the input, instead of waiting a round trip to see it. When the server's own answer for that tick arrives the two are compared: they normally agree exactly, because the client advanced the same body with the same velocity against the same static colliders. When they do not, the server wins — the body is put where the server says it was and every input sent since is replayed on top, so a correction does not discard the keys pressed while the news was travelling. The *drawn* position keeps the old offset and gives it up over about a tenth of a second, so a small disagreement is never seen and a large one reads as a settle rather than a jump.

An actor says what may run early. Running a whole avatar's `fixedUpdate` on a client would run its attacks, abilities and damage, which are the server's to decide:

```javascript
class Knight extends ObliquePlayer {
  static predictedConstraints = ['control', 'walk'];
  static predictedFields = ['heading'];
}
```

| Declaration | Meaning |
| --- | --- |
| `static predictedConstraints` | Constraint keys a client runs for itself each tick. Movement; nothing that decides an outcome |
| `static predictedFields` | Fields those constraints own, which the server's older copy must not overwrite |

Both join along the class chain, like `static replicated`. `TopDownPlayer` declares `control`, so every player actor built on it is predicted without saying anything.

In a 2D game, an avatar on a **character body** is predicted: its motion comes from its own controller resolving its own velocity against the colliders around it, so it can be advanced without running the solver over a world the server owns. An avatar on a dynamic body — carried by gravity and contacts — is drawn from the server's states instead. Pass `predict: false` to `NetClient.connect` to turn prediction off.

## Interpolation

Interpolation and client prediction apply to 2D games. A 3D replica draws the latest server transform, including its rotation quaternion.

Remote entities are drawn a little behind the newest server state, blending between the two states that bracket that moment, so motion is smooth at any frame rate and a late or lost message is invisible. The delay is two send intervals plus a margin. Each entity is blended on its own clock, because a diff only carries what changed and two entities' states rarely arrive on the same ticks. Past the newest state an entity carries on along its last velocity for at most one send interval, then holds: guessing further is how a remote body walks through a wall.

## Interest

A match with `interest: { radius }` sends each client only what its player is near. Scenery is always sent — anything on a static or kinematic body, which is sent once and never again — as is the player's own avatar and anything a class declares `static alwaysRelevant = true`. Everything else is sent while it is within `radius` of the avatar.

An entity that leaves is not removed: the client keeps it and stops drawing it, and coming back into range re-sends the whole of it rather than a diff against a stale memory. The boundary has hysteresis, so something walking along it does not flicker. World events are filtered the same way, by where they happened.

For Cinder Keep's 615 entities and four players this takes a join from 52 KB to 2.7 KB and a stream from 30 KB/s to 7.2 KB/s per client, or 5.7 KB/s once compressed.

## What is sent

A client builds the scene itself, so the server sends only changes:

- An entity spawned at runtime with `game.spawn({ type, x, y, width, height, sprite, animation, options, physics, playerId })` (plus `z` and `depth` in a 3D game), which records how it was made. An entity made with `new` is not sent. Spawn `options` must be plain data.
- An entity removed from `game.entities`.
- In a 2D game, an entity's position, angle and velocity, each when that part changed. They are diffed apart because most things never rotate and much of what moves needs no velocity sent at all — a creature crossing a flat floor sends two numbers, not five. Positions carry a tenth of a pixel, angles a thousandth of a radian, speeds whole pixels per second, and a velocity under 1 px/s is sent as a standstill.
- In a 3D game, the transform carries position, rotation quaternion and velocity together. A 3D match sets `dimensions: 3` in its `game` options and the worker loads the 3D solver.
- The receiving player's own avatar's position, every message whether it changed or not. A client is predicting that one, and a prediction needs something to check against: if the server's avatar has not moved because the input never arrived, saying nothing would leave the client walking on uncorrected.
- Declared fields, when their value changed. A class lists them in `static replicated = ['field']`; the lists of every class in the chain are joined. `Entity` sends `elevation`, `visible` and `dead`. Constraints declare theirs the same way: `Health` sends `currentHealth`, `Attack` sends its swing state. Values must be plain data. A class with `replicaState()` sends what it returns instead, and `replicaUpdated(changed)` runs on the client after its fields arrive.
- The receiving player's `state`, to that player alone.
- Events the simulation raised for the player with `player.notify(name, data)`, to that player alone. `game.players.local.on(name, handler)` hears them, alone and online alike.
- World events the simulation raised with `game.events.emit(name, data)` — a hit, a death, a footstep — to every client that can see where they happened. See [World events](./headless#world-events).
- An entity that has left the player's interest, as `hide`.
- Intent results.

A client is not sent the level it has just built for itself: the stream is seeded with the scene's own build, so a join carries only what has changed since the match began.

## Close codes

| Code | Name | When |
| --- | --- | --- |
| `4000` | `idle` | Nothing heard for `idleMs` |
| `4001` | `replaced` | The same player connected again |
| `4002` | `malformed` | Binary frames, or too many frames that are not envelopes |
| `4003` | `full` | The match has `maxPlayers` |
| `4008` | `violation` | Too many messages, or the player's violation meter tripped |
| `4009` | `slow` | The client did not read fast enough |
| `4010` | `ended` | The match ended, crashed, stopped responding or passed its limits |
| `1001` | `shutdown` | The server is stopping |
| `1009` | | A frame larger than `maxMessageBytes` |

Before closing, the server sends `{ t: 'bye', reason }`. `net.closed` holds the code and reason afterwards. A refused ticket, a foreign origin or a connection over the limits is answered with an HTTP status (401, 403, 429 or 503) and never upgraded.
