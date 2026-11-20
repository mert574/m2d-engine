/**
 * The WebGPU flag namespaces, from the spec (https://www.w3.org/TR/webgpu/).
 *
 * TypeScript 7's DOM lib has the WebGPU interfaces (`GPUDevice`,
 * `GPUTexture`, ...) but not these four global flag objects, and
 * `@webgpu/types` cannot fill the gap without redeclaring what the DOM lib
 * already has. A platform declaration, like the vendored transcoder's —
 * not a description of the engine.
 */

declare const GPUBufferUsage: {
  readonly MAP_READ: 0x0001;
  readonly MAP_WRITE: 0x0002;
  readonly COPY_SRC: 0x0004;
  readonly COPY_DST: 0x0008;
  readonly INDEX: 0x0010;
  readonly VERTEX: 0x0020;
  readonly UNIFORM: 0x0040;
  readonly STORAGE: 0x0080;
  readonly INDIRECT: 0x0100;
  readonly QUERY_RESOLVE: 0x0200;
};

declare const GPUTextureUsage: {
  readonly COPY_SRC: 0x01;
  readonly COPY_DST: 0x02;
  readonly TEXTURE_BINDING: 0x04;
  readonly STORAGE_BINDING: 0x08;
  readonly RENDER_ATTACHMENT: 0x10;
};

declare const GPUShaderStage: {
  readonly VERTEX: 0x1;
  readonly FRAGMENT: 0x2;
  readonly COMPUTE: 0x4;
};

declare const GPUMapMode: {
  readonly READ: 0x0001;
  readonly WRITE: 0x0002;
};

/**
 * Spec members the DOM lib does not have yet, same provenance as the
 * flag namespaces above.
 */
interface GPUTextureDescriptor {
  /** How a layered texture will be viewed when bound; a cube view must agree with it. */
  textureBindingViewDimension?: GPUTextureViewDimension;
}
