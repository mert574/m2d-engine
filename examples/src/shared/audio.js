/**
 * The demos' audio: sampled, with one deliberate exception — the circuit's
 * electric motor whine is synthesised in `circuit/evSound.js`, because an
 * EV's note is pure tones that must slide with speed.
 *
 * Music is from the IDMf netlabel's first compilation, *InDepthMelodics*
 * (CC BY 3.0), one pair of tracks per demo so each has its own room tone.
 * Sound effects are Kenney's *Interface Sounds* (CC0): clean, short
 * synthetic tones — instrument readouts, not arcade noises — that sit with
 * the music rather than fight it. Credits and sources are in
 * THIRD_PARTY_NOTICES.md and docs/examples/music-credits.md.
 */

// Music — IDMf001: InDepthMelodics, CC BY 3.0.
export { default as starsAtDawn } from './music/nathanrain-stars-at-dawn.ogg';
export { default as perfectUnion } from './music/theget-perfect-union.ogg';
export { default as lastTransmission } from './music/kloquewurk-last-transmission.ogg';
export { default as november } from './music/chaoticpulse-november.ogg';
export { default as symmetricalTree } from './music/binarypulse-symmetrical-tree.ogg';
export { default as redux } from './music/halogen-redux.ogg';
export { default as g2Remix } from './music/gbsr-g2-cockboymattt-remix.ogg';
export { default as longingForRain } from './music/evelon-longing-for-rain.ogg';
export { default as woodlandFantasy } from './music/matthewpablo-woodland-fantasy.mp3';
export { default as enchantedFestival } from './music/matthewpablo-enchanted-festival.mp3';

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

// Sound effects — Kenney Interface Sounds, CC0. Picked by measurement, not
// by name: every sample is under half a second and keeps its spectral
// centroid below ~700 Hz, so nothing in the set is shrill.
export { default as jumpSound } from './sfx/bong_001.ogg';
export { default as coinSound } from './sfx/confirmation_001.ogg';
export { default as solvedSound } from './sfx/maximize_006.ogg';
export { default as levelCompleteSound } from './sfx/maximize_008.ogg';
export { default as attackSound } from './sfx/minimize_008.ogg';
export { default as damageSound } from './sfx/error_008.ogg';
export { default as gameOverSound } from './sfx/error_006.ogg';
export { default as spawnSound } from './sfx/drop_003.ogg';
export { default as removeSound } from './sfx/minimize_006.ogg';
