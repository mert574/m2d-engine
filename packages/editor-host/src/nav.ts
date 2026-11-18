/**
 * The navmesh bake, one implementation for every caller: the MCP tool
 * (`bake_navmesh`) and the editor's Bake button (`/__bake_nav`). It builds
 * the scene headless exactly as a server would, walks the static bodies,
 * runs the Recast pipeline once per nav agent the project declares, writes
 * each Detour binary beside the scene, and records the asset entries —
 * with the bake's stamp — as one step of undo.
 *
 * Before baking, every model the scene declares gets its bounds written
 * into its asset entry (read from the .glb with gltf-transform): headless
 * games load no models, so without the declared bounds a `bounds` prop
 * collider would be missing from the bake, and from any server.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import type { Op } from 'm2d-editor-core';
import type { Session } from './session.ts';
import type { Project } from './project.ts';

type Vec3 = { x: number; y: number; z: number };
type AgentSpec = { radius: number; height?: number; step?: number; slope?: number };

/** What the bake needs of the booted game; the host's SSR engine provides it. */
export type BakeGame = {
  sceneManager: { addScene(name: string, config: object): void; switchTo(name: string): Promise<unknown>; getCurrentScene(): unknown };
  nav: { areas: unknown };
};

export type BakeDeps = {
  /** A fresh headless game, booted with the project's declarations. */
  makeGame: () => Promise<BakeGame | null>;
  /** The engine's nav modules, through the same loader as the game. */
  navModules: () => Promise<{
    navGeometryOf: (game: BakeGame, agent: AgentSpec, scene?: unknown) => object;
    bakeNavMesh: (geometry: object, agent: AgentSpec, areas: unknown) => Promise<{ data: Uint8Array; stamp: string; polys: number }>;
  }>;
};

const round4 = (v: number) => Math.round(v * 10000) / 10000;
const roundVec = (v: number[]): Vec3 => ({ x: round4(v[0] ?? 0), y: round4(v[1] ?? 0), z: round4(v[2] ?? 0) });

/** Every declared model's bounds from its .glb, for the entries that lack them. */
async function modelBoundsOps(
  project: Project, basePath: string, models: Record<string, { url?: string; bounds?: unknown }>
): Promise<{ ops: Op[]; named: string[] }> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const ops: Op[] = [];
  const named: string[] = [];
  for (const [key, entry] of Object.entries(models)) {
    if (entry.bounds || !entry.url) continue;
    const path = resolve(project.root, basePath, entry.url);
    const document = await io.read(path).catch((error: unknown) => {
      throw new Error(`model '${key}' (${entry.url}) did not load for its bounds: ${(error as Error).message}`);
    });
    const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
    if (!scene) throw new Error(`model '${key}' (${entry.url}) has no scene to measure`);
    const b = getBounds(scene);
    const bounds = { min: roundVec(b.min), max: roundVec(b.max) };
    entry.bounds = bounds;
    ops.push({ op: 'set', path: ['assets', 'models', key, 'bounds'], value: bounds });
    named.push(key);
  }
  return { ops, named };
}

/**
 * Bake a scene's navmeshes and record them, one undo step. Resolves with
 * what was baked; throws when the project declares no nav agents or the
 * scene cannot build.
 */
export async function bakeNav(
  session: Session, project: Project, deps: BakeDeps, file: string,
  options: { agents?: string[] }, origin: { origin: string; client?: string; id?: number }
): Promise<{ baked: { agent: string; polys: number; url: string }[]; measured: string[]; revision: number }> {
  const config = await project.config();
  const agents = options.agents ?? Object.keys(config.navAgents);
  if (!agents.length) throw new Error('declare navAgents in m2d.project.json first: the bake makes one mesh per agent profile');
  for (const name of agents) {
    if (!config.navAgents[name]) throw new Error(`no nav agent named '${name}' (m2d.project.json navAgents: ${Object.keys(config.navAgents).join(', ') || 'none'})`);
  }

  const doc = await session.document(file);
  const data = structuredClone(doc.data) as Record<string, unknown> & {
    name?: string; type?: string;
    assets?: { models?: Record<string, { url?: string; bounds?: unknown }>; navmeshes?: Record<string, { url: string; stamp: string }> };
  };
  if (data.type !== 'level') throw new Error('only a level has a navmesh');

  // The models' bounds first: they are part of the level the bake walks.
  const { ops, named } = await modelBoundsOps(project, config.basePath, data.assets?.models ?? {});
  // The bake copy loads no meshes of its own: the old ones are what this run replaces.
  if (data.assets?.navmeshes) delete data.assets.navmeshes;

  const game = await deps.makeGame();
  if (!game) throw new Error("the game's code did not load in the host");
  const { navGeometryOf, bakeNavMesh } = await deps.navModules();
  const name = `${typeof data.name === 'string' ? data.name : 'scene'}:bake`;
  game.sceneManager.addScene(name, { fetch: async () => structuredClone(data) });
  await game.sceneManager.switchTo(name);
  const scene = game.sceneManager.getCurrentScene();

  const navmeshes: Record<string, { url: string; stamp: string }> = { ...(doc.data as typeof data).assets?.navmeshes };
  const baked: { agent: string; polys: number; url: string }[] = [];
  for (const agent of agents) {
    const spec = config.navAgents[agent];
    if (!spec) continue;
    const geometry = navGeometryOf(game, spec, scene);
    const result = await bakeNavMesh(geometry, spec, game.nav.areas);
    const sidecar = file.replace(/\.json$/i, '') + `.${agent}.navmesh`;
    const full = resolve(project.root, sidecar);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, result.data);
    const url = relative(resolve(project.root, config.basePath), full).split('\\').join('/');
    navmeshes[agent] = { url, stamp: result.stamp };
    baked.push({ agent, polys: result.polys, url });
  }

  if (!(doc.data as typeof data).assets) ops.push({ op: 'set', path: ['assets'], value: { navmeshes } });
  else ops.push({ op: 'set', path: ['assets', 'navmeshes'], value: navmeshes });
  const label = `Bake navmesh (${baked.map((b) => b.agent).join(', ')})`;
  const event = await session.edit(file, { label, ops }, origin);
  return { baked, measured: named, revision: event?.revision ?? 0 };
}
