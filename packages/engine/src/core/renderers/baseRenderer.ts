/**
 * Base renderer interface that all renderer backends must implement.
 *
 * A renderer backend owns the target canvas and draws both world-space and
 * screen-space (UI) content. World-space drawing happens between beginFrame()
 * and endFrame() with the camera transform applied; screen-space drawing
 * happens between beginScreenFrame() and endScreenFrame(), or by passing
 * `isScreenSpace: true` to any draw call.
 *
 * ## Colours
 *
 * Colours are CSS strings. Backends must support `#rgb`, `#rgba`, `#rrggbb`,
 * `#rrggbbaa`, `rgb()`, `rgba()`, `transparent`, and the CSS named colours.
 *
 * ## Style descriptors
 *
 * Wherever a `fillStyle` or `strokeStyle` is accepted, backends must support
 * either a colour string or a declarative gradient descriptor:
 *
 *   { type: 'linear', x0, y0, x1, y1, stops: [{ offset, color }, ...] }
 *   { type: 'radial', x, y, r0 = 0, r1, stops: [{ offset, color }, ...] }
 *
 * A radial gradient is concentric: it runs from radius `r0` to `r1` around
 * the single centre (x, y). Coordinates are in the same space as the draw
 * call they are used with.
 *
 * ## Common draw options
 *
 * All draw methods accept these optional fields:
 * - {boolean} isScreenSpace - Draw in screen space (ignores camera), default false
 * - {number} globalAlpha - Opacity multiplier in [0, 1], applied once to the
 *   whole primitive (fill, stroke and shadow together).
 * - {Object} shadow - Drop shadow / glow: { color, blur, offsetX, offsetY }.
 *   The shadow is the primitive's complete silhouette — fill plus stroke, or
 *   the image's alpha — offset by (offsetX, offsetY), blurred, tinted with
 *   `color`, and drawn once beneath the primitive. `blur` is a Gaussian blur
 *   whose standard deviation is blur / 2 (the Canvas 2D definition).
 * - {string} blend - How the primitive combines with what is already there:
 *   `'normal'` (default, source-over), `'additive'`, `'multiply'` or
 *   `'screen'`. Optional.
 *
 * ## State stacks
 *
 * pushTransform/popTransform and pushClip/popClip form one nested state
 * stack: pushes and pops of either kind must nest strictly (a clip pushed
 * inside a transform must be popped before that transform). Each stack entry
 * belongs to either the world or the screen pass, chosen by `isScreenSpace`
 * on the push.
 *
 * ## Everything is mandatory
 *
 * A backend that cannot do something documented here is not a backend: the
 * conformance suite holds every one to all of it, tint, blending, batched
 * particles, lights, shadow casters and the post pass included. A game
 * writes to the contract and never asks what the backend can do.
 *
 * This is an abstract class and cannot be instantiated directly.
 */


import { identityViewport, type Viewport } from '../viewport.ts';
import type { SpriteSheet } from '../spriteSheet.js';
import type { Geometry } from './geometry/primitives.ts';

/**
 * Floats per particle in a `drawParticles` buffer:
 * x, y, size, rotation, r, g, b, a — colour is straight (not premultiplied),
 * 0..1, and white means untinted. `size` is the drawn height; width follows
 * the tile's aspect ratio.
 */
export const PARTICLE_STRIDE = 8;

/**
 * Anything a backend can both draw and upload: what Canvas 2D's `drawImage`
 * and WebGL's `texImage2D` agree on. (An `SVGImageElement` is in neither
 * backend's reach, so `CanvasImageSource` is wider than the contract.)
 */
export type TextureSource =
  | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLVideoElement;

/** One stop of a gradient descriptor. */
export interface ColorStop {
  offset: number;
  color: string;
}

/** A gradient along a line, in the draw call's own coordinate space. */
export interface LinearGradientStyle {
  type: 'linear';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  stops: ColorStop[];
}

/** A concentric gradient from radius `r0` to `r1` around (x, y). */
export interface RadialGradientStyle {
  type: 'radial';
  x: number;
  y: number;
  r0?: number;
  r1: number;
  stops: ColorStop[];
}

export type GradientStyle = LinearGradientStyle | RadialGradientStyle;

/** A colour string or a gradient descriptor; see the class docs. */
export type Style = string | GradientStyle;

/** A drop shadow or glow beneath a primitive's whole silhouette. */
export interface ShadowStyle {
  color?: string;
  blur?: number;
  offsetX?: number;
  offsetY?: number;
}

/** How a primitive combines with what is already on the surface. */
export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen';

/** How a surface is sampled when it is drawn at another size. */
export type Filter = 'linear' | 'nearest';

/**
 * What every draw method accepts, whatever it draws. A backend reads these
 * from the same options object as the primitive's own fields.
 */
export interface DrawOptions {
  /** Draw in screen space, ignoring the camera. */
  isScreenSpace?: boolean;
  /** Opacity multiplier in [0, 1], applied to the whole primitive. */
  globalAlpha?: number;
  /** Drop shadow or glow. */
  shadow?: ShadowStyle;
  /** How it combines with what is already there. */
  blend?: BlendMode;
}

/** What a shape's fill and stroke are drawn with. */
export interface ShapeStyleOptions extends DrawOptions {
  fillStyle?: Style;
  strokeStyle?: Style;
  lineWidth?: number;
  /** Whether to fill when `fillStyle` is set. */
  fill?: boolean;
}

export interface SpriteOptions extends DrawOptions {
  image: TextureSource;
  /** Centre X. */
  x: number;
  /** Centre Y. */
  y: number;
  tileX?: number;
  tileY?: number;
  tileWidth: number;
  tileHeight: number;
  /** Destination width; the tile's own when omitted. */
  width?: number;
  /** Destination height; the tile's own when omitted. */
  height?: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  /**
   * Colour multiplied into every texel, e.g. `'#ff8080'` for a hit flash.
   * The tint's own alpha scales the result.
   */
  tint?: string;
}

export interface AnimationOptions {
  sprite: SpriteSheet;
  x: number;
  y: number;
  animation: string;
  /** Which of the animation's frames to draw. */
  frame?: number;
  /** Extra `drawSprite` options. */
  transform?: Partial<SpriteOptions>;
}

export interface LightOptions {
  x: number;
  y: number;
  /** Radius at which the light reaches zero. */
  radius: number;
  color?: string;
  /**
   * Brightness multiplier. Above 1 pushes the lit area past the scene's own
   * brightness, which is what feeds bloom.
   */
  intensity?: number;
  /** Spot direction, radians. */
  angle?: number;
  /** Spot width: the full apex angle in radians. Omit both for a disc. */
  cone?: number;
  /** Occluded by shadow casters. */
  shadows?: boolean;
  /**
   * How high the light hangs. A caster only blocks lights at or below its
   * own `z`.
   */
  z?: number;
  isScreenSpace?: boolean;
}

/** One of three shapes: a polygon, a rectangle, or a circle. */
export interface ShadowCasterOptions {
  /** A polygon, in order (either winding), at least three points. */
  points?: Array<{ x: number; y: number }>;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  /** Circle radius, approximated as an octagon. */
  radius?: number;
  /** How tall the caster is; it blocks lights whose `z` is at most this. */
  z?: number;
}

/**
 * The full-screen post pass; `null` disables it. The scene format's
 * `world.post` block is this (`sceneSchema.js`), and a colour may arrive as
 * a CSS string or as an already-parsed `[r, g, b]`.
 */
export interface PostEffects {
  bloom?: { threshold?: number; strength?: number; blur?: number };
  vignette?: { strength?: number; start?: number };
  /** Defocuses the whole world pass, in world units. */
  blur?: { strength?: number };
  /** Barrel/pincushion warp. */
  distortion?: { strength?: number };
  /** Colour fringing toward the edges. */
  chromatic?: { strength?: number };
  /** Lift/gain grading, with saturation and contrast. */
  grade?: {
    shadows?: string | readonly number[];
    highlights?: string | readonly number[];
    amount?: number;
    saturation?: number;
    contrast?: number;
  };
  grain?: { strength?: number };
  scanlines?: { strength?: number; density?: number };
  /** A torn, shifted signal. */
  glitch?: { strength?: number };
  /** The screen washed with a colour. */
  flash?: { color?: string | readonly number[]; strength?: number };
}

export interface ParticlesOptions {
  image: TextureSource;
  tileX?: number;
  tileY?: number;
  tileWidth: number;
  tileHeight: number;
  /** `PARTICLE_STRIDE` floats per particle. */
  data: Float32Array | number[];
  /** Particles to draw; the whole buffer when omitted. */
  count?: number;
  blend?: BlendMode;
  globalAlpha?: number;
  /** Draw in screen space, ignoring the camera. */
  isScreenSpace?: boolean;
}

export interface ImageOptions extends DrawOptions {
  image: TextureSource;
  /** Destination X (top-left). */
  x: number;
  /** Destination Y (top-left). */
  y: number;
  width?: number;
  height?: number;
  /** Source rect; the full image when omitted. */
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  /** Colour multiplied into every texel. */
  tint?: string;
}

export interface RectOptions extends ShapeStyleOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Scalar, or [tl, tr, br, bl]. */
  cornerRadius?: number | number[];
}

export interface LineOptions extends DrawOptions {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeStyle?: Style;
  lineWidth?: number;
}

export interface ArcOptions extends ShapeStyleOptions {
  x: number;
  y: number;
  radius: number;
  startAngle?: number;
  endAngle?: number;
}

export interface PathOptions extends DrawOptions {
  points: Array<{ x: number; y: number }>;
  closed?: boolean;
  fillStyle?: Style;
  strokeStyle?: Style;
  lineWidth?: number;
}

/** How text is laid out and faced; shared by `drawText` and `measureText`. */
export interface TextStyle {
  /** `'16px'` or `16`. */
  fontSize?: string | number;
  fontFamily?: string;
  /**
   * A numeric weight ('100'..'900') is honoured when the family is a
   * variable font.
   */
  fontWeight?: string | number;
  fontStyle?: 'normal' | 'italic' | 'oblique';
  /**
   * Tracking, in units or as a CSS length. Affects `measureText` too.
   * Ignored where the browser lacks `ctx.letterSpacing`.
   */
  letterSpacing?: number | string;
}

export interface TextOptions extends DrawOptions, TextStyle {
  text: string;
  x: number;
  y: number;
  fillStyle?: Style;
  /** Outline colour; drawn before the fill. */
  strokeStyle?: Style;
  lineWidth?: number;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
}

/** A local transform applied to subsequent draw calls. */
export interface TransformOptions {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  isScreenSpace?: boolean;
}

/** A clipping rectangle applied to subsequent draw calls. */
export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number | number[];
  isScreenSpace?: boolean;
}

/** What `hitTest` understands. */
export type HitShape =
  | { type: 'rect'; x: number; y: number; width: number; height: number }
  | { type: 'circle'; x: number; y: number; radius: number };

/** What a backend is started with. */
export interface RendererInitOptions {
  width?: number;
  height?: number;
  /** Initial sizing; an identity viewport of width x height when omitted. */
  viewport?: Viewport;
  /** Filter the world surface is upscaled with; see `setWorldFilter`. */
  worldFilter?: Filter;
  /** Filter sprites are sampled with; see `setTextureFilter`. */
  textureFilter?: Filter;
}

/** What `applyCamera` reads: where the view sits and how much it shows. */
export interface CameraView {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom?: number;
  rotation?: number;
}

/** The backend state `trackStateChange` diffs against. */
export interface RendererState {
  fillStyle?: string | null;
  strokeStyle?: string | null;
  lineWidth?: number | null;
  font?: string | null;
}

/** What a frame cost, as the performance overlay and the tests read it. */
export interface RendererStats {
  primitives: number;
  drawCalls: number;
  /** Entities the view cull skipped this frame; see core/viewCull.js. */
  culled: number;
  stateChanges: number;
  spritesDrawn: number;
  textDrawn: number;
  shapesDrawn: number;
  lastState: RendererState;
}

export class BaseRenderer {
  #debugEnabled = false;
  #debugLayer = 'default';

  /**
   * Current sizing. Backends read every size they need from here rather than
   * from the canvas, so the world surface, the UI layer and the backing store
   * can differ. Replaced wholesale by setViewport().
   */
  viewport: Viewport;
  /**
   * How many dimensions this renderer draws in. The 2D backends are
   * immediate-mode and driven through the draw primitives below; a 3D
   * renderer is retained and driven through `render(frame)`. The engine
   * matches this against its physics dimension at start-up.
   */
  dimensions: 2 | 3;
  /**
   * How the world surface is filtered when it is upscaled — that is, when
   * the render resolution is below the display's. `'nearest'` keeps pixel
   * art crisp instead of smearing it. Has no effect at `'native'`, where
   * there is nothing to upscale.
   */
  worldFilter: Filter;
  /** How sprites are sampled when drawn at another size; see setTextureFilter. */
  textureFilter: Filter = 'linear';
  frameCount: number;
  fps: number;
  lastFpsUpdate: number;
  fpsUpdateInterval: number;
  fpsHistory: number[];
  fpsHistoryIndex: number;
  fpsSum: number;
  fpsCount: number;
  stats: RendererStats;

  constructor() {
    if (this.constructor === BaseRenderer) {
      throw new Error('BaseRenderer is an abstract class and cannot be instantiated directly');
    }

    this.viewport = identityViewport(800, 600);
    this.dimensions = 2;
    this.worldFilter = 'linear';

    // FPS tracking (backend-agnostic)
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsUpdate = performance.now();
    this.fpsUpdateInterval = 1000; // Update FPS every second
    this.fpsHistory = new Array<number>(60).fill(0); // Store last 60 FPS values
    this.fpsHistoryIndex = 0;
    this.fpsSum = 0; // Track running sum for average
    this.fpsCount = 0; // Track number of samples

    // Render stats. `primitives` and the per-type counters are what callers
    // asked for and mean the same for every backend. `drawCalls` and
    // `stateChanges` are what the backend actually submitted: one draw call
    // per primitive and a change per style string in Canvas, one draw call per
    // batch and a change per texture/program/clip switch in a GPU backend.
    this.stats = {
      primitives: 0,
      drawCalls: 0,
      /** Entities the view cull skipped this frame; see core/viewCull.js. */
      culled: 0,
      stateChanges: 0,
      spritesDrawn: 0,
      textDrawn: 0,
      shapesDrawn: 0,
      lastState: {
        fillStyle: null,
        strokeStyle: null,
        lineWidth: null,
        font: null
      }
    };
  }

  // === Lifecycle ===

  /**
   * Initialize the renderer with a target canvas and options.
   * @param element - The target canvas to render to.
   * @param options - Renderer options.
   */
  init(element: HTMLCanvasElement, options?: RendererInitOptions): void { throw new Error('Method not implemented'); }

  /**
   * Choose how the world surface is filtered when it is upscaled to the
   * screen, which happens whenever the render resolution is below the
   * display's. Backends that need to act on the change override this and call
   * super; the stored value is what a backend reads at presentation time.
   *
   * @param filter - 'nearest' for pixel art.
   */
  setWorldFilter(filter: Filter): void {
    this.worldFilter = filter === 'nearest' ? 'nearest' : 'linear';
  }

  /**
   * Choose how sprites and images are sampled when drawn at a size other
   * than their own: `'linear'` (default) or `'nearest'`, for pixel art drawn
   * enlarged. Independent of `setWorldFilter`, which is about presenting the
   * world surface. Backends that need to act on the change override this
   * and call super.
   */
  setTextureFilter(filter: Filter): void {
    this.textureFilter = filter === 'nearest' ? 'nearest' : 'linear';
  }

  /**
   * Clean up renderer resources.
   */
  destroy(): void { throw new Error('Method not implemented'); }

  /**
   * Visible world width, in world units. This is the camera's view size, not a
   * pixel count: it does not change when the render resolution changes.
   */
  get width(): number { return this.viewport.viewWidth; }

  /**
   * Visible world height, in world units.
   */
  get height(): number { return this.viewport.viewHeight; }

  /**
   * Adopt a new viewport: resize the backing store, the world surface and any
   * size-dependent resources, and re-establish the world and UI transforms.
   *
   * Backends must store the viewport even when they cannot act on it yet (a
   * WebGL context may be lost), so the size can be replayed on recovery.
   *
   * @param viewport - The sizes to adopt.
   */
  setViewport(viewport: Viewport): void { throw new Error('Method not implemented'); }

  /**
   * Resize the renderer to an unscaled `width` x `height` — view, world
   * surface, UI space and backing store all the same size. Called with no
   * arguments it re-applies the current viewport, which is how a backend
   * rebuilds after losing its drawing resources.
   *
   * This is the simple entry point; `setViewport` is the full one.
   *
   * @param width - New width.
   * @param height - New height.
   */
  resize(width?: number, height?: number): void {
    const next = (width !== undefined && height !== undefined)
      ? identityViewport(width, height)
      : this.viewport;
    this.setViewport(next);
  }

  /**
   * Clear the presented surface.
   * Backends that keep intermediate buffers (e.g. a world buffer) clear those
   * in beginFrame(), not here.
   * @param color - Background colour; transparent clear if omitted.
   */
  clear(color?: string): void { throw new Error('Method not implemented'); }

  // === Frame control ===

  /**
   * Begin a new world frame. Clears the world to opaque black so no content
   * from the previous frame survives. Subclasses must call super.beginFrame()
   * to keep FPS and draw-call statistics up to date.
   */
  beginFrame(): void {
    this.frameCount++;
    this.resetStats();

    const now = performance.now();
    const elapsed = now - this.lastFpsUpdate;
    if (elapsed >= this.fpsUpdateInterval) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);

      if (this.fpsCount === this.fpsHistory.length) {
        this.fpsSum -= this.fpsHistory[this.fpsHistoryIndex]!;
      } else {
        this.fpsCount++;
      }
      this.fpsSum += this.fps;

      this.fpsHistory[this.fpsHistoryIndex] = this.fps;
      this.fpsHistoryIndex = (this.fpsHistoryIndex + 1) % this.fpsHistory.length;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  /**
   * End the current world frame and present it.
   */
  endFrame(): void { throw new Error('Method not implemented'); }

  /**
   * Begin a screen-space (UI) pass. Draw calls made through a UIRenderer
   * happen between beginScreenFrame() and endScreenFrame().
   */
  beginScreenFrame(): void { throw new Error('Method not implemented'); }

  /**
   * End the current screen-space (UI) pass.
   */
  endScreenFrame(): void { throw new Error('Method not implemented'); }

  /**
   * Apply camera transformation to subsequent world-space draw calls.
   * @param camera - Where the view sits and how much it shows.
   */
  applyCamera(camera: CameraView): void { throw new Error('Method not implemented'); }

  // === Draw primitives ===

  /**
   * Draw a sprite tile from a spritesheet image, centered on (x, y).
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Spritesheet image
   * @param {number} options.x - Center X position
   * @param {number} options.y - Center Y position
   * @param {number} [options.tileX=0] - Tile X index in spritesheet
   * @param {number} [options.tileY=0] - Tile Y index in spritesheet
   * @param {number} options.tileWidth - Tile width in pixels
   * @param {number} options.tileHeight - Tile height in pixels
   * @param {number} [options.width] - Destination width (defaults to tileWidth)
   * @param {number} [options.height] - Destination height (defaults to tileHeight)
   * @param {number} [options.rotation=0] - Rotation in radians
   * @param {boolean} [options.flipX=false] - Flip horizontally
   * @param {boolean} [options.flipY=false] - Flip vertically
   * @param {string} [options.tint] - Colour multiplied into every texel, e.g.
   *   `'#ff8080'` for a hit flash. The tint's own alpha scales the result.
   *   Optional.
   * @param {boolean} [options.isScreenSpace=false] - Draw in screen space, ignoring the camera
   * @param {number} [options.globalAlpha] - Opacity multiplier in [0, 1]
   * @param {{color?: string, blur?: number, offsetX?: number, offsetY?: number}} [options.shadow] - Drop shadow or glow
   * @param {'normal'|'additive'|'multiply'|'screen'} [options.blend] - How it combines with what is already there
   */
  drawSprite(options: SpriteOptions): void { throw new Error('Method not implemented'); }

  /**
   * Draw a named animation frame from a SpriteSheet.
   * Frames resolve as `SpriteSheet.draw` resolves them: a single-frame
   * animation adds the index to its column (the legacy sheet layout), and a
   * multi-frame one picks that frame, clamped to the list.
   */
  drawAnimation(options: AnimationOptions): void {
    const { sprite, x, y, animation, frame = 0, transform = {} } = options;
    const anim = sprite.animations.get(animation);
    if (!anim) return;
    const frames = anim.frames;
    const first = frames[0];
    if (!first) return;
    const at = frames.length === 1
      ? { tileX: first.tileX + frame, tileY: first.tileY }
      : frames[Math.min(frames.length - 1, Math.max(0, frame))]!;

    this.drawSprite({
      image: sprite.image,
      x,
      y,
      tileX: at.tileX,
      tileY: at.tileY,
      tileWidth: sprite.tileW,
      tileHeight: sprite.tileH,
      ...transform
    });
  }

  /**
   * Set the ambient light the world is lit by, and switch lighting on.
   *
   * Pass `null` to turn lighting back off; the world then renders at full
   * brightness as if no light had ever been submitted.
   * @param {string|null} color - Ambient colour, e.g. `'#303848'`
   */
  setAmbientLight(color: string | null): void { throw new Error('Method not implemented'); }

  /**
   * Add a light to the current frame's light map.
   *
   * Lights are cleared at `beginFrame`, so they are submitted every frame
   * like any other draw. Without an ambient set, lighting is off and a
   * light changes nothing.
   * A light is a disc by default. Give it `angle` and `cone` and it is a
   * spot: full brightness inside the cone, falling to nothing at its edge,
   * still bounded by `radius` — a headlight, a street lamp, a beacon sweep.
   *
   * `shadows: true` makes this light cast shadows: geometry submitted with
   * `drawShadowCaster` this frame blocks it, and everything behind that
   * geometry stays at ambient.
   *
   * @param {Object} options - Light options
   * @param {number} options.x - Centre X
   * @param {number} options.y - Centre Y
   * @param {number} options.radius - Radius at which the light reaches zero
   * @param {string} [options.color='#ffffff'] - Light colour
   * @param {number} [options.intensity=1] - Brightness multiplier. Values
   *   above 1 push the lit area past the scene's own brightness, which is
   *   what feeds bloom
   * @param {number} [options.angle] - Spot direction, radians
   * @param {number} [options.cone] - Spot width: the full apex angle in
   *   radians. Omit both for a plain disc
   * @param {boolean} [options.shadows=false] - Occluded by shadow casters
   * @param {number} [options.z=0] - How high the light hangs, in any unit
   *   the game likes. A caster only blocks lights at or below its own `z`,
   *   so a street lamp at 1 clears a barrier at 0.3 while a headlight at
   *   0.2 does not
   * @param {boolean} [options.isScreenSpace=false] - Position in screen space
   */
  drawLight(options: LightOptions): void { throw new Error('Method not implemented'); }

  /**
   * Submit geometry that blocks shadowed lights this frame.
   *
   * A caster is flat scenery in light's way: a wall, a crate, a tree trunk.
   * Every light drawn with `shadows: true` treats the shape's silhouette as
   * opaque, so the area behind it (as seen from that light) stays at
   * ambient — which is what lets a wall in one layer throw a shadow across
   * the ground drawn beneath it. Casters are cleared at `beginFrame` and
   * submitted per frame, exactly like lights.
   *
   * @param {Object} options - One of three shapes:
   * @param {Array<{x: number, y: number}>} [options.points] - A polygon, in
   *   order (either winding), at least three points
   * @param {number} [options.x] - Rect/circle centre X
   * @param {number} [options.y] - Rect/circle centre Y
   * @param {number} [options.width] - Rect width (with `height`)
   * @param {number} [options.height] - Rect height
   * @param {number} [options.rotation=0] - Rect rotation, radians
   * @param {number} [options.radius] - Circle radius (approximated as an
   *   octagon)
   * @param {number} [options.z=Infinity] - How tall the caster is. It
   *   blocks lights whose `z` is at most this; the default blocks all
   */
  drawShadowCaster(options: ShadowCasterOptions): void { throw new Error('Method not implemented'); }

  /**
   * Configure the full-screen post pass, or pass `null` to disable it.
   * @param {Object|null} effects - Effect configuration
   * @param {Object} [effects.bloom] - { threshold, strength, blur }
   * @param {Object} [effects.vignette] - { strength, start }
   * @param {Object} [effects.blur] - { strength }, in world units. Defocuses
   *   the whole world pass. Everything downstream, bloom included, reads the
   *   softened image, so a glow agrees with what is on screen. This is what
   *   sits behind a modal screen: the game reads as *behind* the menu rather
   *   than merely dimmed
   */
  setPostEffects(effects: PostEffects | null): void { throw new Error('Method not implemented'); }

  /**
   * Draw many copies of one sprite tile from a packed buffer, as a few
   * batched draw calls with per-particle colour.
   *
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Spritesheet image
   * @param {number} [options.tileX=0] - Tile X index in spritesheet
   * @param {number} [options.tileY=0] - Tile Y index in spritesheet
   * @param {number} options.tileWidth - Tile width in pixels
   * @param {number} options.tileHeight - Tile height in pixels
   * @param {Float32Array|number[]} options.data - `PARTICLE_STRIDE` floats per particle
   * @param {number} [options.count] - Particles to draw (defaults to the whole buffer)
   * @param {string} [options.blend] - Blend mode for every particle
   * @param {number} [options.globalAlpha] - Multiplied into every particle's alpha
   */
  drawParticles(options: ParticlesOptions): void { throw new Error('Method not implemented'); }

  /**
   * Draw an image stretched to a destination rectangle (top-left anchored).
   * @param {Object} options - Drawing options
   * @param {CanvasImageSource} options.image - Image to draw
   * @param {number} options.x - Destination X (top-left)
   * @param {number} options.y - Destination Y (top-left)
   * @param {number} [options.width] - Destination width (defaults to image width)
   * @param {number} [options.height] - Destination height (defaults to image height)
   * @param {number} [options.sourceX] - Source rect X (full image if omitted)
   * @param {number} [options.sourceY] - Source rect Y
   * @param {number} [options.sourceWidth] - Source rect width
   * @param {number} [options.sourceHeight] - Source rect height
   * @param {string} [options.tint] - Colour multiplied into every texel.
   *   Optional.
   * @param {boolean} [options.isScreenSpace=false] - Draw in screen space, ignoring the camera
   * @param {number} [options.globalAlpha] - Opacity multiplier in [0, 1]
   * @param {{color?: string, blur?: number, offsetX?: number, offsetY?: number}} [options.shadow] - Drop shadow or glow
   * @param {'normal'|'additive'|'multiply'|'screen'} [options.blend] - How it combines with what is already there
   */
  drawImage(options: ImageOptions): void { throw new Error('Method not implemented'); }

  /**
   * Draw a rectangle (top-left anchored), optionally rounded.
   * @param {Object} options - Drawing options
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} options.width - Rectangle width
   * @param {number} options.height - Rectangle height
   * @param {string|Object} [options.fillStyle] - Fill color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Stroke color or gradient descriptor
   * @param {number} [options.lineWidth=1] - Stroke width
   * @param {number|number[]} [options.cornerRadius=0] - Rounded corner radius
   * @param {boolean} [options.fill=true] - Whether to fill when fillStyle is set
   * @param {boolean} [options.isScreenSpace=false] - Draw in screen space, ignoring the camera
   * @param {number} [options.globalAlpha] - Opacity multiplier in [0, 1]
   * @param {{color?: string, blur?: number, offsetX?: number, offsetY?: number}} [options.shadow] - Drop shadow or glow
   * @param {'normal'|'additive'|'multiply'|'screen'} [options.blend] - How it combines with what is already there
   */
  drawRect(options: RectOptions): void { throw new Error('Method not implemented'); }

  /**
   * Draw a line segment.
   * @param {Object} options - Drawing options
   * @param {number} options.x1 - Start X
   * @param {number} options.y1 - Start Y
   * @param {number} options.x2 - End X
   * @param {number} options.y2 - End Y
   * @param {string|Object} [options.strokeStyle='#000'] - Stroke color
   * @param {number} [options.lineWidth=1] - Line width
   * @param {boolean} [options.isScreenSpace=false] - Draw in screen space, ignoring the camera
   * @param {number} [options.globalAlpha] - Opacity multiplier in [0, 1]
   * @param {{color?: string, blur?: number, offsetX?: number, offsetY?: number}} [options.shadow] - Drop shadow or glow
   * @param {'normal'|'additive'|'multiply'|'screen'} [options.blend] - How it combines with what is already there
   */
  drawLine(options: LineOptions): void { throw new Error('Method not implemented'); }

  /**
   * Draw an arc or circle.
   *
   * Filling a partial arc fills the **circular segment** — the region between
   * the arc and the straight chord joining its endpoints — not a pie sector.
   * The centre of the circle is therefore NOT filled unless the sweep is at
   * least half a turn. This matches Canvas 2D `arc()` + `fill()` semantics and
   * is what the engine has always rendered; backends must reproduce it so
   * output stays identical. For a pie/sector look, draw a closed drawPath()
   * through the centre instead.
   *
   * @param {Object} options - Drawing options
   * @param {number} options.x - Center X
   * @param {number} options.y - Center Y
   * @param {number} options.radius - Radius
   * @param {number} [options.startAngle=0] - Start angle in radians
   * @param {number} [options.endAngle=Math.PI*2] - End angle in radians
   * @param {string|Object} [options.fillStyle] - Fill color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Stroke color or gradient descriptor
   * @param {number} [options.lineWidth=1] - Stroke width
   * @param {boolean} [options.fill=true] - Whether to fill when fillStyle is set
   * @param {boolean} [options.isScreenSpace=false] - Draw in screen space, ignoring the camera
   * @param {number} [options.globalAlpha] - Opacity multiplier in [0, 1]
   * @param {{color?: string, blur?: number, offsetX?: number, offsetY?: number}} [options.shadow] - Drop shadow or glow
   * @param {'normal'|'additive'|'multiply'|'screen'} [options.blend] - How it combines with what is already there
   */
  drawArc(options: ArcOptions): void { throw new Error('Method not implemented'); }

  /**
   * Draw a polyline or polygon.
   * @param {Object} options - Drawing options
   * @param {Array<{x: number, y: number}>} options.points - Path points
   * @param {boolean} [options.closed=false] - Close the path
   * @param {string|Object} [options.fillStyle] - Fill color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Stroke color or gradient descriptor
   * @param {number} [options.lineWidth=1] - Stroke width
   * @param {boolean} [options.isScreenSpace=false] - Draw in screen space, ignoring the camera
   * @param {number} [options.globalAlpha] - Opacity multiplier in [0, 1]
   * @param {{color?: string, blur?: number, offsetX?: number, offsetY?: number}} [options.shadow] - Drop shadow or glow
   * @param {'normal'|'additive'|'multiply'|'screen'} [options.blend] - How it combines with what is already there
   */
  drawPath(options: PathOptions): void { throw new Error('Method not implemented'); }

  /**
   * Draw text.
   * @param {Object} options - Drawing options
   * @param {string} options.text - Text to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string|Object} [options.fillStyle='#000'] - Text color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Outline color; drawn before the fill
   * @param {number} [options.lineWidth=3] - Outline width
   * @param {string|number} [options.fontSize='16px'] - Font size ('16px' or 16)
   * @param {string} [options.fontFamily='system-ui'] - Font family
   * @param {string} [options.fontWeight='normal'] - Font weight. A numeric
   *   weight ('100'..'900') is honoured when the family is a variable font
   * @param {'normal'|'italic'|'oblique'} [options.fontStyle='normal'] - Font style
   * @param {number|string} [options.letterSpacing] - Tracking, in units or as
   *   a CSS length. Affects `measureText` too, so a tracked label measures at
   *   the width it occupies. Ignored where the browser lacks
   *   `ctx.letterSpacing`, in which case text simply draws untracked
   * @param {string} [options.textAlign='left'] - Text alignment
   * @param {string} [options.textBaseline='top'] - Text baseline
   * @param {boolean} [options.isScreenSpace=false] - Draw in screen space, ignoring the camera
   * @param {number} [options.globalAlpha] - Opacity multiplier in [0, 1]
   * @param {{color?: string, blur?: number, offsetX?: number, offsetY?: number}} [options.shadow] - Drop shadow or glow
   * @param {'normal'|'additive'|'multiply'|'screen'} [options.blend] - How it combines with what is already there
   */
  drawText(options: TextOptions): void { throw new Error('Method not implemented'); }

  // === Transform & clip stacks ===

  /**
   * Push a local transform applied to subsequent draw calls.
   * @param {Object} transform - Transform options
   * @param {number} [transform.x=0] - Translation X
   * @param {number} [transform.y=0] - Translation Y
   * @param {number} [transform.rotation=0] - Rotation in radians
   * @param {number} [transform.scaleX=1] - Scale X
   * @param {number} [transform.scaleY=1] - Scale Y
   * @param {boolean} [transform.isScreenSpace=false] - Apply in screen space
   */
  pushTransform(transform: TransformOptions): void { throw new Error('Method not implemented'); }

  /**
   * Pop the most recent transform pushed with pushTransform(). Must be the
   * top of the shared transform/clip stack (see class docs).
   */
  popTransform(): void { throw new Error('Method not implemented'); }

  /**
   * Push a clipping rectangle applied to subsequent draw calls.
   * @param {Object} rect - Clipping rectangle
   * @param {number} rect.x - X position
   * @param {number} rect.y - Y position
   * @param {number} rect.width - Rectangle width
   * @param {number} rect.height - Rectangle height
   * @param {number|number[]} [rect.cornerRadius=0] - Rounded corner radius
   * @param {boolean} [rect.isScreenSpace=false] - Clip in screen space
   */
  pushClip(rect: ClipRect): void { throw new Error('Method not implemented'); }

  /**
   * Pop the most recent clipping rectangle. Must be the top of the shared
   * transform/clip stack (see class docs).
   */
  popClip(): void { throw new Error('Method not implemented'); }

  // === Queries ===

  /**
   * Measure text dimensions.
   * @param text - Text to measure.
   * @param style - Text style.
   */
  measureText(text: string, style?: TextStyle): { width: number; height: number } {
    throw new Error('Method not implemented');
  }

  /**
   * Test if a point hits a shape. Pure math; shared by all backends.
   * @param x - X position to test.
   * @param y - Y position to test.
   * @param shape - What to test against.
   * @returns Whether the point hits the shape.
   */
  hitTest(x: number, y: number, shape: HitShape): boolean {
    switch (shape.type) {
      case 'rect':
        return x >= shape.x && x <= shape.x + shape.width &&
               y >= shape.y && y <= shape.y + shape.height;

      case 'circle': {
        const dx = x - shape.x;
        const dy = y - shape.y;
        return dx * dx + dy * dy <= shape.radius * shape.radius;
      }

      default:
        return false;
    }
  }

  /**
   * Set the cursor style.
   * @param style - CSS cursor style.
   */
  setCursor(style: string): void { throw new Error('Method not implemented'); }

  // === Debug rendering state (shared by all backends) ===

  /**
   * Enable/disable debug rendering.
   * @param enabled - Whether debug rendering should be enabled.
   */
  setDebugEnabled(enabled: boolean): void {
    this.#debugEnabled = enabled;
  }

  /**
   * Check if debug rendering is enabled.
   * @returns Whether debug rendering is enabled.
   */
  isDebugEnabled(): boolean {
    return this.#debugEnabled;
  }

  /**
   * Set debug rendering layer.
   * @param layer - Debug layer name.
   */
  setDebugLayer(layer: string): void {
    this.#debugLayer = layer;
  }

  /**
   * Get current debug layer.
   * @returns Current debug layer name.
   */
  getDebugLayer(): string {
    return this.#debugLayer;
  }

  // === Performance stats (shared by all backends) ===

  getFPS(): number {
    return this.fps;
  }

  getFPSHistory(): number[] {
    return [...this.fpsHistory];
  }

  getAverageFPS(): number {
    if (this.fpsCount === 0) return this.fps;
    return Math.round(this.fpsSum / this.fpsCount);
  }

  resetStats(): void {
    this.stats.primitives = 0;
    this.stats.drawCalls = 0;
    this.stats.culled = 0;
    this.stats.stateChanges = 0;
    this.stats.spritesDrawn = 0;
    this.stats.textDrawn = 0;
    this.stats.shapesDrawn = 0;
  }

  /**
   * Count a primitive requested by the caller. Backends call this once per
   * draw method invocation; how many GPU draw calls it becomes is theirs.
   */
  trackPrimitive(kind: 'sprite' | 'text' | 'shape'): void {
    this.stats.primitives++;
    if (kind === 'sprite') this.stats.spritesDrawn++;
    else if (kind === 'text') this.stats.textDrawn++;
    else this.stats.shapesDrawn++;
  }

  /**
   * Count backend state changes by diffing against the last seen values.
   * A backend may track bound textures and programs this way, or count
   * directly into stats.stateChanges.
   */
  trackStateChange(newState: RendererState): void {
    const lastState = this.stats.lastState;
    let changes = 0;

    for (const key of Object.keys(newState) as Array<keyof RendererState>) {
      const value = newState[key];
      if (value !== undefined && value !== lastState[key]) {
        // Each key carries its own type; they are written back in pairs.
        (lastState as Record<string, unknown>)[key] = value;
        changes++;
      }
    }

    if (changes > 0) {
      this.stats.stateChanges += changes;
    }
  }

  getStats(): RendererStats {
    return { ...this.stats };
  }
}
