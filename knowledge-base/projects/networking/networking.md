# Networking

Goal: multiplayer through an authoritative server, with no networking code in the game. Roadmap line: "Networking".

## Decisions

- **Server-authoritative only.** The server simulates and is the only authority. Clients send held input and declared intents, nothing else. The game author writes no networking code: one game module runs in the browser and headless on the server. Lockstep and rollback are deferred.
- The full rules are in `docs/guide/multiplayer.md` and `docs/contributing/determinism.md`. The headless rules that make this possible also shape [[idiomatic-m2d]] actors.

## Backlog

**3D online.** A 3D match runs headless, and two yard clients agree on every transform (`server3d.test.js`).

| Gap | Done when |
| --- | --- |
| Prediction (`Predictor` refuses 3D) | The local hero predicts and reconciles. Needs a 3D movement constraint, since the yard's `Hero` steers in its own `fixedUpdate` |
| Interpolation (skipped when `dimensions` is 3) | Remote entities blend between states, with rotations slerped |
| Interest measures x and y (in 3D, ground and *up*) | Interest and event culling measure ground or full distance, documented in metres |
| No 3D demo online | The yard joins with `?online=`, with a two-client test like `keepOnline.test.js` |
| `guide/multiplayer.md` says prediction is 2D only | That sentence is gone |

**Datagrams over WebTransport.** Larger than it looks:

- Node has no HTTP/3 server, so this needs a QUIC package and TLS even locally, weighed against running from a fresh checkout.
- The `Replicator` diffs against what it last *sent*, so a dropped datagram loses a change. Datagrams need per-client *acknowledged* baselines, which is a protocol change.
- `NetClient` is already transport-agnostic, so the adapter is the small half.

**Later:** lockstep or rollback, on Rapier's deterministic build and a deterministic math module.

## Record

Shipped, Nov 2026: determinism hardening, headless simulation, players and intents, snapshots, the `m2d-server` host with replication, prediction, interpolation and interest (2D). Cinder Keep plays online.

Related: [[3d]] (the yard is the 3D online target), [[editor]] (hosting a session from the editor)
