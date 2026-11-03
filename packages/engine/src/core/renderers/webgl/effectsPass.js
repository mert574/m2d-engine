import {
  createProgram, createRenderTarget, resizeRenderTarget, deleteRenderTarget,
  setRenderTargetFiltering
} from './device.js';
import {
  ATTRIBUTES, VERTEX_FLOATS, VERTEX_SHADER, BLUR_FRAGMENT_SHADER,
  LIGHT_FRAGMENT_SHADER, BRIGHT_FRAGMENT_SHADER, COMPOSITE_FRAGMENT_SHADER,
  PRESENT_FRAGMENT_SHADER
} from './shaders.js';

/**
 * The world's offscreen surface, plus lighting and full-screen post effects.
 *
 * Three things need the world in a *texture* rather than as pixels already on
 * screen, and all three share the one `scene` target:
 *
 * - **a world render resolution of its own** — the resolution setting. The
 *   world rasterizes into `scene` at `pixelWidth x pixelHeight` and is scaled
 *   to the content rect on presentation (`present`).
 * - **lighting** — `scene` is multiplied by the accumulated light map.
 * - **post effects** — bloom samples `scene`, and the composite vignettes it.
 *
 * Nothing else about world drawing changes: the scene target carries a stencil
 * buffer, so clipping works exactly as it does on screen.
 *
 * The frame is then one of two shapes. With no lighting or post effects:
 *
 *   1. world pass draws into `scene` (with stencil)
 *   2. `present` blits `scene` to the content rect — one draw call
 *
 * and with either of them on:
 *
 *   1. world pass draws into `scene` (with stencil)
 *   2. lights accumulate additively into `light`, over the ambient clear
 *   3. optional bloom: bright-pass `scene * light` into `bloomA`, blur it
 *   4. composite `scene * light + bloom`, vignetted, to the default framebuffer
 *
 * The screen (UI) pass runs after all of that, straight to the default
 * framebuffer, so the HUD is never dimmed by ambient or smeared by bloom — and
 * never resampled by the world's resolution.
 */

/** Floats per light vertex, matching the shared vertex layout. */
const LIGHT_VERTS = 6;

export class EffectsPass {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {number} width - Coordinate-space width in world units
   * @param {number} height - Coordinate-space height in world units
   * @param {number} [pixelWidth=width] - Scene target width in pixels
   * @param {number} [pixelHeight=height] - Scene target height in pixels
   * @param {Object} [options]
   * @param {boolean} [options.smooth=true] - Filter the scene is upscaled
   *   with. False is the `worldFilter: 'nearest'` setting.
   */
  constructor(gl, width, height, pixelWidth = width, pixelHeight = height, options = {}) {
    this.gl = gl;
    /** Coordinate space of the world pass, in world units. */
    this.width = width;
    this.height = height;
    /** Pixel size of the offscreen targets — the world render resolution. */
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;

    // The world renders here, so this one needs a stencil for clips, and it is
    // the only target whose filter is the game's to choose — the light and
    // bloom maps are always sampled smoothly, since a blur is meaningless
    // otherwise.
    this.scene = createRenderTarget(gl, pixelWidth, pixelHeight, {
      stencil: true,
      smooth: options.smooth ?? true
    });
    // Stencil: shadowed lights mark the occluded region per light and draw
    // around it. See #drawShadowedLight.
    this.light = createRenderTarget(gl, pixelWidth, pixelHeight, { stencil: true });
    this.bloomA = createRenderTarget(gl, pixelWidth, pixelHeight);
    this.bloomB = createRenderTarget(gl, pixelWidth, pixelHeight);
    /**
     * Holds the blurred scene for the `blur` post effect. Allocated on
     * first use: most games never blur, and this is a full-size target.
     * @type {?object}
     */
    this.sceneBlur = null;

    this.lightProgram = createProgram(gl, VERTEX_SHADER, LIGHT_FRAGMENT_SHADER, ATTRIBUTES);
    this.brightProgram = createProgram(gl, VERTEX_SHADER, BRIGHT_FRAGMENT_SHADER, ATTRIBUTES);
    this.blurProgram = createProgram(gl, VERTEX_SHADER, BLUR_FRAGMENT_SHADER, ATTRIBUTES);
    this.compositeProgram = createProgram(gl, VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER, ATTRIBUTES);
    this.presentProgram = createProgram(gl, VERTEX_SHADER, PRESENT_FRAGMENT_SHADER, ATTRIBUTES);

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
    if (this.sceneBlur) deleteRenderTarget(gl, this.sceneBlur);
    this.sceneBlur = null;
    gl.deleteVertexArray(this.quadVao);
    gl.deleteVertexArray(this.lightVao);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.lightBuffer);
    gl.deleteProgram(this.lightProgram.program);
    gl.deleteProgram(this.brightProgram.program);
    gl.deleteProgram(this.blurProgram.program);
    gl.deleteProgram(this.compositeProgram.program);
    gl.deleteProgram(this.presentProgram.program);
  }

  /**
   * Choose the filter the world is upscaled with on presentation.
   * @param {boolean} smooth - Linear (true) or nearest (false, for pixel art)
   */
  setSceneFiltering(smooth) {
    setRenderTargetFiltering(this.gl, this.scene, smooth);
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
    resizeRenderTarget(gl, this.light, pixelWidth, pixelHeight, { stencil: true });
    resizeRenderTarget(gl, this.bloomA, pixelWidth, pixelHeight);
    resizeRenderTarget(gl, this.bloomB, pixelWidth, pixelHeight);
    if (this.sceneBlur) resizeRenderTarget(gl, this.sceneBlur, pixelWidth, pixelHeight);
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
   * Write one light's two triangles into `data` at float offset `o`.
   *
   * Local uv runs -1..1 so the shader's falloff is the distance from the
   * quad's centre. A spot rotates the quad so local +x is the beam, and
   * carries cos(half-cone) in the alpha slot; a point light carries the 2.0
   * sentinel the shader reads as "no cone".
   */
  static #writeLight(data, o, lightSource) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    const { x, y, radius, color, intensity } = lightSource;
    const spot = lightSource.cosCone !== undefined;
    const cos = spot ? Math.cos(lightSource.angle) : 1;
    const sin = spot ? Math.sin(lightSource.angle) : 0;
    const alpha = spot ? lightSource.cosCone : 2;
    for (let i = 0; i < LIGHT_VERTS; i++) {
      const [cx, cy] = corners[i];
      data[o] = x + (cx * cos - cy * sin) * radius;
      data[o + 1] = y + (cx * sin + cy * cos) * radius;
      data[o + 2] = cx;
      data[o + 3] = cy;
      data[o + 4] = color[0] * intensity;
      data[o + 5] = color[1] * intensity;
      data[o + 6] = color[2] * intensity;
      data[o + 7] = alpha;
      o += VERTEX_FLOATS;
    }
    return o;
  }

  /** Grow the light buffer to hold `floats`, keeping the GPU copy sized. */
  #reserveLightData(floats) {
    const gl = this.gl;
    if (this.lightData.length < floats) {
      this.lightData = new Float32Array(floats);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.lightData.byteLength, gl.DYNAMIC_DRAW);
    }
    return this.lightData;
  }

  /** Upload `floats` of lightData and draw them as triangles. */
  #drawLightData(floats) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lightData, 0, floats);
    gl.drawArrays(gl.TRIANGLES, 0, floats / VERTEX_FLOATS);
  }

  /**
   * Accumulate the frame's lights into the light map.
   *
   * Lights without shadows batch into one draw. Each shadowed light then
   * runs its own little pass: the shadow volumes of every caster near it
   * are marked in the stencil (each caster edge extruded away from the
   * light, past its radius), and the light's quad draws only where the
   * stencil stayed clear. The volumes never touch the colour buffer, so
   * the cost is two draws per shadowed light.
   *
   * @param {Array<{x, y, radius, color: number[], intensity: number,
   *   angle?: number, cosCone?: number, shadows?: boolean}>} lights
   * @param {number[]} ambient - Straight [r, g, b] the map clears to
   * @param {Array<{points: Float32Array, minX, minY, maxX, maxY}>} [casters]
   * @returns {number} GPU draw calls issued
   */
  drawLights(lights, ambient, casters = []) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.light.framebuffer);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(ambient[0], ambient[1], ambient[2], 1);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    if (lights.length === 0) return 0;

    const plain = [];
    const shadowed = [];
    for (const light of lights) {
      const blocked = light.shadows && casters.some((c) => c.z >= (light.z ?? 0));
      (blocked ? shadowed : plain).push(light);
    }

    const { program, uniforms } = this.lightProgram;
    gl.useProgram(program);
    gl.bindVertexArray(this.lightVao);
    gl.uniform2f(uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(uniforms.u_flipY, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    let drawCalls = 0;
    if (plain.length > 0) {
      const needed = plain.length * LIGHT_VERTS * VERTEX_FLOATS;
      const data = this.#reserveLightData(needed);
      let o = 0;
      for (const light of plain) o = EffectsPass.#writeLight(data, o, light);
      this.#drawLightData(needed);
      drawCalls += 1;
    }

    for (const light of shadowed) {
      drawCalls += this.#drawShadowedLight(light, casters);
    }

    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(null);
    return drawCalls;
  }

  /**
   * One shadowed light: mark its shadow volumes in the stencil, then draw
   * the light where the stencil stayed clear. Scissored to the light's
   * bounds, so per-light stencil clears stay cheap and volumes from one
   * light never leak into another's.
   * @returns {number} GPU draw calls issued
   */
  #drawShadowedLight(light, casters) {
    const gl = this.gl;
    const { x, y, radius } = light;

    // Scissor rect in target pixels. Entirely off the map means no work.
    const sx = this.pixelWidth / this.width;
    const sy = this.pixelHeight / this.height;
    const minX = Math.max(0, Math.floor((x - radius) * sx));
    const minY = Math.max(0, Math.floor((y - radius) * sy));
    const maxX = Math.min(this.pixelWidth, Math.ceil((x + radius) * sx));
    const maxY = Math.min(this.pixelHeight, Math.ceil((y + radius) * sy));
    if (minX >= maxX || minY >= maxY) return 0;

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(minX, minY, maxX - minX, maxY - minY);
    gl.clearStencil(0);
    gl.clear(gl.STENCIL_BUFFER_BIT);

    // Collect volumes from the casters the light can reach. Every edge is
    // extruded away from the light to past the radius; front and back edges
    // together cover the same union a silhouette would.
    const reach = radius * 2.2;
    let floats = 0;
    const data = [];
    const lightZ = light.z ?? 0;
    for (const caster of casters) {
      // Too low to reach a light hanging above it: a barrier under a lamp.
      if (caster.z < lightZ) continue;
      if (caster.minX > x + radius || caster.maxX < x - radius ||
          caster.minY > y + radius || caster.maxY < y - radius) continue;
      const pts = caster.points;
      const count = pts.length / 2;
      for (let i = 0; i < count; i++) {
        const ax = pts[i * 2], ay = pts[i * 2 + 1];
        const bx = pts[((i + 1) % count) * 2], by = pts[((i + 1) % count) * 2 + 1];
        const alen = Math.hypot(ax - x, ay - y) || 1;
        const blen = Math.hypot(bx - x, by - y) || 1;
        const a2x = ax + ((ax - x) / alen) * reach;
        const a2y = ay + ((ay - y) / alen) * reach;
        const b2x = bx + ((bx - x) / blen) * reach;
        const b2y = by + ((by - y) / blen) * reach;
        // Two triangles: a, b, b2 and a, b2, a2.
        data.push(ax, ay, bx, by, b2x, b2y, ax, ay, b2x, b2y, a2x, a2y);
      }
    }

    let drawCalls = 0;
    gl.enable(gl.STENCIL_TEST);
    if (data.length > 0) {
      const verts = data.length / 2;
      const buffer = this.#reserveLightData(verts * VERTEX_FLOATS);
      let o = 0;
      for (let i = 0; i < data.length; i += 2) {
        buffer[o] = data[i];
        buffer[o + 1] = data[i + 1];
        // uv at the centre: full falloff, but the colour write is masked
        // off anyway — only the stencil matters here.
        buffer[o + 2] = 0;
        buffer[o + 3] = 0;
        buffer[o + 4] = 0;
        buffer[o + 5] = 0;
        buffer[o + 6] = 0;
        buffer[o + 7] = 2;
        o += VERTEX_FLOATS;
      }
      gl.stencilFunc(gl.ALWAYS, 1, 0xFF);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.colorMask(false, false, false, false);
      this.#drawLightData(verts * VERTEX_FLOATS);
      gl.colorMask(true, true, true, true);
      floats = verts * VERTEX_FLOATS;
      drawCalls += 1;
    }

    // The light itself, everywhere its shadows are not.
    gl.stencilFunc(gl.EQUAL, 0, 0xFF);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    const lightFloats = LIGHT_VERTS * VERTEX_FLOATS;
    const buffer = this.#reserveLightData(Math.max(floats, lightFloats));
    EffectsPass.#writeLight(buffer, 0, light);
    this.#drawLightData(lightFloats);
    drawCalls += 1;

    return drawCalls;
  }

  /**
   * Present the world to the default framebuffer with no lighting and no post
   * effects — a straight scaled blit of the scene target into the content
   * rect, at whatever filter `setSceneFiltering` last chose.
   *
   * This is the path every game that only sets a resolution takes, so it does
   * the minimum: no light map to clear, no bloom texture to clear, one draw.
   *
   * @param {{x: number, y: number, width: number, height: number}} [content] -
   *   Where the world lands on the backing store, in GL (bottom-left) pixels
   * @returns {number} GPU draw calls issued
   */
  present(content) {
    const gl = this.gl;
    const { program, uniforms } = this.presentProgram;

    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    this.#drawFullQuad();
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    return 1;
  }

  /**
   * Composite the frame to the default framebuffer.
   * @param {Object|null} post - { bloom: {threshold, strength, blur},
   *   vignette: {strength, start}, blur: {strength}, distortion: {strength},
   *   chromatic: {strength}, grade: {shadows, highlights, amount, saturation,
   *   contrast}, grain: {strength}, scanlines: {strength, density},
   *   glitch: {strength}, flash: {color, strength} }. Colours are parsed
   *   `[r, g, b]` triples in 0..1 (see WebGLRenderer.setPostEffects)
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

    // Defocus the whole world first, so everything downstream — the bloom's
    // bright pass included — reads the softened image and the glow agrees
    // with what is on screen. This is what sits behind a modal: the game
    // reads as *behind* the menu rather than merely dimmed.
    const blurStrength = post?.blur?.strength ?? 0;
    let sceneTexture = this.scene.texture;
    if (blurStrength > 0) {
      calls += this.#blurScene(blurStrength);
      sceneTexture = this.sceneBlur.texture;
    }

    if (bloom && (bloom.strength ?? 0) > 0) {
      calls += this.#bloom(bloom, sceneTexture);
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
    this.#bindUnit(uniforms.u_scene, 0, sceneTexture);
    this.#bindUnit(uniforms.u_light, 1, this.light.texture);
    this.#bindUnit(uniforms.u_bloom, 2, this.bloomA.texture);
    gl.uniform1f(uniforms.u_bloomStrength, bloom ? (bloom.strength ?? 0) : 0);
    gl.uniform1f(uniforms.u_vignette, vignette ? (vignette.strength ?? 0) : 0);
    gl.uniform1f(uniforms.u_vignetteStart, vignette ? (vignette.start ?? 0.55) : 0.55);

    // The lens, grade and surface effects. Every one defaults to "off", so a
    // post object that only asks for bloom pays for nothing else.
    const grade = post?.grade;
    const shadows = grade?.shadows ?? [1, 1, 1];
    const highlights = grade?.highlights ?? [1, 1, 1];
    const flash = post?.flash;
    const flashColor = flash?.color ?? [1, 1, 1];
    gl.uniform1f(uniforms.u_time, performance.now() / 1000);
    gl.uniform1f(uniforms.u_distortion, post?.distortion?.strength ?? 0);
    gl.uniform1f(uniforms.u_chromatic, post?.chromatic?.strength ?? 0);
    gl.uniform3f(uniforms.u_gradeShadows, shadows[0], shadows[1], shadows[2]);
    gl.uniform3f(uniforms.u_gradeHighlights, highlights[0], highlights[1], highlights[2]);
    gl.uniform1f(uniforms.u_gradeAmount, grade ? (grade.amount ?? 1) : 0);
    gl.uniform1f(uniforms.u_saturation, grade?.saturation ?? 1);
    gl.uniform1f(uniforms.u_contrast, grade?.contrast ?? 1);
    gl.uniform1f(uniforms.u_grain, post?.grain?.strength ?? 0);
    gl.uniform1f(uniforms.u_scanlines, post?.scanlines?.strength ?? 0);
    gl.uniform1f(uniforms.u_scanDensity, post?.scanlines?.density ?? 1.6);
    gl.uniform1f(uniforms.u_glitch, post?.glitch?.strength ?? 0);
    gl.uniform3f(uniforms.u_flashColor, flashColor[0], flashColor[1], flashColor[2]);
    gl.uniform1f(uniforms.u_flashStrength, flash?.strength ?? 0);

    this.#drawFullQuad();
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    return calls + 1;
  }

  /**
   * Separable Gaussian over the whole scene, into `sceneBlur`.
   * `bloomB` is borrowed as the horizontal intermediate — it is only read
   * by the bloom pass, which runs after this.
   * @returns {number} GPU draw calls issued
   */
  #blurScene(strength) {
    const gl = this.gl;
    if (!this.sceneBlur) {
      this.sceneBlur = createRenderTarget(gl, this.pixelWidth, this.pixelHeight);
    }

    const sigma = Math.max(0.5, strength / 2);
    const radius = Math.min(128, Math.ceil(sigma * 3));
    // The kernel steps in texels, so a strength given in world units has to
    // be converted or the blur would tighten as the render resolution rises.
    const texelScale = this.pixelWidth / this.width;

    const blur = this.blurProgram;
    gl.useProgram(blur.program);
    gl.bindVertexArray(this.quadVao);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.uniform2f(blur.uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(blur.uniforms.u_flipY, 1);
    gl.uniform1f(blur.uniforms.u_sigma, sigma * texelScale);
    gl.uniform1i(blur.uniforms.u_radius, Math.min(128, Math.ceil(radius * texelScale)));

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.framebuffer);
    this.#bindUnit(blur.uniforms.u_texture, 0, this.scene.texture);
    gl.uniform2f(blur.uniforms.u_direction, 1 / this.pixelWidth, 0);
    this.#drawFullQuad();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneBlur.framebuffer);
    this.#bindUnit(blur.uniforms.u_texture, 0, this.bloomB.texture);
    gl.uniform2f(blur.uniforms.u_direction, 0, 1 / this.pixelHeight);
    this.#drawFullQuad();

    gl.bindVertexArray(null);
    return 2;
  }

  #bloom(bloom, sceneTexture = this.scene.texture) {
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
    this.#bindUnit(bright.uniforms.u_scene, 0, sceneTexture);
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
