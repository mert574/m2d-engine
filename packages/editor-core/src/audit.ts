/**
 * Search and audit across a project's scenes: where a prefab, an asset or
 * a path is used, which references dangle, and which files nothing names.
 *
 * References come from the schema walk itself (the loader's `onRef` fires
 * at every `s.ref`), so a reference added to the format is found here
 * without this file changing. File URLs are the one exception — they are
 * strings, not refs — collected from the keys the format gives them.
 */

import { SceneLoader } from 'm2d-engine/core/sceneLoader.js';
import { isPlainObject } from './descriptors.ts';

export interface SceneInput {
  /** Project-relative file path: how the editor and MCP address it. */
  path: string;
  name: string | null;
  data: Record<string, unknown>;
}

/** One reference a scene makes: `scope` names the namespace, `at` the field. */
export interface Reference {
  scene: string;
  scope: string;
  name: string;
  at: string;
}

/** One file URL a scene names: a sheet's image, a model, a sound. */
export interface FileUse {
  scene: string;
  url: string;
  at: string;
}

export interface Audit {
  /** URLs scenes name and no project file answers to. */
  missingFiles: FileUse[];
  /** Project files (by scene-facing url) no scene names. */
  unusedFiles: string[];
  /** Prefabs no object, prop or rule of their own scene uses. */
  unusedPrefabs: Array<{ scene: string; prefab: string }>;
  /** Paths nothing follows. */
  unusedPaths: Array<{ scene: string; path: string }>;
  /** How many references each scene makes to each other scene, by name. */
  sceneUses: Array<{ scene: string; to: string; count: number }>;
}

/**
 * Every reference every scene makes, through the schema walk; validity is
 * `validateScene`'s business. A rule's `switch` is the format's one
 * reference kept as a string (it may name a scene the game's page builds
 * in code), so it is collected by hand.
 */
export function references(scenes: SceneInput[], game: unknown = null): Reference[] {
  return checked(scenes, game).refs;
}

/**
 * One loader pass per scene: the references it makes, and the loaded
 * document where the check produced one — `uses` expanded into the sheets
 * and models it binds, which the raw document only names by uid.
 */
function checked(scenes: SceneInput[], game: unknown): { refs: Reference[]; loaded: Map<string, Record<string, unknown>> } {
  const refs: Reference[] = [];
  const loaded = new Map<string, Record<string, unknown>>();
  for (const scene of scenes) {
    const result = new SceneLoader(game).check(scene.data, scene.name ?? scene.path, {
      onRef: (scope, name, at) => refs.push({ scene: scene.path, scope, name, at })
    });
    if (result.loaded) loaded.set(scene.path, result.loaded);
    const rules = isPlainObject(scene.data.world) && Array.isArray(scene.data.world.rules) ? scene.data.world.rules : [];
    rules.forEach((rule, r) => {
      const actions = isPlainObject(rule) && Array.isArray(rule.then) ? rule.then : [];
      actions.forEach((action, a) => {
        if (isPlainObject(action) && action.do === 'switch' && typeof action.scene === 'string') {
          refs.push({ scene: scene.path, scope: 'scene', name: action.scene, at: `world.rules[${r}].then[${a}].scene` });
        }
      });
    });
  }
  return { refs, loaded };
}

/** The file URLs a scene names, with where: `url` keys, a texture's maps, an image element's sprite. */
export function fileUses(scene: SceneInput): FileUse[] {
  const out: FileUse[] = [];
  const walk = (value: unknown, at: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${at}[${i}]`));
      return;
    }
    if (!isPlainObject(value)) return;
    for (const [key, field] of Object.entries(value)) {
      const here = at ? `${at}.${key}` : key;
      if (typeof field === 'string' && (['url', 'normal', 'arm'].includes(key) || (key === 'sprite' && value.type === 'image'))) {
        out.push({ scene: scene.path, url: field, at: here });
      } else walk(field, here);
    }
  };
  walk(scene.data, '');
  return out;
}

/** Where `name` of `scope` (prefab, spritesheet, model, environment, path, scene, …) is used, across every scene. */
export function usesOf(scenes: SceneInput[], scope: string, name: string, game: unknown = null): Reference[] {
  return references(scenes, game).filter((ref) => ref.scope === scope && ref.name === name);
}

/** The project audited whole. `files` are the scene-facing urls of every asset file. */
export function auditProject(scenes: SceneInput[], files: string[], game: unknown = null): Audit {
  const { refs, loaded } = checked(scenes, game);
  const used = scenes.flatMap((scene) => fileUses({ ...scene, data: loaded.get(scene.path) ?? scene.data }));
  const have = new Set(files);
  const named = new Set(used.map((use) => use.url));

  const usedIn = (scene: SceneInput, scope: string) => new Set(
    refs.filter((ref) => ref.scene === scene.path && ref.scope === scope).map((ref) => ref.name));
  const declared = (scene: SceneInput, key: string) => {
    const block = key === 'prefabs' ? scene.data.prefabs : scene.data.paths;
    return isPlainObject(block) ? Object.keys(block) : [];
  };

  const names = new Map(scenes.flatMap((scene) => (scene.name ? [[scene.name, scene.path] as const] : [])));
  const sceneUses = new Map<string, number>();
  for (const ref of refs) {
    if (ref.scope !== 'scene' || !names.has(ref.name)) continue;
    const key = `${ref.scene}\u0000${ref.name}`;
    sceneUses.set(key, (sceneUses.get(key) ?? 0) + 1);
  }

  return {
    missingFiles: used.filter((use) => !have.has(use.url)),
    unusedFiles: files.filter((url) => !named.has(url)).sort(),
    unusedPrefabs: scenes.flatMap((scene) => {
      const uses = usedIn(scene, 'prefab');
      return declared(scene, 'prefabs').filter((prefab) => !uses.has(prefab)).map((prefab) => ({ scene: scene.path, prefab }));
    }),
    unusedPaths: scenes.flatMap((scene) => {
      const uses = usedIn(scene, 'path');
      return declared(scene, 'paths').filter((path) => !uses.has(path)).map((path) => ({ scene: scene.path, path }));
    }),
    sceneUses: [...sceneUses].map(([key, count]) => {
      const [scene, to] = key.split('\u0000') as [string, string];
      return { scene, to, count };
    })
  };
}
