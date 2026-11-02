/**
 * The drawing surface a UI element sees.
 *
 * `UIRenderer` is the raw screen-space view over the backend: it takes
 * literal colours, literal font strings and no notion of who is drawing.
 * That is the right contract for a renderer and the wrong one for a
 * component, which would otherwise have to resolve its own theme tokens,
 * multiply in its own inherited opacity and remember the UI font on every
 * call — three things every component would get subtly differently.
 *
 * A painter sits between them and does exactly three jobs:
 *
 * 1. **Resolves tokens.** `fillStyle: '$color.accent.default'` reaches the
 *    renderer as a colour, including inside gradient stops. Literals pass
 *    through untouched, so a component is never forced through the theme.
 * 2. **Applies inherited opacity.** An element's effective alpha is the
 *    product of its own and every ancestor's. The renderer takes
 *    `globalAlpha` per draw call rather than as pushable state, so somebody
 *    has to multiply it into every call; doing it here means a component
 *    fades correctly without knowing it can be faded.
 * 3. **Supplies typographic defaults.** Text with no family set is set in
 *    the theme's UI face, not the backend's `system-ui` fallback.
 *
 * Elements reach theirs as `this.paint`. Everything else about the renderer
 * — the transform and clip stacks, `measureText`, the cursor — is forwarded
 * unchanged, so the painter never becomes a second drawing contract to
 * learn.
 */

/**
 * Options whose value may be a `$token` reference, by the kind of value
 * expected. Colours additionally accept a gradient descriptor, whose stops
 * are resolved one by one.
 */
const COLOUR_KEYS = ['fillStyle', 'strokeStyle', 'tint'];
const SCALAR_KEYS = ['cornerRadius', 'lineWidth', 'fontSize', 'fontWeight', 'fontFamily',
  'fontStyle', 'letterSpacing'];
const OBJECT_KEYS = ['shadow'];

export class UIPainter {
  /**
   * @param {import('./uiElement.js').UIElement} element - The element that
   *   draws through this painter; its alpha and theme are read per call, so
   *   moving an element between parents needs no rebinding
   */
  constructor(element) {
    this.element = element;
  }

  /** The screen-space renderer, or null before the element has a game. */
  get renderer() {
    return this.element.game?.uiRenderer ?? null;
  }

  /** Width of UI space, in UI units. */
  get width() {
    return this.renderer?.width ?? 0;
  }

  /** Height of UI space, in UI units. */
  get height() {
    return this.renderer?.height ?? 0;
  }

  /** Whether the backend implements an optional feature. */
  supports(feature) {
    return this.renderer?.supports(feature) ?? false;
  }

  // === Draw calls ===

  drawRect(options) {
    this.renderer?.drawRect(this.#prepare(options));
  }

  drawText(options) {
    this.renderer?.drawText(this.#prepare(options, true));
  }

  drawImage(options) {
    this.renderer?.drawImage(this.#prepare(options));
  }

  drawSprite(options) {
    this.renderer?.drawSprite(this.#prepare(options));
  }

  drawLine(options) {
    this.renderer?.drawLine(this.#prepare(options));
  }

  drawArc(options) {
    this.renderer?.drawArc(this.#prepare(options));
  }

  drawPath(options) {
    this.renderer?.drawPath(this.#prepare(options));
  }

  drawParticles(options) {
    this.renderer?.drawParticles(this.#prepare(options));
  }

  // === Pass-through ===

  /**
   * Measure text, with the same typographic defaults `drawText` applies —
   * otherwise a component would lay out against one font and draw in
   * another.
   */
  measureText(text, style = {}) {
    // Tokens resolved, opacity not: how transparent the text will be has no
    // bearing on how wide it is.
    return this.renderer?.measureText(text, this.#prepare(style, true, false))
      ?? { width: 0, height: 0 };
  }

  pushTransform(transform) {
    this.renderer?.pushTransform(transform);
  }

  popTransform() {
    this.renderer?.popTransform();
  }

  pushClip(rect) {
    this.renderer?.pushClip(rect);
  }

  popClip() {
    this.renderer?.popClip();
  }

  setCursor(style) {
    this.renderer?.setCursor(style);
  }

  // === Internals ===

  /**
   * Resolve tokens, fold in inherited opacity and apply font defaults.
   *
   * Returns the input object itself when there is nothing to change, so the
   * common case of an already-literal style allocates nothing.
   *
   * @param {Object} options - Renderer draw options, possibly with tokens
   * @param {boolean} [isText=false] - Apply typographic defaults
   * @param {boolean} [withAlpha=true] - Fold in the inherited opacity
   */
  #prepare(options, isText = false, withAlpha = true) {
    const theme = this.element.theme;
    const alpha = withAlpha ? this.element.alpha : 1;
    let out = options;

    // Cloned lazily: the first field that actually changes creates the copy.
    const write = (key, value) => {
      if (out === options) out = { ...options };
      out[key] = value;
    };

    if (theme) {
      for (const key of COLOUR_KEYS) {
        const value = options[key];
        if (value === undefined) continue;
        const resolved = resolveColour(theme, value);
        if (resolved !== value) write(key, resolved);
      }
      for (const key of SCALAR_KEYS) {
        const value = options[key];
        if (typeof value !== 'string' || value.charCodeAt(0) !== 36) continue;
        write(key, theme.resolve(value));
      }
      for (const key of OBJECT_KEYS) {
        const value = options[key];
        if (typeof value !== 'string' || value.charCodeAt(0) !== 36) continue;
        const resolved = theme.resolve(value);
        // `elevation.none` is null; drop the key rather than passing null,
        // so backends take their no-shadow path.
        if (resolved) write(key, resolved);
        else if (out === options) { out = { ...options }; delete out[key]; }
        else delete out[key];
      }
      if (isText && options.fontFamily === undefined) {
        write('fontFamily', theme.get('font.family'));
      }
    }

    if (alpha < 1) {
      write('globalAlpha', (options.globalAlpha ?? 1) * alpha);
    }

    return out;
  }
}

/**
 * Resolve a colour that may be a token, a literal, or a gradient descriptor
 * whose stops are themselves tokens.
 */
function resolveColour(theme, value) {
  if (typeof value === 'string') return theme.resolve(value);
  if (value && Array.isArray(value.stops)) {
    let changed = false;
    const stops = value.stops.map((stop) => {
      const colour = theme.resolve(stop.color);
      if (colour === stop.color) return stop;
      changed = true;
      return { ...stop, color: colour };
    });
    return changed ? { ...value, stops } : value;
  }
  return value;
}
