import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { GardenBackdrop } from './gardenBackdrop.js';
import { TILE, COURT_PX, MAPS, buildMap, wallObjects } from './courtyards.js';
import { tileTexture } from '../shared/textures.js';
import { solvedSound, symmetricalTree, redux, audioOption } from '../shared/audio.js';
import lawnTexture from './textures/lawn.jpg';
import hedgeTexture from './textures/hedge.jpg';

/**
 * Hedgerow Court: a hedge-maze garden in three maps, and the engine's
 * single-screen perspective. Each court is exactly one screen; the camera's
 * `'rooms'` mode holds it there and glides to the next court as the
 * gardener walks through a gate. Find the fountain at the far end of each
 * map to open the next.
 */

/** How long a map's title hangs over its first court, in seconds. */
const TITLE_HOLD = 3;

/** Daisies bloom this far apart along the walked path, in px. */
const TRAIL_SPACING = 22;
/** And this many at most, oldest mown first. */
const TRAIL_LIMIT = 600;

/**
 * A hedge, in texture, in the sun. The moss tiles at its own scale (see
 * `tileTexture`); the sun comes from the top of the screen, so the top edge
 * catches light, the bottom edge sits in its own leaves, and a soft shadow
 * falls onto the lawn below.
 */
class HedgeWall extends Platform {
  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const w = this.size.x;
    const h = this.size.y;
    const left = pos.x - w / 2;
    const top = pos.y - h / 2;

    renderer.drawRect({
      x: left + 4, y: top + 6, width: w, height: h,
      fillStyle: 'rgba(30, 48, 26, 0.35)'
    });
    tileTexture(renderer, this.sprite?.image, { x: left, y: top, width: w, height: h }, 128);
    // Thin rects, not lines or strokes: rects ride the sprite batch, and a
    // court draws dozens of hedges.
    renderer.drawRect({
      x: left + 1, y: top + 0.5, width: w - 2, height: 2.5,
      fillStyle: 'rgba(255, 248, 200, 0.22)'
    });
    renderer.drawRect({
      x: left + 1, y: top + h - 3, width: w - 2, height: 2.5,
      fillStyle: 'rgba(14, 30, 12, 0.4)'
    });
    renderer.drawRect({
      x: left, y: top, width: 1.5, height: h,
      fillStyle: 'rgba(22, 44, 20, 0.3)'
    });
    renderer.drawRect({
      x: left + w - 1.5, y: top, width: 1.5, height: h,
      fillStyle: 'rgba(22, 44, 20, 0.3)'
    });
  }
}

/**
 * The gardener: a straw hat seen from above, leaving daisies in the lawn
 * behind it. Movement is the stock keyboard constraint; the trail is the
 * maze aid — the courts you have walked are the courts in bloom.
 */
class Gardener extends Entity {
  name = 'Player';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    // Direct-velocity movement (continuous: false): crisp stop-and-go suits a
    // maze better than building momentum against air friction.
    this.addConstraint('movement', new KeyboardControl(this, {
      verticalMovement: true, continuous: false, maxSpeed: 240
    }));

    this.clock = 0;
    /** @type {Array<{x: number, y: number, t: number, k: number}>} */
    this.trail = [];
  }

  resetTrail() {
    this.trail = [];
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;

    const pos = this.position;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > TRAIL_SPACING) {
      this.trail.push({ x: pos.x, y: pos.y, t: this.clock, k: this.trail.length });
      if (this.trail.length > TRAIL_LIMIT) this.trail.shift();
    }
  }

  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;

    // The daisies: five white petals round a gold eye, blooming in over a
    // moment, swaying a little once grown.
    for (const daisy of this.trail) {
      const age = this.clock - daisy.t;
      const grown = Math.min(1, age / 0.7);
      const sway = Math.sin(this.clock * 1.3 + daisy.k * 2.1) * 0.6;
      const radius = 2.1 * grown;
      for (let petal = 0; petal < 5; petal++) {
        const angle = daisy.k * 1.7 + petal * (Math.PI * 2 / 5);
        renderer.drawArc({
          x: daisy.x + sway + Math.cos(angle) * 2.6 * grown,
          y: daisy.y + Math.sin(angle) * 2.6 * grown,
          radius,
          fillStyle: '#fdf8ee',
          globalAlpha: 0.85 * grown
        });
      }
      renderer.drawArc({
        x: daisy.x + sway, y: daisy.y, radius: 1.5 * grown,
        fillStyle: '#edb63e', globalAlpha: grown
      });
    }

    // The gardener: a shadow, shoulders in denim, and the hat — brim, band
    // and crown — bobbing with the walk.
    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.y);
    const bob = speed > 10 ? Math.sin(this.clock * 11) * 1.2 : 0;
    renderer.drawArc({ x: pos.x + 3, y: pos.y + 4, radius: 12, fillStyle: 'rgba(28, 46, 24, 0.35)' });
    renderer.drawArc({ x: pos.x, y: pos.y, radius: 10, fillStyle: '#4e6e95' });
    renderer.drawArc({
      x: pos.x, y: pos.y + bob, radius: 11.5,
      fillStyle: {
        type: 'radial', x: pos.x - 3, y: pos.y + bob - 3, r0: 0, r1: 12,
        stops: [{ offset: 0, color: '#f0d890' }, { offset: 1, color: '#d4b05e' }]
      }
    });
    renderer.drawArc({
      x: pos.x, y: pos.y + bob, radius: 11.5,
      strokeStyle: 'rgba(130, 96, 36, 0.55)', lineWidth: 1.2, fill: false
    });
    renderer.drawArc({ x: pos.x, y: pos.y + bob, radius: 5.5, fillStyle: '#e3c274' });
    renderer.drawArc({
      x: pos.x, y: pos.y + bob, radius: 5.8,
      strokeStyle: '#a0543c', lineWidth: 2, fill: false
    });

    for (const constraint of this.constraints.values()) {
      constraint.draw();
    }
  }
}

/** The banner in the current scene's UI, or null between scenes. */
let courtBanner = null;
/** The map being played, set by each court scene's hooks. */
let currentMap = null;

/**
 * Screen-space banner for map titles and the fountain's send-off, shown for
 * a stretch of game time. A game-time timer hides it, so it waits out a
 * pause instead of expiring behind the menu.
 */
class CourtBanner extends UIElement {
  constructor() {
    super({ anchor: 'top', y: 60 });
    this.text = null;
    this.hideTimer = null;
  }

  show(text, hold = 2.5) {
    this.text = text;
    this.hideTimer?.cancel();
    this.hideTimer = this.game.time.after(hold, () => { this.text = null; });
  }

  draw() {
    if (!this.text) return;
    this.paint.drawText({
      text: this.text,
      x: this.x, y: this.y,
      fillStyle: '$color.status.success',
      fontSize: '$font.size.heading',
      fontWeight: '$font.weight.bold',
      textAlign: 'center', textBaseline: 'middle',
      shadow: '$elevation.medium'
    });
  }
}

/**
 * The fountain at the far end of a map. Touching it finishes the map:
 * the banner, the chime, and the glide to the next court — or, after the
 * last map, back out to the garden plan.
 */
class Fountain extends Entity {
  name = 'Fountain';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.clock = 0;
    this.triggered = false;
    this.lit = game.renderer.supports('lights');
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (this.triggered || other.entity?.name !== 'Player') return;
    this.triggered = true;

    const map = currentMap;
    courtBanner?.show(map.banner, map.last ? 3.4 : 2.5);
    this.game.soundManager.playSound('solved');
    const next = MAPS[MAPS.indexOf(map) + 1];
    this.game.time.after(map.last ? 3.6 : 1.8, () => {
      this.game.sceneManager.switchTo(map.last ? 'mainMenu' : next.scene);
    });
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
  }

  draw() {
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;

    // The basin: stone ring, water, two ripples always on their way out,
    // and the jet's sparkle turning over the surface.
    renderer.drawArc({ x: pos.x + 2, y: pos.y + 3, radius: 30, fillStyle: 'rgba(30, 48, 26, 0.3)' });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 30,
      fillStyle: {
        type: 'radial', x: pos.x - 6, y: pos.y - 8, r0: 0, r1: 32,
        stops: [{ offset: 0, color: '#cfc9b2' }, { offset: 1, color: '#a39d84' }]
      }
    });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 23,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: 23,
        stops: [{ offset: 0, color: '#bfe6f2' }, { offset: 1, color: '#5fa3c4' }]
      }
    });
    for (let i = 0; i < 2; i++) {
      const phase = (this.clock * 0.45 + i * 0.5) % 1;
      renderer.drawArc({
        x: pos.x, y: pos.y, radius: 4 + phase * 17,
        strokeStyle: '#e8f6fc', lineWidth: 1.5, fill: false,
        globalAlpha: (1 - phase) * 0.6
      });
    }
    for (let i = 0; i < 3; i++) {
      const angle = this.clock * 1.4 + i * (Math.PI * 2 / 3);
      renderer.drawArc({
        x: pos.x + Math.cos(angle) * 12,
        y: pos.y + Math.sin(angle) * 12,
        radius: 1.8,
        fillStyle: '#ffffff',
        globalAlpha: 0.8
      });
    }
    const spout = 0.85 + 0.15 * Math.sin(this.clock * 6);
    renderer.drawArc({ x: pos.x, y: pos.y, radius: 3.4 * spout, fillStyle: '#f3fbff' });

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y, radius: 130, color: '#dff2ff', intensity: 0.4 * spout
      });
    }
  }
}

// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const LAST_MAP = MAPS[MAPS.length - 1];
const game = new M2D(document.getElementById('screen'), {
  pointerLock: false,
  initialScene: 'mainMenu', width: COURT_PX.width, height: COURT_PX.height,
  worldWidth: LAST_MAP.courtsX * COURT_PX.width,
  worldHeight: LAST_MAP.courtsY * COURT_PX.height,
  sounds: { solved: solvedSound },
  music: { menu: symmetricalTree, game: redux }
});
game.registerActor('Gardener', Gardener);
game.registerActor('Platform', HedgeWall);
game.registerActor('Fountain', Fountain);
registerMainMenu(game, {
  title: 'Hedgerow Court',
  subtitle: 'a garden in three courts',
  hint: 'Arrows move · O for settings',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Start Game', onSelect: () => game.sceneManager.switchTo(MAPS[0].scene) },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

// The garden around the courts, built per entry and torn down on exit so
// its warm grade and post pass never leak into the menu.
let backdrop = null;

for (const mapConfig of MAPS) {
  // The map is deterministic, so build it once and let the scene and its
  // backdrop both place things from the same layout.
  let map = null;
  const built = () => (map ??= buildMap(mapConfig));

  game.sceneManager.addScene(mapConfig.scene, {
    fetch: async () => ({
      version: 1, name: mapConfig.scene, type: 'level', gameType: 'topDown',
      world: { width: built().width, height: built().height, gravity: { x: 0, y: 0 } },
      assets: { spritesheets: {
        lawn: { url: lawnTexture, frameWidth: 256, frameHeight: 256 },
        hedge: { url: hedgeTexture, frameWidth: 256, frameHeight: 256 }
      } },
      prefabs: {
        // A circle character in 32px corridors the player is also 32px wide:
        // the round shape plus the controller's slide is what lets a 90° turn
        // happen on the move instead of only when perfectly aligned.
        player: { actor: 'Gardener', physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 } },
        hedge: { actor: 'Platform', spritesheet: 'hedge', physics: { bodyType: 'static' } },
        fountain: { actor: 'Fountain', physics: { bodyType: 'static', isSensor: true } }
      },
      layers: [{ name: 'garden', objects: [
        // 26px in 32px corridors: the character controller keeps an 0.5px gap
        // on each side, so a full-width 32px body physically cannot fit — it
        // jammed against both walls at once, even on straights.
        { prefab: 'player', x: built().start.x, y: built().start.y, width: 26, height: 26 },
        { prefab: 'fountain', x: built().goal.x, y: built().goal.y, width: 36, height: 36 },
        ...wallObjects(built().wall)
      ] }]
    }),

    // Screen-space elements belong in the scene's UI container (onDraw would
    // run in the world pass, under the camera transform).
    onEnter() {
      currentMap = mapConfig;
      // One court is one screen: the camera holds the court the gardener is
      // in and glides through the hedge when they take a gate.
      game.camera.mode = 'rooms';
      game.camera.roomSize = { width: COURT_PX.width, height: COURT_PX.height };
      game.camera.lerp = 0.12;
      game.camera.bounds = { left: 0, top: 0, right: built().width, bottom: built().height };
      game.camera.x = COURT_PX.width / 2;
      game.camera.y = COURT_PX.height / 2;

      game.soundManager.playMusic('game');
      const scene = game.sceneManager.getCurrentScene();
      courtBanner = scene.ui.add(new CourtBanner());
      courtBanner.show(mapConfig.name, TITLE_HOLD);
      backdrop = new GardenBackdrop(game, scene.spriteSheets.get('lawn'), built());
      backdrop.applyAtmosphere();
    },
    onExit() {
      backdrop?.clearAtmosphere();
      backdrop = null;
      courtBanner = null;
    },
    onUpdate(deltaTime) {
      backdrop?.update(deltaTime);
    },
    onDrawBackground() {
      backdrop?.drawBackground();
    },
    onDraw() {
      backdrop?.drawForeground();
    }
  });
}
// Settings overlay (O), with the demos' shared Audio row added on.
new SettingsMenu(game).addOption(audioOption(game));

// `?debug` exposes the engine for poking at from the console or a harness.
if (new URLSearchParams(location.search).has('debug')) window.hedgerowCourt = { game };

game.start();
