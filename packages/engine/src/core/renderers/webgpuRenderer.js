import { BaseRenderer } from './baseRenderer.js';
import { WebGLRenderer } from './webglRenderer.js';
import { identityViewport } from '../viewport.js';
import { webgpuDevice } from './webgpu/device.js';
import {
  SKY_SHADER, SHADOW_SHADER, SHADOW_SKINNED_SHADER, MESH_SHADER, MESH_SKINNED_SHADER, CULL_SHADER,
  FRAME_UNIFORM_FLOATS, FRAME_OFFSETS, MATERIAL_UNIFORM_FLOATS, MAX_CASCADES, MAX_SPOT_SHADOWS, MAX_CULL_PASSES
} from './webgpu/shaders.js';
import { TextureCache3D } from './webgpu/textures.js';
import { Environment } from './webgpu/environment.js';
import { PostPass } from './webgpu/post.js';
import { Frame3D, INSTANCE_FLOATS, LIGHT_FLOATS, MAX_LIGHTS } from './frame3d.js';
import * as mat4 from './geometry/mat4.js';

/**
 * The 3D renderer, on WebGPU.
 *
 * It is a different kind of renderer from the 2D backends. They are
 * immediate-mode: an entity calls `drawSprite` and the call is batched and
 * drawn. A 3D frame cannot be drawn that way — the shadow pass needs every
 * caster before the main pass shades anything — so this renderer is
 * *retained*: once a frame the engine hands it a `Frame3D` describing
 * everything to draw, and `render(frame)` draws it.
 *
 * It extends `BaseRenderer` for the parts that are not about drawing — the
 * viewport, the statistics, the debug flag, the capability table — and so
 * that the 2D primitives fail loudly if anything calls them. `dimensions`
 * is how the engine tells the two kinds apart.
 *
 * **The frame**, in passes:
 *
 *   0. the environment, when the sky changed: the sky baked to a cubemap,
 *      prefiltered for reflections and convolved for diffuse (environment.js);
 *   0b. the cull: one compute pass tests every instance's bounding sphere
 *      against the planes of every pass below and writes each pass's
 *      indirect draw arguments and the list of instances it draws;
 *   1. shadow maps: the sun's cascades, each an orthographic box fitted
 *      to a slice of the view frustum and snapped to its own texels so the
 *      shadows hold still as the camera moves, then a perspective map for
 *      each of the nearest shadowed spot lights; every caster, depth only;
 *   2. the sky: one full-screen triangle, gradient and sun disc;
 *   3. the meshes: one indirect instanced, indexed draw per geometry and
 *      material, over the instances the cull kept, shaded with a metallic-roughness model under the sun, the point
 *      and spot lights and the environment, with the shadow maps, into
 *      four targets: direct light, indirect light, normal and depth, and
 *      velocity;
 *   4. post: occlusion, resolve with fog, temporal anti-aliasing, depth of
 *      field, motion blur, auto exposure, bloom, and the composite that
 *      tonemaps, grades and encodes to the canvas (post.js).
 *
 * Passes 2 and 3 render in high range at 4x MSAA, with a sub-pixel jitter
 * for the anti-aliasing, and resolve into the post pass's targets. The
 * `effects` flags, set by the `r_*` cvars, say which post stages run.
 * Geometry, images and materials are uploaded once each and cached by
 * identity. The instance buffer is laid out per frame, one contiguous
 * range per group: a group's per-frame records are written from the CPU
 * and its resident `StaticBatch` records are copied GPU-to-GPU from a
 * buffer uploaded once, so a level's props cost the CPU nothing a frame.
 *
 * **Statistics.** How many instances each pass drew is decided on the GPU,
 * so `stats.drawn`, `casters` and `triangles` come back a frame late
 * through a staging buffer, and `gpuMs` — the cull pass to the composite —
 * where the adapter has `timestamp-query`.
 *
 * **The HUD.** A canvas holds one context, so the UI pass cannot share this
 * renderer's canvas. The renderer makes a second canvas, laid exactly over
 * the first and transparent to pointer events, and runs the WebGL2 backend
 * on it unchanged; `uiBackend` is what `game.uiRenderer` wraps. Input and
 * fullscreen still target the original canvas.
 */

const SAMPLES = 4;
const HDR_FORMAT = 'rgba16float';

/**
 * What the `r_shadows` setting buys: cascade count and size for the sun,
 * how many spot lights get a map and at what size.
 */
export const SHADOW_QUALITY = Object.freeze({
  off: { cascades: 0, sunSize: 1, spots: 0, spotSize: 1 },
  low: { cascades: 2, sunSize: 1024, spots: 1, spotSize: 512 },
  medium: { cascades: 3, sunSize: 2048, spots: 2, spotSize: 1024 },
  high: { cascades: 4, sunSize: 2048, spots: 4, spotSize: 1024 }
});

/** Where the cascade splits fall between linear and logarithmic spacing. */
const CASCADE_LAMBDA = 0.6;

export class WebGPURenderer extends BaseRenderer {
  constructor() {
    super();
    /** Tells the engine this renderer draws a 3D world. */
    this.dimensions = 3;
    this.canvas = null;
    this.device = null;
    this.context = null;
    this.format = null;
    /** The HUD's canvas, laid over `canvas`. */
    this.overlayCanvas = null;
    /** The 2D backend drawing the HUD onto `overlayCanvas`. */
    this.uiBackend = null;

    this.frameUniform = null;
    this.frameData = new Float32Array(FRAME_UNIFORM_FLOATS);
    this.sceneBindGroupLayout = null;
    this.sceneBindGroup = null;
    /** Group 1 of the mesh pass: the shadow map and the environment. */
    this.lightingBindGroup = null;
    /** @type {Environment|null} */
    this.environment = null;
    /** @type {PostPass|null} */
    this.post = null;
    this.lightBuffer = null;
    this.lightData = new Float32Array(MAX_LIGHTS * LIGHT_FLOATS);
    this.materialBindGroupLayout = null;
    /** @type {TextureCache3D|null} */
    this.textures = null;
    /** @type {WeakMap<object, GPUBindGroup>} material -> its bind group; `defaultMaterial` for none. */
    this.materialCache = new WeakMap();
    this.defaultMaterial = null;
    this.skyPipeline = null;
    this.shadowPipeline = null;
    this.meshPipeline = null;
    /** The same two, reading joints and weights and skinning on the GPU. */
    this.shadowSkinnedPipeline = null;
    this.meshSkinnedPipeline = null;
    this.jointBuffer = null;
    this.jointCapacity = 0;
    this.jointData = new Float32Array(0);

    this.colorTextures = [];
    this.colorViews = [];
    this.depthTexture = null;
    /** Shadow maps: a depth array for the sun's cascades and one for the spots. */
    this.sunShadowTexture = null;
    this.spotShadowTexture = null;
    this.sunShadowLayers = [];
    this.spotShadowLayers = [];
    /** One 64-byte uniform and bind group per shadow pass, holding its light matrix. */
    this.shadowPassUniforms = [];
    this.shadowPassGroups = [];
    this.shadowPassLayout = null;
    this.lightingBindGroupLayout = null;
    this.shadowSampler = null;
    this.shadowQuality = 'medium';
    /** Which post stages run; the frame's `post` block holds their strengths. */
    this.effects = { taa: true, ao: true, dof: true, motionBlur: true, autoExposure: true, bloom: true, film: true };
    this.previousViewProjection = mat4.create();
    this.jitteredViewProjection = mat4.create();
    this.frameCounter = 0;
    this.lastFrameTime = 0;
    this.startTime = typeof performance !== 'undefined' ? performance.now() : 0;
    this.cascadeScratch = { eye: { x: 0, y: 0, z: 0 }, view: mat4.create(), projection: mat4.create(), lightBasis: mat4.create() };

    /** One instance buffer for the whole frame, grown when a frame outgrows it. */
    this.instanceBuffer = null;
    this.instanceCapacity = 0;
    this.instanceData = new Float32Array(0);
    /** @type {WeakMap<object, {buffer: GPUBuffer, version: number, capacity: number}>} StaticBatch -> its resident copy */
    this.batchCache = new WeakMap();
    /** The cull pass: its pipeline, parameters and outputs. */
    this.cullPipeline = null;
    this.cullSceneLayout = null;
    this.cullSceneBindGroup = null;
    this.cullBindGroupLayout = null;
    this.cullBindGroup = null;
    this.cullParams = null;
    this.cullData = new Float32Array(4 + MAX_CULL_PASSES * 6 * 4);
    this.groupStartsBuffer = null;
    this.groupStartsCapacity = 0;
    /** Indirect draw arguments, one record per pass and group; the cull writes the instance counts. */
    this.argsBuffer = null;
    this.argsCapacity = 0;
    /** The cull's output: instance indices per pass, in the groups' slots. */
    this.remapBuffer = null;
    this.remapCapacity = 0;
    /** Staging buffers the statistics read back through; a few, so a frame never waits on a map. */
    this.staging = [];
    this.querySet = null;
    this.timeBuffer = null;
    this.hasTimestamps = false;
    Object.assign(this.stats, { instances: 0, drawn: 0, casters: 0, triangles: 0, gpuMs: 0 });
    /** @type {WeakMap<object, {positions: GPUBuffer, normals: GPUBuffer, uvs: GPUBuffer, index: GPUBuffer, count: number, format: GPUIndexFormat}>} */
    this.geometryCache = new WeakMap();

    /** The canvas texture of the frame being drawn; valid until the task ends. */
    this.currentTexture = null;
  }

  /** Fullscreen takes the canvas's parent, so the HUD overlay comes along. */
  get fullscreenElement() {
    return this.canvas?.parentElement ?? this.canvas;
  }

  // === Lifecycle ===

  init(element, options = {}) {
    this.canvas = element;
    this.device = webgpuDevice();
    this.context = element.getContext('webgpu');
    if (!this.context) throw new Error('WebGPURenderer: the canvas has no WebGPU context (is another context already on it?)');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    // COPY_SRC is for `readPixels`; it costs nothing when unused.
    this.context.configure({
      device: this.device, format: this.format, alphaMode: 'opaque',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });

    if (options.worldFilter) super.setWorldFilter(options.worldFilter);
    if (options.textureFilter) super.setTextureFilter(options.textureFilter);
    const viewport = options.viewport || identityViewport(
      options.width || this.viewport.viewWidth,
      options.height || this.viewport.viewHeight
    );

    this.#createOverlay(element, options, viewport);
    this.#createResources();
    this.setViewport(viewport);
    return true;
  }

  #createOverlay(element, options, viewport) {
    const overlay = document.createElement('canvas');
    overlay.className = 'm2d-ui-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.position = 'absolute';
    overlay.style.pointerEvents = 'none';
    element.insertAdjacentElement?.('afterend', overlay);
    this.overlayCanvas = overlay;
    this.#placeOverlay();

    this.uiBackend = new WebGLRenderer();
    this.uiBackend.init(overlay, { ...options, viewport });
  }

  /**
   * Lay the overlay exactly over the world canvas. Offsets are relative to
   * the offset parent, which is the containing block of an absolutely
   * positioned sibling in every layout but one: a canvas placed directly in
   * an unpositioned body, where the body's margin is the difference. Games
   * that hit it position the canvas's parent, as they would for any overlay.
   */
  #placeOverlay() {
    const canvas = this.canvas;
    const style = this.overlayCanvas.style;
    style.left = `${canvas.offsetLeft}px`;
    style.top = `${canvas.offsetTop}px`;
    style.width = canvas.style.width || `${canvas.clientWidth}px`;
    style.height = canvas.style.height || `${canvas.clientHeight}px`;
  }

  #createResources() {
    const device = this.device;
    this.frameUniform = device.createBuffer({
      label: 'frame',
      size: FRAME_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.lightBuffer = device.createBuffer({
      label: 'lights',
      size: MAX_LIGHTS * LIGHT_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.sceneBindGroupLayout = device.createBindGroupLayout({
      label: 'scene',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
      ]
    });
    // The cull reads the instances through a group of its own: the scene
    // group also holds the remap list, which the cull writes, and one pass
    // may not bind a buffer both ways.
    this.cullSceneLayout = device.createBindGroupLayout({
      label: 'cull scene',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }
      ]
    });
    this.cullBindGroupLayout = device.createBindGroupLayout({
      label: 'cull',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
      ]
    });
    this.cullParams = device.createBuffer({
      label: 'cull params', size: this.cullData.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.cullPipeline = device.createComputePipeline({
      label: 'cull',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.cullSceneLayout, this.cullBindGroupLayout] }),
      compute: { module: device.createShaderModule({ code: CULL_SHADER, label: 'cull' }), entryPoint: 'main' }
    });
    if (!device.features.has('indirect-first-instance')) {
      throw new Error('M2D: the WebGPU adapter lacks indirect-first-instance, which the 3D renderer draws with');
    }
    this.hasTimestamps = device.features.has('timestamp-query');
    if (this.hasTimestamps) {
      this.querySet = device.createQuerySet({ label: 'frame time', type: 'timestamp', count: 2 });
      this.timeBuffer = device.createBuffer({
        label: 'frame time', size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
      });
    }
    this.#ensureRemapBuffer(256);
    this.#ensureGroupBuffers(1, 16);
    this.#ensureJointBuffer(64);
    this.lightingBindGroupLayout = device.createBindGroupLayout({
      label: 'lighting',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', viewDimension: '2d-array' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', viewDimension: '2d-array' } }
      ]
    });
    const lightingBindGroupLayout = this.lightingBindGroupLayout;
    this.shadowPassLayout = device.createBindGroupLayout({
      label: 'shadow pass',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }]
    });
    for (let i = 0; i < MAX_CASCADES + MAX_SPOT_SHADOWS; i++) {
      const buffer = device.createBuffer({ label: `shadow pass ${i}`, size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.shadowPassUniforms.push(buffer);
      this.shadowPassGroups.push(device.createBindGroup({
        layout: this.shadowPassLayout, entries: [{ binding: 0, resource: { buffer } }]
      }));
    }
    this.shadowSampler = device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
    this.environment = new Environment(device, this.sceneBindGroupLayout);
    this.post = new PostPass(device, this.sceneBindGroupLayout, this.format);
    this.materialBindGroupLayout = device.createBindGroupLayout({
      label: 'material',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }
      ]
    });
    this.textures = new TextureCache3D(device);
    this.defaultMaterial = this.#materialBindGroup(null);

    this.#createShadowMaps();

    const vertexBuffers = [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
      { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }] }
    ];
    const skinBuffers = [
      { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: 'uint16x4' }] },
      { arrayStride: 16, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }] }
    ];
    const sceneLayout = device.createPipelineLayout({ bindGroupLayouts: [this.sceneBindGroupLayout] });
    const shadowLayout = device.createPipelineLayout({ bindGroupLayouts: [this.sceneBindGroupLayout, this.shadowPassLayout] });

    const sky = device.createShaderModule({ code: SKY_SHADER, label: 'sky' });
    this.skyPipeline = device.createRenderPipeline({
      label: 'sky',
      layout: sceneLayout,
      vertex: { module: sky, entryPoint: 'vs' },
      fragment: { module: sky, entryPoint: 'fs', targets: MAIN_TARGETS.map(({ format }) => ({ format })) },
      primitive: { topology: 'triangle-list' },
      multisample: { count: SAMPLES },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' }
    });

    const shadowPipeline = (code, label, buffers) => device.createRenderPipeline({
      label,
      layout: shadowLayout,
      vertex: { module: device.createShaderModule({ code, label }), entryPoint: 'vs', buffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less',
        depthBias: 2, depthBiasSlopeScale: 2
      }
    });
    this.shadowPipeline = shadowPipeline(SHADOW_SHADER, 'shadow', vertexBuffers.slice(0, 2));
    this.shadowSkinnedPipeline = shadowPipeline(SHADOW_SKINNED_SHADER, 'shadow skinned', [...vertexBuffers.slice(0, 2), ...skinBuffers]);

    const meshLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.sceneBindGroupLayout, lightingBindGroupLayout, this.materialBindGroupLayout]
    });
    const meshPipeline = (code, label, buffers) => {
      const module = device.createShaderModule({ code, label });
      return device.createRenderPipeline({
        label,
        layout: meshLayout,
        vertex: { module, entryPoint: 'vs', buffers },
        fragment: { module, entryPoint: 'fs', targets: MAIN_TARGETS.map(({ format }) => ({ format })) },
        primitive: { topology: 'triangle-list', cullMode: 'back' },
        multisample: { count: SAMPLES },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
      });
    };
    this.meshPipeline = meshPipeline(MESH_SHADER, 'mesh', vertexBuffers);
    this.meshSkinnedPipeline = meshPipeline(MESH_SKINNED_SHADER, 'mesh skinned', [...vertexBuffers, ...skinBuffers]);

    this.#ensureInstanceBuffer(256);
  }

  /**
   * The shadow maps at the current quality, and the lighting bind group that
   * reads them. Rebuilt when the quality changes.
   */
  #createShadowMaps() {
    const device = this.device;
    const q = SHADOW_QUALITY[this.shadowQuality];
    this.sunShadowTexture?.destroy();
    this.spotShadowTexture?.destroy();
    const array = (size, layers, label) => device.createTexture({
      label, size: { width: size, height: size, depthOrArrayLayers: layers }, format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    // Arrays always have their full layer count, so the bind group layout
    // holds whatever the quality; unused layers are never drawn or read.
    this.sunShadowTexture = array(q.sunSize, MAX_CASCADES, 'sun shadow maps');
    this.spotShadowTexture = array(q.spotSize, MAX_SPOT_SHADOWS, 'spot shadow maps');
    const layers = (texture, count) => Array.from({ length: count }, (_, i) =>
      texture.createView({ dimension: '2d', baseArrayLayer: i, arrayLayerCount: 1 }));
    this.sunShadowLayers = layers(this.sunShadowTexture, MAX_CASCADES);
    this.spotShadowLayers = layers(this.spotShadowTexture, MAX_SPOT_SHADOWS);
    this.lightingBindGroup = device.createBindGroup({
      layout: this.lightingBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sunShadowTexture.createView({ dimension: '2d-array' }) },
        { binding: 1, resource: this.shadowSampler },
        { binding: 2, resource: this.environment.irradianceView },
        { binding: 3, resource: this.environment.prefilteredView },
        { binding: 4, resource: this.environment.lutView },
        { binding: 5, resource: this.environment.sampler },
        { binding: 6, resource: this.spotShadowTexture.createView({ dimension: '2d-array' }) }
      ]
    });
  }

  /**
   * Shadow quality: `off`, `low`, `medium` or `high`; see `SHADOW_QUALITY`.
   * The `r_shadows` cvar sets it.
   */
  setShadowQuality(quality) {
    if (!(quality in SHADOW_QUALITY) || quality === this.shadowQuality) return;
    this.shadowQuality = quality;
    if (this.device) this.#createShadowMaps();
  }

  setViewport(viewport) {
    this.viewport = viewport;
    if (!this.device) return;
    const { backingWidth, backingHeight, worldWidth, worldHeight } = viewport;
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    for (const t of this.colorTextures ?? []) t.destroy();
    this.depthTexture?.destroy();
    // The world renders at the resolution setting and is presented into the
    // content rectangle, as the 2D backends do; see viewport.js.
    const size = { width: worldWidth, height: worldHeight };
    this.colorTextures = MAIN_TARGETS.map(({ label, format }) => this.device.createTexture({
      label: `${label} (msaa)`, size, sampleCount: SAMPLES, format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    }));
    this.colorViews = this.colorTextures.map((t) => t.createView());
    this.post.resize(worldWidth, worldHeight);
    this.depthTexture = this.device.createTexture({
      label: 'depth (msaa)', size, sampleCount: SAMPLES, format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    if (this.overlayCanvas) this.#placeOverlay();
    this.uiBackend?.setViewport(viewport);
  }

  setWorldFilter(filter) {
    super.setWorldFilter(filter);
    this.uiBackend?.setWorldFilter(filter);
  }

  setTextureFilter(filter) {
    super.setTextureFilter(filter);
    this.uiBackend?.setTextureFilter(filter);
  }

  destroy() {
    this.uiBackend?.destroy();
    this.overlayCanvas?.remove?.();
    for (const texture of [...(this.colorTextures ?? []), this.depthTexture, this.sunShadowTexture, this.spotShadowTexture]) texture?.destroy();
    for (const buffer of this.shadowPassUniforms) buffer.destroy();
    this.shadowPassUniforms = [];
    this.shadowPassGroups = [];
    this.textures?.destroy();
    this.textures = null;
    this.environment?.destroy();
    this.post?.destroy();
    this.lightBuffer?.destroy();
    this.environment = this.post = this.lightBuffer = null;
    this.materialCache = new WeakMap();
    this.defaultMaterial = null;
    this.frameUniform?.destroy();
    this.instanceBuffer?.destroy();
    this.jointBuffer?.destroy();
    this.jointBuffer = null;
    this.jointCapacity = 0;
    for (const buffer of [this.cullParams, this.groupStartsBuffer, this.argsBuffer, this.remapBuffer, this.timeBuffer]) buffer?.destroy();
    for (const slot of this.staging) slot.buffer.destroy();
    this.staging = [];
    this.querySet?.destroy();
    this.querySet = this.timeBuffer = null;
    this.cullParams = this.groupStartsBuffer = this.argsBuffer = this.remapBuffer = this.cullBindGroup = null;
    this.groupStartsCapacity = this.argsCapacity = this.remapCapacity = 0;
    this.batchCache = new WeakMap();
    this.context?.unconfigure();
    this.uiBackend = null;
    this.overlayCanvas = null;
    this.colorTextures = [];
    this.depthTexture = this.sunShadowTexture = this.spotShadowTexture = this.lightingBindGroup = null;
    this.frameUniform = this.instanceBuffer = null;
    this.instanceCapacity = 0;
    this.skyPipeline = this.shadowPipeline = this.meshPipeline = null;
    this.geometryCache = new WeakMap();
    this.context = null;
    this.device = null;
    this.canvas = null;
  }

  // === The frame ===

  /**
   * The engine calls this at the top of every frame. The 3D frame draws
   * its own sky, so there is nothing to clear here; it is where the HUD's
   * overlay is wiped to transparent for the UI pass that follows.
   */
  clear() {
    this.uiBackend?.clear();
  }

  /** A fresh frame to fill; see `Frame3D`. */
  createFrame() {
    return new Frame3D();
  }

  /**
   * Draw one frame.
   * @param {Frame3D} frame
   */
  render(frame) {
    super.beginFrame();
    const device = this.device;
    this.#jitter(frame);
    const shadows = this.#planShadows(frame);
    this.#writeFrameUniform(frame, shadows);
    this.#uploadLights(frame);
    this.#uploadJoints(frame);
    const layout = this.#assemble(frame, 1 + shadows.passes.length);
    this.#writeCullParams(frame, shadows, layout);
    this.stats.instances = layout.total;

    const encoder = device.createCommandEncoder({ label: 'frame' });
    // Resident batches into this frame's instance buffer, GPU to GPU. The
    // per-frame records were written to the queue above, so they land first.
    for (const copy of layout.copies) {
      encoder.copyBufferToBuffer(copy.buffer, 0, this.instanceBuffer, copy.offset * INSTANCE_BYTES, copy.count * INSTANCE_BYTES);
    }
    if (this.environment.update(encoder, frame, this.sceneBindGroup)) this.stats.stateChanges++;

    const stamps = this.hasTimestamps;
    const cull = encoder.beginComputePass({
      label: 'cull',
      ...(stamps && { timestampWrites: { querySet: this.querySet, beginningOfPassWriteIndex: 0 } })
    });
    cull.setPipeline(this.cullPipeline);
    cull.setBindGroup(0, this.cullSceneBindGroup);
    cull.setBindGroup(1, this.cullBindGroup);
    cull.dispatchWorkgroups(Math.ceil(layout.total / 64));
    cull.end();

    for (let i = 0; i < shadows.passes.length; i++) {
      const { view, matrix } = shadows.passes[i];
      device.queue.writeBuffer(this.shadowPassUniforms[i], 0, matrix);
      const pass = encoder.beginRenderPass({
        label: 'shadow',
        colorAttachments: [],
        depthStencilAttachment: { view, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
      });
      pass.setBindGroup(0, this.sceneBindGroup);
      pass.setBindGroup(1, this.shadowPassGroups[i]);
      this.#drawGroups(pass, layout, 'shadow', 1 + i);
      pass.end();
    }

    const resolves = this.post.attachments;
    const pass = encoder.beginRenderPass({
      label: 'main',
      colorAttachments: this.colorViews.map((view, i) => ({
        view,
        resolveTarget: resolves[i],
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'discard'
      })),
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard'
      }
    });
    pass.setBindGroup(0, this.sceneBindGroup);
    pass.setPipeline(this.skyPipeline);
    pass.draw(3);
    this.stats.drawCalls++;

    pass.setBindGroup(1, this.lightingBindGroup);
    this.stats.stateChanges += 2;
    this.#drawGroups(pass, layout, 'main', 0);
    pass.end();

    this.currentTexture = this.context.getCurrentTexture();
    const { contentX, contentY, contentWidth, contentHeight } = this.viewport;
    const e = this.effects;
    const post = frame.post ?? {};
    this.stats.drawCalls += this.post.run(encoder, this.sceneBindGroup, this.currentTexture.createView(), {
      effects: {
        ao: e.ao && (post.ao?.intensity ?? 0) > 0,
        taa: e.taa,
        dof: e.dof && post.dof?.focus != null,
        motionBlur: e.motionBlur && (post.motionBlur?.strength ?? 0) > 0,
        autoExposure: e.autoExposure && !!post.autoExposure?.enabled,
        bloom: e.bloom && (frame.bloom?.intensity ?? 0) > 0
      },
      lut: post.grade?.lut ?? null,
      filter: this.worldFilter,
      rect: [contentX, contentY, contentWidth, contentHeight],
      timestampWrites: stamps ? { querySet: this.querySet, endOfPassWriteIndex: 1 } : undefined
    });

    const slot = this.#stageStats(encoder, layout);
    device.queue.submit([encoder.finish()]);
    if (slot) this.#readStats(slot);
    // What the cull decided last frame is the best answer this frame has.
    this.stats.primitives = this.stats.drawn;
    // This frame's unjittered camera is next frame's previous.
    if (frame.camera.viewProjection) this.previousViewProjection.set(frame.camera.viewProjection);
    this.frameCounter++;
  }

  /**
   * Lay the frame's groups out in the instance buffer — each group one
   * contiguous range, its per-frame records first and its resident batches
   * after — and prepare what the cull and the draws need: group starts,
   * indirect argument templates and the remap list's size. Per-frame
   * records are written here; batches are copied in `render`.
   * @returns {{groups: object[], total: number, copies: object[], passCount: number}}
   */
  #assemble(frame, passCount) {
    const entries = [...frame.entries()];
    let total = 0;
    for (const entry of entries) {
      total += entry.instances.length;
      for (const batch of entry.batches) total += batch.count;
    }
    this.#ensureInstanceBuffer(total);
    this.#ensureRemapBuffer(Math.max(1, total * passCount));
    this.#ensureGroupBuffers(entries.length, Math.max(1, entries.length * passCount));

    const data = this.instanceData;
    const groups = [];
    const copies = [];
    const starts = new Uint32Array(entries.length + 1);
    let first = 0;
    entries.forEach((entry, g) => {
      const start = first;
      starts[g] = start;
      for (const record of entry.instances) {
        data.set(record, first * INSTANCE_FLOATS);
        first++;
      }
      if (first > start) {
        this.device.queue.writeBuffer(this.instanceBuffer, start * INSTANCE_BYTES, data, start * INSTANCE_FLOATS, (first - start) * INSTANCE_FLOATS);
      }
      for (const batch of entry.batches) {
        copies.push({ buffer: this.#batchBuffer(batch), offset: first, count: batch.count });
        first += batch.count;
      }
      groups.push({
        gpu: this.#geometry(entry.geometry),
        material: this.#material(entry.material),
        start,
        count: first - start
      });
    });
    starts[entries.length] = total;
    this.device.queue.writeBuffer(this.groupStartsBuffer, 0, starts);

    // Indirect arguments: index count and where in the remap list the
    // pass's slots for this group begin; the cull fills the instance counts.
    const args = this.argsTemplate;
    const count = passCount * groups.length;
    for (let p = 0; p < passCount; p++) {
      for (let g = 0; g < groups.length; g++) {
        const o = (p * groups.length + g) * 5;
        args[o] = groups[g].gpu.count;
        args[o + 1] = 0;
        args[o + 2] = 0;
        args[o + 3] = 0;
        args[o + 4] = p * total + groups[g].start;
      }
    }
    if (count) this.device.queue.writeBuffer(this.argsBuffer, 0, args, 0, count * 5);
    return { groups, total, copies, passCount };
  }

  /** The cull's planes: the camera's frustum for pass 0, each shadow map's after it. */
  #writeCullParams(frame, shadows, layout) {
    const data = this.cullData;
    const counts = new Uint32Array(data.buffer, 0, 4);
    counts[0] = layout.passCount; counts[1] = layout.total; counts[2] = layout.groups.length; counts[3] = 0;
    mat4.frustumPlanes(frame.camera.viewProjection ?? IDENTITY, data.subarray(4, 28));
    shadows.passes.forEach((pass, i) => {
      mat4.frustumPlanes(pass.matrix, data.subarray(4 + (i + 1) * 24, 4 + (i + 2) * 24));
    });
    this.device.queue.writeBuffer(this.cullParams, 0, data);
  }

  /** A resident batch's GPU copy, uploaded on first sight and again when it has grown. */
  #batchBuffer(batch) {
    let gpu = this.batchCache.get(batch);
    if (gpu && gpu.version === batch.version) return gpu.buffer;
    const records = batch.records;
    if (!gpu || gpu.capacity < records.length) {
      gpu?.buffer.destroy();
      const buffer = this.device.createBuffer({
        label: 'static batch', size: Math.max(records.byteLength, 4), usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
      });
      gpu = { buffer, version: -1, capacity: records.length };
      this.batchCache.set(batch, gpu);
    }
    this.device.queue.writeBuffer(gpu.buffer, 0, records);
    gpu.version = batch.version;
    return gpu.buffer;
  }

  /**
   * Queue the frame's indirect arguments (and timestamps) into a free
   * staging buffer, to be read once the GPU is done with them.
   */
  #stageStats(encoder, layout) {
    const argsBytes = layout.passCount * layout.groups.length * ARGS_BYTES;
    const size = Math.max(4, argsBytes) + 16;
    let slot = this.staging.find((s) => !s.pending && s.size >= size);
    if (!slot) {
      if (this.staging.filter((s) => !s.pending).length >= 3) return null;
      slot = { buffer: null, size: 0, pending: false };
      this.staging.push(slot);
    }
    if (slot.size < size) {
      slot.buffer?.destroy();
      slot.buffer = this.device.createBuffer({ label: 'stats staging', size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      slot.size = size;
    }
    if (argsBytes) encoder.copyBufferToBuffer(this.argsBuffer, 0, slot.buffer, 0, argsBytes);
    if (this.hasTimestamps) {
      encoder.resolveQuerySet(this.querySet, 0, 2, this.timeBuffer, 0);
      encoder.copyBufferToBuffer(this.timeBuffer, 0, slot.buffer, Math.max(4, argsBytes), 16);
    }
    slot.pending = true;
    slot.layout = { passCount: layout.passCount, indexCounts: layout.groups.map((g) => g.gpu.count), argsBytes };
    return slot;
  }

  /** Read a staged frame's statistics when the GPU has finished with them. */
  #readStats(slot) {
    const { passCount, indexCounts, argsBytes } = slot.layout;
    const buffer = slot.buffer;
    const promise = buffer.mapAsync(GPUMapMode.READ).then(() => {
      // The renderer may have been destroyed while the map was pending.
      if (!this.device || buffer !== slot.buffer) return;
      const view = new DataView(buffer.getMappedRange());
      let drawn = 0, casters = 0, triangles = 0;
      const groups = indexCounts.length;
      for (let p = 0; p < passCount; p++) {
        for (let g = 0; g < groups; g++) {
          const count = view.getUint32((p * groups + g) * ARGS_BYTES + 4, true);
          if (p === 0) { drawn += count; triangles += count * indexCounts[g] / 3; }
          else casters += count;
        }
      }
      if (this.hasTimestamps) {
        const o = Math.max(4, argsBytes);
        const t0 = view.getBigUint64(o, true);
        const t1 = view.getBigUint64(o + 8, true);
        if (t1 > t0) this.stats.gpuMs = Number(t1 - t0) / 1e6;
      }
      buffer.unmap();
      this.stats.drawn = drawn;
      this.stats.casters = casters;
      this.stats.triangles = Math.round(triangles);
    }).catch(() => {}).finally(() => { slot.pending = false; });
    this.statsPending = promise;
  }

  /** Resolves when the statistics of the frame most recently drawn have been read. For tests. */
  async flushStats() {
    await this.device?.queue.onSubmittedWorkDone();
    await this.statsPending;
  }

  /**
   * The sub-pixel jitter for temporal anti-aliasing: a Halton (2, 3) point
   * per frame, in NDC, folded into the frame's view-projection. Off when
   * TAA is off, so the image is steady.
   */
  #jitter(frame) {
    const { worldWidth, worldHeight } = this.viewport;
    if (!this.effects.taa) {
      this.jitterNDC = [0, 0];
      return;
    }
    const i = (this.frameCounter % 8) + 1;
    const jx = (halton(i, 2) - 0.5) * 2 / worldWidth;
    const jy = (halton(i, 3) - 0.5) * 2 / worldHeight;
    this.jitterNDC = [jx, jy];
  }

  /** Every skinned instance's joint matrices, back to back, as the instances' offsets expect. */
  #uploadJoints(frame) {
    const count = frame.jointCount ?? 0;
    if (!count) return;
    this.#ensureJointBuffer(count);
    let offset = 0;
    for (const skin of frame.skins) {
      this.jointData.set(skin, offset);
      offset += skin.length;
    }
    this.device.queue.writeBuffer(this.jointBuffer, 0, this.jointData, 0, count * 16);
  }

  /** A joint buffer for at least `count` matrices; the scene bind group is rebuilt when it grows. */
  #ensureJointBuffer(count) {
    if (this.jointBuffer && this.jointCapacity >= count) return;
    const capacity = Math.max(count, 64, this.jointCapacity * 2);
    this.jointBuffer?.destroy();
    this.jointBuffer = this.device.createBuffer({
      label: 'joints', size: capacity * 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.jointCapacity = capacity;
    this.jointData = new Float32Array(capacity * 16);
    if (this.instanceBuffer) this.#sceneBindGroup();
  }

  #sceneBindGroup() {
    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.sceneBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameUniform } },
        { binding: 1, resource: { buffer: this.instanceBuffer } },
        { binding: 2, resource: { buffer: this.lightBuffer } },
        { binding: 3, resource: { buffer: this.jointBuffer } },
        { binding: 4, resource: { buffer: this.remapBuffer } }
      ]
    });
    this.cullSceneBindGroup = this.device.createBindGroup({
      layout: this.cullSceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameUniform } },
        { binding: 1, resource: { buffer: this.instanceBuffer } }
      ]
    });
  }

  #cullBindGroup() {
    this.cullBindGroup = this.device.createBindGroup({
      layout: this.cullBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cullParams } },
        { binding: 1, resource: { buffer: this.groupStartsBuffer } },
        { binding: 2, resource: { buffer: this.argsBuffer } },
        { binding: 3, resource: { buffer: this.remapBuffer } }
      ]
    });
  }

  /** Room in the remap list for `count` slots (instances times passes). */
  #ensureRemapBuffer(count) {
    if (this.remapBuffer && this.remapCapacity >= count) return;
    const capacity = Math.max(count, 256, this.remapCapacity * 2);
    this.remapBuffer?.destroy();
    this.remapBuffer = this.device.createBuffer({
      label: 'remap', size: capacity * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.remapCapacity = capacity;
    if (this.instanceBuffer) this.#sceneBindGroup();
    if (this.argsBuffer) this.#cullBindGroup();
  }

  /** Room for `groups` group starts and `args` indirect records. */
  #ensureGroupBuffers(groups, args) {
    let changed = false;
    if (!this.groupStartsBuffer || this.groupStartsCapacity < groups + 1) {
      const capacity = Math.max(groups + 1, 16, this.groupStartsCapacity * 2);
      this.groupStartsBuffer?.destroy();
      this.groupStartsBuffer = this.device.createBuffer({
        label: 'group starts', size: capacity * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.groupStartsCapacity = capacity;
      changed = true;
    }
    if (!this.argsBuffer || this.argsCapacity < args) {
      const capacity = Math.max(args, 16, this.argsCapacity * 2);
      this.argsBuffer?.destroy();
      this.argsBuffer = this.device.createBuffer({
        label: 'indirect args', size: capacity * ARGS_BYTES,
        usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
      });
      this.argsCapacity = capacity;
      this.argsTemplate = new Uint32Array(capacity * 5);
      changed = true;
    }
    if (changed) this.#cullBindGroup();
  }

  /** The frame's lights into the light buffer; the count rides in the frame uniform. */
  #uploadLights(frame) {
    const lights = frame.lights ?? [];
    const count = Math.min(lights.length, MAX_LIGHTS);
    if (!count) return;
    for (let i = 0; i < count; i++) this.lightData.set(lights[i], i * LIGHT_FLOATS);
    this.device.queue.writeBuffer(this.lightBuffer, 0, this.lightData, 0, count * LIGHT_FLOATS);
  }

  /**
   * One indirect instanced, indexed draw per group for the given pass: the
   * arguments the cull wrote hold how many of the group's instances that
   * pass sees. A group the pass sees nothing of still costs the call, and
   * nothing else. The shadow pass binds no material and reads no texture
   * coordinates.
   */
  #drawGroups(pass, layout, which, passIndex) {
    const { groups } = layout;
    let boundMaterial = null;
    let skinned = null;
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      const gpu = group.gpu;
      // Skinned geometry takes the skinning pipeline; switch only on change.
      if (gpu.skinned !== skinned) {
        skinned = gpu.skinned;
        pass.setPipeline(which === 'main'
          ? (skinned ? this.meshSkinnedPipeline : this.meshPipeline)
          : (skinned ? this.shadowSkinnedPipeline : this.shadowPipeline));
        this.stats.stateChanges++;
      }
      pass.setVertexBuffer(0, gpu.positions);
      pass.setVertexBuffer(1, gpu.normals);
      if (gpu.skinned) {
        pass.setVertexBuffer(which === 'main' ? 3 : 2, gpu.joints);
        pass.setVertexBuffer(which === 'main' ? 4 : 3, gpu.weights);
      }
      if (which === 'main') {
        pass.setVertexBuffer(2, gpu.uvs);
        if (group.material !== boundMaterial) {
          pass.setBindGroup(2, group.material);
          boundMaterial = group.material;
          this.stats.stateChanges++;
        }
      }
      pass.setIndexBuffer(gpu.index, gpu.format);
      pass.drawIndexedIndirect(this.argsBuffer, (passIndex * groups.length + g) * ARGS_BYTES);
      this.stats.drawCalls++;
    }
  }

  /** The bind group for a glTF material, or the default for none, made on first sight. */
  #material(material) {
    if (!material) return this.defaultMaterial;
    let group = this.materialCache.get(material);
    if (!group) this.materialCache.set(material, group = this.#materialBindGroup(material));
    return group;
  }

  #materialBindGroup(material) {
    const device = this.device;
    const textures = this.textures;
    const data = new Float32Array(MATERIAL_UNIFORM_FLOATS);
    const base = material?.baseColor ?? [1, 1, 1, 1];
    data.set(base, 0);
    data[4] = material?.metallic ?? 1;
    data[5] = material?.roughness ?? 1;
    const emissive = material?.emissive ?? [0, 0, 0];
    data[8] = emissive[0]; data[9] = emissive[1]; data[10] = emissive[2]; data[11] = 0;
    const uniform = device.createBuffer({
      label: `material ${material?.name ?? 'default'}`,
      size: data.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(uniform, 0, data);
    const texture = (image, fallback, srgb) => (image ? textures.get(image, { srgb }) : fallback).createView();
    return device.createBindGroup({
      label: `material ${material?.name ?? 'default'}`,
      layout: this.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: textures.sampler },
        { binding: 2, resource: texture(material?.baseColorTexture, textures.whiteSRGB, true) },
        { binding: 3, resource: texture(material?.metallicRoughnessTexture, textures.white, false) },
        { binding: 4, resource: texture(material?.emissiveTexture, textures.black, true) }
      ]
    });
  }

  /** An instance buffer for at least `count` instances, grown geometrically so frames settle on one. */
  #ensureInstanceBuffer(count) {
    if (this.instanceBuffer && this.instanceCapacity >= count) return;
    const capacity = Math.max(count, 256, this.instanceCapacity * 2);
    this.instanceBuffer?.destroy();
    this.instanceBuffer = this.device.createBuffer({
      label: 'instances',
      size: capacity * INSTANCE_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.instanceCapacity = capacity;
    this.instanceData = new Float32Array(capacity * INSTANCE_FLOATS);
    this.#sceneBindGroup();
  }

  /** The GPU copy of a geometry, uploaded on first sight. */
  #geometry(geometry) {
    let gpu = this.geometryCache.get(geometry);
    if (gpu) return gpu;
    const upload = (array, usage, label) => {
      const buffer = this.device.createBuffer({
        label, size: Math.ceil(array.byteLength / 4) * 4, usage, mappedAtCreation: true
      });
      new array.constructor(buffer.getMappedRange(), 0, array.length).set(array);
      buffer.unmap();
      return buffer;
    };
    gpu = {
      positions: upload(geometry.positions, GPUBufferUsage.VERTEX, 'positions'),
      normals: upload(geometry.normals, GPUBufferUsage.VERTEX, 'normals'),
      uvs: upload(geometry.uvs ?? new Float32Array((geometry.positions.length / 3) * 2), GPUBufferUsage.VERTEX, 'uvs'),
      skinned: !!geometry.skinned,
      joints: geometry.skinned ? upload(geometry.joints, GPUBufferUsage.VERTEX, 'joints') : null,
      weights: geometry.skinned ? upload(geometry.weights, GPUBufferUsage.VERTEX, 'weights') : null,
      index: upload(geometry.indices, GPUBufferUsage.INDEX, 'indices'),
      count: geometry.indices.length,
      format: geometry.indices instanceof Uint32Array ? 'uint32' : 'uint16'
    };
    this.geometryCache.set(geometry, gpu);
    return gpu;
  }

  #writeFrameUniform(frame, shadows) {
    const data = this.frameData;
    const camera = frame.camera;
    const vp = camera.viewProjection ?? IDENTITY;
    const [jx, jy] = this.jitterNDC ?? [0, 0];
    // Translate in clip space: x' = x + jx * w, which is row 0, column 3.
    const jittered = this.jitteredViewProjection;
    jittered.set(vp);
    jittered[12] += jx * vp[15]; jittered[13] += jy * vp[15];
    jittered[0] += jx * vp[3]; jittered[1] += jy * vp[3];
    jittered[4] += jx * vp[7]; jittered[5] += jy * vp[7];
    jittered[8] += jx * vp[11]; jittered[9] += jy * vp[11];
    data.set(jittered, 0);
    data.set(camera.view ?? IDENTITY, 16);
    if (camera.inverseViewProjection) data.set(camera.inverseViewProjection, 32);
    else mat4.invert(camera.viewProjection ?? IDENTITY, data.subarray(32, 48));
    for (let i = 0; i < shadows.cascades.length; i++) data.set(shadows.cascades[i].matrix, 48 + i * 16);
    for (let i = 0; i < shadows.spots.length; i++) data.set(shadows.spots[i].matrix, 112 + i * 16);
    const o = 176;
    const eye = camera.position ?? ZERO;
    data[o] = eye.x; data[o + 1] = eye.y; data[o + 2] = eye.z; data[o + 3] = 0;
    const sun = frame.sun;
    const dir = normalized(sun.direction);
    data[o + 4] = dir[0]; data[o + 5] = dir[1]; data[o + 6] = dir[2]; data[o + 7] = sun.intensity ?? 1;
    const sc = sun.color ?? WHITE;
    data[o + 8] = sc[0]; data[o + 9] = sc[1]; data[o + 10] = sc[2]; data[o + 11] = 0;
    const ambient = frame.ambient;
    data[o + 12] = ambient.sky[0]; data[o + 13] = ambient.sky[1]; data[o + 14] = ambient.sky[2]; data[o + 15] = ambient.intensity ?? 1;
    data[o + 16] = ambient.ground[0]; data[o + 17] = ambient.ground[1]; data[o + 18] = ambient.ground[2]; data[o + 19] = 0;
    const fog = frame.fog;
    data[o + 20] = fog.color[0]; data[o + 21] = fog.color[1]; data[o + 22] = fog.color[2]; data[o + 23] = fog.density ?? 0;
    data[o + 24] = frame.exposure ?? 1;
    data[o + 25] = 0; data[o + 26] = 0; data[o + 27] = 0;
    data[o + 28] = Math.min(frame.lights?.length ?? 0, MAX_LIGHTS);
    data[o + 29] = frame.bloom?.threshold ?? 1;
    data[o + 30] = frame.bloom?.intensity ?? 0;
    data[o + 31] = this.environment.prefilteredMips - 1;
    const q = SHADOW_QUALITY[this.shadowQuality];
    for (let i = 0; i < 4; i++) {
      data[o + 32 + i] = shadows.cascades[i]?.split ?? 0;
      data[o + 40 + i] = shadows.cascades[i]?.radius ?? 1;
    }
    data[o + 36] = shadows.cascades.length;
    data[o + 37] = 1 / q.sunSize;
    data[o + 38] = 1 / q.spotSize;
    data[o + 39] = frame.shadow.normalOffset ?? 1.5;
    data[o + 44] = frame.shadow.bias ?? 0.03;
    data[o + 45] = data[o + 46] = data[o + 47] = 0;

    const post = frame.post ?? {};
    const p = FRAME_OFFSETS.post;
    const now = (typeof performance !== 'undefined' ? performance.now() : 0) - this.startTime;
    const dt = this.lastFrameTime ? Math.min(0.1, (now - this.lastFrameTime) / 1000) : 1 / 60;
    this.lastFrameTime = now;
    data[p] = this.post.historyValid ? (post.taa?.blend ?? 0.1) : 1;
    data[p + 1] = post.ao?.radius ?? 0.8;
    data[p + 2] = post.ao?.intensity ?? 1;
    data[p + 3] = this.effects.ao && (post.ao?.intensity ?? 0) > 0 ? 1 : 0;
    data[p + 4] = post.dof?.focus ?? 0;
    data[p + 5] = post.dof?.focalLength ?? 50;
    data[p + 6] = post.dof?.maxBlur ?? 16;
    data[p + 7] = post.dof?.focus != null ? 1 : 0;
    data[p + 24] = post.dof?.fStop ?? 2.8;
    data[p + 8] = post.motionBlur?.strength ?? 0;
    data[p + 9] = this.effects.film ? (post.vignette ?? 0) : 0;
    data[p + 10] = this.effects.film ? (post.grain ?? 0) : 0;
    data[p + 11] = now / 1000;
    data[p + 12] = this.effects.autoExposure && post.autoExposure?.enabled ? 1 : 0;
    data[p + 13] = post.autoExposure?.key ?? 0.18;
    data[p + 14] = post.autoExposure?.min ?? 0.25;
    data[p + 15] = post.autoExposure?.max ?? 4;
    data[p + 16] = post.grade?.saturation ?? 1;
    data[p + 17] = post.grade?.contrast ?? 1;
    data[p + 18] = post.grade?.temperature ?? 0;
    data[p + 19] = post.grade?.lut ? 1 : 0;
    data[p + 20] = post.autoExposure?.speed ?? 1.5;
    data[p + 21] = dt;
    data[p + 22] = this.effects.taa ? 1 : 0;
    data[p + 23] = this.effects.motionBlur ? 1 : 0;
    const l = FRAME_OFFSETS.lens;
    const tanY = Math.tan((camera.fov ?? Math.PI / 3) / 2);
    data[l] = tanY * (camera.aspect ?? 16 / 9); data[l + 1] = tanY; data[l + 2] = camera.near ?? 0.1; data[l + 3] = camera.far ?? 500;
    const j = FRAME_OFFSETS.jitter;
    data[j] = jx; data[j + 1] = jy; data[j + 2] = this.viewport.worldWidth; data[j + 3] = this.viewport.worldHeight;
    data.set(this.previousValid ? this.previousViewProjection : vp, FRAME_OFFSETS.previousViewProjection);
    this.previousValid = true;
    this.device.queue.writeBuffer(this.frameUniform, 0, data);
  }

  /**
   * Fit the frame's shadow maps: the sun's cascades over slices of the view
   * frustum out to `shadow.distance`, and a perspective map for each of the
   * nearest shadowed spot lights. Returns the matrices and the passes to
   * draw; the cull pass decides each pass's casters against its planes.
   */
  #planShadows(frame) {
    const none = { cascades: [], spots: [], passes: [] };
    const q = SHADOW_QUALITY[this.shadowQuality];
    const camera = frame.camera;
    if (frame.shadow.enabled === false || !camera.view || (!q.cascades && !q.spots)) return none;

    const cascades = [];
    const passes = [];
    if (q.cascades) {
      const near = camera.near;
      const far = Math.min(camera.far, frame.shadow.distance);
      const dir = normalized(frame.sun.direction);
      const inverseView = mat4.invert(camera.view, this.cascadeScratch.lightBasis);
      const tanY = Math.tan(camera.fov / 2);
      const tanX = tanY * camera.aspect;
      const up = Math.abs(dir[1]) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      // A light-space basis at the origin, so cascade centres can be snapped
      // to the map's texel grid in it; what the map sees then only ever
      // moves by whole texels, and shadow edges do not swim.
      const basis = mat4.lookAt(ZERO, { x: dir[0], y: dir[1], z: dir[2] }, up);
      let start = near;
      for (let i = 0; i < q.cascades; i++) {
        const t = (i + 1) / q.cascades;
        const linear = near + (far - near) * t;
        const log = near * Math.pow(far / near, t);
        const end = CASCADE_LAMBDA * log + (1 - CASCADE_LAMBDA) * linear;
        // The slice's bounding sphere, in view space then world.
        const corners = [];
        for (const d of [start, end]) {
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) corners.push({ x: sx * tanX * d, y: sy * tanY * d, z: -d });
        }
        const centre = { x: 0, y: 0, z: -(start + end) / 2 };
        let radius = 0;
        for (const c of corners) radius = Math.max(radius, Math.hypot(c.x - centre.x, c.y - centre.y, c.z - centre.z));
        const world = mat4.transformPoint(inverseView, centre);
        // Snap in light space.
        const texel = (radius * 2) / q.sunSize;
        const ls = mat4.transformPoint(basis, world);
        ls.x = Math.round(ls.x / texel) * texel;
        ls.y = Math.round(ls.y / texel) * texel;
        const snapped = mat4.transformPoint(mat4.invert(basis), ls);
        const eye = { x: snapped.x - dir[0] * radius * 2, y: snapped.y - dir[1] * radius * 2, z: snapped.z - dir[2] * radius * 2 };
        const view = mat4.lookAt(eye, snapped, up);
        const projection = mat4.orthographic(-radius, radius, -radius, radius, 0.01, radius * 4);
        const matrix = mat4.multiply(projection, view);
        cascades.push({ matrix, split: end, radius });
        passes.push({ view: this.sunShadowLayers[i], matrix });
        start = end;
      }
    }

    const spots = [];
    if (q.spots) {
      const eye = camera.position;
      const candidates = [];
      frame.lightInfo.forEach((light, index) => {
        if (light.type !== 'spot' || light.shadow === false) return;
        const p = light.position;
        const d = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z);
        if (d > (light.range ?? 10) + frame.shadow.distance) return;
        candidates.push({ light, index, d });
      });
      candidates.sort((a, b) => a.d - b.d);
      for (const { light, index } of candidates.slice(0, q.spots)) {
        const p = light.position;
        const dir = normalized([light.direction?.x ?? 0, light.direction?.y ?? -1, light.direction?.z ?? 0]);
        const up = Math.abs(dir[1]) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
        const range = light.range ?? 10;
        const view = mat4.lookAt(p, { x: p.x + dir[0], y: p.y + dir[1], z: p.z + dir[2] }, up);
        const fov = Math.min(Math.PI * 0.95, 2 * (light.outerCone ?? 0.6) + 0.1);
        const projection = mat4.perspective(fov, 1, 0.05, range);
        const matrix = mat4.multiply(projection, view);
        const layer = spots.length;
        spots.push({ matrix, index });
        frame.lights[index][14] = layer + 1;
        passes.push({ view: this.spotShadowLayers[layer], matrix });
      }
    }
    return { cascades, spots, passes };
  }

  /**
   * The pixels of the frame just drawn, top-left origin, as RGBA whatever the
   * canvas format (BGRA is swizzled). For tests and tooling: it stalls on
   * the GPU and must be called in the same task as `render`, before the
   * canvas texture is presented.
   * @returns {Promise<{width: number, height: number, data: Uint8ClampedArray}>}
   */
  async readPixels() {
    const texture = this.currentTexture;
    if (!texture) throw new Error('WebGPURenderer.readPixels: nothing has been rendered this task');
    const { width, height } = texture;
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
    const buffer = this.device.createBuffer({
      label: 'readback', size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    const encoder = this.device.createCommandEncoder({ label: 'readback' });
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, { width, height });
    this.device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const rows = new Uint8Array(buffer.getMappedRange());
    const data = new Uint8ClampedArray(width * height * 4);
    const bgra = this.format.startsWith('bgra');
    for (let y = 0; y < height; y++) {
      const row = rows.subarray(y * bytesPerRow, y * bytesPerRow + width * 4);
      const out = y * width * 4;
      if (!bgra) { data.set(row, out); continue; }
      for (let x = 0; x < width * 4; x += 4) {
        data[out + x] = row[x + 2]; data[out + x + 1] = row[x + 1];
        data[out + x + 2] = row[x]; data[out + x + 3] = row[x + 3];
      }
    }
    buffer.unmap();
    buffer.destroy();
    return { width, height, data };
  }

  // The 2D world pass is not how this renderer is driven; the engine calls
  // `render` instead. These exist so an engine path written for 2D does
  // not explode on the way to the one that is not.
  beginFrame() { super.beginFrame(); }
  endFrame() {}
  applyCamera() {}

  setCursor(style) {
    if (this.canvas) this.canvas.style.cursor = style;
  }
}

/** The main pass's colour targets, in attachment order; `PostPass.attachments` resolves them. */
const MAIN_TARGETS = Object.freeze([
  { label: 'direct', format: HDR_FORMAT },
  { label: 'indirect', format: HDR_FORMAT },
  { label: 'normal depth', format: HDR_FORMAT },
  { label: 'velocity', format: 'rg16float' }
]);

/** The i-th point of the Halton sequence in `base`, in [0, 1). */
function halton(i, base) {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const INSTANCE_BYTES = INSTANCE_FLOATS * 4;
/** One `drawIndexedIndirect` record: five 32-bit values. */
const ARGS_BYTES = 20;
const ZERO = { x: 0, y: 0, z: 0 };
const WHITE = [1, 1, 1];

function normalized([x, y, z]) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}
