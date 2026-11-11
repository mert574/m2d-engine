import { SKY_BAKE_SHADER, PREFILTER_SHADER, IRRADIANCE_SHADER, BRDF_LUT_SHADER } from './shaders/index.js';

/**
 * The lighting environment: the sky as a cubemap, prefiltered for
 * reflections and convolved for diffuse, plus the split-sum BRDF lookup.
 *
 * The sky is the renderer's own procedural one, baked from the frame's sun,
 * sky, ground and fog settings, so the metal sphere reflects the same sky
 * the camera sees. It is re-baked only when those settings change — a
 * handful of small passes — and the lookup table is built once. An HDR
 * environment asset can later replace the bake as the source cube and
 * everything downstream stays the same.
 *
 * Sizes are small on purpose. Reflections of a smooth gradient need few
 * texels, and roughness blurs away the rest; the sun's own highlight comes
 * from the analytic light, not from here.
 */

/** A stable id per panorama object, so the bake key can name it. */
const environmentIds = new WeakMap();
let nextEnvironmentId = 1;
function environmentId(image) {
  if (!image) return 'none';
  let id = environmentIds.get(image);
  if (!id) environmentIds.set(image, id = nextEnvironmentId++);
  return id;
}

const SKY_SIZE = 128;
const PREFILTER_SIZE = 128;
const PREFILTER_MIPS = 6;
const IRRADIANCE_SIZE = 16;
const LUT_SIZE = 128;
const FORMAT = 'rgba16float';

export class Environment {
  /**
   * @param {GPUDevice} device
   * @param {GPUBindGroupLayout} sceneLayout - Group 0: the frame uniform and storage arrays
   */
  constructor(device, sceneLayout) {
    this.device = device;
    this.key = null;
    this.prefilteredMips = PREFILTER_MIPS;

    this.bakeLayout = device.createBindGroupLayout({
      label: 'bake',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, this.bakeLayout] });
    const pipeline = (code, label) => {
      const module = device.createShaderModule({ code, label });
      return device.createRenderPipeline({
        label, layout,
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: FORMAT }] },
        primitive: { topology: 'triangle-list' }
      });
    };
    this.skyPipeline = pipeline(SKY_BAKE_SHADER, 'sky bake');
    this.prefilterPipeline = pipeline(PREFILTER_SHADER, 'prefilter');
    this.irradiancePipeline = pipeline(IRRADIANCE_SHADER, 'irradiance');
    this.lutPipeline = pipeline(BRDF_LUT_SHADER, 'brdf lut');

    this.sampler = device.createSampler({
      label: 'environment', minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge'
    });

    const cube = (size, mips, label) => device.createTexture({
      label, size: { width: size, height: size, depthOrArrayLayers: 6 }, format: FORMAT, mipLevelCount: mips,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });
    const skyMips = 1 + Math.floor(Math.log2(SKY_SIZE));
    this.sky = cube(SKY_SIZE, skyMips, 'sky cube');
    this.skyView = this.sky.createView({ dimension: 'cube' });
    this.prefiltered = cube(PREFILTER_SIZE, PREFILTER_MIPS, 'prefiltered cube');
    this.prefilteredView = this.prefiltered.createView({ dimension: 'cube' });
    this.irradiance = cube(IRRADIANCE_SIZE, 1, 'irradiance cube');
    this.irradianceView = this.irradiance.createView({ dimension: 'cube' });
    this.lut = device.createTexture({
      label: 'brdf lut', size: { width: LUT_SIZE, height: LUT_SIZE }, format: FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.lutView = this.lut.createView();

    // A pass may not sample the texture it renders into, even another
    // face or mip of it, so the sky bake and the LUT bind this instead.
    this.dummy = cube(1, 1, 'unused cube');
    this.dummyView = this.dummy.createView({ dimension: 'cube' });

    // One uniform per face-and-mip draw the bake can need, written once.
    this.bakeUniforms = [];
    this.skyMips = skyMips;
    this.lutPending = true;
  }

  /** A `{ params }` uniform and bind group for one bake draw. */
  #bake(params, sourceView) {
    const buffer = this.device.createBuffer({
      label: 'bake', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(buffer, 0, new Float32Array(params));
    const group = this.device.createBindGroup({
      layout: this.bakeLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: sourceView },
        { binding: 2, resource: this.sampler }
      ]
    });
    this.bakeUniforms.push(buffer);
    return group;
  }

  #draw(encoder, pipeline, view, sceneBindGroup, bakeGroup) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store' }]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, sceneBindGroup);
    pass.setBindGroup(1, bakeGroup);
    pass.draw(3);
    pass.end();
  }

  /**
   * Re-bake if the frame's sky settings changed. Encodes into `encoder`,
   * ahead of the frame's own passes.
   * @returns {boolean} Whether a bake happened
   */
  update(encoder, frame, sceneBindGroup) {
    const sun = frame.sun;
    const key = [
      ...sun.direction, ...(sun.color ?? [1, 1, 1]), sun.intensity ?? 1,
      ...frame.ambient.sky, ...frame.fog.color,
      frame.environment?.intensity ?? 1
      // The panorama's own identity, so swapping one for another at the
      // same intensity still re-bakes.
    ].map((v) => Math.round(v * 1000)).join(',') + `|${environmentId(frame.environment?.image)}`;
    if (key === this.key) return false;
    this.key = key;

    for (const buffer of this.bakeUniforms) buffer.destroy();
    this.bakeUniforms = [];

    if (this.lutPending) {
      this.lutPending = false;
      this.#draw(encoder, this.lutPipeline, this.lutView, sceneBindGroup, this.#bake([0, 0, 256, 0], this.dummyView));
    }

    // 1. The sky, one face at a time, then its mip chain by re-rendering
    //    smaller — the sky is analytic, so every mip is exact.
    for (let mip = 0; mip < this.skyMips; mip++) {
      for (let face = 0; face < 6; face++) {
        const view = this.sky.createView({ dimension: '2d', baseMipLevel: mip, mipLevelCount: 1, baseArrayLayer: face, arrayLayerCount: 1 });
        this.#draw(encoder, this.skyPipeline, view, sceneBindGroup, this.#bake([face, 0, 0, mip], this.dummyView));
      }
    }
    // 2. Prefiltered reflections, roughness rising with the mip, sampling
    //    a blurrier sky mip for the wider lobes.
    for (let mip = 0; mip < PREFILTER_MIPS; mip++) {
      const roughness = mip / (PREFILTER_MIPS - 1);
      const sourceMip = Math.min(this.skyMips - 1, mip + 1);
      for (let face = 0; face < 6; face++) {
        const view = this.prefiltered.createView({ dimension: '2d', baseMipLevel: mip, mipLevelCount: 1, baseArrayLayer: face, arrayLayerCount: 1 });
        this.#draw(encoder, this.prefilterPipeline, view, sceneBindGroup, this.#bake([face, roughness, 48, sourceMip], this.skyView));
      }
    }
    // 3. Diffuse irradiance from a blurry sky mip.
    for (let face = 0; face < 6; face++) {
      const view = this.irradiance.createView({ dimension: '2d', baseArrayLayer: face, arrayLayerCount: 1 });
      this.#draw(encoder, this.irradiancePipeline, view, sceneBindGroup, this.#bake([face, 0, 128, 3], this.skyView));
    }
    return true;
  }

  /**
   * Forget everything baked. For the renderer's submit-failure recovery:
   * a discarded submit throws away whatever bake it carried, while the
   * key and the LUT flag say the work is done — and nothing would ever
   * re-bake a black environment.
   */
  invalidate() {
    this.key = null;
    this.lutPending = true;
  }

  destroy() {
    for (const buffer of this.bakeUniforms) buffer.destroy();
    for (const texture of [this.sky, this.prefiltered, this.irradiance, this.lut, this.dummy]) texture.destroy();
  }
}
