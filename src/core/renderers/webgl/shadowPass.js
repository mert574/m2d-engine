import { createProgram, createRenderTarget, resizeRenderTarget, deleteRenderTarget } from './device.js';
import { ATTRIBUTES, VERTEX_FLOATS, VERTEX_SHADER, BLUR_FRAGMENT_SHADER } from './shaders.js';

/**
 * Silhouette shadows for the GPU backend.
 *
 * The contract defines a shadow as the primitive's whole silhouette, offset,
 * blurred (Gaussian, sigma = blur / 2) and tinted, drawn once beneath it.
 * This pass owns two canvas-sized render targets and the blur program:
 *
 *   1. the renderer draws the primitive into target A (silhouette)
 *   2. A → B horizontal blur, B → A vertical blur, over the bounding region
 *   3. the renderer composites A onto the frame in shadow-tint mode
 */
export class ShadowPass {
  constructor(gl, width, height) {
    this.gl = gl;
    this.a = createRenderTarget(gl, width, height);
    this.b = createRenderTarget(gl, width, height);
    this.width = width;
    this.height = height;

    const { program, uniforms } = createProgram(gl, VERTEX_SHADER, BLUR_FRAGMENT_SHADER, ATTRIBUTES);
    this.program = program;
    this.uniforms = uniforms;

    // One quad for the blur passes.
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    this.quad = new Float32Array(4 * VERTEX_FLOATS);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.quad.byteLength, gl.DYNAMIC_DRAW);
    const stride = VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(ATTRIBUTES.a_position);
    gl.vertexAttribPointer(ATTRIBUTES.a_position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(ATTRIBUTES.a_uv);
    gl.vertexAttribPointer(ATTRIBUTES.a_uv, 2, gl.FLOAT, false, stride, 8);
    gl.bindVertexArray(null);
  }

  destroy() {
    const gl = this.gl;
    deleteRenderTarget(gl, this.a);
    deleteRenderTarget(gl, this.b);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
  }

  resize(width, height) {
    resizeRenderTarget(this.gl, this.a, width, height);
    resizeRenderTarget(this.gl, this.b, width, height);
    this.width = width;
    this.height = height;
  }

  /** Blur radius in pixels for a shadow descriptor. */
  static radius(shadow) {
    const sigma = (shadow.blur || 0) / 2;
    return sigma > 0 ? Math.min(128, Math.ceil(sigma * 3)) : 0;
  }

  /** Bind target A cleared to transparent, ready for the silhouette. */
  beginSilhouette() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Blur the silhouette in A over `region` (pixel-space bounds already
   * expanded by the blur radius). Leaves the result in A.
   * @returns {number} GPU draw calls issued
   */
  blur(region, shadow) {
    const gl = this.gl;
    const radius = ShadowPass.radius(shadow);
    if (radius === 0) return 0;
    const sigma = (shadow.blur || 0) / 2;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(this.uniforms.u_flipY, 1);
    gl.uniform1i(this.uniforms.u_texture, 0);
    gl.uniform1f(this.uniforms.u_sigma, sigma);
    gl.uniform1i(this.uniforms.u_radius, radius);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);

    // Rows the vertical pass will read must be clean in B.
    const tall = expand(region, 0, radius, this.width, this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.framebuffer);
    gl.enable(gl.SCISSOR_TEST);
    scissor(gl, tall, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    scissor(gl, region, this.height);
    gl.bindTexture(gl.TEXTURE_2D, this.a.texture);
    gl.uniform2f(this.uniforms.u_direction, 1 / this.width, 0);
    this.#drawQuad(region);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, this.b.texture);
    gl.uniform2f(this.uniforms.u_direction, 0, 1 / this.height);
    this.#drawQuad(region);

    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(null);
    return 2;
  }

  /** The blurred silhouette texture (target A). */
  get texture() {
    return this.a.texture;
  }

  #drawQuad(r) {
    const gl = this.gl;
    const q = this.quad;
    const corners = [r.minX, r.minY, r.maxX, r.minY, r.maxX, r.maxY, r.minX, r.maxY];
    for (let i = 0; i < 4; i++) {
      const o = i * VERTEX_FLOATS;
      q[o] = corners[2 * i];
      q[o + 1] = corners[2 * i + 1];
      q[o + 2] = corners[2 * i] / this.width;
      q[o + 3] = corners[2 * i + 1] / this.height;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, q);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }
}

/** Expand pixel bounds, clamped to the surface. */
export function expand(r, dx, dy, width, height) {
  return {
    minX: Math.max(0, Math.floor(r.minX - dx)),
    minY: Math.max(0, Math.floor(r.minY - dy)),
    maxX: Math.min(width, Math.ceil(r.maxX + dx)),
    maxY: Math.min(height, Math.ceil(r.maxY + dy))
  };
}

function scissor(gl, r, height) {
  // Offscreen targets are rendered un-flipped: pixel y maps straight to GL y.
  gl.scissor(r.minX, r.minY, Math.max(0, r.maxX - r.minX), Math.max(0, r.maxY - r.minY));
}
