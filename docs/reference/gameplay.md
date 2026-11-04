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

An actor; see [Built-in actors](./actors#npc).

## UIDialogue, UIMinimap, UIAbilityBar, UIMeter

UI components; see [UI components](./ui#uidialogue).

## Directions and arcs

`Angle` in `core/math.js` gained `normalize(angle)`, `sector(angle, count)`, `direction8(angle)` (one of `DIRECTIONS_8`: `right`, `down_right`, `down`, `down_left`, `left`, `up_left`, `up`, `up_right`, clockwise on screen) and `inArc(angle, centre, arc)`.
