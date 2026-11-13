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
 *   camera, light, HUD and the stair's news are its scene's (keep.json);
 *   hooks.js opens the satchel and the shop. This file is the page around
 *   it: the project boot, the menu and the connection to a match.
 */
import { bootProject } from 'm2d-engine/core/project.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIScreen } from 'm2d-engine/core/ui/screen.js';
import { NetClient } from 'm2d-engine/net/client.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { lastTransmission, audioOption } from '../shared/audio.js';
import { menuBackdrop } from './menuBackdrop.js';
import project from './m2d.project.json';
import * as definition from './game.js';
import * as hooks from './hooks.js';

const ONLINE = new URLSearchParams(location.search).get('online');

const game = await bootProject(document.getElementById('screen'), {
  project,
  definition,
  hooks,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  // Vite's BASE_URL is '/' on the dev server and '/m2d-engine/examples/' in the build.
  basePath: import.meta.env.BASE_URL + 'iso/',
  options: { music: { menu: { src: lastTransmission, volume: 0.7 } } },
  setup
});

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
    const net = await NetClient.connect(game, { url: `${ONLINE}/play`, ticket, schema: definition.KEEP_INPUT });
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

/** Online, leaving the keep leaves the match: Escape, or three seconds after descending. Alone, the scene's rules do it. */
function leaveMatch() {
  game.net?.close(1000, 'left');
}

function setup(game) {
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
  game.settings.addOption(audioOption(game));
  game.input.on('keydown', (event) => {
    if (game.net && game.actions.codes('menu').includes(event.code)) { leaveMatch(); event.consume(); }
  });
  game.players.local.on('descended', () => { if (game.net) game.time.after(3, leaveMatch, { unscaled: true }); });
}

if (new URLSearchParams(location.search).has('debug')) window.cinderKeep = { game };
