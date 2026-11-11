import {
  AO_SHADER, AO_BLUR_SHADER, RESOLVE_SHADER, TAA_SHADER, DOF_DOWN_SHADER, DOF_TILE_SHADER, DOF_DILATE_SHADER,
  DOF_FAR_SHADER, DOF_NEAR_SHADER,
  DOF_COMBINE_SHADER, MOTION_BLUR_SHADER,
  LUMINANCE_SHADER, ADAPT_SHADER, BLOOM_PREFILTER_SHADER, BLOOM_DOWNSAMPLE_SHADER, BLOOM_UPSAMPLE_SHADER,
  COMPOSITE_SHADER
} from './shaders/index.js';

/**
 * The frame after the meshes.
 *
 * The main pass leaves four resolved targets: direct light, indirect light,
 * world normal with linear depth, and screen-space velocity. From them:
 *
 *   1. ambient occlusion at half resolution, blurred within the surface;
 *   2. resolve: direct + indirect * occlusion, then fog by depth — the lit frame;
 *   3. temporal anti-aliasing against the reprojected history;
 *   4. depth of field: tiles of the widest circle, then ring gathers of
 *      the near and far fields over a half-resolution copy;
 *   5. per-object motion blur along the velocity;
 *   6. auto exposure: the average log luminance, eased over frames;
 *   7. bloom: a threshold at half resolution, a mip chain down, then back
 *      up blending each level over the next by the scatter constant, so
 *      the result stays at the scene's energy;
 *   8. composite: exposure, bloom, tonemapping, grading, vignette, grain,
 *      into the canvas's content rectangle.
 *
 * Each stage reads whatever the previous one wrote; a stage that is off is
 * skipped and the next reads its input instead. Bind groups are made per
 * combination of inputs the first time it is seen and kept until a resize.
 */

const HDR_FORMAT = 'rgba16float';
const BLOOM_LEVELS = 8;

/**
 * What every post stack shares: the pipelines, their layouts, the
 * samplers, and the constant textures. One per renderer; each *view* of
 * the world (the game's canvas, an editor's side viewports) runs its own
 * `PostPass` over these, because the stack's mutable state — the TAA
 * history, the adapted exposure, every intermediate target — belongs to
 * one camera's sequence of frames and cannot be shared between two.
 */
export class PostPipelines {
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
    this.nearestSampler = device.createSampler({
      label: 'post nearest', minFilter: 'nearest', magFilter: 'nearest', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge'
    });

    // Layouts by texture count: binding 0 is the source, 1 the sampler, the rest more textures.
    this.layouts = [1, 2, 3, 4].map((count) => device.createBindGroupLayout({
      label: `post ${count}`,
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ...Array.from({ length: count - 1 }, (_, i) => ({
          binding: 2 + i, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' }
        }))
      ]
    }));
    const layout = (count) => this.layouts[count - 1];
    const pipeline = (code, label, count, format, blend) => {
      const module = device.createShaderModule({ code, label });
      return device.createRenderPipeline({
        label,
        layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, layout(count)] }),
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format, ...(blend && { blend }) }] },
        primitive: { topology: 'triangle-list' }
      });
    };
    // The bloom upsample blends by the scatter constant — out = scatter *
    // tent(lower) + (1 - scatter) * own — so the chain is a weighted mean
    // of its levels, not their sum; see BLOOM_UPSAMPLE_SHADER.
    const scatterBlend = {
      color: { srcFactor: 'constant', dstFactor: 'one-minus-constant', operation: 'add' },
      alpha: { srcFactor: 'constant', dstFactor: 'one-minus-constant', operation: 'add' }
    };
    this.pipelines = {
      ao: pipeline(AO_SHADER, 'ao', 1, 'r8unorm'),
      aoBlur: pipeline(AO_BLUR_SHADER, 'ao blur', 2, 'r8unorm'),
      resolve: pipeline(RESOLVE_SHADER, 'resolve', 4, HDR_FORMAT),
      taa: pipeline(TAA_SHADER, 'taa', 3, HDR_FORMAT),
      dofDown: pipeline(DOF_DOWN_SHADER, 'dof down', 2, HDR_FORMAT),
      dofTile: pipeline(DOF_TILE_SHADER, 'dof tile', 1, 'rg16float'),
      dofDilate: pipeline(DOF_DILATE_SHADER, 'dof dilate', 1, 'rg16float'),
      dofFar: pipeline(DOF_FAR_SHADER, 'dof far', 1, HDR_FORMAT),
      dofNear: pipeline(DOF_NEAR_SHADER, 'dof near', 2, HDR_FORMAT),
      dofCombine: pipeline(DOF_COMBINE_SHADER, 'dof combine', 4, HDR_FORMAT),
      motionBlur: pipeline(MOTION_BLUR_SHADER, 'motion blur', 2, HDR_FORMAT),
      luminance: pipeline(LUMINANCE_SHADER, 'luminance', 1, HDR_FORMAT),
      adapt: pipeline(ADAPT_SHADER, 'adapt', 2, HDR_FORMAT),
      prefilter: pipeline(BLOOM_PREFILTER_SHADER, 'bloom prefilter', 2, HDR_FORMAT),
      downsample: pipeline(BLOOM_DOWNSAMPLE_SHADER, 'bloom downsample', 1, HDR_FORMAT),
      upsample: pipeline(BLOOM_UPSAMPLE_SHADER, 'bloom upsample', 1, HDR_FORMAT, scatterBlend),
      composite: pipeline(COMPOSITE_SHADER, 'composite', 4, canvasFormat)
    };

    const one = (label, data) => {
      const texture = device.createTexture({
        label, size: { width: 1, height: 1 }, format: HDR_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      device.queue.writeTexture({ texture }, new Uint16Array(data), { bytesPerRow: 8 }, { width: 1, height: 1 });
      return texture;
    };
    this.makeOne = one;
    /** Black: no bloom, no history. */
    this.black = one('black', [0, 0, 0, 0x3c00]);
    this.blackView = this.black.createView();
    /** A 16-step identity LUT strip; a frame's own replaces it. */
    this.identityLut = this.#identityLut();
    this.identityLutView = this.identityLut.createView();
  }

  destroy() {
    for (const texture of [this.black, this.identityLut]) texture.destroy();
  }

  #identityLut() {
    const data = new Uint8Array(256 * 16 * 4);
    for (let b = 0; b < 16; b++) {
      for (let g = 0; g < 16; g++) {
        for (let r = 0; r < 16; r++) {
          const i = ((g * 256) + b * 16 + r) * 4;
          data[i] = Math.round(r * 255 / 15); data[i + 1] = Math.round(g * 255 / 15); data[i + 2] = Math.round(b * 255 / 15); data[i + 3] = 255;
        }
      }
    }
    const texture = this.device.createTexture({
      label: 'identity lut', size: { width: 256, height: 16 }, format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.device.queue.writeTexture({ texture }, data, { bytesPerRow: 256 * 4 }, { width: 256, height: 16 });
    return texture;
  }
}

/**
 * One view's post stack: the mutable half of the frame after the meshes.
 * Owns every target the stages write — including the TAA history and the
 * adapted exposure, which persist across frames and belong to one camera.
 */
export class PostPass {
  /** @param {PostPipelines} shared */
  constructor(shared) {
    this.shared = shared;
    this.device = shared.device;

    this.textures = {};
    this.views = {};
    this.levels = [];
    this.groups = new Map();
    this.viewIds = new WeakMap();
    this.nextViewId = 1;
    this.frameIndex = 0;
    this.historyValid = false;
    this.width = 0;
    this.height = 0;

    /** Exposure 1, as a half float, in two textures the adaptation ping-pongs between. */
    this.exposure = [shared.makeOne('exposure a', [0x3c00, 0, 0, 0x3c00]), shared.makeOne('exposure b', [0x3c00, 0, 0, 0x3c00])];
    this.exposureViews = this.exposure.map((t) => t.createView());
    this.exposureIndex = 0;
    this.lum = shared.makeOne('luminance', [0x3c00, 0, 0, 0x3c00]);
    this.lumView = this.lum.createView();
    this.lutTexture = null;
    this.lutView = null;
    this.lutImage = null;
  }

  /** A grading LUT image (256x16 strip), uploaded once per image. */
  #lut(image) {
    if (!image) return this.shared.identityLutView;
    if (image !== this.lutImage) {
      this.lutTexture?.destroy();
      this.lutTexture = this.device.createTexture({
        label: 'lut', size: { width: image.width, height: image.height }, format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.device.queue.copyExternalImageToTexture({ source: image }, { texture: this.lutTexture }, { width: image.width, height: image.height });
      this.lutImage = image;
      this.lutView = this.lutTexture.createView();
    }
    return this.lutView;
  }

  /** (Re)create every target for a world-surface size. Resets the history. */
  resize(width, height) {
    this.width = width;
    this.height = height;
    for (const texture of Object.values(this.textures)) texture.destroy();
    for (const level of this.levels) level.texture.destroy();
    this.groups.clear();
    const make = (label, w, h, format = HDR_FORMAT) => this.device.createTexture({
      label, size: { width: w, height: h }, format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    const hw = Math.max(1, width >> 1);
    const hh = Math.max(1, height >> 1);
    this.textures = {
      direct: make('direct', width, height),
      indirect: make('indirect', width, height),
      normalDepth: make('normal depth', width, height),
      velocity: make('velocity', width, height, 'rg16float'),
      aoRaw: make('ao raw', hw, hh, 'r8unorm'),
      ao: make('ao', hw, hh, 'r8unorm'),
      lit: make('lit', width, height),
      historyA: make('history a', width, height),
      historyB: make('history b', width, height),
      dofHalf: make('dof half', hw, hh),
      // The widest circle of confusion per 8x8 half-resolution tile, and
      // the same dilated by one tile.
      dofTiles: make('dof tiles', Math.ceil(hw / 8), Math.ceil(hh / 8), 'rg16float'),
      dofTilesDilated: make('dof tiles dilated', Math.ceil(hw / 8), Math.ceil(hh / 8), 'rg16float'),
      dofFar: make('dof far', hw, hh),
      dofNear: make('dof near', hw, hh),
      dof: make('dof', width, height),
      motion: make('motion', width, height)
    };
    this.views = Object.fromEntries(Object.entries(this.textures).map(([k, t]) => [k, t.createView()]));
    this.levels = [];
    let w = hw;
    let h = hh;
    for (let i = 0; i < BLOOM_LEVELS && w >= 4 && h >= 4; i++) {
      const texture = make(`bloom ${i}`, w, h);
      this.levels.push({ texture, view: texture.createView() });
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
    this.historyValid = false;
  }

  /** The resolve targets the main pass writes, in attachment order. */
  get attachments() {
    const v = this.views;
    return [v.direct, v.indirect, v.normalDepth, v.velocity];
  }

  #id(view) {
    let id = this.viewIds.get(view);
    if (!id) this.viewIds.set(view, id = this.nextViewId++);
    return id;
  }

  /** A bind group over `views` with a sampler, cached by the views' identities. */
  #group(views, sampler = this.shared.sampler) {
    const key = views.map((v) => this.#id(v)).join(',') + (sampler === this.shared.sampler ? '' : 'n');
    let group = this.groups.get(key);
    if (group) return group;
    const entries = [{ binding: 0, resource: views[0] }, { binding: 1, resource: sampler }];
    for (let i = 1; i < views.length; i++) entries.push({ binding: 1 + i, resource: views[i] });
    group = this.device.createBindGroup({ layout: this.shared.layouts[views.length - 1], entries });
    this.groups.set(key, group);
    return group;
  }

  #draw(encoder, pipeline, target, sceneBindGroup, group, { loadOp = 'clear', rect = null, blendConstant = null, timestampWrites = undefined } = {}) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target, loadOp, storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      ...(timestampWrites && { timestampWrites })
    });
    // The content rectangle: the rest of the canvas stays the clear's black,
    // which is the letterbox.
    if (rect) pass.setViewport(rect[0], rect[1], rect[2], rect[3], 0, 1);
    if (blendConstant != null) pass.setBlendConstant({ r: blendConstant, g: blendConstant, b: blendConstant, a: blendConstant });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, sceneBindGroup);
    pass.setBindGroup(1, group);
    pass.draw(3);
    pass.end();
  }

  /**
   * Run the stack onto `target`.
   * @param {object} options
   * @param {object} options.effects - Which stages run: `ao`, `taa`, `dof`, `motionBlur`, `autoExposure`, `bloom`
   * @param {object|null} [options.lut] - A grading LUT image, or null
   * @param {number} [options.bloomScatter] - How far bloom spreads: each upsample's blend toward the wider level
   * @param {'linear'|'nearest'} [options.filter] - How the world is upscaled to the canvas
   * @param {number[]|null} [options.rect] - The content rectangle in canvas pixels
   * @param {GPURenderPassTimestampWrites} [options.timestampWrites] - Stamps for the last pass, the composite
   * @returns {number} Draw calls issued
   */
  run(encoder, sceneBindGroup, target, { effects, lut = null, bloomScatter = 0.75, filter = 'linear', rect = null, timestampWrites = undefined }) {
    const p = this.shared.pipelines;
    const v = this.views;
    let draws = 0;
    const draw = (pipeline, out, views, options) => {
      this.#draw(encoder, pipeline, out, sceneBindGroup, this.#group(views), options);
      draws++;
    };

    if (effects.ao) {
      draw(p.ao, v.aoRaw, [v.normalDepth]);
      draw(p.aoBlur, v.ao, [v.aoRaw, v.normalDepth]);
    }
    draw(p.resolve, v.lit, [v.direct, v.indirect, v.ao, v.normalDepth]);
    let current = v.lit;

    if (effects.taa) {
      const [write, read] = this.frameIndex % 2 ? [v.historyA, v.historyB] : [v.historyB, v.historyA];
      draw(p.taa, write, [current, this.historyValid ? read : current, v.velocity]);
      current = write;
      this.historyValid = true;
    } else {
      this.historyValid = false;
    }
    if (effects.dof) {
      draw(p.dofDown, v.dofHalf, [current, v.normalDepth]);
      draw(p.dofTile, v.dofTiles, [v.dofHalf]);
      draw(p.dofDilate, v.dofTilesDilated, [v.dofTiles]);
      draw(p.dofFar, v.dofFar, [v.dofHalf]);
      draw(p.dofNear, v.dofNear, [v.dofHalf, v.dofTilesDilated]);
      draw(p.dofCombine, v.dof, [current, v.normalDepth, v.dofFar, v.dofNear]);
      current = v.dof;
    }
    if (effects.motionBlur) {
      draw(p.motionBlur, v.motion, [current, v.velocity]);
      current = v.motion;
    }

    let exposureView = this.exposureViews[this.exposureIndex];
    if (effects.autoExposure) {
      const next = 1 - this.exposureIndex;
      draw(p.luminance, this.lumView, [current]);
      draw(p.adapt, this.exposureViews[next], [this.lumView, exposureView]);
      this.exposureIndex = next;
      exposureView = this.exposureViews[next];
    }

    const levels = this.levels;
    let bloomView = this.shared.blackView;
    if (effects.bloom && levels.length) {
      const scatter = Math.min(0.95, Math.max(0.05, bloomScatter));
      draw(p.prefilter, levels[0].view, [current, exposureView]);
      for (let i = 1; i < levels.length; i++) draw(p.downsample, levels[i].view, [levels[i - 1].view]);
      for (let i = levels.length - 1; i > 0; i--) {
        draw(p.upsample, levels[i - 1].view, [levels[i].view], { loadOp: 'load', blendConstant: scatter });
      }
      bloomView = levels[0].view;
    }

    const sampler = filter === 'nearest' ? this.shared.nearestSampler : this.shared.sampler;
    this.#draw(encoder, p.composite, target, sceneBindGroup,
      this.#group([current, exposureView, bloomView, this.#lut(lut)], sampler), { rect, timestampWrites });
    draws++;
    this.frameIndex++;
    return draws;
  }

  destroy() {
    for (const texture of Object.values(this.textures)) texture.destroy();
    for (const level of this.levels) level.texture.destroy();
    for (const texture of [this.lum, ...this.exposure]) texture.destroy();
    this.lutTexture?.destroy();
    this.textures = {};
    this.levels = [];
    this.groups.clear();
  }
}
