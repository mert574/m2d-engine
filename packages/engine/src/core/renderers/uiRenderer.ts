import type {
  ArcOptions, BaseRenderer, ClipRect, HitShape, ImageOptions, LineOptions, ParticlesOptions,
  PathOptions, RectOptions, SpriteOptions, TextOptions, TextStyle, TransformOptions
} from './baseRenderer.ts';

/**
 * Screen-space (UI) view over a renderer backend.
 *
 * Wraps any BaseRenderer and forwards draw calls with `isScreenSpace: true`,
 * so UI code never needs to know which backend is in use. Backends only have
 * to implement BaseRenderer; the UI layer comes for free.
 */
export class UIRenderer {
  renderer: BaseRenderer;

  /** @param renderer - Backend renderer. */
  constructor(renderer: BaseRenderer) {
    this.renderer = renderer;
  }

  /**
   * Width of the UI coordinate space, in UI units.
   *
   * This is *not* the renderer's world size and *not* a pixel count. UI space
   * always covers the whole display, so this grows and shrinks with the
   * display's aspect ratio while the height stays put — which is what lets an
   * element anchored to the right edge sit at the real right edge. UI is
   * rasterized at the display's full pixel density regardless of the world's
   * render resolution, so it stays sharp. See `viewport.ts`.
   */
  get width(): number {
    return this.renderer.viewport.uiWidth;
  }

  /**
   * Height of the UI coordinate space, in UI units. Fixed at the design
   * height, so UI layout is stable as the window changes.
   */
  get height(): number {
    return this.renderer.viewport.uiHeight;
  }

  /**
   * Clear the presented surface (e.g. to paint a full-screen menu background).
   * @param color - Background colour; transparent clear if omitted.
   */
  clear(color?: string): void {
    this.renderer.clear(color);
  }

  beginFrame(): void {
    this.renderer.beginScreenFrame();
  }

  endFrame(): void {
    this.renderer.endScreenFrame();
  }

  drawRect(options: RectOptions): void {
    this.renderer.drawRect({ ...options, isScreenSpace: true });
  }

  drawText(options: TextOptions): void {
    this.renderer.drawText({ ...options, isScreenSpace: true });
  }

  drawImage(options: ImageOptions): void {
    this.renderer.drawImage({ ...options, isScreenSpace: true });
  }

  drawSprite(options: SpriteOptions): void {
    this.renderer.drawSprite({ ...options, isScreenSpace: true });
  }

  drawParticles(options: ParticlesOptions): void {
    this.renderer.drawParticles({ ...options, isScreenSpace: true });
  }

  drawLine(options: LineOptions): void {
    this.renderer.drawLine({ ...options, isScreenSpace: true });
  }

  drawArc(options: ArcOptions): void {
    this.renderer.drawArc({ ...options, isScreenSpace: true });
  }

  drawPath(options: PathOptions): void {
    this.renderer.drawPath({ ...options, isScreenSpace: true });
  }

  pushTransform(transform: TransformOptions = {}): void {
    this.renderer.pushTransform({ ...transform, isScreenSpace: true });
  }

  popTransform(): void {
    this.renderer.popTransform();
  }

  pushClip(rect: ClipRect): void {
    this.renderer.pushClip({ ...rect, isScreenSpace: true });
  }

  popClip(): void {
    this.renderer.popClip();
  }

  measureText(text: string, style?: TextStyle): { width: number; height: number } {
    return this.renderer.measureText(text, style);
  }

  hitTest(x: number, y: number, shape: HitShape): boolean {
    return this.renderer.hitTest(x, y, shape);
  }

  setCursor(style: string): void {
    this.renderer.setCursor(style);
  }
}
