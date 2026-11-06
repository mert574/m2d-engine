import { BaseRenderer } from './baseRenderer.js';
import { WebGLRenderer } from './webglRenderer.js';
import { identityViewport } from '../viewport.js';
import { parseColor } from './geometry/color.js';
import { webgpuDevice } from './webgpu/device.js';
import { MESH_SHADER, MESH_VERTEX_FLOATS, FRAME_UNIFORM_FLOATS } from './webgpu/shaders.js';

/**
 * The 3D renderer, on WebGPU.
 *
 * It is a different kind of renderer from the 2D backends. They are
 * immediate-mode: an entity calls `drawSprite` and the call is batched and
 * drawn. A 3D frame cannot be drawn that way — shadows, light culling,
 * transparency sorting and post effects all need the whole frame's contents
 * before the first pixel is shaded — so this renderer is *retained*: once a
 * frame the engine hands it a `Frame3D` describing everything to draw, and
 * `render(frame)` draws it.
 *
 * It extends `BaseRenderer` for the parts that are not about drawing — the
 * viewport, the statistics, the debug flag, the capability table — and so
 * that the 2D primitives fail loudly if anything calls them. `dimensions`
 * is how the engine tells the two kinds apart.
 *
 * **The HUD.** A canvas holds one context, so the UI pass cannot share this
 * renderer's canvas. The renderer makes a second canvas, laid exactly over
 * the first and transparent to pointer events, and runs the WebGL2 backend
 * on it unchanged; `uiBackend` is what `game.uiRenderer` wraps. Input and
 * fullscreen still target the original canvas.
 *
 * **What a frame is**, so far (R0; see docs/plans/3d-and-editor.md):
 *
 *   { clearColor:     a CSS colour, or [r, g, b, a],
 *     viewProjection: Float32Array(16), column-major; identity if omitted,
 *     light: { direction: [x, y, z], color: [r, g, b], ambient: [r, g, b] },
 *     meshes: [{ vertices: Float32Array }] }
 *
 * where each vertex is position xyz, normal xyz, colour rgb — nine floats.
 * Vertices are uploaded every frame into one growable buffer; caching,
 * instancing and materials are later phases' work and will reshape this.
 */
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Overhead sun, white, with a little fill, when a frame names no light. */
const DEFAULT_LIGHT = Object.freeze({
  direction: [0, -1, 0], color: [1, 1, 1], ambient: [0.1, 0.1, 0.1]
});

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
    this.pipeline = null;
    this.frameUniform = null;
    this.frameBindGroup = null;
    this.depthTexture = null;
    this.clearColor = [0, 0, 0, 1];
    this.frameData = new Float32Array(FRAME_UNIFORM_FLOATS);
    /** One vertex buffer for the whole frame, grown when a frame outgrows it. */
    this.vertexBuffer = null;
    this.vertexBufferSize = 0;
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
    this.#createPipeline();
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

  #createPipeline() {
    const device = this.device;
    const module = device.createShaderModule({ code: MESH_SHADER, label: 'mesh' });
    this.frameUniform = device.createBuffer({
      label: 'frame',
      size: FRAME_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'frame',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }]
    });
    this.frameBindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.frameUniform } }]
    });
    this.pipeline = device.createRenderPipeline({
      label: 'mesh',
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: MESH_VERTEX_FLOATS * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' }
          ]
        }]
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
    });
  }

  setViewport(viewport) {
    this.viewport = viewport;
    if (!this.device) return;
    const { backingWidth, backingHeight } = viewport;
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    this.depthTexture?.destroy();
    this.depthTexture = this.device.createTexture({
      label: 'depth',
      size: { width: backingWidth, height: backingHeight },
      format: 'depth24plus',
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
    this.depthTexture?.destroy();
    this.frameUniform?.destroy();
    this.vertexBuffer?.destroy();
    this.context?.unconfigure();
    this.uiBackend = null;
    this.overlayCanvas = null;
    this.depthTexture = null;
    this.frameUniform = null;
    this.vertexBuffer = null;
    this.vertexBufferSize = 0;
    this.pipeline = null;
    this.context = null;
    this.device = null;
    this.canvas = null;
  }

  // === The frame ===

  /**
   * The colour `render` clears to when the frame does not say. The engine
   * calls this at the top of every frame, so it is also where the HUD's
   * overlay is wiped to transparent for the UI pass that follows.
   */
  clear(color) {
    this.clearColor = color ? parseColor(color) : [0, 0, 0, 0];
    this.uiBackend?.clear();
  }

  /**
   * Draw one frame. See the class note for the frame's shape.
   * @param {object} frame
   */
  render(frame = {}) {
    super.beginFrame();
    const device = this.device;
    const clear = frame.clearColor === undefined
      ? this.clearColor
      : (typeof frame.clearColor === 'string' ? parseColor(frame.clearColor) : frame.clearColor);

    this.#writeFrameUniform(frame);

    const encoder = device.createCommandEncoder({ label: 'frame' });
    this.currentTexture = this.context.getCurrentTexture();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.currentTexture.createView(),
        clearValue: { r: clear[0], g: clear[1], b: clear[2], a: clear[3] ?? 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard'
      }
    });

    const meshes = frame.meshes ?? [];
    if (meshes.length) {
      let total = 0;
      for (const mesh of meshes) total += mesh.vertices.byteLength;
      this.#ensureVertexBuffer(total);
      pass.setPipeline(this.pipeline);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.setBindGroup(0, this.frameBindGroup);
      this.stats.stateChanges += 3;
      // Every mesh's vertices go into the one buffer, back to back; the
      // writes are queued ahead of the submit below, so the pass reads
      // this frame's data.
      let offset = 0;
      let first = 0;
      for (const mesh of meshes) {
        const vertices = mesh.vertices;
        const count = Math.floor(vertices.length / MESH_VERTEX_FLOATS);
        if (!count) continue;
        device.queue.writeBuffer(this.vertexBuffer, offset, vertices, 0, count * MESH_VERTEX_FLOATS);
        pass.draw(count, 1, first);
        offset += count * MESH_VERTEX_FLOATS * 4;
        first += count;
        this.stats.drawCalls++;
        this.stats.primitives++;
      }
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  /** A vertex buffer of at least `bytes`, grown geometrically so frames settle on one. */
  #ensureVertexBuffer(bytes) {
    if (this.vertexBuffer && this.vertexBufferSize >= bytes) return;
    this.vertexBuffer?.destroy();
    const size = Math.max(bytes, 64 * 1024, this.vertexBufferSize * 2);
    this.vertexBuffer = this.device.createBuffer({
      label: 'frame vertices',
      size,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    this.vertexBufferSize = size;
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

  #writeFrameUniform(frame) {
    const data = this.frameData;
    const vp = frame.viewProjection;
    if (vp) data.set(vp, 0);
    else data.set(IDENTITY, 0);
    const light = frame.light ?? DEFAULT_LIGHT;
    const direction = light.direction ?? DEFAULT_LIGHT.direction;
    const color = light.color ?? DEFAULT_LIGHT.color;
    const ambient = light.ambient ?? DEFAULT_LIGHT.ambient;
    data[16] = direction[0]; data[17] = direction[1]; data[18] = direction[2];
    data[20] = color[0]; data[21] = color[1]; data[22] = color[2];
    data[24] = ambient[0]; data[25] = ambient[1]; data[26] = ambient[2];
    this.device.queue.writeBuffer(this.frameUniform, 0, data);
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
