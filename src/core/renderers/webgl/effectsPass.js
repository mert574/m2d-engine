import { createProgram, createRenderTarget, resizeRenderTarget, deleteRenderTarget } from './device.js';
import {
  ATTRIBUTES, VERTEX_FLOATS, VERTEX_SHADER, BLUR_FRAGMENT_SHADER,
  LIGHT_FRAGMENT_SHADER, BRIGHT_FRAGMENT_SHADER, COMPOSITE_FRAGMENT_SHADER
} from './shaders.js';

/**
 * Lighting and full-screen post effects for the GPU backend.
 *
 * Both features need the world as a *texture* rather than as pixels already
 * on screen, so when either is active the renderer points the world pass at
 * this pass's scene target instead of the default framebuffer. Nothing else
 * about world drawing changes — the scene target carries a stencil buffer so
 * clipping keeps working exactly as it does on screen.
 *
 * The frame then becomes:
 *
 *   1. world pass draws into `scene` (with stencil)
 *   2. lights accumulate additively into `light`, over the ambient clear
 *   3. optional bloom: bright-pass `scene * light` into `bloomA`, blur it
 *   4. composite `scene * light + bloom`, vignetted, to the default framebuffer
 *
 * The screen (UI) pass runs after all of that, straight to the default
 * framebuffer, so the HUD is never dimmed by ambient or smeared by bloom.
 */

/** Floats per light vertex, matching the shared vertex layout. */
const LIGHT_VERTS = 6;

export class EffectsPass {
  constructor(gl, width, height, pixelWidth = width, pixelHeight = height) {
    this.gl = gl;
    /** Coordinate space of the world pass, in world units. */
    this.width = width;
    this.height = height;
    /** Pixel size of the offscreen targets — the world render resolution. */
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;

    // The world renders here, so this one needs a stencil for clips.
    this.scene = createRenderTarget(gl, pixelWidth, pixelHeight, { stencil: true });
    this.light = createRenderTarget(gl, pixelWidth, pixelHeight);
    this.bloomA = createRenderTarget(gl, pixelWidth, pixelHeight);
    this.bloomB = createRenderTarget(gl, pixelWidth, pixelHeight);

    this.lightProgram = createProgram(gl, VERTEX_SHADER, LIGHT_FRAGMENT_SHADER, ATTRIBUTES);
    this.brightProgram = createProgram(gl, VERTEX_SHADER, BRIGHT_FRAGMENT_SHADER, ATTRIBUTES);
    this.blurProgram = createProgram(gl, VERTEX_SHADER, BLUR_FRAGMENT_SHADER, ATTRIBUTES);
    this.compositeProgram = createProgram(gl, VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER, ATTRIBUTES);

    this.quadVao = gl.createVertexArray();
    this.quadBuffer = gl.createBuffer();
    this.quad = new Float32Array(4 * VERTEX_FLOATS);
    this.#setupVao(this.quadVao, this.quadBuffer, this.quad.byteLength);

    this.lightVao = gl.createVertexArray();
    this.lightBuffer = gl.createBuffer();
    this.lightData = new Float32Array(0);
    this.#setupVao(this.lightVao, this.lightBuffer, 0);
  }

  #setupVao(vao, buffer, bytes) {
    const gl = this.gl;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (bytes > 0) gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
    const stride = VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(ATTRIBUTES.a_position);
    gl.vertexAttribPointer(ATTRIBUTES.a_position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(ATTRIBUTES.a_uv);
    gl.vertexAttribPointer(ATTRIBUTES.a_uv, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(ATTRIBUTES.a_color);
    gl.vertexAttribPointer(ATTRIBUTES.a_color, 4, gl.FLOAT, false, stride, 16);
    gl.bindVertexArray(null);
  }

  destroy() {
    const gl = this.gl;
    deleteRenderTarget(gl, this.scene);
    deleteRenderTarget(gl, this.light);
    deleteRenderTarget(gl, this.bloomA);
    deleteRenderTarget(gl, this.bloomB);
    gl.deleteVertexArray(this.quadVao);
    gl.deleteVertexArray(this.lightVao);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.lightBuffer);
    gl.deleteProgram(this.lightProgram.program);
    gl.deleteProgram(this.brightProgram.program);
    gl.deleteProgram(this.blurProgram.program);
    gl.deleteProgram(this.compositeProgram.program);
  }

  /**
   * @param {number} width - Coordinate-space width in world units
   * @param {number} height - Coordinate-space height in world units
   * @param {number} [pixelWidth=width] - Target width in pixels
   * @param {number} [pixelHeight=height] - Target height in pixels
   */
  resize(width, height, pixelWidth = width, pixelHeight = height) {
    const gl = this.gl;
    resizeRenderTarget(gl, this.scene, pixelWidth, pixelHeight, { stencil: true });
    resizeRenderTarget(gl, this.light, pixelWidth, pixelHeight);
    resizeRenderTarget(gl, this.bloomA, pixelWidth, pixelHeight);
    resizeRenderTarget(gl, this.bloomB, pixelWidth, pixelHeight);
    this.width = width;
    this.height = height;
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
  }

  /** Bind the scene target, cleared to opaque black like the world pass. */
  beginScene() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.framebuffer);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }

  /** Re-bind the scene target mid-frame (after an offscreen detour). */
  bindScene(clipDepth) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.framebuffer);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.SCISSOR_TEST);
    if (clipDepth > 0) gl.enable(gl.STENCIL_TEST);
  }

  /**
   * Accumulate the frame's lights into the light map.
   * @param {Array<{x, y, radius, color: number[], intensity: number}>} lights
   * @param {number[]} ambient - Straight [r, g, b] the map clears to
   * @returns {number} GPU draw calls issued
   */
  drawLights(lights, ambient) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.light.framebuffer);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(ambient[0], ambient[1], ambient[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (lights.length === 0) return 0;

    const needed = lights.length * LIGHT_VERTS * VERTEX_FLOATS;
    if (this.lightData.length < needed) {
      this.lightData = new Float32Array(needed);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.lightData.byteLength, gl.DYNAMIC_DRAW);
    }

    // Two triangles per light. Local uv runs -1..1 so the shader's falloff is
    // just the distance from the quad's centre.
    const data = this.lightData;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    let o = 0;
    for (const lightSource of lights) {
      const { x, y, radius, color, intensity } = lightSource;
      for (let i = 0; i < LIGHT_VERTS; i++) {
        const [cx, cy] = corners[i];
        data[o] = x + cx * radius;
        data[o + 1] = y + cy * radius;
        data[o + 2] = cx;
        data[o + 3] = cy;
        data[o + 4] = color[0] * intensity;
        data[o + 5] = color[1] * intensity;
        data[o + 6] = color[2] * intensity;
        data[o + 7] = 1;
        o += VERTEX_FLOATS;
      }
    }

    const { program, uniforms } = this.lightProgram;
    gl.useProgram(program);
    gl.bindVertexArray(this.lightVao);
    gl.uniform2f(uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(uniforms.u_flipY, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, needed);
    gl.drawArrays(gl.TRIANGLES, 0, lights.length * LIGHT_VERTS);
    gl.bindVertexArray(null);
    return 1;
  }

  /**
   * Composite the frame to the default framebuffer.
   * @param {Object|null} post - { bloom: {threshold, strength, blur}, vignette: {strength, start} }
   * @param {{x: number, y: number, width: number, height: number}} [content] - Where
   *   the world lands on the backing store. Defaults to the full offscreen size,
   *   which is the unscaled, unletterboxed case.
   * @returns {number} GPU draw calls issued
   */
  composite(post, content) {
    const gl = this.gl;
    const bloom = post?.bloom;
    let calls = 0;

    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);

    if (bloom && (bloom.strength ?? 0) > 0) {
      calls += this.#bloom(bloom);
    } else {
      // Nothing to add: clear the bloom texture so the composite reads zero.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
      gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    const vignette = post?.vignette;
    const { program, uniforms } = this.compositeProgram;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // The world is presented into its content rect, which is letterboxed and
    // at display resolution — not the offscreen render resolution.
    if (content) {
      gl.viewport(content.x, content.y, content.width, content.height);
    } else {
      gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    }
    gl.useProgram(program);
    gl.bindVertexArray(this.quadVao);
    gl.uniform2f(uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(uniforms.u_flipY, -1);
    this.#bindUnit(uniforms.u_scene, 0, this.scene.texture);
    this.#bindUnit(uniforms.u_light, 1, this.light.texture);
    this.#bindUnit(uniforms.u_bloom, 2, this.bloomA.texture);
    gl.uniform1f(uniforms.u_bloomStrength, bloom ? (bloom.strength ?? 0) : 0);
    gl.uniform1f(uniforms.u_vignette, vignette ? (vignette.strength ?? 0) : 0);
    gl.uniform1f(uniforms.u_vignetteStart, vignette ? (vignette.start ?? 0.55) : 0.55);
    this.#drawFullQuad();
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    return calls + 1;
  }

  #bloom(bloom) {
    const gl = this.gl;
    const threshold = bloom.threshold ?? 0.65;
    const sigma = Math.max(1, (bloom.blur ?? 24) / 2);
    const radius = Math.min(128, Math.ceil(sigma * 3));

    // Bright pass over the lit scene, into bloomA.
    const bright = this.brightProgram;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.useProgram(bright.program);
    gl.bindVertexArray(this.quadVao);
    gl.uniform2f(bright.uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(bright.uniforms.u_flipY, 1);
    this.#bindUnit(bright.uniforms.u_scene, 0, this.scene.texture);
    this.#bindUnit(bright.uniforms.u_light, 1, this.light.texture);
    gl.uniform1f(bright.uniforms.u_threshold, threshold);
    this.#drawFullQuad();

    // Separable blur, A -> B -> A.
    const blur = this.blurProgram;
    gl.useProgram(blur.program);
    gl.uniform2f(blur.uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(blur.uniforms.u_flipY, 1);
    // The blur steps in texels, so a radius given in world units has to be
    // converted or bloom would tighten as the render resolution rises.
    const texelScale = this.pixelWidth / this.width;
    gl.uniform1f(blur.uniforms.u_sigma, sigma * texelScale);
    gl.uniform1i(blur.uniforms.u_radius, Math.min(128, Math.ceil(radius * texelScale)));

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.framebuffer);
    this.#bindUnit(blur.uniforms.u_texture, 0, this.bloomA.texture);
    gl.uniform2f(blur.uniforms.u_direction, 1 / this.pixelWidth, 0);
    this.#drawFullQuad();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
    this.#bindUnit(blur.uniforms.u_texture, 0, this.bloomB.texture);
    gl.uniform2f(blur.uniforms.u_direction, 0, 1 / this.pixelHeight);
    this.#drawFullQuad();

    gl.bindVertexArray(null);
    return 3;
  }

  #bindUnit(location, unit, texture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(location, unit);
  }

  #drawFullQuad() {
    const gl = this.gl;
    const q = this.quad;
    const w = this.width;
    const h = this.height;
    const corners = [0, 0, w, 0, w, h, 0, h];
    for (let i = 0; i < 4; i++) {
      const o = i * VERTEX_FLOATS;
      q[o] = corners[2 * i];
      q[o + 1] = corners[2 * i + 1];
      q[o + 2] = corners[2 * i] / w;
      q[o + 3] = corners[2 * i + 1] / h;
      q[o + 4] = 1; q[o + 5] = 1; q[o + 6] = 1; q[o + 7] = 1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, q);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }
}
