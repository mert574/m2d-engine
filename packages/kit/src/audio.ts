/**
 * The Audio row a game adds to the settings menu: one switch for music and
 * effects together, through the engine's mute. The worked example of
 * `SettingsMenu.addOption`; a game with its own volumes adds its own rows.
 */

interface MutableSound { isMuted: boolean; toggleMute(): void }

/** @returns An item for `game.settings.addOption` */
export function audioOption(game: { soundManager: MutableSound }) {
  return {
    section: 'Game',
    label: 'Audio',
    value: () => (game.soundManager.isMuted ? 'Off' : 'On'),
    step: () => game.soundManager.toggleMute(),
    choices: () => ({ index: game.soundManager.isMuted ? 0 : 1, count: 2 }),
    description: 'Music and sound effects.'
  };
}
