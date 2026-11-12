/**
 * Playtests other than the scene as written, one implementation for every
 * caller: the MCP tools (`run_scene`, `screenshot_scene`, `settle_scene`)
 * and the editor's Settle button, which reaches `settle` over `/__settle`.
 */

import { stage } from 'm2d-editor-core';
import type { Session } from './session.ts';
import type { RunReport } from './server.ts';

export type RunScene = (data: Record<string, unknown>, ticks: number) => Promise<RunReport>;

/**
 * Run the scene headless for `seconds` and write where its dynamic bodies
 * came to rest as one edit. Resolves with what moved, or null when nothing
 * did (and nothing was written).
 */
export async function settle(
  session: Session, run: RunScene, file: string,
  options: { seconds?: number; ids?: string[] }, origin: { origin: string; client?: string; id?: number }
): Promise<{ moved: string[]; revision: number } | null> {
  const doc = await session.document(file);
  const report = await run(doc.data, Math.round((options.seconds ?? 2) * 60));
  if (report.errors.length) throw new Error(`the run logged errors, so nothing was written: ${report.errors.slice(0, 3).join(' | ')}`);
  const { ops, moved } = stage.settleOps(doc.data, report.objects, options.ids);
  if (!ops.length) return null;
  const event = await session.edit(file, { label: `Settle ${moved.length} object${moved.length === 1 ? '' : 's'}`, ops }, origin);
  return { moved, revision: event?.revision ?? 0 };
}
