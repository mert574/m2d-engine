import { UIElement, ANCHOR_ORIGINS } from './uiElement.js';

/**
 * An image drawn in screen space: a logo, an icon, a portrait.
 *
 * Sized from the image unless told otherwise, and scaled about its pivot, so
 * the natural thing to do — drop an image in and position it — needs no
 * measurements from the caller.
 */
export class UIImage extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {CanvasImageSource} options.image
   * @param {number} [options.width] - Defaults to the image's width
   * @param {number} [options.height] - Defaults to the image's height
   * @param {number} [options.imageScale=1] - Multiplier on the drawn size.
   *   Distinct from `UIElement`'s `scale`, which is a *transform* applied to
   *   the element and everything under it
   * @param {string} [options.tint] - Colour multiplied into every texel.
   *   Ignored by backends without the `tint` capability
   * @param {boolean} [options.interactive=false] - Take part in hit testing
   */
  constructor(options = {}) {
    const image = options.image;
    super({
      pivot: 'center',
      width: options.width ?? image?.width,
      height: options.height ?? image?.height,
      ...options
    });

    this.image = image;
    this.imageScale = options.imageScale ?? 1;
    this.tint = options.tint ?? null;
    this.interactive = options.interactive ?? false;
  }

  /** The drawn box: the frame scaled about the pivot. */
  get drawnFrame() {
    const width = (this.width ?? 0) * this.imageScale;
    const height = (this.height ?? 0) * this.imageScale;
    const [px, py] = ANCHOR_ORIGINS[this.pivot] ?? ANCHOR_ORIGINS['top-left'];
    return { x: this.x - px * width, y: this.y - py * height, width, height };
  }

  draw() {
    if (!this.game || !this.image) return;
    this.paint.drawImage({
      image: this.image,
      ...this.drawnFrame,
      ...(this.tint ? { tint: this.tint } : {})
    });
  }

  contains(x, y) {
    if (!this.interactive) return false;
    return super.contains(x, y);
  }
}
