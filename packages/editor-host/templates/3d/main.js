import { bootProject } from 'm2d-engine/core/project.js';
import project from './m2d.project.json';
import * as definition from './game.js';

// The page: the project boots itself. Which scene opens, the display and
// the input actions are m2d.project.json's; the look, the HUD and what
// happens when are the scenes'. Everything here is edited in the editor.
await bootProject(document.getElementById('screen'), {
  project,
  definition,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' })
}).catch((error) => {
  document.body.textContent = error.message;
  throw error;
});
