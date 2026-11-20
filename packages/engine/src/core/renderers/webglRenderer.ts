import { BaseRenderer, PARTICLE_STRIDE } from './baseRenderer.ts';
import type {
  ArcOptions, CameraView, ClipRect, ImageOptions, LineOptions, LightOptions, ParticlesOptions,
  PathOptions, PostEffects, RectOptions, RendererInitOptions, ShadowCasterOptions, ShadowStyle,
  SpriteOptions, Style, TextOptions, TextStyle, Filter, TransformOptions
} from './baseRenderer.ts';
import type { Mat2D } from './geometry/matrix.ts';
import type { PaintKey } from './webgl/batch.ts';
import type { TextureEntry } from './webgl/textureCache.ts';
import type { PassCaster, PassLight, PassPost } from './webgl/effectsPass.ts';
import type { Viewport } from '../viewport.ts';
import * as mat from './geometry/matrix.ts';
import { parseColor, parseColorPremultiplied } from './geometry/color.ts';
import { strokePolyline } from './geometry/polyline.ts';
import { arcPoints, roundRectPoints, fanIndices, triangulate } from './geometry/shapes.ts';
import { bakeGradient, gradientKey, GRADIENT_LUT_SIZE } from './geometry/gradient.ts';
import { createContext, createTexture } from './webgl/device.ts';
import { Batch, MODE_SOLID, MODE_TEXTURE, MODE_GRADIENT, MODE_SHADOW } from './webgl/batch.ts';
import { TextureCache } from './webgl/textureCache.ts';
import { TextLabels } from './webgl/textLabels.ts';
import { ShadowPass, expand } from './webgl/shadowPass.ts';
import { EffectsPass } from './webgl/effectsPass.ts';
import { identityViewport } from '../viewport.ts';

/** One entry of the shared transform/clip stack. */
type StateEntry =
  | { kind: 'transform'; screen: boolean; matrix: Mat2D }
  | { kind: 'clip'; screen: boolean; positions: number[]; indices: number[] };

/** Which space a draw call belongs to; all this backend reads to pick a matrix. */
interface PassOptions {
  isScreenSpace?: boolean;
}

/** The source rect of a textured quad, in texels. */
interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What `#passSpace` reports about the pass currently drawing. */
interface PassSpace {
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * What every draw method hands the shared helpers: the fields they read,
 * whatever primitive the call is for.
 */
interface DrawCall {
  isScreenSpace?: boolean;
  globalAlpha?: number;
  shadow?: ShadowStyle | null;
  blend?: string;
  tint?: string;
}

/** What `#fillAndStroke` is told to draw. */
interface FillAndStroke {
  fill?: Style | null;
  stroke?: Style | null;
  lineWidth?: number;
  fillIndices?: number[];
}

/**
 * WebGL2 implementation of the renderer interface.
 *
 * Geometry is tessellated and transformed to pixel space on the CPU (camera
 * and transform stack folded into one matrix per pass), then accumulated by
 * a Batch and drawn with as few GPU draw calls as paint-state changes allow.
 * World and screen passes draw straight to the default framebuffer in
 * submission order, so they can share batches.
 *
 * Shadows (the contract's silhouette shadow) render the primitive to an
 * offscreen target, blur the bounding region, and composite it tinted before
 * drawing the primitive; see ShadowPass.
 */
export class WebGLRenderer extends BaseRenderer {
  /** Ambient light colour, or null when lighting is off. */
  ambientLight: string | null;
  /** Lights submitted this frame, cleared at beginFrame. */
  lights: PassLight[];
  /** Light-blocking polygons submitted this frame, cleared with the lights. */
  shadowCasters: PassCaster[];
  /** Post-effect configuration, with its colours parsed, or null. */
  postEffects: PassPost | null;
  /** Which framebuffer world/screen draws currently belong to. */
  targetIsScene: boolean;
  /** True between beginScreenFrame and endScreenFrame. */
  inScreenPass: boolean;
  canvas: HTMLCanvasElement | null;
  gl: WebGL2RenderingContext | null;
  imageSmoothing: boolean;
  contextAttributes: WebGLContextAttributes;
  /** True while the context is lost; drawing is skipped until it is back. */
  contextLost = false;
  batch: Batch | null;
  textures: TextureCache | null;
  labels: TextLabels | null;
  shadowPass: ShadowPass | null;
  effectsPass: EffectsPass | null;
  // Pass matrices (pixel space). The camera is folded into worldMatrix.
  worldMatrix: Mat2D;
  screenMatrix: Mat2D;
  cameraMatrix: Mat2D;
  /** Shared transform/clip stack (the contract requires strict nesting). */
  stateStack: StateEntry[];
  clipDepth: number;
  /** Gradient ramps baked to 256x1 textures, keyed by their stops. */
  gradientCache: Map<string, { texture: WebGLTexture; lastUsed: number }>;
  frameIndex: number;
  /** Kept so `destroy` can take the listeners off the canvas again. */
  declare onContextLost: (event: Event) => void;
  declare onContextRestored: () => void;

  /**
   * @param options.contextAttributes - Merged over the defaults. Tests pass
   *   `preserveDrawingBuffer: true` so pixels can be read back after the
   *   frame is presented.
   * @param options.imageSmoothing - Linear (true) or nearest (false) texture
   *   filtering; matches Canvas 2D's default when true.
   */
  constructor(options: {
    contextAttributes?: WebGLContextAttributes;
    imageSmoothing?: boolean;
  } = {}) {
    super();

    this.ambientLight = null;
    this.lights = [];
    this.shadowCasters = [];
    this.postEffects = null;
    this.targetIsScene = false;
    this.inScreenPass = false;
    this.canvas = null;
    this.gl = null;
    this.imageSmoothing = options.imageSmoothing ?? true;
    this.contextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      stencil: true,
      antialias: true,
      preserveDrawingBuffer: false,
      ...(options.contextAttributes || {})
    };

    this.batch = null;
    this.textures = null;
    this.labels = null;
    this.shadowPass = null;
    this.effectsPass = null;

    this.worldMatrix = mat.identity();
    this.screenMatrix = mat.identity();
    this.cameraMatrix = mat.identity();

    this.stateStack = [];
    this.clipDepth = 0;

    this.gradientCache = new Map();
    this.frameIndex = 0;
  }

  // === Lifecycle ===

  override init(element: HTMLCanvasElement, options: RendererInitOptions = {}): void {
    this.canvas = element;
    this.gl = createContext(element, this.contextAttributes);
    // Stored, not applied: #createResources below reads it to build the scene
    // target with the right filter, and there is no pass to retune yet.
    if (options.worldFilter) super.setWorldFilter(options.worldFilter);
    if (options.textureFilter) super.setTextureFilter(options.textureFilter);
    const viewport = options.viewport || identityViewport(
      options.width || this.viewport.viewWidth,
      options.height || this.viewport.viewHeight
    );

    // GPU resources live in #createResources so a context restore can rebuild
    // them; everything else about the renderer survives a loss untouched.
    this.onContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      this.#createResources();
      this.resize();
    };
    element.addEventListener('webglcontextlost', this.onContextLost, false);
    element.addEventListener('webglcontextrestored', this.onContextRestored, false);

    this.contextLost = false;
    this.viewport = viewport;
    this.#createResources();
    this.setViewport(viewport);
  }

  #createResources(): void {
    const gl = this.gl!;
    const { viewWidth, viewHeight, worldWidth, worldHeight } = this.viewport;
    this.batch = new Batch(gl, this.stats);
    this.textures = new TextureCache(gl, this.imageSmoothing && this.textureFilter !== 'nearest');
    this.labels = new TextLabels(gl);
    this.shadowPass = new ShadowPass(gl, viewWidth, viewHeight, worldWidth, worldHeight);
    this.effectsPass = new EffectsPass(gl, viewWidth, viewHeight, worldWidth, worldHeight, {
      smooth: this.worldFilter !== 'nearest'
    });
    this.gradientCache.clear();

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.STENCIL_TEST);
  }

  #releaseResources(): void {
    const gl = this.gl;
    if (!gl) return;
    this.batch?.destroy();
    this.textures?.destroy();
    this.labels?.destroy();
    this.shadowPass?.destroy();
    this.effectsPass?.destroy();
    for (const entry of this.gradientCache.values()) gl.deleteTexture(entry.texture);
    this.gradientCache.clear();
    this.batch = null;
    this.textures = null;
    this.labels = null;
    this.shadowPass = null;
    this.effectsPass = null;
  }

  override destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost, false);
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored, false);
    }
    this.#releaseResources();
    // Browsers cap live WebGL contexts per page; give this one back promptly.
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas = null;
    this.gl = null;
    this.stateStack = [];
    this.clipDepth = 0;
  }

  /** True while drawing is possible (initialized and context not lost). */
  get #ready(): boolean {
    return !!this.gl && !this.contextLost;
  }

  override setViewport(viewport: Viewport): void {
    // Store first: a resize that arrives while the context is lost must still
    // be the size that gets replayed once it is restored.
    this.viewport = viewport;

    const gl = this.gl;
    if (!this.#ready) return;

    const { backingWidth, backingHeight, viewWidth, viewHeight, worldWidth, worldHeight } = viewport;
    // The canvas is set in `init`, before anything can be ready to draw.
    this.canvas!.width = backingWidth;
    this.canvas!.height = backingHeight;
    this.shadowPass!.resize(viewWidth, viewHeight, worldWidth, worldHeight);
    this.effectsPass!.resize(viewWidth, viewHeight, worldWidth, worldHeight);
    this.#bindDefaultTarget();
  }

  override setTextureFilter(filter: Filter): void {
    super.setTextureFilter(filter);
    this.textures?.setSmoothing(this.imageSmoothing && this.textureFilter !== 'nearest');
  }

  override setWorldFilter(filter: Filter): void {
    super.setWorldFilter(filter);
    // Stored by super first: like a viewport change, the setting has to stick
    // even while the context is lost, so #createResources can rebuild with it.
    if (this.#ready && this.effectsPass) {
      this.effectsPass!.setSceneFiltering(this.worldFilter !== 'nearest');
    }
  }

  /**
   * Whether the world surface differs in size from the area it is presented
   * into — i.e. whether the resolution setting is actually asking for a
   * resample.
   *
   * When it is not (the `'native'` case), the world draws straight to the
   * default framebuffer: no offscreen round trip, and the context's own
   * multisampling still applies. A sub-pixel difference is rounding, not a
   * resolution choice, so the comparison carries a one-pixel tolerance.
   */
  get #worldIsResampled(): boolean {
    const v = this.viewport;
    return Math.abs(v.worldWidth - v.contentWidth) > 1 ||
           Math.abs(v.worldHeight - v.contentHeight) > 1;
  }

  /** The content rect in GL pixels, which measure y from the bottom. */
  #contentRect(): { x: number; y: number; width: number; height: number } {
    const v = this.viewport;
    return {
      x: v.contentX,
      y: v.backingHeight - v.contentY - v.contentHeight,
      width: v.contentWidth,
      height: v.contentHeight
    };
  }

  override clear(color?: string): void {
    const gl = this.gl!;
    if (!this.#ready) return;
    this.batch!.flush();
    const [r, g, b, a] = color ? parseColorPremultiplied(color) : [0, 0, 0, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }

  // === Frame control ===

  override beginFrame(): void {
    if (!this.#ready) return;
    this.frameIndex++;
    this.clear('#000');
    this.cameraMatrix = mat.identity();
    this.worldMatrix = mat.identity();
    this.lights.length = 0;
    this.shadowCasters.length = 0;
    this.#resetStencil();

    // The world needs to end up in a texture rather than straight on screen
    // when it is rendered at a resolution of its own, and when lighting or
    // post effects have to sample it. Either way it draws into the effects
    // pass's scene target and is presented in endFrame().
    this.inScreenPass = false;
    this.targetIsScene = this.#effectsActive || this.#worldIsResampled;
    if (!this.targetIsScene) this.#bindDefaultTarget();

    if (this.targetIsScene) {
      this.effectsPass!.beginScene();
      this.batch!.setTarget(this.width, this.height, false);
      this.batch!.invalidateState();
    }

    super.beginFrame();
  }

  override endFrame(): void {
    if (!this.#ready) return;
    this.batch!.flush();

    if (this.targetIsScene) {
      const content = this.#contentRect();
      if (this.#effectsActive) {
        const ambient = this.ambientLight ? parseColor(this.ambientLight) : [1, 1, 1, 1];
        this.stats.drawCalls += this.effectsPass!.drawLights(this.lights, ambient, this.shadowCasters);
        this.stats.drawCalls += this.effectsPass!.composite(this.postEffects, content);
      } else {
        // Resolution alone: scale the world surface up to its content rect and
        // nothing else.
        this.stats.drawCalls += this.effectsPass!.present(content);
      }
      this.targetIsScene = false;
      this.#bindDefaultTarget();
    }

    this.#evictGradients();
    this.labels!.evict(this.frameIndex);
  }

  override beginScreenFrame(): void {
    if (!this.#ready) return;
    // The screen pass always goes straight to the default framebuffer, after
    // the composite, so UI is never dimmed by ambient or smeared by bloom.
    // It also covers the whole backing store at display resolution, which is
    // what keeps UI text sharp however coarse the world resolution is.
    this.targetIsScene = false;
    this.inScreenPass = true;
    this.#bindDefaultTarget();
    this.screenMatrix = mat.identity();
  }

  override endScreenFrame(): void {
    if (!this.#ready) return;
    this.batch!.flush();
    this.inScreenPass = false;
  }

  override applyCamera(camera: CameraView): void {
    if (!this.#ready) return;
    this.cameraMatrix = mat.viewMatrix(camera);
    this.worldMatrix = mat.multiply(this.cameraMatrix, mat.identity());
  }

  // === Paint helpers ===

  /** Current matrix for a draw call's pass. */
  #matrixFor(options: PassOptions): Mat2D {
    return options.isScreenSpace ? this.screenMatrix : this.worldMatrix;
  }

  #setMatrixFor(options: PassOptions, m: Mat2D): void {
    if (options.isScreenSpace) this.screenMatrix = m;
    else this.worldMatrix = m;
  }

  /**
   * Resolve a fill/stroke style into a batch key plus per-vertex colour and
   * uvs for the given local-space positions.
   */
  /**
   * Premultiplied vertex colour for a textured draw.
   * @param tint - Colour multiplied into every texel.
   * @param alpha - globalAlpha.
   * @returns Premultiplied [r, g, b, a].
   */
  #tintColor(tint: string | undefined, alpha: number): number[] {
    if (!tint) return [alpha, alpha, alpha, alpha];
    const [r, g, b, a] = parseColor(tint);
    const s = a * alpha;
    return [r * s, g * s, b * s, s];
  }

  #paint(
    style: Style, alpha: number, localPositions: number[], blend: string | undefined
  ): { key: PaintKey; color: number[]; uvs: number[] | null } {
    if (style && typeof style === 'object' && style.type) {
      const texture = this.#gradientTexture(style);
      const key = style.type === 'radial'
        ? { mode: MODE_GRADIENT, texture, gradientType: 1, gradient: [style.x, style.y, style.r0 ?? 0, style.r1], blend }
        : { mode: MODE_GRADIENT, texture, gradientType: 0, gradient: [style.x0, style.y0, style.x1, style.y1], blend };
      return { key, color: [alpha, alpha, alpha, alpha], uvs: localPositions };
    }
    const [r, g, b, a] = parseColorPremultiplied(style);
    return { key: { mode: MODE_SOLID, blend }, color: [r * alpha, g * alpha, b * alpha, a * alpha], uvs: null };
  }

  #gradientTexture(style: Extract<Style, { type: string }>): WebGLTexture {
    const gl = this.gl!;
    const key = gradientKey(style);
    let entry = this.gradientCache.get(key);
    if (!entry) {
      const texture = createTexture(gl, {
        pixels: bakeGradient(style.stops), width: GRADIENT_LUT_SIZE, height: 1, smooth: true
      });
      entry = { texture, lastUsed: this.frameIndex };
      this.gradientCache.set(key, entry);
      this.batch!.invalidateState();
    }
    entry.lastUsed = this.frameIndex;
    return entry.texture;
  }

  #evictGradients(): void {
    if (this.gradientCache.size < 64) return;
    for (const [key, entry] of this.gradientCache) {
      if (this.frameIndex - entry.lastUsed > 120) {
        this.gl!.deleteTexture(entry.texture);
        this.gradientCache.delete(key);
      }
    }
  }

  /**
   * Submit a filled/stroked local-space polygon set to the batch.
   * @param options - Draw options (alpha, shadow, pass).
   * @param localPositions - Local-space positions.
   */
  #submitShape(
    options: DrawCall, localPositions: number[], indices: number[], style: Style
  ): void {
    if (indices.length === 0) return;
    const alpha = options.globalAlpha ?? 1;
    const { key, color, uvs } = this.#paint(style, alpha, localPositions, options.blend);
    const positions = mat.applyToPositions(this.#matrixFor(options), localPositions);
    this.batch!.begin(key);
    this.batch!.push(positions, uvs, color, indices);
  }

  /**
   * What the pass's transform turns one of its units into on screen, for
   * deciding how finely to tessellate a curve. The camera's zoom is the
   * whole of it: the render resolution is deliberately not folded in,
   * since it varies by code path and `arcSegments` has margin for it.
   */
  #pixelScale(options: PassOptions): number {
    return mat.maxScale(this.#matrixFor(options)) || 1;
  }

  #fillAndStroke(
    options: DrawCall, outline: number[], closed: boolean,
    { fill, stroke, lineWidth, fillIndices }: FillAndStroke
  ): void {
    if (fill) {
      const indices = fillIndices || fanIndices(outline.length / 2);
      this.#submitShape(options, outline, indices, fill);
    }
    if (stroke) {
      const { positions, indices } = strokePolyline(outline, closed, lineWidth || 1);
      this.#submitShape(options, positions, indices, stroke);
    }
  }

  /**
   * Run a primitive's submissions, casting its silhouette shadow first when
   * options.shadow is set. The silhouette is whatever `draw` submits (fill
   * and stroke, or the textured quad), so every primitive shares this path.
   */
  #withShadow<T extends DrawCall>(options: T, draw: (options: T) => void): void {
    const shadow = options.shadow;
    if (!shadow) {
      draw(options);
      return;
    }
    const gl = this.gl;
    const batch = this.batch!;
    const pass = this.shadowPass!;

    // 1. Silhouette into the offscreen target, with the primitive's own alpha
    //    forced to 1: alpha is applied once, at composite time.
    // Shadows are cast in the active pass's space: world units at the world
    // render resolution, or UI units at display resolution. Sizes usually
    // match what the pass already has, in which case this costs nothing.
    const space = this.#passSpace();
    pass.resize(space.width, space.height, space.pixelWidth, space.pixelHeight);

    batch.flush();
    pass.beginSilhouette();
    batch.setTarget(space.width, space.height, false);
    batch.invalidateState();
    batch.trackBounds(true);
    const opaque = { ...options, globalAlpha: 1, shadow: null };
    draw(opaque);
    batch.flush();
    const bounds = batch.bounds;
    batch.trackBounds(false);

    if (bounds && bounds.minX <= bounds.maxX) {
      // 2. Blur over the bounding region.
      const radius = ShadowPass.radius(shadow);
      const region = expand(bounds, radius + 1, radius + 1, space.width, space.height);
      this.stats.drawCalls += pass.blur(region, shadow);

      // 3. Composite onto the frame, offset and tinted.
      this.#bindCurrentTarget();
      const ox = shadow.offsetX || 0;
      const oy = shadow.offsetY || 0;
      const positions = [
        region.minX + ox, region.minY + oy, region.maxX + ox, region.minY + oy,
        region.maxX + ox, region.maxY + oy, region.minX + ox, region.maxY + oy
      ];
      const uvs = [
        region.minX / space.width, region.minY / space.height, region.maxX / space.width, region.minY / space.height,
        region.maxX / space.width, region.maxY / space.height, region.minX / space.width, region.maxY / space.height
      ];
      const alpha = options.globalAlpha ?? 1;
      batch.begin({ mode: MODE_SHADOW, texture: pass.texture, shadowColor: parseColorPremultiplied(shadow.color || 'rgba(0,0,0,0.5)'), blend: options.blend });
      batch.push(positions, uvs, [alpha, alpha, alpha, alpha], QUAD_INDICES);
      batch.flush();
    } else {
      this.#bindCurrentTarget();
    }

    // 4. The primitive itself.
    draw(options);
  }

  /**
   * Coordinate space and pixel resolution of the pass currently drawing.
   */
  #passSpace(): PassSpace {
    const v = this.viewport;
    return this.inScreenPass
      ? { width: v.uiWidth, height: v.uiHeight, pixelWidth: v.backingWidth, pixelHeight: v.backingHeight }
      : { width: v.viewWidth, height: v.viewHeight, pixelWidth: v.worldWidth, pixelHeight: v.worldHeight };
  }

  /**
   * Re-bind whichever framebuffer the current pass draws into. The world pass
   * owns the effects scene target when lighting or post effects are on;
   * everything else owns the default framebuffer.
   */
  #bindCurrentTarget(): void {
    if (this.targetIsScene) {
      this.effectsPass!.bindScene(this.clipDepth);
      this.batch!.setTarget(this.width, this.height, false);
      this.batch!.invalidateState();
      return;
    }
    this.#bindDefaultTarget();
  }

  /**
   * Bind the default framebuffer for whichever pass is active.
   *
   * The two passes address it differently, and that difference is what keeps
   * the UI sharp: the world covers only its content rect and is measured in
   * world units, while the UI covers the whole backing store at full display
   * resolution and is measured in UI units.
   */
  #bindDefaultTarget(): void {
    const gl = this.gl!;
    const v = this.viewport;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    if (this.clipDepth > 0) gl.enable(gl.STENCIL_TEST);

    if (this.inScreenPass) {
      gl.viewport(0, 0, v.backingWidth, v.backingHeight);
      this.batch!.setTarget(v.uiWidth, v.uiHeight, true);
    } else {
      // GL measures y from the bottom; the content rect measures from the top.
      const glY = v.backingHeight - v.contentY - v.contentHeight;
      gl.viewport(v.contentX, glY, v.contentWidth, v.contentHeight);
      this.batch!.setTarget(v.viewWidth, v.viewHeight, true);
    }
    this.batch!.invalidateState();
  }

  // === Draw primitives ===

  /**
   * Submit a textured quad. `local` is the quad's local-space corner list
   * (top-left, top-right, bottom-right, bottom-left) and `localMatrix` places
   * it before the pass matrix is applied.
   */
  #submitTexturedQuad(
    options: DrawCall, entry: { texture: WebGLTexture; width: number; height: number },
    local: number[], localMatrix: Mat2D | null, source: SourceRect
  ): void {
    const { width: tw, height: th } = entry;
    const u0 = source.x / tw, v0 = source.y / th;
    const u1 = (source.x + source.width) / tw, v1 = (source.y + source.height) / th;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    // Inset half a texel so linear filtering stays inside the source rect.
    const hx = Math.min(0.5 / tw, (u1 - u0) / 2);
    const hy = Math.min(0.5 / th, (v1 - v0) / 2);
    const uvBounds = [u0 + hx, v0 + hy, u1 - hx, v1 - hy];

    const alpha = options.globalAlpha ?? 1;
    const m = localMatrix ? mat.multiply(this.#matrixFor(options), localMatrix) : this.#matrixFor(options);
    const positions = mat.applyToPositions(m, local);

    // The texture path already evaluates `texel * v_color`, so a tint costs
    // nothing extra: fold it into the vertex colour. White tint reduces to
    // [a, a, a, a], which is exactly the untinted case.
    const color = this.#tintColor(options.tint, alpha);

    this.batch!.begin({ mode: MODE_TEXTURE, texture: entry.texture, blend: options.blend });
    this.batch!.push(positions, uvs, color, QUAD_INDICES, uvBounds);
  }

  override drawSprite(options: SpriteOptions): void {
    if (!this.#ready || !options.image) return;
    const entry = this.textures!.get(options.image);
    if (!entry) return;
    this.trackPrimitive('sprite');

    const {
      x, y, tileX = 0, tileY = 0, tileWidth, tileHeight,
      width = tileWidth, height = tileHeight,
      rotation = 0, flipX = false, flipY = false
    } = options;

    let local = mat.translation(x, y);
    if (rotation) local = mat.multiply(local, mat.rotation(rotation));
    if (flipX || flipY) local = mat.multiply(local, mat.scaling(flipX ? -1 : 1, flipY ? -1 : 1));

    const hw = width / 2, hh = height / 2;
    this.#withShadow(options, (opts) => this.#submitTexturedQuad(
      opts, entry,
      [-hw, -hh, hw, -hh, hw, hh, -hw, hh],
      local,
      { x: tileX * tileWidth, y: tileY * tileHeight, width: tileWidth, height: tileHeight }
    ));
  }

  override drawImage(options: ImageOptions): void {
    if (!this.#ready || !options.image) return;
    const entry = this.textures!.get(options.image);
    if (!entry) return;
    this.trackPrimitive('sprite');

    const width = options.width ?? entry.width;
    const height = options.height ?? entry.height;
    const source = options.sourceWidth !== undefined && options.sourceHeight !== undefined
      ? { x: options.sourceX ?? 0, y: options.sourceY ?? 0, width: options.sourceWidth, height: options.sourceHeight }
      : { x: 0, y: 0, width: entry.width, height: entry.height };

    const { x, y } = options;
    this.#withShadow(options, (opts) => this.#submitTexturedQuad(
      opts, entry,
      [x, y, x + width, y, x + width, y + height, x, y + height],
      null,
      source
    ));
  }

  /**
   * Batched particle path. Each particle becomes one textured quad pushed
   * straight into the running batch with its own premultiplied colour, so a
   * whole field shares one texture bind and flushes only when the vertex
   * buffer fills. The quad is rotated and transformed inline rather than via
   * the matrix helpers, which would allocate per particle.
   */
  override drawParticles(options: ParticlesOptions): void {
    if (!this.#ready || !options.image || !options.data) return;
    const entry = this.textures!.get(options.image);
    if (!entry) return;

    const { data, tileX = 0, tileY = 0, tileWidth, tileHeight } = options;
    const available = Math.floor(data.length / PARTICLE_STRIDE);
    const count = Math.min(options.count ?? available, available);
    if (count <= 0) return;

    const { width: tw, height: th } = entry;
    const sx = tileX * tileWidth, sy = tileY * tileHeight;
    const u0 = sx / tw, v0 = sy / th;
    const u1 = (sx + tileWidth) / tw, v1 = (sy + tileHeight) / th;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    const hx = Math.min(0.5 / tw, (u1 - u0) / 2);
    const hy = Math.min(0.5 / th, (v1 - v0) / 2);
    const uvBounds = [u0 + hx, v0 + hy, u1 - hx, v1 - hy];

    const [ma, mb, mc, md, me, mf] = this.#matrixFor(options);
    const aspect = tileWidth / tileHeight;
    const alphaScale = options.globalAlpha ?? 1;
    const positions = this.#particleQuad;
    const color = this.#particleColor;
    let drawn = 0;

    this.batch!.begin({ mode: MODE_TEXTURE, texture: entry.texture, blend: options.blend });

    for (let i = 0; i < count; i++) {
      const o = i * PARTICLE_STRIDE;
      // `count` is derived from the buffer's own length, so every float
      // this particle needs is in it.
      const alpha = data[o + 7]! * alphaScale;
      if (alpha <= 0) continue;

      const px = data[o]!, py = data[o + 1]!;
      const hh = data[o + 2]! / 2, hw = hh * aspect;
      const rot = data[o + 3]!;
      const c = rot ? Math.cos(rot) : 1;
      const sn = rot ? Math.sin(rot) : 0;

      // Rotated half-extents: corner = centre ± ex ± ey.
      const exx = c * hw, exy = sn * hw;
      const eyx = -sn * hh, eyy = c * hh;

      let x, y;
      x = px - exx - eyx; y = py - exy - eyy;
      positions[0] = ma * x + mc * y + me; positions[1] = mb * x + md * y + mf;
      x = px + exx - eyx; y = py + exy - eyy;
      positions[2] = ma * x + mc * y + me; positions[3] = mb * x + md * y + mf;
      x = px + exx + eyx; y = py + exy + eyy;
      positions[4] = ma * x + mc * y + me; positions[5] = mb * x + md * y + mf;
      x = px - exx + eyx; y = py - exy + eyy;
      positions[6] = ma * x + mc * y + me; positions[7] = mb * x + md * y + mf;

      color[0] = data[o + 4]! * alpha;
      color[1] = data[o + 5]! * alpha;
      color[2] = data[o + 6]! * alpha;
      color[3] = alpha;

      this.batch!.push(positions, uvs, color, QUAD_INDICES, uvBounds);
      drawn++;
    }

    this.stats.primitives += drawn;
    this.stats.spritesDrawn += drawn;
  }

  /** Scratch buffers for drawParticles, reused across particles and frames. */
  #particleQuad = new Array<number>(8);
  #particleColor = new Array<number>(4);

  override setAmbientLight(color: string | null): void {
    this.ambientLight = color ?? null;
  }

  override setPostEffects(effects: PostEffects | null): void {
    if (!effects) {
      this.postEffects = null;
      return;
    }
    // Colours are parsed here, once per set, so the composite pass only
    // ever uploads numbers. Arrays are accepted as already-parsed.
    const rgb = (color: string | readonly number[]): number[] =>
      (Array.isArray(color) ? [...color] : parseColor(color as string).slice(0, 3));
    this.postEffects = {
      ...effects,
      grade: effects.grade
        ? {
          ...effects.grade,
          shadows: rgb(effects.grade.shadows ?? '#ffffff'),
          highlights: rgb(effects.grade.highlights ?? '#ffffff')
        }
        : undefined,
      flash: effects.flash
        ? { ...effects.flash, color: rgb(effects.flash.color ?? '#ffffff') }
        : undefined
    };
  }

  override drawLight(options: LightOptions): void {
    if (!this.#ready || !this.#effectsActive) return;
    const { x, y, radius, color = '#ffffff', intensity = 1, angle, cone, shadows = false, z = 0 } = options;
    const m = this.#matrixFor(options);
    const [sx, sy] = mat.apply(m, x, y);
    const light: PassLight = {
      x: sx,
      y: sy,
      radius: radius * mat.maxScale(m),
      color: parseColor(color),
      intensity,
      shadows,
      z
    };
    if (cone !== undefined && angle !== undefined) {
      // The matrix may itself rotate; the beam turns with it.
      light.angle = angle + Math.atan2(m[1], m[0]);
      // cos(half-cone), what the shader compares against. Clamped away from
      // a degenerate full-circle "spot".
      light.cosCone = Math.cos(Math.min(Math.PI - 0.01, Math.max(0.02, cone)) / 2);
    }
    this.lights.push(light);
  }

  override drawShadowCaster(options: ShadowCasterOptions & PassOptions): void {
    if (!this.#ready || !this.#effectsActive) return;
    const m = this.#matrixFor(options);
    let points: Array<{ x: number; y: number }>;
    if (options.points) {
      points = options.points;
    } else if (options.radius !== undefined) {
      // A circle as an octagon: plenty for a silhouette nobody sees directly.
      // A caster that is not a polygon names its centre.
      const { x, y, radius } = options as { x: number; y: number; radius: number };
      points = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        points.push({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius });
      }
    } else {
      // Neither points nor a radius: the rectangle form, which carries a size.
      const { x, y, width, height, rotation = 0 } =
        options as { x: number; y: number; width: number; height: number; rotation?: number };
      const c = Math.cos(rotation);
      const sn = Math.sin(rotation);
      const hw = width / 2;
      const hh = height / 2;
      const corners: Array<[number, number]> = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      points = corners.map(([px, py]) => ({
        x: x + px * c - py * sn,
        y: y + px * sn + py * c
      }));
    }
    if (points.length < 3) return;

    const flat = new Float32Array(points.length * 2);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const [px, py] = mat.apply(m, points[i]!.x, points[i]!.y);
      flat[i * 2] = px;
      flat[i * 2 + 1] = py;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    this.shadowCasters.push({ points: flat, minX, minY, maxX, maxY, z: options.z ?? Infinity });
  }

  /** Whether this frame routes the world pass through the effects target. */
  get #effectsActive(): boolean {
    return Boolean(this.ambientLight || this.postEffects);
  }

  override drawRect(options: RectOptions): void {
    if (!this.#ready) return;
    this.trackPrimitive('shape');

    const { x, y, width, height, cornerRadius } = options;
    const outline = roundRectPoints(x, y, width, height, cornerRadius || 0, this.#pixelScale(options));
    this.#withShadow(options, (opts) => this.#fillAndStroke(opts, outline, true, {
      fill: options.fill !== false ? options.fillStyle : null,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth
    }));
  }

  override drawLine(options: LineOptions): void {
    if (!this.#ready) return;
    this.trackPrimitive('shape');

    const { positions, indices } = strokePolyline(
      [options.x1, options.y1, options.x2, options.y2], false, options.lineWidth || 1
    );
    this.#withShadow(options, (opts) => this.#submitShape(opts, positions, indices, options.strokeStyle || '#000'));
  }

  override drawArc(options: ArcOptions): void {
    if (!this.#ready) return;
    this.trackPrimitive('shape');

    const { points, full } = arcPoints(
      options.x, options.y, options.radius, options.startAngle ?? 0, options.endAngle ?? Math.PI * 2,
      this.#pixelScale(options)
    );
    // A chord-closed circular segment is always convex, so a fan is exact.
    this.#withShadow(options, (opts) => this.#fillAndStroke(opts, points, full, {
      fill: options.fill !== false ? options.fillStyle : null,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth
    }));
  }

  override drawPath(options: PathOptions): void {
    if (!this.#ready) return;
    if (!options.points || options.points.length < 2) return;
    this.trackPrimitive('shape');

    const flat: number[] = [];
    for (const p of options.points) flat.push(p.x, p.y);
    const fillIndices = triangulate(flat);
    this.#withShadow(options, (opts) => this.#fillAndStroke(opts, flat, !!options.closed, {
      fill: options.fillStyle,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth,
      fillIndices
    }));
  }

  override drawText(options: TextOptions): void {
    if (!this.#ready) return;
    this.trackPrimitive('text');

    // Rasterize at the density the active pass is presented with: UI text
    // follows the display, world text follows the render resolution.
    const space = this.#passSpace();
    const entry = this.labels!.get(options, this.frameIndex, space.pixelWidth / space.width);
    if (!entry) return;

    const x = options.x - entry.anchorX;
    const y = options.y - entry.anchorY;
    this.#withShadow(options, (opts) => this.#submitTexturedQuad(
      opts, entry,
      [x, y, x + entry.width, y, x + entry.width, y + entry.height, x, y + entry.height],
      null,
      { x: 0, y: 0, width: entry.width, height: entry.height }
    ));
  }

  // === Transform & clip stacks ===

  override pushTransform(transform: TransformOptions = {}): void {
    if (!this.#ready) return;
    const current = this.#matrixFor(transform);
    this.stateStack.push({ kind: 'transform', screen: !!transform.isScreenSpace, matrix: current });
    this.#setMatrixFor(transform, mat.multiply(current, mat.fromTransform(transform)));
  }

  override popTransform(): void {
    if (!this.#ready) return;
    const entry = this.#popState('transform');
    if (!entry) return;
    if (entry.kind === 'transform') {
      this.#setMatrixFor({ isScreenSpace: entry.screen }, entry.matrix);
    } else {
      this.#unclip(entry);
    }
  }

  override pushClip(rect: ClipRect): void {
    if (!this.#ready) return;
    const outline = roundRectPoints(rect.x, rect.y, rect.width, rect.height, rect.cornerRadius || 0, this.#pixelScale(rect));
    const positions = mat.applyToPositions(this.#matrixFor(rect), outline);
    const indices = fanIndices(outline.length / 2);
    const entry: StateEntry = { kind: 'clip', screen: !!rect.isScreenSpace, positions, indices };
    this.stateStack.push(entry);
    this.#clip(entry);
  }

  override popClip(): void {
    if (!this.#ready) return;
    const entry = this.#popState('clip');
    if (!entry) return;
    if (entry.kind === 'clip') {
      this.#unclip(entry);
    } else {
      this.#setMatrixFor({ isScreenSpace: entry.screen }, entry.matrix);
    }
  }

  #popState(kind: StateEntry['kind']): StateEntry | null {
    const entry = this.stateStack.pop();
    if (!entry) return null;
    if (entry.kind !== kind) {
      console.warn(`WebGLRenderer: pop${kind === 'clip' ? 'Clip' : 'Transform'}() called but the top of the state stack is a ${entry.kind}; transform/clip pushes must nest`);
    }
    return entry;
  }

  /**
   * Stencil-based clipping with reference counting: the stencil value of a
   * pixel is the number of active clips containing it, so nested clips
   * intersect. Draws pass only where stencil == clipDepth.
   */
  #clip(entry: Extract<StateEntry, { kind: 'clip' }>): void {
    const gl = this.gl!;
    this.batch!.flush();
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    this.#drawStencilGeometry(entry);
    this.clipDepth++;
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    this.stats.stateChanges += 2;
  }

  #unclip(entry: Extract<StateEntry, { kind: 'clip' }>): void {
    const gl = this.gl!;
    this.batch!.flush();
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
    this.#drawStencilGeometry(entry);
    this.clipDepth = Math.max(0, this.clipDepth - 1);
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    if (this.clipDepth === 0) gl.disable(gl.STENCIL_TEST);
    this.stats.stateChanges += 2;
  }

  #drawStencilGeometry(entry: Extract<StateEntry, { kind: 'clip' }>): void {
    const gl = this.gl!;
    gl.colorMask(false, false, false, false);
    this.batch!.begin({ mode: MODE_SOLID });
    this.batch!.push(entry.positions, null, [0, 0, 0, 0], entry.indices);
    this.batch!.flush();
    // The stencil-only draw is bookkeeping, not a submitted primitive batch.
    this.stats.drawCalls--;
    gl.colorMask(true, true, true, true);
  }

  #resetStencil(): void {
    const gl = this.gl!;
    this.clipDepth = 0;
    this.stateStack = [];
    gl.disable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
  }

  // === Queries ===

  override measureText(text: string, style: TextStyle = {}): { width: number; height: number } {
    if (!this.#ready) return { width: 0, height: 0 };
    return this.labels!.measure(text, style);
  }

  override setCursor(style: string): void {
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }
}

const QUAD_INDICES = [0, 1, 2, 0, 2, 3];
