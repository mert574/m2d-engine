/**
 * The Project tab: `m2d.project.json` in the inspector — the scene the
 * game opens on, its display, its named input actions, boot music — the
 * same rows the MCP `read_project` tool returns, from the engine's
 * `PROJECT_SCHEMA`. An edit goes to the host, which refuses it whole when
 * the file would no longer be a valid project and otherwise writes it at
 * once; the file has no undo, as a project setting is not a scene edit.
 */

import { project as projectFile, type Op, type PathSegment, type ValidationIssue } from 'm2d-editor-core';
import { createInspector } from './inspector.ts';
import { get, post } from './host.ts';

export interface ProjectPanelOptions {
  /** Tell the person something in the status bar. */
  say: (message: string) => void;
  /** After a change was written: the project's config is stale. */
  changed: () => void;
  /** The project's scene names, for the opening-scene picker. */
  scenes: () => string[];
}

export function createProjectPanel(container: HTMLElement, options: ProjectPanelOptions): { refresh: () => Promise<void> } {
  let file: Record<string, unknown> = {};

  const apply = async (ops: Op[], label: string): Promise<void> => {
    try {
      file = (await post<{ file: Record<string, unknown> }>('/__project/edit', { ops })).file;
      options.say(`Project: ${label}`);
      options.changed();
      render();
    } catch (error) {
      options.say(String((error as Error).message ?? error));
      render();
    }
  };

  const inspector = createInspector(container, {
    edit: (path: PathSegment[], value: unknown, label: string) => { void apply([{ op: 'set', path, value } as Op], label); },
    list: (op: unknown, label: string) => { void apply([op as Op], label); },
    refs: (scope: string) => (scope === 'scene' ? options.scenes() : []),
    // Renaming an action (or a track) moves its entry to the new name.
    rename: (path: PathSegment[], from: string, to: string) => {
      const record = path.reduce<unknown>((at, key) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[key as string] : undefined), file) as Record<string, unknown> | undefined;
      if (!record || !(from in record)) return;
      void apply([{ op: 'set', path: [...path, to], value: record[from] } as Op, { op: 'set', path: [...path, from] } as Op], `Rename ${from} to ${to}`);
    }
  });

  const render = (): void => {
    const problems = projectFile.projectProblems(file);
    inspector.show('m2d.project.json', projectFile.inspectProject(file), {
      kind: 'project',
      issues: problems.map((problem) => ({ path: problem.path, message: problem.message })) as ValidationIssue[],
      groups: [
        { id: 'game', label: 'Game', keys: ['name', 'initialScene', 'definition', 'hooks', 'scenes', 'basePath', 'settings'] },
        { id: 'display', label: 'Display', keys: ['display'] },
        { id: 'input', label: 'Input', keys: ['input'] },
        { id: 'audio', label: 'Audio', keys: ['music'], rest: true }
      ]
    });
  };

  const refresh = async (): Promise<void> => {
    try {
      file = (await get<{ file: Record<string, unknown> }>('/__project/file')).file;
      render();
    } catch (error) {
      inspector.clear(String((error as Error).message ?? error));
    }
  };

  return { refresh };
}
