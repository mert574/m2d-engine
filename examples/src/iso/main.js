/**
 * Cinder Keep: an isometric dungeon.
 *
 * What this example demonstrates:
 *
 * - the isometric projection: `world.projection` in the scene JSON, so
 *   every position is drawn through it while physics, movement and the
 *   depth sort stay on the flat ground plane;
 * - a tile layer drawn as diamonds over only the carved cells, with
 *   nearest-neighbour sampling for pixel art drawn at twice its size;
 * - click-to-move through `PointerMove`, which reads the pointer's ground
 *   position from the input snapshot, and arrow keys along the screen's
 *   axes through `KeyboardControl`'s `inputSpace`;
 * - wall blocks as entities on tile footprints that fade when the knight
 *   is behind them and cast torchlight shadows from their projected
 *   diamonds;
 * - Flare's isometric hero and creatures with eight facings, the engine's
 *   `Attack` swung at the heading, and the minimap drawing the ground plane;
 * - a satchel and a quartermaster driven through intents (keepIntents.js):
 *   buying, selling, moving and using items are requests the simulation
 *   validates and runs as the player who sent them, the same path a client
 *   takes on a server. The screens that send them block input without
 *   pausing (satchelUI.js);
 * - the same keep played online: the rules live in game.js, which
 *   keepMatch.js runs on an m2d-server (server.mjs), and with
 *   `?online=ws://host:port` this page joins it as a client. The keep's
 *   presentation (camera, light, HUD, screens and sound) is hooks.js,
 *   which the editor's play mode builds too; this file is the page around
 *   it: the menu, settings and the connection to a match.
 */
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { NetClient } from 'm2d-engine/net/client.js';
import { UIScreen } from 'm2d-engine/core/ui/screen.js';
import { WORLD, KEEP_INPUT, registerKeep, keepScene } from './game.js';
import { sceneHooks, OPTIONS } from './hooks.js';
import { lastTransmission, audioOption } from '../shared/audio.js';

const canvas = document.getElementById('screen');
await initPhysics();

/** `?online=ws://host:port`: an m2d-server running keepMatch.js (see server.mjs). */
const ONLINE = new URLSearchParams(location.search).get('online');

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 800,
  worldWidth: WORLD.width,
  worldHeight: WORLD.height,
  // The tiles are pixel art drawn at twice their size.
  ...OPTIONS,
  basePath: import.meta.env.BASE_URL + 'iso/',
  // The keep's own sounds and its music are loaded by its hooks (hooks.js);
  // the menu's track is the page's.
  music: { menu: { src: lastTransmission, volume: 0.7 } }
});

registerKeep(game);

/** A line at the top of whatever is showing, for connection news. */
function status(text, seconds = 4) {
  game.ui.get('netStatus')?.close();
  const screen = game.ui.push(new UIScreen({ name: 'netStatus', blocking: false, transition: 'fade' }));
  // Top centre: the corners hold the HUD and the bottom the ability bar.
  screen.add(new UIText({ x: 0, y: 22, anchor: 'top', align: 'center', text, fontSize: '16px', letterSpacing: 1, color: '#ffc890' }));
  game.time.after(seconds, () => screen.close(), { unscaled: true });
}

/** Join the match server as a fresh knight. The server's welcome loads the keep. */
async function playOnline() {
  if (game.net) return;
  const name = `knight-${Math.random().toString(36).slice(2, 8)}`;
  status('Joining the keep…', 10);
  try {
    // A development server hands out tickets; a real one gets them from its lobby.
    const ticketUrl = `${ONLINE.replace(/^ws/, 'http')}/dev/ticket?player=${name}&match=keep`;
    const ticket = await (await fetch(ticketUrl)).text();
    const net = await NetClient.connect(game, { url: `${ONLINE}/play`, ticket, schema: KEEP_INPUT });
    status('In the keep with whoever else is here');
    net.on('close', ({ code, reason }) => {
      game.replica = false;
      game.net = null;
      game.sceneManager.switchTo('mainMenu');
      status(code === 1000 ? 'Left the keep' : `Disconnected: ${reason || code}`);
    });
  } catch (error) {
    game.replica = false;
    game.net = null;
    status(`Could not join: ${error.message}`);
  }
}

/** Back to the menu, alone or online. */
function leaveKeep() {
  if (game.net) game.net.close(1000, 'left');
  else game.sceneManager.switchTo('mainMenu');
}

registerMainMenu(game, {
  title: 'Cinder Keep',
  subtitle: 'an isometric view',
  hint: 'Click to walk · Arrows move · X swings · 1 2 3 abilities · Wheel zooms · O for settings',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Descend', onSelect: () => game.sceneManager.switchTo('keep') },
    ...(ONLINE ? [{ text: 'Descend together', onSelect: () => playOnline() }] : []),
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

game.sceneManager.addScene('keep', {
  ...keepScene(game, { loadScene: async () => (await import('./scenes/keep.json')).default }),
  ...sceneHooks(game, { leave: leaveKeep }).keep
});

new SettingsMenu(game).addOption(audioOption(game));

if (new URLSearchParams(location.search).has('debug')) window.cinderKeep = { game };

game.start();
