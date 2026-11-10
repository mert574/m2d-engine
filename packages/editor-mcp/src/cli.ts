#!/usr/bin/env node
/**
 * `m2d-editor` — start the companion for a project.
 *
 *   m2d-editor [project-folder]      serve the project and speak MCP on stdio
 *
 * Over stdio it is an MCP endpoint: point an agent at this command and it
 * can read the project. The editor app connects to the same process once
 * it has an HTTP half to connect to (E0.7 leaves that to the phase that
 * needs it; in development Vite serves the app).
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Companion } from './companion.ts';

const root = process.argv[2] ?? process.cwd();
const companion = new Companion({ root, watch: true });

if (!(await companion.project.exists())) {
  // stderr, never stdout: stdout is the MCP transport.
  console.error(`m2d-editor: no such folder: ${companion.project.root}`);
  process.exit(1);
}

console.error(`m2d-editor: project ${companion.project.root}`);
await companion.mcp.connect(new StdioServerTransport());

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { companion.close(); process.exit(0); });
}
