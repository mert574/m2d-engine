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

There is no client prediction yet. A player's own knight moves when the server says it did, one round trip after the key went down.

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

## What is sent

A client builds the scene itself, so the server sends only changes:

- An entity spawned at runtime with `game.spawn({ type, x, y, width, height, sprite, animation, options, physics, playerId })` (plus `z` and `depth` in a 3D game), which records how it was made. An entity made with `new` is not sent. Spawn `options` must be plain data.
- An entity removed from `game.entities`.
- An entity's transform, when it moved: position, angle and velocity in a 2D game; position, rotation quaternion and velocity in a 3D one. The shape follows the game's dimension, which both ends agree on before any state is sent. A 3D match says `dimensions: 3` in its `game` options and the worker loads the 3D solver.
- Declared fields, when their value changed. A class lists them in `static replicated = ['field']`; the lists of every class in the chain are joined. `Entity` sends `elevation`, `visible` and `dead`. Constraints declare theirs the same way: `Health` sends `currentHealth`, `Attack` sends its swing state. Values must be plain data. A class with `replicaState()` sends what it returns instead, and `replicaUpdated(changed)` runs on the client after its fields arrive.
- The receiving player's `state`, to that player alone.
- Events the simulation raised for the player with `player.notify(name, data)`, to that player alone. `game.players.local.on(name, handler)` hears them, alone and online alike.
- Intent results.

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
