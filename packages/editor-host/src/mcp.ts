#!/usr/bin/env node
/**
 * The host's MCP face as a one-off stdio command, for when no editor is
 * running — no server to find, no port to fight over:
 *
 *   npm run editor:mcp <project-folder>
 *
 * It edits through its own session over the same files. With an editor
 * open, point the agent at that editor's `/mcp` instead (printed at
 * start): then the agent and the person share one document and one undo
 * history, rather than meeting only on disk.
 */

import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Companion } from './companion.ts';

// Relative to where the command was typed, not to the package `npm run` moved into.
const root = resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2] ?? '.');
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
