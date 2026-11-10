/**
 * The MCP server: an AI agent as a first-class user of the editor.
 *
 * The point of this package, and the reason the editor's core is
 * headless. An agent is not scripting the GUI and not parsing
 * screenshots — it calls the same API the GUI calls, against the same
 * documents, through the same commands, so anything a person can do in
 * the inspector an agent can do over a tool call, and its edits land in
 * the human's undo list with a label on them.
 *
 * This round ships the read-only half, which is what proves the wiring:
 * list the project's scenes, read one, validate one. The mutating tools
 * (`apply_commands`) arrive with the concrete commands in E2, the asset
 * tools with E3, and `run_scene` — stepping a headless game so an agent
 * can *play-test* what it just edited — with E4. They are deliberately
 * not stubbed here: a tool that exists and does nothing is worse than
 * one that is absent, because an agent will call it.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Project } from './project.ts';

export const SERVER_NAME = 'm2d-editor';
export const SERVER_VERSION = '0.1.0';

/**
 * An MCP server over one project.
 * @param project - The folder the agent may read
 */
export function createServer(project: Project): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool('list_scenes', {
    title: 'List scenes',
    description:
      'Every scene in the project, with its name, its type (level or ui), and the script that ' +
      'generates it when it has one. A generated scene is read-only: edit its script instead.',
    inputSchema: {}
  }, async () => {
    const scenes = await project.scenes();
    return { content: [{ type: 'text', text: JSON.stringify(scenes, null, 2) }] };
  });

  server.registerTool('read_scene', {
    title: 'Read a scene',
    description:
      'One scene document as canonical JSON. This is the file as it is authored: defaults are ' +
      'omitted and the loader applies them, so a field being absent means "the default".',
    inputSchema: { path: z.string().describe('Project-relative path, as list_scenes gives it') }
  }, async ({ path }) => {
    const doc = await project.openScene(path);
    return { content: [{ type: 'text', text: doc.text }] };
  });

  server.registerTool('validate_scene', {
    title: 'Validate a scene',
    description:
      "Check a scene against the engine's schema. Reports each problem with the field path it is " +
      'at. Structural only here: actor, constraint and scene references resolve against a running ' +
      "game's registries, which this server does not have.",
    inputSchema: { path: z.string().describe('Project-relative path') }
  }, async ({ path }) => {
    const doc = await project.openScene(path);
    const result = doc.validate();
    const text = result.ok
      ? 'valid'
      : result.issues.map((issue) => `${issue.path || '(document)'}: ${issue.message}`).join('\n');
    return { content: [{ type: 'text', text }], isError: !result.ok };
  });

  return server;
}
