import type { BaseRenderer, SpriteOptions, TextureSource } from './renderers/baseRenderer.ts';

export interface SpriteFrame {
  tileX: number;
  tileY: number;
}

export interface SpriteAnimation {
  frames: SpriteFrame[];
  /** Frames per second; 0 holds the first frame. */
  fps: number;
  /** Repeat, or hold the last frame. */
  loop: boolean;
}

/** Extra `draw` options: `drawSprite`'s, plus which animation frame to draw. */
export type SpriteDrawOptions = Partial<Omit<SpriteOptions, 'image' | 'x' | 'y'>> & {
  /**
   * Which of the animation's frames to draw (default 0; legacy single-frame
   * animations add `currentFrame` to the column instead).
   */
  frame?: number;
};

/**
 * One image divided into equal frames, with named animations over them.
 *
 * An animation is a list of frames and an optional rate. `define` adds one
 * frame to an animation (calling it again adds another), `defineAnimation`
 * sets the whole list at once. A sheet with a single-frame animation keeps
 * the old contract too: `currentFrame` is added to that frame's column, so
 * an actor that steps the column itself still works.
 *
 * Playback lives on the entity (`Entity.animTime`, advanced in `update`),
 * not here: one sheet is shared by every entity drawn from it, and each of
 * them is at a different point in its cycle.
 */
export class SpriteSheet {
  tileW: number;
  tileH: number;
  width: number;
  height: number;
  animations: Map<string, SpriteAnimation>;
  currentFrame: number;
  image: TextureSource;
  loaded: boolean;
  game: { renderer: BaseRenderer } | null | undefined;

  constructor(
    image: TextureSource, tileW: number, tileH: number,
    game: { renderer: BaseRenderer } | null | undefined,
    width: number = tileW, height: number = tileH
  ) {
    this.tileW = tileW;
    this.tileH = tileH;
    this.width = width;
    this.height = height;
    this.animations = new Map();
    this.currentFrame = 0;
    this.image = image;
    this.loaded = true;
    this.game = game;
  }

  /** Add a frame to an animation, creating it at rate 0 if it is new. */
  define(name: string, tileX: number, tileY: number): void {
    const animation = this.animations.get(name);
    if (animation) animation.frames.push({ tileX, tileY });
    else this.animations.set(name, { frames: [{ tileX, tileY }], fps: 0, loop: true });
  }

  /**
   * Set an animation's frames and rate.
   * @param options.fps - Frames per second; 0 holds the first frame
   * @param options.loop - Repeat, or hold the last frame
   */
  defineAnimation(
    name: string,
    frames: ReadonlyArray<readonly [number, number] | SpriteFrame>,
    { fps = 0, loop = true }: { fps?: number; loop?: boolean } = {}
  ): void {
    const list = frames.map(f => Array.isArray(f) ? { tileX: f[0], tileY: f[1] } : f as SpriteFrame);
    this.animations.set(name, { frames: list, fps, loop });
  }

  has(name: string): boolean {
    return this.animations.has(name);
  }

  /** How many frames an animation has; 0 for an unknown one. */
  frameCount(name: string): number {
    return this.animations.get(name)?.frames.length ?? 0;
  }

  /**
   * The frame an animation shows `time` seconds in: looping, or held on
   * the last frame. A rate of 0 shows the first frame.
   */
  frameAt(name: string, time: number): number {
    const animation = this.animations.get(name);
    if (!animation || animation.frames.length <= 1 || !animation.fps) return 0;
    const index = Math.floor(time * animation.fps);
    const count = animation.frames.length;
    return animation.loop ? ((index % count) + count) % count : Math.min(count - 1, index);
  }

  /**
   * Draw one frame of an animation centred on `x, y`.
   * @param anim - Animation name; null draws column `currentFrame` of row 0
   * @param options - `drawSprite` options, plus `frame`: which of
   *   the animation's frames to draw (default 0; legacy single-frame
   *   animations add `currentFrame` to the column instead)
   */
  draw(anim: string | null, x: number, y: number, options: SpriteDrawOptions = {}): void {
    if (!this.loaded) return;

    if (!this.game) {
      console.error('Game instance not found');
      return;
    }

    const { frame, ...rest } = options;
    if (!anim) {
      this.game.renderer.drawSprite({
        image: this.image,
        x,
        y,
        tileWidth: this.tileW,
        tileHeight: this.tileH,
        tileX: this.currentFrame,
        tileY: 0,
        ...rest
      });
      return;
    }

    const animation = this.animations.get(anim);
    if (!animation) {
      console.warn(`Animation ${anim} not found`);
      return;
    }

    const frames = animation.frames;
    let tileX;
    let tileY;
    if (frames.length === 1) {
      tileX = frames[0]!.tileX + this.currentFrame;
      tileY = frames[0]!.tileY;
    } else {
      const f = frames[Math.min(frames.length - 1, Math.max(0, frame ?? 0))]!;
      tileX = f.tileX;
      tileY = f.tileY;
    }

    this.game.renderer.drawSprite({
      image: this.image,
      x,
      y,
      tileWidth: this.tileW,
      tileHeight: this.tileH,
      tileX,
      tileY,
      ...rest
    });
  }
}
