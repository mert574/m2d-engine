import { Platform } from './platform.js';

/**
 * An invisible wall: it stops what a platform stops and draws nothing,
 * shown as Source's player-clip magenta in the editor and under
 * `r_showtools`. The edge of a field, a kerb nobody sees, the line a
 * street ends at.
 */
export class Clip extends Platform {
  static description = 'An invisible wall: collides like a platform, drawn only as a tool box';
  static tool = { color: '#e040fb', label: 'clip' };
}
