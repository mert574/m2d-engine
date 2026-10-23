import { createProgram } from './device.js';
import {
  ATTRIBUTES, VERTEX_FLOATS, VERTEX_SHADER, FRAGMENT_SHADER,
  MODE_SOLID, MODE_TEXTURE, MODE_GRADIENT, MODE_SHADOW
} from './shaders.js';

const NO_BOUNDS = [0, 0, 1, 1];

/**
 * Accumulates vertices sharing one paint state (mode, texture, gradient,
 * shadow colour) and submits them in a single draw call.
 *
 * Flushes happen on a paint-state change, when the buffers are full, and
 * when the renderer asks (end of pass, stencil state change, render-target
 * switch). Each flush is one `drawCalls`; each uniform/texture change applied
 * at flush time is one `stateChanges`.
 */
export class Batch {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {Object} stats - Renderer stats object to count into
   * @param {number} [maxVertices]
   */
  constructor(gl, stats, maxVertices = 16384) {
    this.gl = gl;
    this.stats = stats;

    const { program, uniforms } = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, ATTRIBUTES);
    this.program = program;
    this.uniforms = uniforms;

    this.vertexData = new Float32Array(maxVertices * VERTEX_FLOATS);
    this.indexData = new Uint32Array(maxVertices * 3);
    this.vertexCount = 0;
    this.indexCount = 0;

    this.vao = gl.createVertexArray();
    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
    const stride = VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(ATTRIBUTES.a_position);
    gl.vertexAttribPointer(ATTRIBUTES.a_position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(ATTRIBUTES.a_uv);
    gl.vertexAttribPointer(ATTRIBUTES.a_uv, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(ATTRIBUTES.a_color);
    gl.vertexAttribPointer(ATTRIBUTES.a_color, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(ATTRIBUTES.a_uvBounds);
    gl.vertexAttribPointer(ATTRIBUTES.a_uvBounds, 4, gl.FLOAT, false, stride, 32);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);

    /** Paint state of the vertices currently accumulated. */
    this.key = null;
    /** Paint state last applied to the GPU, for stateChanges counting. */
    this.applied = { mode: -1, texture: null, gradientType: -1, gradient: null, shadowColor: null };
    this.resolution = [0, 0];
    this.flipY = -1;

    /** Optional pixel-space bounds of everything pushed since trackBounds(). */
    this.bounds = null;
  }

  /** Start recording the bounds of pushed positions (null to stop). */
  trackBounds(enabled) {
    this.bounds = enabled ? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } : null;
  }

  destroy() {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteProgram(this.program);
  }

  /**
   * Set the output size. Default framebuffer output is y-flipped (pixel
   * y down → clip y up); offscreen render targets are not, so that their
   * texture rows end up in the same top-down order as pixel space.
   */
  setTarget(width, height, flipY) {
    if (this.resolution[0] !== width || this.resolution[1] !== height || this.flipY !== flipY) {
      this.flush();
      this.resolution = [width, height];
      this.flipY = flipY ? -1 : 1;
      this.resolutionDirty = true;
    }
  }

  /**
   * Start (or continue) a batch with the given paint state.
   * @param {{mode: number, texture?: WebGLTexture, gradientType?: number, gradient?: number[], shadowColor?: number[]}} key
   */
  begin(key) {
    if (this.key && !sameKey(this.key, key)) this.flush();
    this.key = key;
  }

  /**
   * Append geometry.
   * @param {number[]} positions - Pixel-space [x, y, ...]
   * @param {number[]|null} uvs - [u, v, ...] or null for solid paint
   * @param {number[]} color - Premultiplied [r, g, b, a] for every vertex
   * @param {number[]} indices - Into `positions`
   * @param {number[]} [uvBounds] - [u0, v0, u1, v1] clamp for texture paint
   */
  push(positions, uvs, color, indices, uvBounds = NO_BOUNDS) {
    const vertexCount = positions.length / 2;
    if (vertexCount === 0 || indices.length === 0) return;
    this.#ensureCapacity(vertexCount, indices.length);

    const base = this.vertexCount;
    let o = base * VERTEX_FLOATS;
    const vd = this.vertexData;
    const b = this.bounds;
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[2 * i];
      const y = positions[2 * i + 1];
      if (b) {
        if (x < b.minX) b.minX = x;
        if (x > b.maxX) b.maxX = x;
        if (y < b.minY) b.minY = y;
        if (y > b.maxY) b.maxY = y;
      }
      vd[o++] = x;
      vd[o++] = y;
      vd[o++] = uvs ? uvs[2 * i] : 0;
      vd[o++] = uvs ? uvs[2 * i + 1] : 0;
      vd[o++] = color[0]; vd[o++] = color[1]; vd[o++] = color[2]; vd[o++] = color[3];
      vd[o++] = uvBounds[0]; vd[o++] = uvBounds[1]; vd[o++] = uvBounds[2]; vd[o++] = uvBounds[3];
    }
    const id = this.indexData;
    let k = this.indexCount;
    for (let i = 0; i < indices.length; i++) id[k++] = base + indices[i];
    this.vertexCount += vertexCount;
    this.indexCount = k;
  }

  #ensureCapacity(vertexCount, indexCount) {
    const maxVertices = this.vertexData.length / VERTEX_FLOATS;
    if (vertexCount > maxVertices || indexCount > this.indexData.length) {
      this.flush();
      const gl = this.gl;
      const newMax = Math.max(vertexCount, maxVertices * 2);
      this.vertexData = new Float32Array(newMax * VERTEX_FLOATS);
      this.indexData = new Uint32Array(Math.max(indexCount, newMax * 3));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData.byteLength, gl.DYNAMIC_DRAW);
      return;
    }
    if (this.vertexCount + vertexCount > maxVertices || this.indexCount + indexCount > this.indexData.length) {
      this.flush();
    }
  }

  /** Submit accumulated geometry as one draw call. */
  flush() {
    if (this.indexCount === 0) return;
    const gl = this.gl;
    const key = this.key;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    this.#applyState(key);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData, 0, this.vertexCount * VERTEX_FLOATS);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.indexData, 0, this.indexCount);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    this.stats.drawCalls++;
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  #applyState(key) {
    const gl = this.gl;
    const u = this.uniforms;
    const applied = this.applied;
    let changes = 0;

    if (this.resolutionDirty) {
      gl.uniform2f(u.u_resolution, this.resolution[0], this.resolution[1]);
      gl.uniform1f(u.u_flipY, this.flipY);
      this.resolutionDirty = false;
      changes++;
    }
    if (applied.mode !== key.mode) {
      gl.uniform1i(u.u_mode, key.mode);
      applied.mode = key.mode;
      changes++;
    }
    const texture = key.texture || null;
    if (key.mode !== MODE_SOLID && applied.texture !== texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(u.u_texture, 0);
      applied.texture = texture;
      changes++;
    }
    if (key.mode === MODE_GRADIENT) {
      const g = key.gradient;
      if (applied.gradientType !== key.gradientType || !sameArray(applied.gradient, g)) {
        gl.uniform1i(u.u_gradientType, key.gradientType);
        gl.uniform4f(u.u_gradient, g[0], g[1], g[2], g[3]);
        applied.gradientType = key.gradientType;
        applied.gradient = g.slice();
        changes++;
      }
    }
    if (key.mode === MODE_SHADOW && !sameArray(applied.shadowColor, key.shadowColor)) {
      const c = key.shadowColor;
      gl.uniform4f(u.u_shadowColor, c[0], c[1], c[2], c[3]);
      applied.shadowColor = c.slice();
      changes++;
    }
    this.stats.stateChanges += changes;
  }

  /** Forget GPU-side state (after another program ran or a target switch). */
  invalidateState() {
    this.applied = { mode: -1, texture: null, gradientType: -1, gradient: null, shadowColor: null };
    this.resolutionDirty = true;
  }
}

function sameKey(a, b) {
  if (a.mode !== b.mode) return false;
  if (a.mode === MODE_SOLID) return true;
  if ((a.texture || null) !== (b.texture || null)) return false;
  if (a.mode === MODE_GRADIENT) {
    return a.gradientType === b.gradientType && sameArray(a.gradient, b.gradient);
  }
  if (a.mode === MODE_SHADOW) return sameArray(a.shadowColor, b.shadowColor);
  return true;
}

function sameArray(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export { MODE_SOLID, MODE_TEXTURE, MODE_GRADIENT, MODE_SHADOW };
