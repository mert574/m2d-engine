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

import { toHalf } from '../../hdr.js';

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

/** GPU formats per transcode target; block formats are 4x4, 16 bytes. */
const COMPRESSED_FORMATS = {
  bc7: { linear: 'bc7-rgba-unorm', srgb: 'bc7-rgba-unorm-srgb', block: 4, blockBytes: 16 },
  astc: { linear: 'astc-4x4-unorm', srgb: 'astc-4x4-unorm-srgb', block: 4, blockBytes: 16 },
  etc2: { linear: 'etc2-rgba8unorm', srgb: 'etc2-rgba8unorm-srgb', block: 4, blockBytes: 16 },
  rgba8: { linear: 'rgba8unorm', srgb: 'rgba8unorm-srgb', block: 1, blockBytes: 4 }
};

export class TextureCache3D {
  /** @param {GPUDevice} device */
  constructor(device) {
    this.device = device;
    /** @type {WeakMap<object, GPUTexture>} */
    this.textures = new WeakMap();
    /**
     * Bytes of GPU memory the uploaded images hold, so a streaming
     * budget has a number to weigh. Mip chains included: a full chain
     * is a third again the base level.
     */
    this.bytes = 0;
    /** @type {WeakMap<object, number>} Bytes per uploaded image, for `release`. */
    this.sizes = new WeakMap();
    this.blitPipelines = new Map();
    this.blitSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    this.blitModule = device.createShaderModule({ code: BLIT_SHADER, label: 'mip blit' });
    /** 1x1 white, for a material slot with no texture. */
    this.white = this.#solid([255, 255, 255, 255], 'rgba8unorm', 'white');
    /** 1x1 white in sRGB, for the base colour slot. */
    this.whiteSRGB = this.#solid([255, 255, 255, 255], 'rgba8unorm-srgb', 'white (srgb)');
    /** 1x1 black, for the emissive slot. */
    this.black = this.#solid([0, 0, 0, 255], 'rgba8unorm-srgb', 'black (srgb)');
    /** 1x1 straight-up tangent-space normal, for the normal slot. */
    this.flatNormal = this.#solid([128, 128, 255, 255], 'rgba8unorm', 'flat normal');
    /**
     * 1x1 black in the panorama's own format, bound when no HDR
     * environment is loaded: a bind group must be complete even when
     * the shader is about to ignore the slot.
     */
    this.blackHDR = device.createTexture({
      label: 'no environment', size: { width: 1, height: 1 }, format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    device.queue.writeTexture(
      { texture: this.blackHDR }, new Uint16Array([0, 0, 0, toHalf(1)]), { bytesPerRow: 8 }, { width: 1, height: 1 }
    );
    this.sampler = device.createSampler({
      label: 'material',
      minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear',
      addressModeU: 'repeat', addressModeV: 'repeat',
      maxAnisotropy: 8
    });
  }

  /**
   * An HDR panorama from `hdr.js` as a filterable float texture, with a
   * mip chain so the cube bake can read a blurrier level for its
   * smaller mips. Cached on the decoded image, like every other texture.
   * @param {{width: number, height: number, data: Uint16Array}} image
   */
  equirect(image) {
    let texture = this.textures.get(image);
    if (texture) return texture;
    const { width, height } = image;
    const mipLevelCount = 1 + Math.floor(Math.log2(Math.max(width, height)));
    texture = this.device.createTexture({
      label: 'environment panorama',
      size: { width, height },
      format: 'rgba16float',
      mipLevelCount,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.device.queue.writeTexture(
      { texture },
      image.data,
      { bytesPerRow: width * 8, rowsPerImage: height },
      { width, height }
    );
    if (mipLevelCount > 1) this.#generateMips(texture, 'rgba16float', mipLevelCount);
    this.textures.set(image, texture);
    return texture;
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
   * The texture for a decoded image: an `ImageBitmap` (or any
   * `copyExternalImageToTexture` source), or a transcoded KTX2 record
   * from `basis.js` (`compressed: true`, pre-mipped, uploaded as is).
   * @param {object} image
   * @param {{srgb?: boolean}} [options] - sRGB-encoded colour data, or linear
   */
  get(image, { srgb = false } = {}) {
    let texture = this.textures.get(image);
    if (texture) return texture;
    if (image.compressed) {
      if (!image.mips) {
        throw new Error('M2D: this texture\'s data was let go once it was on the GPU, and its texture has since been released; load the model again to draw it');
      }
      texture = this.#uploadCompressed(image, srgb);
      this.textures.set(image, texture);
      return texture;
    }
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
    this.#count(image, width * height * 4 * (mipLevelCount > 1 ? 4 / 3 : 1));
    return texture;
  }

  /** Record what an upload costs, for `bytes` and `release`. */
  #count(image, bytes) {
    const size = Math.round(bytes);
    this.sizes.set(image, size);
    this.bytes += size;
  }

  /**
   * Drop an uploaded image: its texture is destroyed and the bytes come
   * off the total. The next `get` for the same image uploads a decoded
   * image again; a transcoded KTX2 record's payload went at its upload,
   * so `get` refuses it and its model has to be loaded again — which is
   * what streaming, the one caller, does with what is far away.
   * @returns {boolean} Whether there was anything to release
   */
  release(image) {
    const texture = this.textures.get(image);
    if (!texture) return false;
    texture.destroy();
    this.textures.delete(image);
    this.bytes -= this.sizes.get(image) ?? 0;
    this.sizes.delete(image);
    return true;
  }

  /**
   * A transcoded KTX2 record: a block-compressed (or RGBA8) payload with
   * its own mip chain, written level by level. The three block formats
   * all use 4x4 blocks of 16 bytes.
   *
   * The copy extent is the level's *physical* size — its logical size
   * rounded up to whole blocks — not its logical one. The last mips of
   * any chain are smaller than a block (a 2048 texture ends 2x2, 1x1),
   * and WebGPU rejects a copy width that is not a multiple of the block
   * width. The transcoder pads those levels to a full block already, so
   * the bytes for a 4x4 copy are there.
   *
   * Once written, the payload is let go (`image.mips` becomes null): the
   * GPU holds the texture, and keeping a CPU copy of every scan's mip
   * chain is what filled a tab's heap — the lot held 2.7 GB of mips it
   * would never read again. Nothing uploads the same record twice: a
   * model whose textures are released is dropped by its scene, and
   * coming back it is loaded afresh.
   */
  #uploadCompressed(image, srgb) {
    const base = COMPRESSED_FORMATS[image.base];
    if (!base) throw new Error(`M2D: unknown compressed texture format '${image.base}'`);
    const format = srgb ? base.srgb : base.linear;
    const texture = this.device.createTexture({
      label: `image (${image.base})`,
      size: { width: image.width, height: image.height },
      format,
      mipLevelCount: image.mips.length,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    const block = base.block;
    for (let level = 0; level < image.mips.length; level++) {
      const blocksWide = Math.ceil(Math.max(1, image.width >> level) / block);
      const blocksHigh = Math.ceil(Math.max(1, image.height >> level) / block);
      this.device.queue.writeTexture(
        { texture, mipLevel: level },
        image.mips[level],
        { bytesPerRow: blocksWide * base.blockBytes, rowsPerImage: blocksHigh },
        { width: blocksWide * block, height: blocksHigh * block }
      );
    }
    this.#count(image, image.mips.reduce((total, level) => total + level.byteLength, 0));
    image.mips = null;
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
    for (const t of [this.white, this.whiteSRGB, this.black, this.flatNormal, this.blackHDR]) t.destroy();
    this.textures = new WeakMap();
  }
}
