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
import menuMusic from '../shared/music/menu.mp3';

const game = new M2D(canvas, {
  sounds: { jump: jumpSound, coin: coinSound, gameOver: gameOverSound },
  music: { menu: menuMusic, game: gameMusic }
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

Default volumes are 1 for effects and 0.5 for music. `playMusic` while muted is dropped. `game.reset()` stops the music. The engine plays the `gameOver` sound, if one is loaded, when the game ends.

Scene hooks are the usual place to switch music.

```javascript
game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default,
  onEnter() { game.soundManager.playMusic('game'); }
});
```

## Generated effects

The example games synthesize their sound effects in `examples/src/shared/audio.js` and ship two licensed music tracks. Credits and license terms are in `THIRD_PARTY_NOTICES.md` at the repository root.

## Demo source

The `synthesize` function is the same approach the examples use. A sound URL can be anything an audio element plays, including a data URL.

<<< @/demos/sound.js
