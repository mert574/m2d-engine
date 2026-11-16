import { describe, it, expect } from 'vitest';
import { projectGameOptions, type HostProject } from '../src/host.ts';

/** What the project file contributes to a game the editor plays or edits. */
const project = (fields: Partial<HostProject> = {}): HostProject => ({
  name: 'Night Circuit', root: '/p', definition: 'game.js', hooks: null, basePath: '.', initialScene: 'mainMenu',
  display: {}, actions: {}, choices: {}, scenes: [], ...fields
});

describe('a project\'s game options', () => {
  it('declares its actions and choices only when it has some, and saves under its own name', () => {
    expect(projectGameOptions(project())).toEqual({ saveId: 'Night Circuit' });
    const declared = projectGameOptions(project({
      actions: { menu: ['Escape'] },
      choices: { car: { values: ['tourer', 'sprint'], initial: 'tourer' } },
      display: { clearColor: '#000', width: 1280 }
    }), { textureFilter: 'nearest' });
    expect(declared).toEqual({
      textureFilter: 'nearest', clearColor: '#000',
      actions: { menu: ['Escape'] }, choices: { car: { values: ['tourer', 'sprint'], initial: 'tourer' } },
      saveId: 'Night Circuit'
    });
  });
});
