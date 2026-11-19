# Gameplay helpers

Small pieces a game is built from that are neither entities nor UI. Each is documented where it lives; this page is the index.

## Quest

`core/quest.js`. A line of stages: `new Quest([{ id, objective }, ...], { onStage })`. Starts on the first; `advance()` moves to the next, `complete(id)` moves past a named stage if it is the current one (so an event can report "the part where you talk to Oswin is done" without knowing what follows), `goTo(id)` jumps. `stage`, `id`, `objective` and `done` describe where it is; `is(id)` and `passed(id)` test it. `onStage(stage, previous)` fires on every change. Who says what, what unlocks and what the HUD shows hang off that hook in the game.

```javascript
const quest = new Quest([
  { id: 'start', objective: 'Speak to Maren' },
  { id: 'findOswin', objective: 'Find Oswin, east past the pond' },
  { id: 'done', objective: 'The grove is quiet' }
], { onStage: (stage) => { hud.text = stage.objective; } });

quest.complete('start');   // after Maren's last line
```

## Abilities, Footsteps, ProximityPrompt

Constraints; see [Built-in constraints](./constraints#abilities).

## Npc

An actor of the kit's; see [The kit](./kit#m2d-kit-actors).

## UIDialogue, UIMinimap, UIAbilityBar, UIMeter

UI components; see [UI components](./ui#uidialogue). A level's `hud` builds each from scene data (`dialogue`, `minimap`, `abilityBar`, `meter`), and a rule's `say` action opens the dialogue; see [`hud`](./scene-format#hud).

## Sight

`core/senses.js`. Pure queries for simulation code that looks at the world — an NPC deciding whether it sees the player. Nothing here keeps state: a sensing interval or a remembered last-seen position is the caller's, as plain fields a snapshot carries.

```javascript
import { canSee } from 'm2d-engine/core/senses.js';

// In a constraint's fixedUpdate, every `senseInterval` seconds:
if (canSee(this.entity, player, { range: 300, cone: Math.PI / 2, facing: this.facing })) {
  this.lastSeen = { ...player.position };
}
```

- `canSee(viewer, target, { range, cone, facing, blockers })` — whether the viewer sees the target: within `range` on the ground plane ((x, y) flat, (x, z) in a 3D scene), inside the `cone` radians centred on `facing` (the default 2π sees all around), and with an unobstructed line between them. `target` is an entity or a bare point (a noise, a last-seen position); neither party's own body counts as cover.
- `lineOfSight(game, from, to, { blockers, ignore })` — just the obstruction test between two points.

What blocks sight is the `blockers` collision layers; unset, anything that is not a dynamic body — the level's walls and platforms — so a crowd never hides its quarry by accident. Sensors never block.

## Directions and arcs

`Angle` in `core/math.js` gained `normalize(angle)`, `sector(angle, count)`, `direction8(angle)` (one of `DIRECTIONS_8`: `right`, `down_right`, `down`, `down_left`, `left`, `up_left`, `up`, `up_right`, clockwise on screen) and `inArc(angle, centre, arc)`.
