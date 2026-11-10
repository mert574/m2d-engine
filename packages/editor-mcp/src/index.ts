/**
 * m2d-editor-mcp: the editor's companion process and its MCP server.
 *
 * See `companion.ts` for why one process does both jobs, and
 * `server.ts` for the agent-facing half.
 */

export { Project, type SceneEntry } from './project.ts';
export { createServer, SERVER_NAME, SERVER_VERSION } from './server.ts';
export { Companion, type CompanionOptions, type ChangeListener } from './companion.ts';
