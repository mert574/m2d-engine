/**
 * The project's assets, as the editor's asset browser shows them, and the
 * library they come from.
 *
 * **Files.** Models, images and environments anywhere in the project
 * folder, by kind, with the URL a scene names them by (relative to the
 * game's `basePath`). A model's bounds and an image's size come on request
 * (`info`), which is what placing one needs: a collider that fits the
 * mesh, a sprite sheet whose frame is the image.
 *
 * **The library.** Assets enter a project as *recipes*, never as bytes:
 * `library.json` records each import — source, id, resolution, the credit —
 * and the files it produced; `CREDITS.md` is rendered from it, so a credit
 * cannot be forgotten. An import fetches through the source's client
 * (checksummed, resumable) into `library/sources/` (ignored by git) and
 * compiles a model in a child process into `library/models/`.
 */

import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, relative, sep, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as polyhaven from './pipeline/polyhaven.mjs';
import type { Project } from './project.ts';

export type AssetKind = 'model' | 'image' | 'environment' | 'audio';

export interface AssetFile {
  /** Project-relative, forward slashes. */
  path: string;
  /** What a scene's `url` names it by: relative to the game's basePath. */
  url: string;
  kind: AssetKind;
  bytes: number;
  /** The library record it came from, when it was imported. */
  credit?: LibraryRecord;
  /**
   * A rendered thumbnail's project-relative path, when the editor has made
   * one for this file as it stands (keyed by path, size and mtime); see
   * `storeThumbnail`.
   */
  thumb?: string;
  /** The key a thumbnail for this file is stored under. */
  thumbKey: string;
}

export interface LibraryRecord {
  source: string;
  type: 'models' | 'textures' | 'hdris';
  id: string;
  resolution: string;
  name: string;
  authors: string[];
  license: string;
  page: string;
  /** Project-relative paths of what the import produced. */
  files: string[];
}

export interface Job {
  id: number;
  label: string;
  stage: 'queued' | 'fetching' | 'compiling' | 'done' | 'failed';
  /** 0..1 within the stage, when known. */
  progress: number | null;
  message?: string;
  result?: { record: LibraryRecord; file: AssetFile };
}

const KINDS: Record<string, AssetKind> = {
  '.glb': 'model', '.gltf': 'model',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image',
  '.hdr': 'environment',
  '.wav': 'audio', '.mp3': 'audio', '.ogg': 'audio'
};

/** Folders that are never a project's assets: dependencies, builds, fetched sources. */
const SKIP = new Set(['node_modules', 'dist', 'site', 'sources', 'assets-src', '.m2d', 'thumbs']);

const COMPILE_JOB = fileURLToPath(new URL('./pipeline/compileJob.mjs', import.meta.url));

/** Where rendered thumbnails live, project-relative; `.gitignore` takes every png. */
const THUMBS = 'library/thumbs';

export class Assets {
  readonly project: Project;
  #jobs = new Map<number, Job>();
  #nextJob = 1;
  #listeners = new Set<(job: Job) => void>();

  constructor(project: Project) {
    this.project = project;
  }

  /** Hear every job's progress. Returns an unsubscribe. */
  onJob(listener: (job: Job) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  get jobs(): Job[] {
    return [...this.#jobs.values()];
  }

  /** Every asset file in the project, by walking it. */
  async list(): Promise<AssetFile[]> {
    const { basePath } = await this.project.config();
    const library = await this.library();
    const byFile = new Map(library.flatMap((record) => record.files.map((file) => [file, record] as const)));
    const found: AssetFile[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        const kind = KINDS[extname(entry.name).toLowerCase()];
        if (!kind) continue;
        const path = relative(this.project.root, full).split(sep).join('/');
        const url = relative(this.project.resolve(basePath), full).split(sep).join('/');
        const record = byFile.get(path);
        const info = await stat(full);
        const thumbKey = createHash('sha1').update(`${path}|${info.size}|${info.mtimeMs}`).digest('hex');
        const thumb = `${THUMBS}/${thumbKey}.png`;
        found.push({
          path, url, kind, bytes: info.size, thumbKey,
          ...(record && { credit: record }),
          ...(existsSync(this.project.resolve(thumb)) && { thumb })
        });
      }
    };
    await walk(this.project.root);
    found.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
    return found;
  }

  /**
   * What placing an asset needs to know. A model: its bounds in metres
   * (the first level of detail's, when it has levels), from which a
   * collider and an offset follow. An image: its pixel size.
   */
  async info(path: string): Promise<{ bounds?: { min: number[]; max: number[] }; width?: number; height?: number }> {
    const full = this.project.resolve(path);
    const kind = KINDS[extname(full).toLowerCase()];
    if (kind === 'model') {
      const { NodeIO, getBounds } = await import('@gltf-transform/core');
      const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
      const doc = await io.read(full);
      const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
      if (!scene) throw new Error(`${path}: no scene`);
      const lod0 = scene.listChildren().find((node) => node.getName() === 'LOD0');
      const { min, max } = getBounds(lod0 ?? scene);
      return { bounds: { min: [...min], max: [...max] } };
    }
    if (kind === 'image') {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(full).metadata();
      return { width: meta.width, height: meta.height };
    }
    return {};
  }

  /**
   * Keep a thumbnail the editor rendered for a file: a PNG under
   * `library/thumbs/` by the file's key, so it is drawn once per file
   * state and shared by every tab. Images are built, never committed.
   */
  async storeThumbnail(thumbKey: string, png: Buffer): Promise<string> {
    if (!/^[0-9a-f]{40}$/.test(thumbKey)) throw new Error('a thumbnail key is a sha1');
    const path = `${THUMBS}/${thumbKey}.png`;
    const full = this.project.resolve(path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, png);
    return path;
  }

  /** The project's library records. */
  async library(): Promise<LibraryRecord[]> {
    try {
      const data = JSON.parse(await readFile(join(this.project.root, 'library.json'), 'utf8')) as { assets?: LibraryRecord[] };
      return Array.isArray(data.assets) ? data.assets : [];
    } catch {
      return [];
    }
  }

  /** Search a library source. Only Poly Haven so far. */
  search(source: string, type: string, query: string) {
    if (source !== polyhaven.SOURCE) throw new Error(`no library source '${source}' (have: ${polyhaven.SOURCE})`);
    return polyhaven.search(type, query);
  }

  /**
   * Import an asset as a background job: fetch, compile when it is a
   * model, record the recipe and the credit. Returns the job at once;
   * progress arrives through `onJob`.
   */
  import(source: string, type: string, id: string, resolution = '2k'): Job {
    if (source !== polyhaven.SOURCE) throw new Error(`no library source '${source}'`);
    if (!['models', 'textures', 'hdris'].includes(type)) throw new Error(`cannot import a ${type}`);
    if (!/^[\w-]+$/.test(id)) throw new Error(`'${id}' is not an asset id`);
    const job: Job = { id: this.#nextJob++, label: `${id} (${type})`, stage: 'queued', progress: null };
    this.#jobs.set(job.id, job);
    void this.#run(job, type as LibraryRecord['type'], id, resolution);
    this.#emit(job);
    return job;
  }

  async #run(job: Job, type: LibraryRecord['type'], id: string, resolution: string): Promise<void> {
    const root = this.project.root;
    const update = (patch: Partial<Job>) => { Object.assign(job, patch); this.#emit(job); };
    try {
      const library = join(root, 'library');
      await mkdir(library, { recursive: true });
      // The fetched sources are a cache the recipe can always refill.
      if (!existsSync(join(library, '.gitignore'))) await writeFile(join(library, '.gitignore'), 'sources/\n');
      update({ stage: 'fetching', progress: 0 });
      let output: string;
      let fetchedResolution = resolution;
      if (type === 'models') {
        const sourceDir = join(library, 'sources', polyhaven.SOURCE, id);
        const fetched = await polyhaven.fetchModel(id, resolution, sourceDir, (done, total) => {
          update({ progress: total ? done / total : null });
        });
        fetchedResolution = fetched.resolution ?? resolution;
        output = join(library, 'models', `${id}.glb`);
        update({ stage: 'compiling', progress: null, message: 'decimating and encoding textures' });
        const card = await polyhaven.credit(id, type);
        await compileInChild({
          source: fetched.gltf, to: output, kind: kindFor(card.categories),
          label: `${polyhaven.SOURCE}:${id}`, name: card.name, authors: card.authors
        });
      } else if (type === 'textures') {
        output = join(library, 'textures', `${id}_diff_${resolution}.jpg`);
        await polyhaven.fetchTexture(id, resolution, output);
      } else {
        output = join(library, 'environments', `${id}_${resolution}.hdr`);
        await polyhaven.fetchHDRI(id, resolution, output);
      }
      const card = await polyhaven.credit(id, type);
      const path = relative(root, output).split(sep).join('/');
      const record: LibraryRecord = {
        source: card.source, type, id, resolution: fetchedResolution,
        name: card.name, authors: card.authors, license: card.license, page: card.page, files: [path]
      };
      await this.#record(record);
      const file = (await this.list()).find((each) => each.path === path)!;
      update({ stage: 'done', progress: 1, message: undefined, result: { record, file } });
    } catch (error) {
      update({ stage: 'failed', progress: null, message: String((error as Error).message ?? error) });
    }
  }

  /** Add or replace a record, and render the credits from all of them. */
  async #record(record: LibraryRecord): Promise<void> {
    const records = (await this.library()).filter((each) => !(each.source === record.source && each.id === record.id && each.type === record.type));
    records.push(record);
    records.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
    await writeFile(join(this.project.root, 'library.json'), JSON.stringify({ assets: records }, null, 2) + '\n');
    await writeFile(join(this.project.root, 'CREDITS.md'), renderCredits(records));
  }

  #emit(job: Job): void {
    for (const listener of this.#listeners) listener({ ...job });
  }
}

/** The compiler's budget, from what the source says the asset is. */
function kindFor(categories: string[]): string {
  const said = categories.map((c) => c.toLowerCase());
  if (said.some((c) => /tree|plant|vegetation/.test(c))) return 'tree';
  if (said.some((c) => /rock|stone/.test(c))) return 'rock';
  if (said.some((c) => /grass|ground|nature/.test(c))) return 'ground';
  return 'prop';
}

function compileInChild(args: Record<string, unknown>): Promise<unknown> {
  return new Promise((done, fail) => {
    execFile(process.execPath, ['--max-old-space-size=4096', COMPILE_JOB, JSON.stringify(args)],
      { maxBuffer: 64 * 1024 * 1024, cwd: resolve(COMPILE_JOB, '..') },
      (error, stdout, stderr) => {
        const line = stdout.trim().split('\n').pop() ?? '';
        try {
          const parsed = JSON.parse(line) as { ok: boolean; result?: unknown; error?: string };
          if (parsed.ok) done(parsed.result);
          else fail(new Error(parsed.error));
        } catch {
          fail(new Error(error?.message ?? (stderr.trim().split('\n').pop() || 'the compiler exited without a result')));
        }
      });
  });
}

/** CREDITS.md, from the library: one table per source, pack, author, licence and link only. */
export function renderCredits(records: LibraryRecord[]): string {
  const lines = [
    '# Credits',
    '',
    'Generated by the M2D editor from `library.json`; edit that, not this.',
    ''
  ];
  const sources = [...new Set(records.map((record) => record.source))];
  for (const source of sources) {
    lines.push(`## ${source === 'polyhaven' ? 'Poly Haven' : source}`, '', '| Asset | Author | License | Source |', '| --- | --- | --- | --- |');
    for (const record of records.filter((each) => each.source === source)) {
      lines.push(`| ${record.name} | ${record.authors.join(', ')} | ${record.license} | ${record.page} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
