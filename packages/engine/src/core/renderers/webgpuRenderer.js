import { BaseRenderer } from './baseRenderer.js';
import { WebGLRenderer } from './webglRenderer.js';
import { identityViewport } from '../viewport.js';
import { webgpuDevice } from './webgpu/device.js';
import { SKY_SHADER, SHADOW_SHADER, MESH_SHADER, FRAME_UNIFORM_FLOATS, MATERIAL_UNIFORM_FLOATS } from './webgpu/shaders.js';
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
 *   1. the sun's shadow map: every caster, depth only, from the sun;
 *   2. the sky: one full-screen triangle, gradient and sun disc;
 *   3. the meshes: one instanced, indexed draw per geometry and material,
 *      shaded with a metallic-roughness model under the sun, the point
 *      and spot lights and the environment, with the shadow map and fog;
 *   4. post: bloom, then the composite that exposes, tonemaps and encodes
 *      to the canvas (post.js).
 *
 * Passes 2 and 3 render in high range at 4x MSAA and resolve to an HDR
 * target. Geometry, images and materials are uploaded once each and
 * cached by identity; instance and light data are storage buffers
 * rewritten per frame, the frame's culled main-pass instances first and
 * its shadow casters after.
 *
 * **The HUD.** A canvas holds one context, so the UI pass cannot share this
 * renderer's canvas. The renderer makes a second canvas, laid exactly over
 * the first and transparent to pointer events, and runs the WebGL2 backend
 * on it unchanged; `uiBackend` is what `game.uiRenderer` wraps. Input and
 * fullscreen still target the original canvas.
 */

const SHADOW_MAP_SIZE = 2048;
const SAMPLES = 4;
const HDR_FORMAT = 'rgba16float';

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

    this.colorTexture = null;
    this.depthTexture = null;
    this.shadowTexture = null;
    this.shadowView = null;

    /** One instance buffer for the whole frame, grown when a frame outgrows it. */
    this.instanceBuffer = null;
    this.instanceCapacity = 0;
    this.instanceData = new Float32Array(0);
    /** @type {WeakMap<object, {positions: GPUBuffer, normals: GPUBuffer, uvs: GPUBuffer, index: GPUBuffer, count: number, format: GPUIndexFormat}>} */
    this.geometryCache = new WeakMap();

    this.lightView = mat4.create();
    this.lightProjection = mat4.create();
    /** The canvas texture of the frame being drawn; valid until the task ends. */
    this.currentTexture = null;
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
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
      ]
    });
    const lightingBindGroupLayout = device.createBindGroupLayout({
      label: 'lighting',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });
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

    this.shadowTexture = device.createTexture({
      label: 'shadow map',
      size: { width: SHADOW_MAP_SIZE, height: SHADOW_MAP_SIZE },
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this.shadowView = this.shadowTexture.createView();
    this.lightingBindGroup = device.createBindGroup({
      layout: lightingBindGroupLayout,
      entries: [
        { binding: 0, resource: this.shadowView },
        { binding: 1, resource: device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' }) },
        { binding: 2, resource: this.environment.irradianceView },
        { binding: 3, resource: this.environment.prefilteredView },
        { binding: 4, resource: this.environment.lutView },
        { binding: 5, resource: this.environment.sampler }
      ]
    });

    const vertexBuffers = [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
      { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }] }
    ];
    const sceneLayout = device.createPipelineLayout({ bindGroupLayouts: [this.sceneBindGroupLayout] });

    const sky = device.createShaderModule({ code: SKY_SHADER, label: 'sky' });
    this.skyPipeline = device.createRenderPipeline({
      label: 'sky',
      layout: sceneLayout,
      vertex: { module: sky, entryPoint: 'vs' },
      fragment: { module: sky, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: 'triangle-list' },
      multisample: { count: SAMPLES },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' }
    });

    const shadow = device.createShaderModule({ code: SHADOW_SHADER, label: 'shadow' });
    this.shadowPipeline = device.createRenderPipeline({
      label: 'shadow',
      layout: sceneLayout,
      vertex: { module: shadow, entryPoint: 'vs', buffers: vertexBuffers.slice(0, 2) },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less',
        depthBias: 2, depthBiasSlopeScale: 2
      }
    });

    const mesh = device.createShaderModule({ code: MESH_SHADER, label: 'mesh' });
    this.meshPipeline = device.createRenderPipeline({
      label: 'mesh',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.sceneBindGroupLayout, lightingBindGroupLayout, this.materialBindGroupLayout]
      }),
      vertex: { module: mesh, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: { module: mesh, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      multisample: { count: SAMPLES },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
    });

    this.#ensureInstanceBuffer(256);
  }

  setViewport(viewport) {
    this.viewport = viewport;
    if (!this.device) return;
    const { backingWidth, backingHeight } = viewport;
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    this.colorTexture?.destroy();
    this.depthTexture?.destroy();
    const size = { width: backingWidth, height: backingHeight };
    this.colorTexture = this.device.createTexture({
      label: 'color (msaa)', size, sampleCount: SAMPLES, format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.post.resize(backingWidth, backingHeight);
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
    for (const texture of [this.colorTexture, this.depthTexture, this.shadowTexture]) texture?.destroy();
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
    this.context?.unconfigure();
    this.uiBackend = null;
    this.overlayCanvas = null;
    this.colorTexture = this.depthTexture = this.shadowTexture = this.shadowView = this.lightingBindGroup = null;
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
    this.#writeFrameUniform(frame);
    this.#uploadLights(frame);
    const groups = this.#uploadInstances(frame);

    const encoder = device.createCommandEncoder({ label: 'frame' });
    if (this.environment.update(encoder, frame, this.sceneBindGroup)) this.stats.stateChanges++;

    if (frame.shadow.enabled !== false) {
      const pass = encoder.beginRenderPass({
        label: 'shadow',
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store'
        }
      });
      pass.setPipeline(this.shadowPipeline);
      pass.setBindGroup(0, this.sceneBindGroup);
      this.#drawGroups(pass, groups, 'shadow');
      pass.end();
    }

    const pass = encoder.beginRenderPass({
      label: 'main',
      colorAttachments: [{
        view: this.colorTexture.createView(),
        resolveTarget: this.post.hdrView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'discard'
      }],
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

    pass.setPipeline(this.meshPipeline);
    pass.setBindGroup(1, this.lightingBindGroup);
    this.stats.stateChanges += 3;
    this.#drawGroups(pass, groups, 'main');
    pass.end();

    this.currentTexture = this.context.getCurrentTexture();
    this.stats.drawCalls += this.post.run(encoder, this.sceneBindGroup, this.currentTexture.createView(), {
      bloom: (frame.bloom?.intensity ?? 0) > 0
    });

    device.queue.submit([encoder.finish()]);
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
   * One instanced, indexed draw per group, over the group's range in the
   * instance buffer for the given pass. The shadow pass binds no material
   * and reads no texture coordinates.
   */
  #drawGroups(pass, groups, which) {
    let boundMaterial = null;
    for (const group of groups) {
      const range = group[which];
      if (!range.count) continue;
      const gpu = group.gpu;
      pass.setVertexBuffer(0, gpu.positions);
      pass.setVertexBuffer(1, gpu.normals);
      if (which === 'main') {
        pass.setVertexBuffer(2, gpu.uvs);
        if (group.material !== boundMaterial) {
          pass.setBindGroup(2, group.material);
          boundMaterial = group.material;
          this.stats.stateChanges++;
        }
      }
      pass.setIndexBuffer(gpu.index, gpu.format);
      pass.drawIndexed(gpu.count, range.count, 0, 0, range.first);
      this.stats.drawCalls++;
      this.stats.primitives += range.count;
    }
  }

  /**
   * Pack the frame's instances into the instance buffer — every group's
   * main-pass instances, then every group's shadow casters — and return
   * the draw list with each group's two ranges. The write is queued ahead
   * of the submit, so the passes read this frame's data.
   */
  #uploadInstances(frame) {
    const total = frame.drawn + frame.casting;
    this.#ensureInstanceBuffer(total);
    const data = this.instanceData;
    const groups = [];
    let first = 0;
    const pack = (list) => {
      const start = first;
      for (let i = 0; i < list.length; i++) data.set(list[i], (first + i) * INSTANCE_FLOATS);
      first += list.length;
      return { first: start, count: list.length };
    };
    for (const entry of frame.entries()) {
      groups.push({
        gpu: this.#geometry(entry.geometry),
        material: this.#material(entry.material),
        main: pack(entry.main),
        shadow: null,
        entry
      });
    }
    for (const group of groups) group.shadow = pack(group.entry.shadow);
    if (total) this.device.queue.writeBuffer(this.instanceBuffer, 0, data, 0, total * INSTANCE_FLOATS);
    return groups;
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
    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.sceneBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameUniform } },
        { binding: 1, resource: { buffer: this.instanceBuffer } },
        { binding: 2, resource: { buffer: this.lightBuffer } }
      ]
    });
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
      index: upload(geometry.indices, GPUBufferUsage.INDEX, 'indices'),
      count: geometry.indices.length,
      format: geometry.indices instanceof Uint32Array ? 'uint32' : 'uint16'
    };
    this.geometryCache.set(geometry, gpu);
    return gpu;
  }

  #writeFrameUniform(frame) {
    const data = this.frameData;
    const camera = frame.camera;
    data.set(camera.viewProjection ?? IDENTITY, 0);
    this.#lightMatrix(frame, data.subarray(16, 32));
    if (camera.inverseViewProjection) data.set(camera.inverseViewProjection, 32);
    else mat4.invert(camera.viewProjection ?? IDENTITY, data.subarray(32, 48));
    const eye = camera.position ?? ZERO;
    data[48] = eye.x; data[49] = eye.y; data[50] = eye.z; data[51] = 0;
    const sun = frame.sun;
    const dir = normalized(sun.direction);
    data[52] = dir[0]; data[53] = dir[1]; data[54] = dir[2]; data[55] = sun.intensity ?? 1;
    const sc = sun.color ?? WHITE;
    data[56] = sc[0]; data[57] = sc[1]; data[58] = sc[2]; data[59] = 0;
    const ambient = frame.ambient;
    data[60] = ambient.sky[0]; data[61] = ambient.sky[1]; data[62] = ambient.sky[2]; data[63] = ambient.intensity ?? 1;
    data[64] = ambient.ground[0]; data[65] = ambient.ground[1]; data[66] = ambient.ground[2]; data[67] = 0;
    const fog = frame.fog;
    data[68] = fog.color[0]; data[69] = fog.color[1]; data[70] = fog.color[2]; data[71] = fog.density ?? 0;
    data[72] = frame.exposure ?? 1;
    data[73] = frame.shadow.enabled === false ? 0 : 1;
    data[74] = 1 / SHADOW_MAP_SIZE;
    data[75] = frame.shadow.radius;
    data[76] = Math.min(frame.lights?.length ?? 0, MAX_LIGHTS);
    data[77] = frame.bloom?.threshold ?? 1;
    data[78] = frame.bloom?.intensity ?? 0;
    data[79] = this.environment.prefilteredMips - 1;
    this.device.queue.writeBuffer(this.frameUniform, 0, data);
  }

  /**
   * The sun's view-projection: an orthographic box of the shadow radius
   * around the shadow centre, looking along the sun's direction. Depth
   * spans twice the radius each way so casters outside the sphere but
   * between it and the sun still shadow it.
   */
  #lightMatrix(frame, out) {
    const { center, radius } = frame.shadow;
    const dir = normalized(frame.sun.direction);
    const eye = { x: center.x - dir[0] * radius * 2, y: center.y - dir[1] * radius * 2, z: center.z - dir[2] * radius * 2 };
    const up = Math.abs(dir[1]) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    mat4.lookAt(eye, center, up, this.lightView);
    mat4.orthographic(-radius, radius, -radius, radius, 0.01, radius * 4, this.lightProjection);
    return mat4.multiply(this.lightProjection, this.lightView, out);
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

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const ZERO = { x: 0, y: 0, z: 0 };
const WHITE = [1, 1, 1];

function normalized([x, y, z]) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}
