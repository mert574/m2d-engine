/**
 * New projects, from templates.
 *
 * A template is a complete small game — definition, hooks, a boot page, a
 * scene — that runs as it is and builds as it is, so a new project starts
 * from something that works and is changed from there. Two ship: a 2D
 * platformer and a 3D blockout, both drawn without art (the engine's
 * `Prop` blocks and a hero drawn in code), since a template must not
 * carry generated images and a fresh project has no assets yet.
 */

import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeScene } from 'm2d-editor-core';

export const TEMPLATES = {
  '2d': 'A small platformer: a hero, platforms, a goal',
  '3d': 'A sunny blockout: ground, blocks, pillars, a ball, orbit camera'
} as const;
export type TemplateName = keyof typeof TEMPLATES;

const TEMPLATE_DIR = fileURLToPath(new URL('../templates', import.meta.url));

/**
 * Create a project at `folder` (absolute, or relative to the working
 * directory) from a template. Refuses a folder that has anything in it:
 * a template never writes over someone's files.
 */
export async function createProject(folder: string, template: string, name?: string): Promise<{ root: string; name: string }> {
  if (!(template in TEMPLATES)) throw new Error(`no template '${template}' (have: ${Object.keys(TEMPLATES).join(', ')})`);
  const root = resolve(folder);
  if (existsSync(root) && (await readdir(root)).length) throw new Error(`${root} is not empty; a new project needs an empty or new folder`);
  await mkdir(root, { recursive: true });
  await cp(join(TEMPLATE_DIR, template), root, { recursive: true });

  const title = name?.trim() || titleFrom(basename(root));
  const configPath = join(root, 'm2d.project.json');
  const config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
  config.name = title;
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

  const packagePath = join(root, 'package.json');
  const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>;
  pkg.name = slug(title);
  await writeFile(packagePath, JSON.stringify(pkg, null, 2) + '\n');

  const page = join(root, 'index.html');
  await writeFile(page, (await readFile(page, 'utf8')).replace(/<title>.*<\/title>/, `<title>${escapeHtml(title)}</title>`));

  // Scenes in canonical form, so the first save diffs only what changed.
  for (const file of await readdir(join(root, 'scenes'))) {
    if (!file.endsWith('.json')) continue;
    const scene = join(root, 'scenes', file);
    await writeFile(scene, writeScene(JSON.parse(await readFile(scene, 'utf8'))));
  }
  await writeFile(join(root, '.gitignore'), 'node_modules/\ndist/\nlibrary/sources/\n');
  return { root, name: title };
}

function titleFrom(folder: string): string {
  return folder.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'My Game';
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
