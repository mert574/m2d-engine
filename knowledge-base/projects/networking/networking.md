# Networking

Goal: multiplayer through an authoritative server, with no networking code in the game. Roadmap line: "Networking".

## Decisions

- **Avatars come from the scene's own player.** After `setup` the server takes out the scene's `world.player` object (the single-player avatar) and makes each joining player one from it at a free `SpawnPoint` (`scene.spawnAvatar`); a match's `join` only sets up the rest. A prefab built in play travels as its scene object and each client builds it from its own copy of the scene, which the signature check made the same, so it arrives with its constraints and art (18 Nov 2026).

- **Server-authoritative only.** The server simulates and is the only authority. Clients send held input and declared intents, nothing else. The game author writes no networking code: one game module runs in the browser and headless on the server. Lockstep and rollback are deferred.
- **The client's input lead stays inside the server's window.** The gate files input at most `maxAhead` ticks ahead (30 on the server) and drops the rest as `early`, before any margin is measured — so an early report means the lead is too long, and the misses it causes are the client's own doing. The client halves its lead on `early` — always by at least one, so a lead of 0 or below still steps down when an inflated round-trip estimate alone overshoots — and never lengthens it for misses in the same report (20 Nov 2026: one load stall pushed the lead past 30, every later message was dropped, each report asked for more lead up to 120, and the player's input never reached the server again; the engine's own test harness hid it by giving its gate `maxAhead: 120`, a stand-in not checked against the real server's — see [[working-style]]).
- The full rules are in `docs/guide/multiplayer.md` and `docs/contributing/determinism.md`. The headless rules that make this possible also shape [[idiomatic-m2d]] actors.

## Backlog

**3D online.** A 3D match runs headless, and two yard clients agree on every transform (`server3d.test.js`). Reviewed against the code on 17 Nov 2026.

| Gap | Done when |
| --- | --- |
| The 3D physics world has no `snapshot`/`restore` (`rapier3dBackend.ts` lists it as unported) | `game.snapshot()` works in a 3D game; this is what prediction rewinds to |
| Prediction (`Predictor` refuses 3D) | The local hero predicts and reconciles. The yard's hero already steers from the tick's `input.heading`, which is what a replay feeds it |
| Interpolation (a 3D replica draws the latest server transform) | Remote entities blend between states, with rotations slerped |
| Interest measures x and y (`Replicator.#relevant`) | Interest and event culling measure ground or full distance in 3D, documented in metres |
| No 3D demo online | The yard joins with `?online=`, with a two-client test like `keepOnline.test.js` |
| `guide/multiplayer.md` says prediction and interpolation are 2D only | That sentence is gone |

**Datagrams over WebTransport.** Larger than it looks:

- Node has no HTTP/3 server, so this needs a QUIC package and TLS even locally, weighed against running from a fresh checkout.
- The `Replicator` diffs against what it last *sent*, so a dropped datagram loses a change. Datagrams need per-client *acknowledged* baselines, which is a protocol change.
- `NetClient` is already transport-agnostic, so the adapter is the small half.

**Later:** lockstep or rollback. `game.snapshot()` and `restore()` are the rewind; what is missing is Rapier's deterministic build (the engine uses `rapier2d-compat`) and a deterministic math module in place of `Math.sin`, `cos`, `atan2`, `exp` and `hypot`, whose results may differ between JavaScript engines.

## Record

Shipped, Nov 2026: determinism hardening, headless simulation, players and intents, snapshots, the `m2d-server` host with replication, prediction, interpolation and interest (2D). Cinder Keep plays online.

Related: [[3d]] (the yard is the 3D online target), [[editor]] (hosting a session from the editor), [[engine-surface]] (spawn points for joins)
