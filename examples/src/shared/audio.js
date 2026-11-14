/**
 * The demos' audio: sampled, with one deliberate exception — the circuit's
 * electric motor whine is synthesised in `circuit/evSound.js`, because an
 * EV's note is pure tones that must slide with speed.
 *
 * Music is from the IDMf netlabel's first compilation, *InDepthMelodics*
 * (CC BY 3.0), one pair of tracks per demo so each has its own room tone,
 * kept in each game's own `music/` folder.
 * Sound effects are Kenney's *Interface Sounds* (CC0): clean, short
 * synthetic tones — instrument readouts, not arcade noises — that sit with
 * the music rather than fight it. Each game keeps its own copies in its
 * `sounds/` folder, named by its scenes. Credits and sources are in
 * THIRD_PARTY_NOTICES.md and docs/examples/music-credits.md.
 */

// The showcase's music (IDMf001: InDepthMelodics, CC BY 3.0). The project
// games keep their tracks in their own folders, named by their scenes.
export { default as lastTransmission } from './music/kloquewurk-last-transmission.ogg';
export { default as g2Remix } from './music/gbsr-g2-cockboymattt-remix.ogg';

/**
 * The Audio row every demo adds to its settings panel — the one game-side
 * option they all share, and the worked example of `SettingsMenu.addOption`.
 * @param {import('m2d-engine/core/m2d.js').M2D} game
 * @returns {Object} An `addOption` item
 */
export function audioOption(game) {
  return {
    section: 'Game',
    label: 'Audio',
    value: () => (game.soundManager.isMuted ? 'Off' : 'On'),
    step: () => game.soundManager.toggleMute(),
    choices: () => ({ index: game.soundManager.isMuted ? 0 : 1, count: 2 }),
    description: 'Music and sound effects.'
  };
}
