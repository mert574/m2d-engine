/**
 * The grove's one quest, and who says what.
 *
 * Maren the herbalist sends the walker to Oswin the lamplighter, who
 * teaches the ward that opens the clearing. Lanterns gathered along the
 * way change what both have to say. The quest is a small state machine
 * over the scene: it marks who has news, writes the objective and lifts
 * the seal; the NPC actors and the dialogue box only show what it says.
 */
import { Quest } from 'm2d-engine/core/quest.js';

const STAGES = [
  { id: 'start', objective: 'Speak to Maren, by the path north of here' },
  { id: 'findOswin', objective: 'Find Oswin the lamplighter, east past the pond' },
  { id: 'openClearing', objective: 'Enter the sealed clearing in the north-east' },
  { id: 'done', objective: 'The grove is quiet' }
];

const PEOPLE = {
  maren: {
    name: 'Maren',
    lines: {
      start: [
        'You came in by the south path. Few do, after dark.',
        'The wisps have grown bold since the clearing sealed itself. They put out the lanterns as fast as Oswin lights them.',
        'Find him. He keeps to the east, past the pond, where the gold trees are. He knows the old ward.',
        'Light what lanterns you pass. The dark is thinner where they burn.'
      ],
      findOswin: ['East, past the pond. Follow the path and you will find him. Press 1 if the wisps crowd you: your lantern can flare.'],
      openClearing: ['He taught you the ward? Then the clearing will let you in. Go carefully among the violet trees.'],
      done: ['The grove is quiet again. Thank you, walker.']
    }
  },
  oswin: {
    name: 'Oswin',
    lines: {
      start: ['Maren sent you? Go and speak to her first. She will tell you why the clearing matters.'],
      findOswin: [
        'So Maren sent you. Good. I have been lighting lanterns for three nights and losing them by morning.',
        'The clearing in the north-east is warded against the dark. The ward answers to a light that will not go out.',
        'Here, I will show you the shape of it. Press 3 when the wisps come, and they cannot touch you.',
        'Walk into the stones with the ward on you and the seal will fall. Mind the dead trees on the way.'
      ],
      openClearing: ['The ward is yours now. The stones are north-east, past the dead trees.'],
      done: ['You opened it. The lamps will stay lit tonight.']
    }
  }
};

export class GroveQuest {
  /**
   * @param {import('m2d-engine/core/m2d.js').M2D} game
   * @param {Object} parts - `{ npcs, clearing, lanterns }` from the scene
   * @param {Object} hooks - `onObjective(text, lanternText)`, `onStage(id)`
   */
  constructor(game, { npcs, clearing, lanterns }, hooks = {}) {
    this.game = game;
    this.npcs = npcs;
    this.clearing = clearing;
    this.lanternTotal = lanterns.length;
    this.lanternsTaken = 0;
    this.hooks = hooks;
    for (const npc of npcs) npc.displayName = PEOPLE[npc.who].name;
    this.quest = new Quest(STAGES, {
      onStage: (stage) => {
        if (stage.id === 'openClearing') {
          this.clearing.sealed = false;
          this.game.player?.getConstraint('abilities')?.unlock('ward');
        }
        this.hooks.onStage?.(stage.id);
        this.#refresh();
      }
    });
    this.#refresh();
  }

  get stage() {
    return this.quest.id;
  }

  /** What the minimap should point at now. */
  get target() {
    if (this.quest.is('start')) return this.npcs.find(n => n.who === 'maren');
    if (this.quest.is('findOswin')) return this.npcs.find(n => n.who === 'oswin');
    if (this.quest.is('openClearing')) return this.clearing;
    return null;
  }

  /** The lines an NPC says now, and the stage change that saying them causes. */
  talkTo(npc) {
    const person = PEOPLE[npc.who];
    const lines = person.lines[this.stage];
    const advances = (this.quest.is('start') && npc.who === 'maren') || (this.quest.is('findOswin') && npc.who === 'oswin');
    return { name: person.name, lines, done: () => { if (advances) this.quest.advance(); } };
  }

  lanternTaken() {
    this.lanternsTaken++;
    this.#refresh();
  }

  /** The walker reached the stones. True when the clearing lets them in. */
  enterClearing() {
    return this.quest.complete('openClearing');
  }

  #refresh() {
    for (const npc of this.npcs) {
      npc.hasNews = (this.quest.is('start') && npc.who === 'maren') || (this.quest.is('findOswin') && npc.who === 'oswin');
    }
    this.hooks.onObjective?.(this.quest.objective, `Lanterns ${this.lanternsTaken} / ${this.lanternTotal}`);
  }
}
