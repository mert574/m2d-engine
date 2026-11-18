# Sound

`game.soundManager` plays one-shot effects and looping music through HTML audio elements.

<Demo name="sound">
Three synthesized effects, a looping synthesized track, a volume control and mute. Every sound here is a WAV built in code and loaded as a data URL.
</Demo>
 Browsers block audio until the player interacts with the page. Music requested before the first click or key press is held and starts then. A sound effect requested before that is attempted at once and lost if the browser refuses it.

## Loading

Pass sounds and music to the engine options. Each key becomes a name to play by. Values are URLs, which can come from imports.

```javascript
import jumpSound from './assets/jump.mp3';
import menuMusic from './assets/menu.mp3';

const game = new M2D(canvas, {
  sounds: { jump: jumpSound, coin: coinSound, step: { src: stepSound, volume: 0.7 } },
  music: { menu: menuMusic, game: { src: gameMusic, volume: 0.5 } }
});
```

Or load at runtime.

```javascript
game.soundManager.loadSound('hit', hitSound);
game.soundManager.loadMusic('boss', bossMusic);
```

## Playing

```javascript
game.soundManager.playSound('jump');    // overlapping plays are allowed
game.soundManager.playMusic('game');    // stops the current track and loops the new one
game.soundManager.stopMusic();
game.soundManager.toggleMute();        // muting stops the music. Unmuting does not restart it
game.soundManager.setSoundVolume(0.8);  // 0 to 1
game.soundManager.setMusicVolume(0.4);
```

## Volumes

The two volumes are cvars, `s_music` and `s_effects`, and the settings menu has a row for each under **Sound**. They are saved like the display settings, so a player who turns the music down finds it down next time. The sound manager holds the live value and the cvar is the view onto it, so a game's own slider calling `setMusicVolume` moves the menu row too, and `s_music 0.4` in the console moves both.

Default volumes are 0.15 for effects and 0.3 for music: sources are mixed loud, and games layer sounds over music. Each effect plays with a few cents of random detune so a repeated sound reads as separate events. `playMusic` while muted is dropped. `game.reset()` stops the music. The engine plays the `gameOver` sound, if one is loaded, when the game ends.

A sound that should keep going, and change while it does, is a loop. `loop` plays one voice of a loaded sound until stopped and returns a handle whose rate and volume the game steers each frame: an engine note that follows the revs, tyres that squeal while the car slides. Mute and the sound volume apply to it like any other effect. Stop it when the thing it belongs to goes away.

```javascript
const engine = game.soundManager.loop('engine', { volume: 0.4, rate: 0.7 });
engine.setRate(0.6 + revs * 1.1);   // pitch follows the rate
engine.setVolume(0.35 + revs * 0.45);
engine.stop();
```

A scene says what plays while it shows. `world.music` (a level) or `music` (a UI scene) plays a track. A looping sound under the level — wind, a hum, a generator — is the kit's `AmbientSound`, placed like any object: faded in from silence, stopped when its entity goes or the scene leaves, and with a `radius` heard only near where it stands.

```json
"assets": { "sounds": { "wind": { "url": "sounds/wind.ogg" } }, "music": { "theme": { "url": "music/theme.ogg" } } },
"world": { "music": { "track": "theme" } },
"prefabs": {
  "wind": { "actor": "AmbientSound", "physics": { "bodyType": "static", "isSensor": true, "layer": "none" }, "properties": { "sound": "wind", "volume": 0.6, "fadeIn": 2 } }
},
"layers": [{ "name": "atmosphere", "objects": [{ "id": "wind-1", "prefab": "wind", "x": 0, "y": 0, "width": 16, "height": 16 }] }]
```

The game registers it with `registerKitScenery(game)` from `m2d-kit/scenery`; see [the kit](../reference/kit#m2d-kit-scenery).

A rule plays an effect with `{ "do": "sound", "key": "levelComplete" }`. See [the scene format](../reference/scene-format#world).

## The examples' sound

The example games ship free sampled effects (Kenney's *Interface Sounds*, CC0) and free music tracks, each copied into the project's own `sounds/` and `music/` folders beside the scenes that name them. One effect is synthesized: Night Circuit's electric motor whine (`examples/src/circuit/evSound.js`), pure tones that must slide with speed. Credits and license terms are in `THIRD_PARTY_NOTICES.md` at the repository root.

## Demo source

The demo below synthesizes its sounds so the page needs no audio files. A sound URL can be anything an audio element plays, including a data URL.

<<< @/demos/sound.js
