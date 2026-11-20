import { bootProject } from 'm2d-engine';
import project from './m2d.project.json';
import * as definition from './game.js';

// The page: the project boots itself. Which scene opens and how it is
// displayed are m2d.project.json's; the look, the camera and the HUD are
// the scene's. Everything here is what the editor opens.
export default function start(canvas) {
  return bootProject(canvas, {
    project,
    definition,
    scenes: import.meta.glob('./scenes/*.json', { import: 'default' })
  });
}
