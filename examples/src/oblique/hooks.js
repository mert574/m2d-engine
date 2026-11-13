import { GroveQuest } from './quest.js';

/**
 * Hollow Grove's hooks: only its quest, which is JS on the engine's
 * `Quest` (quest.js), and the talking that moves it on. Everything else
 * that shows the grove is its scene's (grove.json): the camera and its
 * zoom, the dusk light, the HUD (objective, the lantern count, health, the
 * minimap, the ability bar, the dialogue box), and the notices, sound and
 * way out the quest's news brings, as rules on the world events raised
 * here. See m2d.project.json.
 */
export function sceneHooks(game) {
  /** The talking, on the tick; set up by onEnter. */
  let talking = null;

  return {
    grove: {
      onEnter() {
        const scene = game.sceneManager.getCurrentScene();
        const placed = (...prefabs) => [...game.entities].filter((entity) => prefabs.includes(entity.prefab));
        const npcs = placed('maren', 'oswin');
        const lanterns = placed('lantern');
        const [clearing] = placed('clearing');
        const hud = scene.hud;
        const map = hud?.elements.get('map');
        const dialogue = hud?.elements.get('talk');

        const quest = new GroveQuest(game, { npcs, clearing, lanterns }, {
          onObjective(text) { hud?.setText('objective', text.toUpperCase()); },
          onStage(stage) {
            if (map) map.target = quest.target;
            game.events.emit(`quest-${stage}`);
          }
        });
        if (map) map.target = quest.target;

        for (const lantern of lanterns) lantern.onTaken = () => quest.lanternTaken();
        if (clearing) {
          clearing.onEnter = () => {
            if (!quest.enterClearing() && quest.stage !== 'done') game.events.emit('stones-sealed');
          };
        }
        game.player.getConstraint('abilities').onCast = (ability, ok) => {
          if (!ok && ability.locked) game.events.emit('ward-locked');
        };
        if (dialogue) talking = conversation(game, dialogue, npcs, quest);
      },

      onFixedUpdate() { talking?.(); },

      onExit() { talking = null; }
    }
  };
}

/** Keys that advance an open conversation, besides the interact action. */
const ADVANCE = ['Enter', 'Space'];

/**
 * Talking. Interact (E) starts a conversation with whoever is near, or
 * advances one; Enter and Space advance it too. It freezes the walker and
 * moves the quest on, so it runs on the tick from the tick's input (the
 * dialogue types on game time). The walker thaws once the keys that closed
 * the conversation are up, or the Space that closed it would also hop.
 */
function conversation(game, dialogue, npcs, quest) {
  let thawing = false;
  const talk = () => {
    if (dialogue.open) { dialogue.advance(); return; }
    if (!dialogue.canOpen) return;
    const npc = npcs.find((each) => each.playerNear);
    if (!npc) return;
    const { name, lines, done } = quest.talkTo(npc);
    game.player.frozen = true;
    dialogue.start(name, lines, () => { thawing = true; done(); });
  };
  return () => {
    const input = game.input.snapshot;
    const keys = [...game.actions.codes('interact'), ...ADVANCE];
    if (game.actions.pressed('interact', input) || (dialogue.open && ADVANCE.some((code) => input.justPressed(code)))) talk();
    if (thawing && game.player && !keys.some((code) => input.isDown(code))) {
      thawing = false;
      game.player.frozen = false;
    }
  };
}
