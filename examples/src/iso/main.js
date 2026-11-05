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
 *   `?online=ws://host:port` this page joins it as a client. This file is
 *   presentation only: camera, light, HUD, screens and sound.
 */
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIMinimap } from 'm2d-engine/core/ui/minimap.js';
import { UIMeter } from 'm2d-engine/core/ui/meter.js';
import { UIAbilityBar } from 'm2d-engine/core/ui/abilityBar.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { NetClient } from 'm2d-engine/net/client.js';
import { UIScreen } from 'm2d-engine/core/ui/screen.js';
import { Wall, Ember, Stair, Creature, Quartermaster } from './keepActors.js';
import { WORLD, KEEP_INPUT, registerKeep, keepScene } from './game.js';
import { SatchelBar, SatchelScreen, ShopScreen } from './satchelUI.js';
import {
  attackSound, damageSound, coinSound, levelCompleteSound, gameOverSound,
  spawnSound, solvedSound, lastTransmission, november, audioOption
} from '../shared/audio.js';
import step1 from '../oblique/sounds/footstep-grass-1.wav';
import step2 from '../oblique/sounds/footstep-grass-2.wav';
import step3 from '../oblique/sounds/footstep-grass-3.wav';
import step4 from '../oblique/sounds/footstep-grass-4.wav';
import cleaveIcon from './textures/icons/cleave.png';
import dashIcon from './textures/icons/dash.png';
import shieldIcon from './textures/icons/emberShield.png';

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
  textureFilter: 'nearest',
  basePath: import.meta.env.BASE_URL + 'iso/',
  sounds: {
    attack: attackSound, damage: damageSound, coin: coinSound,
    levelComplete: levelCompleteSound, gameOver: gameOverSound,
    dash: spawnSound, shield: solvedSound,
    step1: { src: step1, volume: 0.5 }, step2: { src: step2, volume: 0.5 },
    step3: { src: step3, volume: 0.5 }, step4: { src: step4, volume: 0.5 }
  },
  music: { menu: { src: lastTransmission, volume: 0.7 }, game: { src: november, volume: 0.6 } }
});

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image;
}
const icons = { cleave: loadImage(cleaveIcon), dash: loadImage(dashIcon), emberShield: loadImage(shieldIcon) };

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

let unsubscribe = [];
/** The trader in the start room, while the keep is loaded. */
let quartermaster = null;
/** Presentation state for the HUD. */
let hud = null;

game.sceneManager.addScene('keep', {
  ...keepScene(game, { loadScene: async () => (await import('./scenes/keep.json')).default }),

  onShow() {
    const scene = game.sceneManager.getCurrentScene();
    game.soundManager.playMusic('game');

    // The camera moves on the render plane, so its bounds are the
    // projected extent of the ground.
    const bounds = game.projection.boundsOf(0, 0, WORLD.width, WORLD.height);
    game.camera.bounds = bounds;
    game.camera.lerp = 0.1;
    game.camera.zoom = 1;
    const start = game.player.renderAnchor;
    game.camera.x = start.x;
    game.camera.y = start.y;

    game.renderer.setAmbientLight('#575062');
    game.renderer.setPostEffects({
      bloom: { threshold: 0.65, strength: 0.4, blur: 22 },
      vignette: { strength: 0.5, start: 0.55 },
      grade: { shadows: '#1a1422', highlights: '#ffd9b0', amount: 0.3, saturation: 1.05, contrast: 1.06 }
    });

    const entities = [...game.entities];
    const stair = entities.find(e => e instanceof Stair);
    quartermaster = entities.find(e => e instanceof Quartermaster) ?? null;
    const local = game.players.local;

    const ui = scene.ui;
    const objective = ui.add(new UIText({ x: 20, y: 16, anchor: 'top-left', align: 'left', text: '', fontSize: '15px', letterSpacing: 1, color: '#ffc890' }));
    ui.add(new UIMeter(() => {
      const health = game.player?.getConstraint('health');
      return health ? { current: health.currentHealth, max: health.maxHealth } : null;
    }, { x: 20, y: 44, color: k => (k > 0.35 ? '#e0905a' : '#ff5a4e') }));
    const notice = ui.add(new UIText({ x: 0, y: -120, anchor: 'center', align: 'center', text: '', fontSize: '30px', fontWeight: '600', letterSpacing: 3, color: '#ffe9cc' }));
    ui.add(new UIText({
      x: -20, y: -16, anchor: 'bottom-right', align: 'right',
      text: 'Click to walk · Arrows move along the screen · X swings · 1 2 3 abilities · I satchel · E trades · Wheel zooms',
      fontSize: '13px', color: 'rgba(240, 230, 220, 0.55)'
    }));
    const minimap = ui.add(new UIMinimap(game, {
      size: 220, bounds: WORLD, background: 'rgba(14, 12, 18, 0.9)', borderColor: 'rgba(255, 200, 140, 0.45)',
      plot(entity) {
        if (entity instanceof Wall) return { shape: 'square', color: 'rgba(120, 110, 100, 0.9)', size: 2.4 };
        if (entity instanceof Ember) return { shape: 'dot', color: '#ff9a4a' };
        if (entity instanceof Creature) return { shape: 'dot', color: '#b0e0ff', size: 2 };
        if (entity instanceof Stair) return { shape: 'ring', color: entity.sealed ? '#9a70ff' : '#ffc878', size: 5 };
        if (entity.name === 'Player' && entity !== game.player && !entity.dead) return { shape: 'dot', color: '#ffe3b0', size: 3 };
        return null;
      }
    }));
    minimap.target = stair ?? null;
    ui.add(new UIAbilityBar(() => game.player?.getConstraint('abilities') ?? null, { icons, borderColor: 'rgba(255, 200, 140, 0.45)' }));
    ui.add(new SatchelBar(local));

    let noticeTimer = null;
    const say = (text) => {
      notice.text = text;
      noticeTimer?.cancel();
      noticeTimer = game.time.after(2.4, () => { notice.text = ''; }, { unscaled: true });
    };
    // Counted from what is in the world, so a client sees the same as the server.
    hud = { objective, stair, total: entities.filter(e => e instanceof Ember).length };

    // What the keep's rules (game.js) tell this player.
    let descending = false;
    unsubscribe.push(
      local.on('stair-open', () => say('THE STAIR OPENS')),
      local.on('stair-sealed', () => say('THE STAIR IS SEALED · GATHER THE EMBERS')),
      local.on('fallen', () => say('YOU FELL · BACK IN A MOMENT')),
      local.on('descended', () => {
        if (descending) return;
        descending = true;
        say('YOU DESCEND');
        game.soundManager.playSound('levelComplete');
        game.time.after(3, leaveKeep, { unscaled: true });
      })
    );

    unsubscribe.push(game.input.on('scroll', (event) => {
      const factor = Math.exp(-event.scroll.y * 0.0015);
      game.camera.zoom = Math.min(1.8, Math.max(0.6, game.camera.zoom * factor));
      event.consume();
    }));
    unsubscribe.push(game.input.on('keydown', (event) => {
      if (event.code === 'Escape') { leaveKeep(); event.consume(); }
      else if (event.code === 'KeyI' && !game.ui.capturesInput) { game.ui.push(new SatchelScreen(game, local)); event.consume(); }
    }));
  },

  onUpdate() {
    if (hud) {
      const left = [...game.entities].filter(e => e instanceof Ember).length;
      hud.objective.text = hud.stair?.sealed === false
        ? 'THE STAIR IS OPEN · DESCEND'
        : `GATHER THE EMBERS · ${hud.total - left} / ${hud.total}`;
    }
    // E by the quartermaster opens the shop. Which trader is meant follows
    // from where the knight stands, so this is a key, not an intent; what
    // is bought is.
    if (quartermaster?.playerNear && game.input.justPressed('KeyE') && !game.ui.capturesInput) {
      game.ui.push(new ShopScreen(game, game.players.local, quartermaster));
    }
  },

  onDrawBackground() {
    // The rock beyond the floor: a dark wash under everything so the view
    // never shows the clear colour at the edges of the keep.
    const area = game.camera.getVisibleArea();
    game.renderer.drawRect({ x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fillStyle: '#0b0a10' });
  },

  onDraw() {
    if (game.renderer.supports('lights')) return;
    const area = game.camera.getVisibleArea();
    game.renderer.drawRect({ x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fillStyle: 'rgba(20, 14, 30, 0.35)' });
  },

  onHide() {
    for (const stop of unsubscribe) stop();
    unsubscribe = [];
    quartermaster = null;
    hud = null;
    for (const name of ['satchel', 'shop', 'itemOptions']) game.ui.get(name)?.close();
    game.renderer.setAmbientLight(null);
    game.renderer.setPostEffects(null);
  }
});

new SettingsMenu(game).addOption(audioOption(game));

if (new URLSearchParams(location.search).has('debug')) window.cinderKeep = { game };

game.start();
