/**
 * Thin WebGL2 device layer: context creation, shader programs, buffers,
 * textures and framebuffers. Knows nothing about the renderer contract.
 */

export function createContext(canvas, attributes) {
  const gl = canvas.getContext('webgl2', attributes);
  if (!gl) {
    throw new Error('WebGLRenderer: WebGL2 is not available on this canvas/browser');
  }
  return gl;
}

export function createProgram(gl, vertexSource, fragmentSource, attributeLocations = {}) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  for (const [name, location] of Object.entries(attributeLocations)) {
    gl.bindAttribLocation(program, location, name);
  }
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGLRenderer: program link failed: ${log}`);
  }

  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGLRenderer: shader compile failed: ${log}\n${source}`);
  }
  return shader;
}

/**
 * Create an RGBA texture from an image-like source or raw pixels.
 * Textures are premultiplied on upload so the renderer can blend with
 * (ONE, ONE_MINUS_SRC_ALPHA) throughout.
 *
 * `UNPACK_PREMULTIPLY_ALPHA_WEBGL` applies to ArrayBufferView uploads as well
 * as DOM sources, so it must only be set for sources that carry straight
 * alpha. Raw `pixels` arrive premultiplied already (the gradient LUT is baked
 * that way); premultiplying them again squares their alpha, which shows up as
 * translucent gradient stops rendering far too dark.
 */
export function createTexture(gl, { source, pixels, width, height, smooth = true, premultiply = !!source }) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (source) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels || null);
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  setTextureFiltering(gl, smooth);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function setTextureFiltering(gl, smooth) {
  const filter = smooth ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
}

/** A colour-only render target (no depth/stencil). */
export function createRenderTarget(gl, width, height, { stencil = false } = {}) {
  const texture = createTexture(gl, { width, height, smooth: true });
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  // A target the world pass renders into needs a stencil, or clipping — which
  // is stencil reference counting here — silently stops working on it.
  let stencilBuffer = null;
  if (stencil) {
    stencilBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencilBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencilBuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, stencilBuffer, width, height };
}

export function resizeRenderTarget(gl, target, width, height) {
  if (target.width === width && target.height === height) return;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  if (target.stencilBuffer) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, target.stencilBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  target.width = width;
  target.height = height;
}

export function deleteRenderTarget(gl, target) {
  if (!target) return;
  if (target.stencilBuffer) gl.deleteRenderbuffer(target.stencilBuffer);
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}
