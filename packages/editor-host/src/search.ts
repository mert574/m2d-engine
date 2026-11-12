/**
 * The project gathered for the audit in editor-core: every scene as the
 * session holds it (unsaved edits included) and every asset file's
 * scene-facing url. The MCP tools and the editor's endpoints both go
 * through here, so they answer alike.
 */

import { audit, type Audit, type Reference, type SceneInput } from 'm2d-editor-core';
import type { Session } from './session.ts';
import type { Assets } from './assets.ts';

export async function projectScenes(session: Session): Promise<SceneInput[]> {
  const entries = await session.project.scenes();
  return Promise.all(entries.map(async (entry) => ({
    path: entry.path,
    name: entry.name ?? null,
    data: (await session.document(entry.path)).data
  })));
}

export async function runAudit(session: Session, assets: Assets, game: unknown): Promise<Audit> {
  const files = await assets.list();
  return audit.auditProject(await projectScenes(session), files.map((file) => file.url), game);
}

export interface Uses {
  /** Per scene, the fields that use it. */
  scenes: Array<{ scene: string; at: string[] }>;
  count: number;
}

export async function findUses(session: Session, scope: string, name: string, game: unknown): Promise<Uses> {
  const scenes = await projectScenes(session);
  const refs: Array<Pick<Reference, 'scene' | 'at'>> = scope === 'file'
    ? scenes.flatMap((scene) => audit.fileUses(scene)).filter((use) => use.url === name)
    : audit.usesOf(scenes, scope, name, game);
  const grouped = new Map<string, string[]>();
  for (const ref of refs) {
    const list = grouped.get(ref.scene) ?? [];
    list.push(ref.at);
    grouped.set(ref.scene, list);
  }
  return { scenes: [...grouped].map(([scene, at]) => ({ scene, at })), count: refs.length };
}
