import { Trigger } from 'm2d-engine/actors/trigger.js';
import layout from './layout.json';

/**
 * Ash Row's presentation hooks: the camera locked to each section and the
 * waves the sections spawn and release. The light, the post pass, the music
 * and the HUD are the scene's (`world.lighting`, `world.post`,
 * `world.music`, `hud` in row.json); this only writes into the HUD's
 * elements by id. Kept out of the definition (`game.js`) so a headless
 * game never loads them; `main.js` and the editor's play mode both build
 * them here. See m2d.project.json.
 */
export function sceneHooks(game) {
  let unsubscribe = [];

  return {
    row: {
      onEnter() {
        const scene = game.sceneManager.getCurrentScene();
        const proj = game.projection;
        const lane = layout.lane;
        // The street is drawn in the lower part of the view, the wall above it.
        // The gutter sits a little above the bottom edge; the wall fills the rest.
        const gutterY = proj.toScreen(0, lane.bottom).y;
        const viewH = game.camera.height;
        const cameraY = gutterY + 84 - viewH / 2;
        game.camera.followAxes = { x: true, y: false };
        game.camera.y = cameraY;
        game.camera.lerp = 0.12;
        game.camera.zoom = 1;
        // The camera's width follows the window under the "Fill" aspect mode.
        // Where thugs spawn and when a wave wakes are rules, so they measure
        // from the design width instead; only the camera lock uses the real one.
        const view = game.options.width;
        const setLock = (right) => { game.camera.bounds = { left: 0, top: cameraY - 10, right, bottom: cameraY + 10 }; };
        setLock(layout.sections[0].lock + game.camera.width / 2);

        // The HUD is the scene's; the waves write into its elements.
        const objective = scene.hud?.elements.get('objective') ?? { text: '' };
        const goSign = scene.hud?.elements.get('go') ?? { text: '' };
        const notice = scene.hud?.elements.get('notice') ?? { text: '' };

        // Waves. Each section locks the camera at its `lock` and spawns its
        // thugs off the right edge; when they are down the lock lifts.
        let section = 0;
        let alive = 0;
        let goTime = 0;
        const spawnWave = (s) => {
          let count = 0;
          for (const [kind, n] of s.wave) {
            for (let i = 0; i < n; i++) {
              // Off the right edge of the locked view, but never past the
              // boundary wall: a thug born outside the map cannot walk back in.
              const x = Math.min(s.lock + view / 2 + 80 + i * 70, layout.length - 160 - (i % 4) * 60);
              const y = lane.top + 40 + ((i * 97 + count * 53) % (lane.bottom - lane.top - 80));
              // The creature is defined once, as a prefab asset, and the scene
              // bound it under this name. Restating its body here is how this
              // used to work, and how it drifted from the scene's copy.
              const prefab = scene.config.prefabs[kind];
              const thug = game.createEntity({
                type: prefab.actor, x, y, width: 30, height: 30,
                spritesheet: scene.spriteSheets.get(prefab.spritesheet),
                physics: prefab.physics
              });
              thug.setAnimation(prefab.defaultAnimation);
              thug.onDeath = () => { alive--; if (alive === 0) release(); };
              game.entities.add(thug);
              game.physics.add(thug.body);
              count++;
            }
          }
          alive = count;
          objective.text = `SECTION ${section + 1} / ${layout.sections.length} · ${count} THUGS`;
        };
        const release = () => {
          section++;
          game.soundManager.playSound('go');
          goTime = 2.5;
          const next = layout.sections[section];
          setLock(next ? next.lock + game.camera.width / 2 : layout.length);
          objective.text = next ? 'GO →' : 'THE DOOR IS OPEN';
          if (next) armed = true;
        };
        let armed = true;
        spawnWave(layout.sections[0]);
        armed = false;

        // A notice clears itself after two seconds of wall time.
        let noticeTimer = null;
        const say = (text, { stay = false } = {}) => {
          notice.text = text;
          noticeTimer?.cancel();
          noticeTimer = stay ? null : game.time.after(2, () => { notice.text = ''; }, { unscaled: true });
        };

        const door = [...game.entities].find(e => e instanceof Trigger);
        if (door) {
          let done = false;
          door.onEnter = () => {
            if (done || section < layout.sections.length) { if (!done) say('NOT YET · CLEAR THE ROW'); return; }
            done = true;
            say('YOU MADE IT OUT', { stay: true });
            game.soundManager.playSound('levelComplete');
            game.time.after(3, () => game.sceneManager.switchTo('mainMenu'), { unscaled: true });
          };
        }

        const frame = {
          fixed() {
            const next = layout.sections[section];
            if (armed && next && game.player.position.x > next.lock - view / 4) { armed = false; spawnWave(next); }
          },
          update(deltaTime) {
            goTime = Math.max(0, goTime - deltaTime);
            goSign.text = goTime > 0 && Math.sin(goTime * 10) > 0 ? 'GO  →' : '';
          }
        };
        scene.frame = frame;

        unsubscribe.push(game.input.on('keydown', (event) => {
          if (event.code === 'Escape') { game.sceneManager.switchTo('mainMenu'); event.consume(); }
        }));
      },

      onFixedUpdate() { game.sceneManager.getCurrentScene()?.frame?.fixed(); },
      onUpdate(deltaTime) { game.sceneManager.getCurrentScene()?.frame?.update(deltaTime); },

      onDrawBackground() {
        // The Street entity paints the sky, the skyline and the road; this
        // only guarantees no clear colour shows at the edges.
        const area = game.camera.getVisibleArea();
        game.renderer.drawRect({ x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top, fillStyle: '#5fa6e4' });
      },

      onExit() {
        for (const stop of unsubscribe) stop();
        unsubscribe = [];
      }
    }
  };
}
