/**
 * Images as GPU textures, with mipmaps, uploaded once each.
 *
 * A glTF material refers to decoded images; the renderer asks here for the
 * texture of one and gets the same texture every time. Base colour and
 * emissive textures are sRGB-encoded and sampled through an `-srgb`
 * format so the shader sees linear light; everything else is linear data.
 *
 * WebGPU has no mipmap generation, so this carries the usual one: a
 * fullscreen blit from each level into the next.
 */

const BLIT_SHADER = /* wgsl */ `
struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: Out;
  out.position = vec4f(corners[i], 0.0, 1.0);
  out.uv = vec2f(corners[i].x * 0.5 + 0.5, 0.5 - corners[i].y * 0.5);
  return out;
}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@fragment fn fs(in: Out) -> @location(0) vec4f { return textureSample(src, smp, in.uv); }
`;

export class TextureCache3D {
  /** @param {GPUDevice} device */
  constructor(device) {
    this.device = device;
    /** @type {WeakMap<object, GPUTexture>} */
    this.textures = new WeakMap();
    this.blitPipelines = new Map();
    this.blitSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    this.blitModule = device.createShaderModule({ code: BLIT_SHADER, label: 'mip blit' });
    /** 1x1 white, for a material slot with no texture. */
    this.white = this.#solid([255, 255, 255, 255], 'rgba8unorm', 'white');
    /** 1x1 white in sRGB, for the base colour slot. */
    this.whiteSRGB = this.#solid([255, 255, 255, 255], 'rgba8unorm-srgb', 'white (srgb)');
    /** 1x1 black, for the emissive slot. */
    this.black = this.#solid([0, 0, 0, 255], 'rgba8unorm-srgb', 'black (srgb)');
    this.sampler = device.createSampler({
      label: 'material',
      minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear',
      addressModeU: 'repeat', addressModeV: 'repeat',
      maxAnisotropy: 8
    });
  }

  #solid(rgba, format, label) {
    const texture = this.device.createTexture({
      label, size: { width: 1, height: 1 }, format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.device.queue.writeTexture({ texture }, new Uint8Array(rgba), { bytesPerRow: 4 }, { width: 1, height: 1 });
    return texture;
  }

  /**
   * The texture for a decoded image (an `ImageBitmap` or any
   * `copyExternalImageToTexture` source).
   * @param {object} image
   * @param {{srgb?: boolean}} [options] - sRGB-encoded colour data, or linear
   */
  get(image, { srgb = false } = {}) {
    let texture = this.textures.get(image);
    if (texture) return texture;
    const width = image.width;
    const height = image.height;
    const mipLevelCount = 1 + Math.floor(Math.log2(Math.max(width, height)));
    const format = srgb ? 'rgba8unorm-srgb' : 'rgba8unorm';
    texture = this.device.createTexture({
      label: 'image',
      size: { width, height },
      format,
      mipLevelCount,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.device.queue.copyExternalImageToTexture({ source: image }, { texture }, { width, height });
    if (mipLevelCount > 1) this.#generateMips(texture, format, mipLevelCount);
    this.textures.set(image, texture);
    return texture;
  }

  #generateMips(texture, format, levels) {
    let pipeline = this.blitPipelines.get(format);
    if (!pipeline) {
      pipeline = this.device.createRenderPipeline({
        label: `mip blit ${format}`,
        layout: 'auto',
        vertex: { module: this.blitModule, entryPoint: 'vs' },
        fragment: { module: this.blitModule, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' }
      });
      this.blitPipelines.set(format, pipeline);
    }
    const encoder = this.device.createCommandEncoder({ label: 'mips' });
    for (let level = 1; level < levels; level++) {
      const bindGroup = this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) },
          { binding: 1, resource: this.blitSampler }
        ]
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
          loadOp: 'clear', storeOp: 'store'
        }]
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
    this.device.queue.submit([encoder.finish()]);
  }

  destroy() {
    for (const t of [this.white, this.whiteSRGB, this.black]) t.destroy();
    this.textures = new WeakMap();
  }
}
