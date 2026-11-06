import {
  BLOOM_PREFILTER_SHADER, BLOOM_DOWNSAMPLE_SHADER, BLOOM_UPSAMPLE_SHADER, COMPOSITE_SHADER
} from './shaders.js';

/**
 * The frame after the meshes: bloom and the composite to the canvas.
 *
 * The main pass renders in high range to an `rgba16float` target. Bloom
 * takes what is brighter than a threshold at half resolution, blurs it by
 * walking down a mip chain with a wide downsample and back up with a tent
 * filter added onto each level, and the composite adds the result to the
 * frame, exposes, tonemaps and encodes it for the canvas. With bloom off
 * only the composite runs.
 */

const HDR_FORMAT = 'rgba16float';
const BLOOM_LEVELS = 6;

export class PostPass {
  /**
   * @param {GPUDevice} device
   * @param {GPUBindGroupLayout} sceneLayout - Group 0: the frame uniform and storage arrays
   * @param {GPUTextureFormat} canvasFormat
   */
  constructor(device, sceneLayout, canvasFormat) {
    this.device = device;
    this.sampler = device.createSampler({
      label: 'post', minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge'
    });
    this.sourceLayout = device.createBindGroupLayout({
      label: 'post source',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });
    this.compositeLayout = device.createBindGroupLayout({
      label: 'composite source',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }
      ]
    });
    const pipeline = (code, label, groupLayout, format, blend) => {
      const module = device.createShaderModule({ code, label });
      return device.createRenderPipeline({
        label,
        layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, groupLayout] }),
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format, ...(blend && { blend }) }] },
        primitive: { topology: 'triangle-list' }
      });
    };
    const additive = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
    };
    this.prefilter = pipeline(BLOOM_PREFILTER_SHADER, 'bloom prefilter', this.sourceLayout, HDR_FORMAT);
    this.downsample = pipeline(BLOOM_DOWNSAMPLE_SHADER, 'bloom downsample', this.sourceLayout, HDR_FORMAT);
    this.upsample = pipeline(BLOOM_UPSAMPLE_SHADER, 'bloom upsample', this.sourceLayout, HDR_FORMAT, additive);
    this.composite = pipeline(COMPOSITE_SHADER, 'composite', this.compositeLayout, canvasFormat);

    this.hdr = null;
    this.hdrView = null;
    this.levels = [];
    this.black = device.createTexture({
      label: 'no bloom', size: { width: 1, height: 1 }, format: HDR_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.blackView = this.black.createView();
    this.compositeGroup = null;
    this.compositeGroupNoBloom = null;
  }

  /** (Re)create the resolved HDR target and the bloom chain for a size. */
  resize(width, height) {
    this.hdr?.destroy();
    for (const level of this.levels) level.texture.destroy();
    this.hdr = this.device.createTexture({
      label: 'hdr', size: { width, height }, format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this.hdrView = this.hdr.createView();
    this.levels = [];
    let w = Math.max(1, width >> 1);
    let h = Math.max(1, height >> 1);
    for (let i = 0; i < BLOOM_LEVELS && w >= 2 && h >= 2; i++) {
      const texture = this.device.createTexture({
        label: `bloom ${i}`, size: { width: w, height: h }, format: HDR_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });
      const view = texture.createView();
      this.levels.push({ texture, view, group: this.#source(view) });
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
    this.hdrGroup = this.#source(this.hdrView);
    const bloomView = this.levels[0]?.view ?? this.blackView;
    this.compositeGroup = this.#compositeSource(this.hdrView, bloomView);
    this.compositeGroupNoBloom = this.#compositeSource(this.hdrView, this.blackView);
  }

  #source(view) {
    return this.device.createBindGroup({
      layout: this.sourceLayout,
      entries: [{ binding: 0, resource: view }, { binding: 1, resource: this.sampler }]
    });
  }

  #compositeSource(hdrView, bloomView) {
    return this.device.createBindGroup({
      layout: this.compositeLayout,
      entries: [
        { binding: 0, resource: hdrView },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: bloomView }
      ]
    });
  }

  #fullscreen(encoder, pipeline, view, sceneBindGroup, group, loadOp = 'clear') {
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp, storeOp: 'store' }] });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, sceneBindGroup);
    pass.setBindGroup(1, group);
    pass.draw(3);
    pass.end();
  }

  /**
   * Bloom, then composite onto `target`.
   * @returns {number} Draw calls issued
   */
  run(encoder, sceneBindGroup, target, { bloom }) {
    let draws = 0;
    const levels = this.levels;
    if (bloom && levels.length) {
      this.#fullscreen(encoder, this.prefilter, levels[0].view, sceneBindGroup, this.hdrGroup);
      draws++;
      for (let i = 1; i < levels.length; i++) {
        this.#fullscreen(encoder, this.downsample, levels[i].view, sceneBindGroup, levels[i - 1].group);
        draws++;
      }
      for (let i = levels.length - 1; i > 0; i--) {
        this.#fullscreen(encoder, this.upsample, levels[i - 1].view, sceneBindGroup, levels[i].group, 'load');
        draws++;
      }
    }
    this.#fullscreen(encoder, this.composite, target, sceneBindGroup, bloom ? this.compositeGroup : this.compositeGroupNoBloom);
    return draws + 1;
  }

  destroy() {
    this.hdr?.destroy();
    for (const level of this.levels) level.texture.destroy();
    this.black.destroy();
    this.levels = [];
  }
}
