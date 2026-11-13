/**
 * The MCP server: an AI agent as a first-class user of the editor.
 *
 * An agent is not scripting the GUI and not parsing screenshots — it
 * calls the same session the editor's tabs talk to, against the same open
 * documents, through the same edits, so anything a person can do in the
 * inspector an agent can do over a tool call, and its edit lands in the
 * person's undo list with a label on it. Served by the running editor on
 * its own port (`/mcp`), or as a one-off stdio command when no editor is
 * open (`mcp.ts`).
 *
 * Still absent, deliberately: asset tools (E3) and `run_scene` — stepping
 * a headless game so an agent can play-test what it just edited (E4). A
 * tool that exists and does nothing is worse than one that is absent,
 * because an agent will call it.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sceneOutline, inspectNode, validateScene, structure, SCENE_VERSION, type Op, type Edit, type Rest } from 'm2d-editor-core';
import type { Session, ChangeEvent } from './session.ts';
import type { Assets } from './assets.ts';
// Type-only: the stdio server never loads shots.ts (or playwright) at runtime.
import type { Shot, ShotOptions } from './shots.ts';
import { stage, look, project as projectFile } from 'm2d-editor-core';
import { settle } from './playtest.ts';
import { runAudit, findUses } from './search.ts';

export const SERVER_NAME = 'm2d-editor';
export const SERVER_VERSION = '0.2.0';

/** A game-like object with the project's real classes, for checks that need them. */
export type GameProvider = () => Promise<unknown | null>;

export interface ServerOptions {
  /**
   * The project's game with its real classes registered, when the host can
   * load its code; validation and inspection then resolve actor properties
   * and constraint params the way the game does.
   */
  game?: GameProvider;
  /**
   * Step a scene document headless for `ticks` and report where its
   * objects ended up — the play-test an agent can run. Needs the game's
   * code, so only the serving host offers it.
   */
  runScene?: (data: Record<string, unknown>, ticks: number) => Promise<RunReport>;
  /** Build the project into a static site; the serving host only. */
  build?: () => Promise<unknown>;
  /**
   * Render a scene in a GPU browser and return the PNG — the serving host
   * only, and only where it can start a Chrome (`shots.ts`).
   */
  screenshot?: (options: ShotOptions) => Promise<Shot>;
}

export interface RunReport {
  ticks: number;
  seconds: number;
  /** Each placed object still in the world: where it is now, its body as built, how far it went. */
  objects: Rest[];
  /** Placed objects the run removed (collected, killed). */
  removed: string[];
  /** Entities the run spawned that the scene did not place. */
  spawned: number;
  /** What the game logged as an error while it ran. */
  errors: string[];
}

const segment = z.union([z.string(), z.number().int().nonnegative()]);
const path = z.array(segment);
const OP = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), path, value: z.unknown().optional() }),
  z.object({ op: z.literal('insert'), path, index: z.number().int().nonnegative(), value: z.unknown() }),
  z.object({ op: z.literal('remove'), path, index: z.number().int().nonnegative() })
]);

const text = (value: string, isError = false) => ({ content: [{ type: 'text' as const, text: value }], isError });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));
const failure = (error: unknown) => text(String((error as Error).message ?? error), true);
const summary = (event: ChangeEvent | null) => event
  ? json({ revision: event.revision, dirty: event.state.dirty, undo: event.state.undo, redo: event.state.redo })
  : text('nothing to do');

const AGENT = { origin: 'agent' };
const AT = z.object({ x: z.number(), y: z.number(), z: z.number().optional() });
const VARIANT = {
  from: AT.optional().describe("Start the player here instead (world units; z in 3D): the editor's Play from here"),
  prefab: z.string().optional().describe("Run this prefab alone on a floor instead of the scene: the editor's Stage")
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * An MCP server over one editing session.
 * @param session - The open documents the agent edits, shared with the editor
 */
export function createServer(session: Session, options: ServerOptions = {}, assets?: Assets): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const registries = async () => {
    const game = (await options.game?.()) as { actors?: Map<string, unknown>; constraintTypes?: Map<string, unknown> } | null;
    return game ? { actors: game.actors, constraintTypes: game.constraintTypes } : undefined;
  };
  const scenePath = z.string().describe('Project-relative path, as list_scenes gives it');

  /** A class's declared fields (`static params` or `static properties`), as the inspector would list them. */
  const fieldsOf = (fields: unknown) => Object.entries(isRecord(fields) ? fields : {}).map(([key, desc]) => {
    const d = isRecord(desc) ? desc : {};
    return {
      key, kind: d.kind, label: d.label, unit: d.unit, description: d.description,
      initial: d.initial ?? d.default, required: d.required === true || undefined, values: d.values
    };
  });

  server.registerTool('list_scenes', {
    title: 'List scenes',
    description:
      'Every scene in the project, with its name, its type (level or ui), and the script that ' +
      'generates it when it has one. A generated scene is read-only: edit its script instead.',
    inputSchema: {}
  }, async () => json(await session.project.scenes()));

  server.registerTool('read_project', {
    title: 'Read the project file',
    description:
      'm2d.project.json: the game\'s definition and hooks modules, its scenes folder, the scene it ' +
      'opens on (initialScene), its display (design size, filters, clear colour), its named input ' +
      'actions (input.actions: name to key codes, which rules fire on and the settings menu rebinds) ' +
      'and boot music. Returns the file, every field the schema declares with kind, description and ' +
      'default (the editor\'s Project panel), and any problems. Change it with edit_project.',
    inputSchema: {}
  }, async () => {
    try {
      const file = await session.project.file();
      const rows = (rowsOf: Array<{ key: string; kind: string; present: boolean; value?: unknown; fallback?: unknown; description?: string; options?: unknown[]; children?: unknown[] }>): unknown[] =>
        rowsOf.map(({ key, kind, present, value, fallback, description, options, children }) => ({
          key, kind, ...(present ? { value } : { default: fallback }), description, options,
          ...(children?.length && { fields: rows(children as typeof rowsOf) })
        }));
      return json({ file, fields: rows(projectFile.inspectProject(file)), problems: projectFile.projectProblems(file) });
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('edit_project', {
    title: 'Edit the project file',
    description:
      'Apply ops to m2d.project.json and write it, all or nothing: refused whole, naming the field, when ' +
      'the result fails the project schema. Same ops as edit_scene, e.g. ' +
      '{"op":"set","path":["initialScene"],"value":"mainMenu"} or ' +
      '{"op":"set","path":["input","actions","menu"],"value":["Escape"]}. Written at once (the project ' +
      'file has no undo); the open editor reloads the project.',
    inputSchema: { ops: z.array(OP).min(1) }
  }, async ({ ops }) => {
    try {
      return json(await session.project.editFile(ops as Op[]));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('read_scene', {
    title: 'Read a scene',
    description:
      'One scene document as canonical JSON, as the editor currently holds it — unsaved edits ' +
      'included. Defaults are omitted and the loader applies them, so an absent field means ' +
      '"the default". Use outline_scene for the paths edit_scene addresses.',
    inputSchema: { path: scenePath }
  }, async ({ path: file }) => {
    try {
      return text((await session.document(file)).text);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('outline_scene', {
    title: 'Outline a scene',
    description:
      'The scene as the editor\'s tree shows it: world, prefabs, layers with their objects and ' +
      'props, UI elements — each node with its `path` into the document, e.g. ' +
      '["layers", 0, "objects", 3]. Those paths are what inspect_node and edit_scene take.',
    inputSchema: { path: scenePath }
  }, async ({ path: file }) => {
    try {
      return json(sceneOutline((await session.document(file)).data));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('inspect_node', {
    title: 'Inspect a node',
    description:
      'The inspector\'s rows for one node: every field the engine\'s schema declares for it, ' +
      'set or not, with kind, unit, description, enum options and — for an unset field — the ' +
      'default the loader applies. This is how to learn what an object, prefab or constraint ' +
      'can be given before editing it.',
    inputSchema: { path: scenePath, node: path.describe('The node\'s path, from outline_scene; [] for the scene') }
  }, async ({ path: file, node }) => {
    try {
      const doc = await session.document(file);
      return json(inspectNode(doc.data, node, { registries: await registries() }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('validate_scene', {
    title: 'Validate a scene',
    description:
      "Check a scene, as the editor currently holds it, against the engine's loader. Reports " +
      'every problem, each with the field path it is at. Uses the game\'s real classes when the ' +
      'host could load them, so actor properties and constraint params are checked too.',
    inputSchema: { path: scenePath }
  }, async ({ path: file }) => {
    try {
      const doc = await session.document(file);
      const result = validateScene(doc.data, (await options.game?.()) ?? null);
      return result.ok
        ? text('valid')
        : text(result.issues.map((issue) => `${issue.path || '(document)'}: ${issue.message}`).join('\n'), true);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('edit_scene', {
    title: 'Edit a scene',
    description:
      'Apply one edit — a list of ops, applied in order, all or nothing — as one step of the ' +
      'editor\'s undo history, labelled. The open editor shows it at once. Ops: ' +
      '{"op":"set","path":[...],"value":v} sets a field or array element (omit value to delete ' +
      'the field, which restores its default); {"op":"insert","path":[...array],"index":i,' +
      '"value":v} and {"op":"remove","path":[...array],"index":i}. Every new object needs a ' +
      'unique "id". Nothing is written to disk until save_scene. Follow with validate_scene.',
    inputSchema: {
      path: scenePath,
      label: z.string().min(1).describe("What the undo list shows: 'Scatter 12 lamps'"),
      ops: z.array(OP).min(1)
    }
  }, async ({ path: file, label, ops }) => {
    try {
      return summary(await session.edit(file, { label, ops: ops as Op[] }, AGENT));
    } catch (error) {
      return failure(error);
    }
  });

  const RECORDS = {
    prefabs: ['prefabs'], spritesheets: ['assets', 'spritesheets'], models: ['assets', 'models'],
    environments: ['assets', 'environments'], paths: ['paths']
  } as const;
  server.registerTool('rename_entry', {
    title: 'Rename a prefab, asset or path',
    description:
      'Rename an entry of a scene\'s prefabs, sprite sheets, models, environments or paths, and ' +
      'every reference to it in the same step of undo: the objects that use a prefab, the prefabs ' +
      'and tile layers that draw a sheet, the followers that name a path. The editor\'s Rename does ' +
      'exactly this; use it instead of edit_scene, which would leave the references dangling.',
    inputSchema: {
      path: scenePath,
      kind: z.enum(['prefabs', 'spritesheets', 'models', 'environments', 'paths']),
      from: z.string().min(1),
      to: z.string().min(1)
    }
  }, async ({ path: file, kind, from, to }) => {
    try {
      const doc = await session.document(file);
      const ops = structure.renameEntry(doc.data, [...RECORDS[kind]], from, to);
      return summary(await session.edit(file, { label: `Rename ${from} to ${to}`, ops }, AGENT));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('find_uses', {
    title: 'Find uses',
    description:
      'Each scene using a named thing, with the fields that use it. scope file takes an asset ' +
      'file\'s url. Path and property references resolve through the game\'s classes, so the ' +
      'running editor sees more than the stdio server.',
    inputSchema: {
      scope: z.enum(['prefab', 'spritesheet', 'model', 'environment', 'path', 'scene', 'actor', 'constraint', 'file']),
      name: z.string().min(1)
    }
  }, async ({ scope, name }) => {
    try {
      return json(await findUses(session, scope, name, (await options.game?.()) ?? null));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('audit_project', {
    title: 'Audit the project',
    description:
      'The whole project checked across its scenes: file urls nothing on disk answers to, files no ' +
      'scene names, prefabs and paths their own scene never uses, and which scene uses which. ' +
      'Unsaved edits count. validate_scene stays the per-scene check.',
    inputSchema: {}
  }, async () => {
    if (!assets) return text('audit_project needs the editor\'s asset pipeline', true);
    try {
      return json(await runAudit(session, assets, (await options.game?.()) ?? null));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('look_at', {
    title: 'Read the look at a phase',
    description:
      'The level\'s lighting and post as the engine blends them at a phase of its world.cycle ' +
      '(the resting look without a cycle), with the cycle\'s states and the colours a strip of it ' +
      'shows. The editor\'s Look tab scrubber previews the same blend.',
    inputSchema: {
      path: scenePath,
      phase: z.number().min(0).optional().describe('Default the cycle\'s own start phase')
    }
  }, async ({ path: file, phase }) => {
    try {
      const data = (await session.document(file)).data;
      const world = (data.world ?? {}) as { cycle?: { phase?: number; states?: Array<{ name?: string }> } };
      const at = phase ?? world.cycle?.phase ?? 0;
      return json({
        phase: at,
        states: (world.cycle?.states ?? []).map((state, i) => state.name ?? `state ${i + 1}`),
        ...look.lookAt(data, at),
        strip: look.cycleColours(data, 9)
      });
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('edit_look', {
    title: 'Edit the lighting cycle or particles',
    description:
      'The Look tab\'s actions, as one step of undo each: startCycle (two states from the resting ' +
      'look), addState (the blended look at phase, inserted as a state named name), removeState ' +
      '(index; the start phase stays on the state it named), addParticles (a field: in 3D motes or ' +
      'smoke at a point; in 2D fireflies, leaves, rain or sparks over the view). Tune fields afterwards with edit_scene under world.cycle and ' +
      'world.particles.',
    inputSchema: {
      path: scenePath,
      action: z.enum(['startCycle', 'addState', 'removeState', 'addParticles']),
      phase: z.number().min(0).optional().describe('addState'),
      name: z.string().min(1).optional().describe('addState'),
      index: z.number().int().nonnegative().optional().describe('removeState'),
      kind: z.enum(['motes', 'smoke', 'fireflies', 'leaves', 'rain', 'sparks']).optional().describe('addParticles: motes and smoke in 3D; fireflies, leaves, rain and sparks in 2D'),
      at: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional().describe('addParticles: where it stands, metres')
    }
  }, async ({ path: file, action, phase, name, index, kind, at }) => {
    try {
      const data = (await session.document(file)).data;
      const need = <T>(value: T | undefined, what: string): T => {
        if (value === undefined) throw new Error(`${action} needs ${what}`);
        return value;
      };
      const edit = ((): Edit => {
        switch (action) {
          case 'startCycle': return { label: 'Start a lighting cycle', ops: look.startCycle(data) };
          case 'addState': return { label: `Add cycle state ${name}`, ops: look.addStateAt(data, need(phase, 'a phase'), need(name, 'a name')) };
          case 'removeState': return { label: `Remove cycle state ${need(index, 'an index') + 1}`, ops: look.removeState(data, index!) };
          case 'addParticles': return { label: `Add ${need(kind, 'a kind')}`, ops: look.addParticleField(data, kind!, at ?? { x: 0, y: 0, z: 0 }) };
        }
      })();
      return summary(await session.edit(file, edit, AGENT));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('undo', {
    title: 'Undo',
    description: 'Undo the newest step of a scene\'s history — whoever made it, the person included.',
    inputSchema: { path: scenePath }
  }, async ({ path: file }) => {
    try {
      return summary(await session.undo(file, AGENT));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('redo', {
    title: 'Redo',
    description: 'Redo the newest undone step of a scene\'s history.',
    inputSchema: { path: scenePath }
  }, async ({ path: file }) => {
    try {
      return summary(await session.redo(file, AGENT));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('save_scene', {
    title: 'Save a scene',
    description:
      'Write the scene to its file in canonical form. Refused for a generated scene. The ' +
      'person may be editing too: say what you changed before saving their work with yours.',
    inputSchema: { path: scenePath }
  }, async ({ path: file }) => {
    try {
      await session.save(file, AGENT);
      return text(`saved ${file}`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('create_scene', {
    title: 'Create a scene',
    description:
      'Make a new scene file in the project\'s scenes folder: a blank level (2D or 3D) or UI scene, ' +
      'or a copy of an existing scene. Returns the new path, which the open editor lists at once.',
    inputSchema: {
      name: z.string().min(1).describe('The file\'s name without .json; also the scene\'s name'),
      type: z.enum(['level', 'ui']).optional().describe('A blank scene of this type (default level)'),
      dimensions: z.union([z.literal(2), z.literal(3)]).optional().describe('For a level: 2 or 3 (default 2)'),
      copyOf: scenePath.optional().describe('Copy this scene instead of starting blank')
    }
  }, async ({ name, type, dimensions, copyOf }) => {
    try {
      const data = copyOf
        ? { ...JSON.parse((await session.document(copyOf)).text) as Record<string, unknown>, name, generator: undefined }
        : structure.blankScene(name, type ?? 'level', SCENE_VERSION, dimensions ?? 2);
      return json({ path: await session.project.createScene(name, data) });
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('rename_scene', {
    title: 'Rename a scene',
    description: 'Move a scene file to a new name in its folder. Refused while it has unsaved edits.',
    inputSchema: { path: scenePath, name: z.string().min(1).describe('The new file name without .json') }
  }, async ({ path: file, name }) => {
    try {
      if (session.isDirty(file)) throw new Error(`'${file}' has unsaved edits; save it first`);
      const moved = await session.project.renameScene(file, name);
      session.forget(file);
      return json({ path: moved });
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('delete_scene', {
    title: 'Delete a scene',
    description: 'Delete a scene file for good. Unsaved edits to it are lost with it.',
    inputSchema: { path: scenePath }
  }, async ({ path: file }) => {
    try {
      await session.project.deleteScene(file);
      session.forget(file);
      return text(`deleted ${file}`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('list_components', {
    title: 'List components',
    description:
      'The actors and constraints the game registers, each with its description and the fields a ' +
      'scene may set (an actor\'s `properties`, a constraint\'s `params`), as the editor\'s ' +
      'Components tab shows them. A prefab names an actor; a constraint goes under a prefab\'s or ' +
      'an object\'s `constraints` as { "slot": { "type": "Name", "params": {...} } }.',
    inputSchema: {}
  }, async () => {
    const found = await registries();
    if (!found) return text('the game\'s code did not load in the host, so its registries are not known', true);
    const describe = (klass: unknown) => (isRecord(klass) || typeof klass === 'function' ? (klass as { description?: unknown }).description : undefined);
    return json({
      actors: [...(found.actors ?? [])].map(([name, klass]) => ({
        name, description: describe(klass) || undefined, properties: fieldsOf((klass as { properties?: unknown }).properties)
      })),
      constraints: [...(found.constraintTypes ?? [])].map(([name, klass]) => ({
        name, description: describe(klass) || undefined, params: fieldsOf((klass as { params?: unknown }).params)
      }))
    });
  });

  if (assets) {
    server.registerTool('list_assets', {
      title: 'List assets',
      description:
        'The project\'s asset files — models, images, environments, audio — each with the `url` a ' +
        'scene names it by (relative to the game\'s basePath) and, for a library import, its credit.',
      inputSchema: {}
    }, async () => {
      try {
        return json(await assets.list());
      } catch (error) {
        return failure(error);
      }
    });

    server.registerTool('search_library', {
      title: 'Search the asset library',
      description:
        'Search Poly Haven (CC0 models, textures and HDRIs) by words; every word must match the ' +
        'name, id, categories or tags. Results carry the id import_asset takes, the authors and the page.',
      inputSchema: {
        type: z.enum(['models', 'textures', 'hdris']),
        query: z.string().describe("Words to match, e.g. 'wooden crate'")
      }
    }, async ({ type, query }) => {
      try {
        return json((await assets.search('polyhaven', type, query)).slice(0, 20));
      } catch (error) {
        return failure(error);
      }
    });

    server.registerTool('import_asset', {
      title: 'Import a library asset',
      description:
        'Fetch an asset into the project as a recipe — checksummed download, a model compiled to a ' +
        'level-of-detail .glb — and record its credit in library.json and CREDITS.md. Waits for the ' +
        'import to finish (a model takes a minute or so) and returns the file and the url to place it by.',
      inputSchema: {
        type: z.enum(['models', 'textures', 'hdris']),
        id: z.string().describe('The id search_library gave'),
        resolution: z.string().optional().describe("Texture resolution, default '2k'")
      }
    }, async ({ type, id, resolution }) => {
      try {
        const job = assets.import('polyhaven', type, id, resolution);
        const finished = await new Promise<typeof job>((done) => {
          const off = assets.onJob((update) => {
            if (update.id === job.id && (update.stage === 'done' || update.stage === 'failed')) { off(); done(update); }
          });
        });
        if (finished.stage === 'failed') return text(`import failed: ${finished.message}`, true);
        return json(finished.result);
      } catch (error) {
        return failure(error);
      }
    });
  }

  server.registerTool('run_scene', {
    title: 'Run a scene',
    description:
      'Play-test: step the scene, as the editor holds it, headless for a number of fixed ticks ' +
      '(60 a second) with no input, and report where each placed object ended up, which were ' +
      'removed, how many entities were spawned and any errors. Use it after an edit to see that ' +
      'things fall, land and stay where they should.',
    inputSchema: {
      path: scenePath,
      seconds: z.number().positive().max(60).optional().describe('How long to run, default 3'),
      ...VARIANT
    }
  }, async ({ path: file, seconds, from, prefab }) => {
    if (!options.runScene) return text('run_scene needs the running editor (npm run editor <project>); the stdio server cannot load the game', true);
    try {
      const doc = await session.document(file);
      return json(await options.runScene(stage.variantOf(doc.data, { from, prefab }), Math.round((seconds ?? 3) * 60)));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('settle_scene', {
    title: 'Settle physics',
    description:
      'Run the scene headless for some seconds and write where its dynamic bodies came to rest ' +
      '(position, and angle or rotation) as one step of undo: crates stacked by hand stop ' +
      'floating, a toppled barrel lies as it fell. The player and objects composed from another ' +
      'scene are left alone. Nothing is written if the run logs errors. The editor\'s Settle does the same.',
    inputSchema: {
      path: scenePath,
      seconds: z.number().positive().max(30).optional().describe('How long bodies get to settle, default 2'),
      ids: z.array(z.string()).optional().describe('Settle only these objects; default every dynamic body')
    }
  }, async ({ path: file, seconds, ids }) => {
    if (!options.runScene) return text('settle_scene needs the running editor (npm run editor <project>)', true);
    try {
      const settled = await settle(session, options.runScene, file, { seconds, ids }, AGENT);
      return settled ? json(settled) : text('nothing moved; nothing was written');
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('screenshot_scene', {
    title: 'Screenshot a scene',
    description:
      'See a scene: the editor draws it, as the editor holds it (unsaved edits included), in a ' +
      'Chrome with the GPU, and this returns the picture. Use it after an edit to check what it ' +
      'looks like — placement, lighting, scale — which run_scene cannot tell you. view "scene" is ' +
      'the viewport alone; "editor" the whole window with panels and the selection gizmo. play ' +
      'runs the game for that many seconds first. The first call starts the browser (a few seconds).',
    inputSchema: {
      path: scenePath,
      play: z.number().min(0).max(30).optional().describe('Seconds to play before the shot; 0 or absent: the edit view (from or prefab play for 1s by default)'),
      focus: z.string().optional().describe('An object id to frame first, as F does in the editor'),
      view: z.enum(['scene', 'editor']).optional().describe('Default scene'),
      width: z.number().int().min(320).max(2560).optional().describe('Window width in px, default 1280'),
      height: z.number().int().min(240).max(1600).optional().describe('Window height in px, default 800'),
      phase: z.number().min(0).optional().describe('The edit view at this phase of world.cycle, as the Look tab\'s scrubber shows it; nothing is written'),
      ...VARIANT
    }
  }, async ({ path: file, play, focus, view, width, height, from, prefab, phase }) => {
    if (!options.screenshot) return text('screenshot_scene needs the running editor (npm run editor <project>)', true);
    try {
      stage.variantOf((await session.document(file)).data, { from, prefab });
      const shot = await options.screenshot({ path: file, play, focus, view, width, height, from, prefab, phase });
      return {
        content: [
          { type: 'image' as const, data: shot.png.toString('base64'), mimeType: 'image/png' },
          { type: 'text' as const, text: shot.notes.join('\n') }
        ]
      };
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool('build_project', {
    title: 'Build the project',
    description:
      'Build the game into dist/, a static site any host serves, with its runtime assets copied ' +
      'beside the page. Builds what is saved on disk: save_scene first.',
    inputSchema: {}
  }, async () => {
    if (!options.build) return text('build_project needs the running editor (npm run editor <project>)', true);
    try {
      return json(await options.build());
    } catch (error) {
      return failure(error);
    }
  });

  return server;
}
