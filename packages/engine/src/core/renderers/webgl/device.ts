/**
 * Thin WebGL2 device layer: context creation, shader programs, buffers,
 * textures and framebuffers. Knows nothing about the renderer contract.
 */

import type { TextureSource } from '../baseRenderer.ts';

/** A linked program and the uniform locations it declared. */
export interface ProgramInfo {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

/** What every texture upload shares. */
interface TextureCommon {
  /** Linear (true) or nearest filtering. */
  smooth?: boolean;
  /** Premultiply on upload; true for a DOM source, false for raw pixels. */
  premultiply?: boolean;
}

/** An image-like source, or a size with optional raw pixels. */
export type TextureOptions =
  | (TextureCommon & { source: TextureSource })
  | (TextureCommon & { pixels?: ArrayBufferView | null; width: number; height: number });

/** A colour render target and what it was built with. */
export interface RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  stencilBuffer: WebGLRenderbuffer | null;
  width: number;
  height: number;
  smooth: boolean;
}

/**
 * WebGL hands back null when it cannot make a resource, which in practice
 * means the context is lost. Saying so here beats failing a few calls later
 * on a null handle.
 */
export function created<T>(resource: T | null, what: string, gl: WebGL2RenderingContext): T {
  if (resource) return resource;
  const lost = gl.isContextLost() ? ' (the context is lost)' : '';
  throw new Error(`WebGLRenderer: could not create a ${what}${lost}`);
}

export function createContext(
  canvas: HTMLCanvasElement, attributes?: WebGLContextAttributes
): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', attributes);
  if (!gl) {
    throw new Error('WebGLRenderer: WebGL2 is not available on this canvas/browser');
  }
  return gl;
}

export function createProgram(
  gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string,
  attributeLocations: Record<string, number> = {}
): ProgramInfo {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = created(gl.createProgram(), 'program', gl);
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

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count: number = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
}

function compileShader(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader {
  const shader = created(gl.createShader(type), 'shader', gl);
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
export function createTexture(gl: WebGL2RenderingContext, options: TextureOptions): WebGLTexture {
  const source = 'source' in options ? options.source : null;
  const { smooth = true, premultiply = !!source } = options;
  const texture = created(gl.createTexture(), 'texture', gl);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (source) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } else if (!('source' in options)) {
    const { pixels, width, height } = options;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels || null);
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  setTextureFiltering(gl, smooth);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function setTextureFiltering(gl: WebGL2RenderingContext, smooth: boolean): void {
  const filter = smooth ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
}

/**
 * A colour-only render target (no depth/stencil by default).
 *
 * `smooth` is the filter used when the target is sampled — which for the
 * scene target is the filter the world is *upscaled* with on its way to the
 * screen. Pixel-art games want it off; see `worldFilter`.
 */
export function createRenderTarget(
  gl: WebGL2RenderingContext, width: number, height: number,
  { stencil = false, smooth = true }: { stencil?: boolean; smooth?: boolean } = {}
): RenderTarget {
  const texture = createTexture(gl, { width, height, smooth });
  const framebuffer = created(gl.createFramebuffer(), 'framebuffer', gl);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  // A target the world pass renders into needs a stencil, or clipping — which
  // is stencil reference counting here — silently stops working on it.
  let stencilBuffer: WebGLRenderbuffer | null = null;
  if (stencil) {
    stencilBuffer = created(gl.createRenderbuffer(), 'renderbuffer', gl);
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencilBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencilBuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, stencilBuffer, width, height, smooth };
}

/**
 * Change the filter a render target is sampled with, in place.
 *
 * Filtering is texture state and survives the `texImage2D` in
 * `resizeRenderTarget`, so this only has to run when the setting itself
 * changes.
 *
 * @param smooth - Linear (true) or nearest (false).
 */
export function setRenderTargetFiltering(
  gl: WebGL2RenderingContext, target: RenderTarget | null, smooth: boolean
): void {
  if (!target || target.smooth === smooth) return;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  setTextureFiltering(gl, smooth);
  target.smooth = smooth;
}

export function resizeRenderTarget(
  gl: WebGL2RenderingContext, target: RenderTarget, width: number, height: number
): void {
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

export function deleteRenderTarget(gl: WebGL2RenderingContext, target: RenderTarget | null): void {
  if (!target) return;
  if (target.stencilBuffer) gl.deleteRenderbuffer(target.stencilBuffer);
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}
