// Navigation meshes: baking one from a scene's geometry (the editor, a
// build script, a server) and what the bake reads.
export { initRecast, bakeConfig, bakeNavMesh } from './core/nav/navBake.js';
export { AGENT_DEFAULTS, navGeometryOf } from './core/nav/navGeometry.js';
