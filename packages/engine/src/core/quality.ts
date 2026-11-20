/**
 * Texture and model quality: the levels a game builds its models at, and
 * the one the player has chosen.
 *
 * A project declares the levels in `m2d.project.json`'s `quality` block,
 * per axis — `textures` (the largest texture side a model keeps) and
 * `models` (the most triangles a model keeps up close) — each level a
 * name and the number the compiler caps at, with one default. A model
 * asset marked `quality: true` has been built at every combination:
 *
 *   models/ph/tree.glb            the defaults
 *   models/ph/1k-70k/tree.glb     every other combination, in a folder
 *                                 named for its levels, textures first
 *
 * so a build that ships only the defaults (a published site) needs no
 * other file, and a game that offers the levels as settings swaps the
 * folder. This module is pure data and runs anywhere: the asset pipeline
 * reads the same names to know what to write where.
 */

/** The axes, in the order a variant folder names them. */
export const QUALITY_AXES = ['textures', 'models'] as const;

export type QualityAxis = (typeof QUALITY_AXES)[number];

/** One axis of `m2d.project.json`'s `quality`: levels by name, and the default. */
export interface QualityAxisSpec {
  levels: Record<string, number>;
  default: string;
}

/** `m2d.project.json`'s `quality` block. */
export type QualityDeclaration = Partial<Record<QualityAxis, QualityAxisSpec>>;

/** A model asset as `url` reads it. */
export interface QualityAsset {
  url: string;
  quality?: boolean;
}

/**
 * Every combination of a declaration's levels, with the folder it is
 * built into (null for the defaults) and each axis's level and number.
 */
export function qualityVariants(declaration: QualityDeclaration | null | undefined): Array<{ folder: string | null; levels: Record<string, { name: string; value: number }> }> {
  const axes = QUALITY_AXES.filter((axis) => declaration?.[axis]);
  let combos: Array<Record<string, { name: string; value: number }>> = [{}];
  for (const axis of axes) {
    combos = combos.flatMap((combo) => Object.entries(declaration![axis]!.levels)
      .map(([name, value]) => ({ ...combo, [axis]: { name, value } })));
  }
  return combos.map((levels) => ({ folder: variantFolder(declaration, Object.fromEntries(axes.map((axis) => [axis, levels[axis]!.name]))), levels }));
}

/**
 * The folder one choice of levels is built into, or null when every axis
 * is at its default. `choice` is a level name per axis.
 */
export function variantFolder(declaration: QualityDeclaration | null | undefined, choice: Record<string, string>): string | null {
  const axes = QUALITY_AXES.filter((axis) => declaration?.[axis]);
  if (axes.every((axis) => choice[axis] === declaration![axis]!.default)) return null;
  return axes.map((axis) => choice[axis]).join('-');
}

/** `url` with its file moved into `folder`, beside where it was; the url itself for none. */
export function variantUrl(url: string, folder: string | null | undefined): string {
  if (!folder) return url;
  const slash = url.lastIndexOf('/');
  return `${url.slice(0, slash + 1)}${folder}/${url.slice(slash + 1)}`;
}

/**
 * What is wrong with a declaration, beyond its shape: a default that names
 * no level of its axis.
 */
export function qualityIssues(declaration: QualityDeclaration | null | undefined): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  for (const axis of QUALITY_AXES) {
    const spec = declaration?.[axis];
    if (spec && !Object.hasOwn(spec.levels ?? {}, spec.default)) {
      issues.push({ path: `quality.${axis}.default`, message: `names no level of quality.${axis}.levels (${Object.keys(spec.levels ?? {}).join(', ') || 'none'})` });
    }
  }
  return issues;
}

/** The levels a game was built at, and the one each axis shows now. */
export class Quality {
  /** `m2d.project.json`'s `quality`. */
  declaration: QualityDeclaration | null;
  /** The level each declared axis shows, by name. */
  choice: Record<string, string>;

  constructor(declaration: QualityDeclaration | null = null) {
    this.declaration = declaration;
    this.choice = Object.fromEntries(QUALITY_AXES.filter((axis) => declaration?.[axis]).map((axis) => [axis, declaration![axis]!.default]));
  }

  /** Whether the game declares any levels. */
  get declared(): boolean {
    return Object.keys(this.choice).length > 0;
  }

  /** An axis's level names, in the declaration's order: highest first, by convention. */
  levels(axis: QualityAxis): string[] {
    return Object.keys(this.declaration?.[axis]?.levels ?? {});
  }

  /** What an axis's level caps at: pixels a side for textures, triangles for models. */
  sizeOf(axis: QualityAxis, name: string): number | null {
    return this.declaration?.[axis]?.levels?.[name] ?? null;
  }

  /** Show another level on one axis. */
  set(axis: QualityAxis, name: string): void {
    if (!this.levels(axis).includes(name)) throw new Error(`M2D quality: '${name}' is not a ${axis} level (${this.levels(axis).join(', ')})`);
    this.choice[axis] = name;
  }

  /** The file a model asset loads at the levels chosen now. */
  url(asset: QualityAsset): string {
    return asset.quality ? variantUrl(asset.url, variantFolder(this.declaration, this.choice)) : asset.url;
  }
}
