/**
 * m2d-editor-host: the editor's companion process and its MCP server.
 *
 * See `companion.ts` for why one process does both jobs, and
 * `server.ts` for the agent-facing half.
 */

export { Project, PROJECT_FILE, type SceneEntry, type ProjectConfig } from './project.ts';
export { createServer, SERVER_NAME, SERVER_VERSION } from './server.ts';
export { Companion, type CompanionOptions, type ChangeListener } from './companion.ts';
export { Assets, renderCredits, type AssetFile, type LibraryRecord, type Job } from './assets.ts';
