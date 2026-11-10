#!/usr/bin/env node
/**
 * The host's MCP face, as a one-off stdio command — no server to find, no
 * port to fight over, which is what lets any number of agents work on one
 * machine at once:
 *
 *   npm run editor:mcp [project-folder]
 *
 * Point an agent at this command and it reads the project through the
 * same `Project` the serving half uses. `serve.ts` is the browser-facing
 * face of the same host.
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
