/**
 * Asset URLs for a scene opened from a folder.
 *
 * A scene names its images and models by paths a *served* game resolves
 * against its `basePath` — but a project opened through the File System
 * Access API is not served; there is no URL a fetch could reach. So the
 * viewport materializes a copy of the document whose asset URLs have been
 * replaced with blob URLs read out of the project folder, and the
 * document itself stays exactly what the file says.
 *
 * Where a path is relative *to* is each game's `basePath`, which lives in
 * that game's own `main.js` — code the editor cannot run. The convention
 * every shipped demo follows is `<demo>/scenes/<scene>.json` with URLs
 * relative to `<demo>/`, so the lookup tries the scene's folder, its
 * parent, then the project root, and takes the first file that exists.
 * A proper project manifest (E5) replaces the guess with a declaration.
 */

import { isPlainObject } from 'm2d-editor-core';
import type { BrowserProject } from './project.ts';

/** `a/b/c.json` → `a/b`; '' at the top. */
const dirname = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

const join = (base: string, path: string): string => (base ? `${base}/${path}` : path);

/** Whether a URL already resolves without the project: data:, blob:, http(s):. */
const isAbsolute = (url: string): boolean => /^(data|blob|https?):/.test(url);

export interface Materializable {
  /** A copy of the document with reachable asset URLs. */
  data: Record<string, unknown>;
  /** Give the blob URLs back; call when the viewport closes the scene. */
  revoke(): void;
}

export async function withProjectAssets(
  data: Record<string, unknown>, project: BrowserProject, scenePath: string
): Promise<Materializable> {
  const copy = structuredClone(data);
  const urls: string[] = [];
  const sceneDir = dirname(scenePath);
  const candidates = (url: string): string[] => [
    join(sceneDir, url),
    join(dirname(sceneDir), url),
    url
  ];

  const rewrite = async (holder: Record<string, unknown>, key: string): Promise<void> => {
    const url = holder[key];
    if (typeof url !== 'string' || !url || isAbsolute(url)) return;
    for (const candidate of candidates(url)) {
      const file = await project.readFile(candidate);
      if (!file) continue;
      const blob = URL.createObjectURL(file);
      urls.push(blob);
      holder[key] = blob;
      return;
    }
    // Left as it was: the engine will report the fetch it could not make.
  };

  const assets = isPlainObject(copy.assets) ? copy.assets : {};
  for (const group of ['spritesheets', 'models', 'environments']) {
    const entries = assets[group];
    if (!isPlainObject(entries)) continue;
    for (const entry of Object.values(entries)) {
      if (isPlainObject(entry)) await rewrite(entry, 'url');
    }
  }
  // A prefab's mesh may carry a tiling texture of its own.
  if (isPlainObject(copy.prefabs)) {
    for (const prefab of Object.values(copy.prefabs)) {
      if (!isPlainObject(prefab) || !isPlainObject(prefab.mesh)) continue;
      const texture = prefab.mesh.texture;
      if (isPlainObject(texture)) await rewrite(texture, 'url');
    }
  }

  return {
    data: copy,
    revoke() {
      for (const url of urls.splice(0)) URL.revokeObjectURL(url);
    }
  };
}
