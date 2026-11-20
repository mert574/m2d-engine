import type { M2D } from 'm2d-engine';

/**
 * One row of the settings menu, as `SettingsMenu.addOption` takes it. The
 * engine builds the row; this says what it shows and what a step does.
 */
export interface SettingsRow {
  /** The caption it is filed under; 'Game' when a game says nothing else. */
  section: string;
  label: string;
  /** What the row shows now. */
  value: () => string;
  /** One step left (-1) or right (+1), or an activation. */
  step: (step?: number) => void;
  /** Where the value sits among its choices, for the row's dots. */
  choices: () => { index: number; count: number };
  /** One line under the row while it is focused. */
  description: string;
}

/**
 * The Audio row a game adds to the settings menu: one switch for music and
 * effects together, through the engine's mute — silence in one step, next
 * to the engine's own Music and Sound effects volume rows. The worked
 * example of `SettingsMenu.addOption`.
 */
export function audioOption(game: M2D): SettingsRow {
  return {
    section: 'Game',
    label: 'Audio',
    // A game built without sound has no manager; the row then says On and
    // does nothing, rather than breaking the menu it was added to.
    value: () => (game.soundManager?.isMuted ? 'Off' : 'On'),
    step: () => game.soundManager?.toggleMute(),
    choices: () => ({ index: game.soundManager?.isMuted ? 0 : 1, count: 2 }),
    description: 'Music and sound effects.'
  };
}
