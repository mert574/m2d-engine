import { BaseUIRenderer } from './baseUIRenderer.js';
import { HTMLRendererBase } from './htmlRendererBase.js';

export class HTMLUIRenderer extends BaseUIRenderer {
  constructor() {
    super();
    this.base = new HTMLRendererBase();
  }

  init(element, options = {}) {
    this.base.container = element;
    this.base.width = options.width || element.clientWidth;
    this.base.height = options.height || element.clientHeight;

    element.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

    // Register element pools
    this.base.registerPool('rects', 'position:absolute;display:none;');
    this.base.registerPool('texts', 'position:absolute;display:none;white-space:nowrap;');
    this.base.registerPool('buttons', 'position:absolute;display:none;cursor:pointer;border:none;outline:none;pointer-events:auto;', 'button');
    this.base.registerPool('images', 'position:absolute;display:none;background-size:contain;background-repeat:no-repeat;');

    this.base.initPools(options.poolSize || 100);
  }

  get width() { return this.base.width; }
  get height() { return this.base.height; }

  destroy() {
    this.base.destroy();
  }

  resize(width, height) {
    this.base.width = width;
    this.base.height = height;
    this.base.container.style.width = `${width}px`;
    this.base.container.style.height = `${height}px`;
  }

  clear() {
    this.base.hideActiveElements(element => {
      element.onclick = null;
      element.onmouseenter = null;
      element.onmouseleave = null;
    });
    this.base.resetPools();
  }

  beginFrame() {
    this.base.updateLayoutCache();
    this.base.hideActiveElements(element => {
      element.onclick = null;
      element.onmouseenter = null;
      element.onmouseleave = null;
    });
    this.base.resetPools();
    this.base.stats.drawCalls = 0;
    this.base.updateFPS();
  }

  endFrame() {
    this.base.endFrameBase();
    if (this.base.stats.activeElements > 1000) {
      console.warn(`High element count: ${this.base.stats.activeElements}`);
    }
  }

  drawRect({ x, y, width, height, fillStyle, strokeStyle, lineWidth = 1 }) {
    const element = this.base.getElement('rects');
    const { x: screenX, y: screenY, scale } = this.base.convertCoordinates(x, y);

    element.style.display = 'block';
    element.style.left = `${screenX}px`;
    element.style.top = `${screenY}px`;
    element.style.width = `${width * scale}px`;
    element.style.height = `${height * scale}px`;
    element.style.backgroundColor = fillStyle || 'transparent';
    element.style.border = strokeStyle ? `${lineWidth * scale}px solid ${strokeStyle}` : 'none';

    this.base.markActive(element);
  }

  drawText({ text, x, y, color, fillStyle, font = '16px Arial', align, textAlign, baseline = 'top', textBaseline, fontSize, fontFamily = 'Arial', properties = {} }) {
    const element = this.base.getElement('texts');
    const { x: screenX, y: screenY, scale } = this.base.convertCoordinates(x, y);

    const finalColor = properties.color || color || fillStyle || '#000';
    const finalAlign = align || textAlign || 'left';
    const finalBaseline = baseline || textBaseline || 'top';

    const size = properties.fontSize || fontSize || font.split('px')[0];
    const scaledFontSize = (typeof size === 'string' ? parseFloat(size) : size) * scale;

    element.style.display = 'block';
    element.style.position = 'absolute';
    element.style.color = finalColor;
    element.style.fontSize = `${scaledFontSize}px`;
    element.style.fontFamily = fontFamily;
    element.textContent = text;

    // Measure for alignment
    const rect = element.getBoundingClientRect();

    // Horizontal alignment
    element.style.left = finalAlign === 'center' ? `${screenX - rect.width / 2}px` :
                         finalAlign === 'right' ? `${screenX - rect.width}px` :
                         `${screenX}px`;

    // Vertical alignment
    element.style.top = finalBaseline === 'middle' ? `${screenY - rect.height / 2}px` :
                        finalBaseline === 'bottom' ? `${screenY - rect.height}px` :
                        `${screenY}px`;

    this.base.markActive(element);
  }

  drawButton({ x, y, width, height, text, style = {}, onClick }) {
    const element = this.base.getElement('buttons');
    const { x: screenX, y: screenY, scale } = this.base.convertCoordinates(x, y);

    element.style.display = 'block';
    element.style.left = `${screenX - (width * scale) / 2}px`;
    element.style.top = `${screenY - (height * scale) / 2}px`;
    element.style.width = `${width * scale}px`;
    element.style.height = `${height * scale}px`;
    element.style.backgroundColor = style.backgroundColor || '#ffffff';
    element.style.color = style.textColor || '#000000';
    element.style.fontSize = `${(style.fontSize || 16) * scale}px`;
    element.style.fontFamily = style.fontFamily || 'Arial';
    element.style.borderRadius = `${(style.borderRadius || 4) * scale}px`;
    element.style.transition = 'background-color 0.2s';
    element.textContent = text;
    element.onclick = onClick;

    if (style.hoverColor) {
      const defaultColor = style.backgroundColor || '#ffffff';
      element.onmouseenter = () => element.style.backgroundColor = style.hoverColor;
      element.onmouseleave = () => element.style.backgroundColor = defaultColor;
    }

    this.base.markActive(element);
  }

  drawImage({ image, x, y, width, height }) {
    const element = this.base.getElement('images');
    const { x: screenX, y: screenY, scale } = this.base.convertCoordinates(x, y);

    element.style.display = 'block';
    element.style.left = `${screenX - (width * scale) / 2}px`;
    element.style.top = `${screenY - (height * scale) / 2}px`;
    element.style.width = `${width * scale}px`;
    element.style.height = `${height * scale}px`;
    element.style.backgroundImage = `url(${image.src})`;

    this.base.markActive(element);
  }

  drawPath() {
    // Not implemented for HTML renderer
  }

  pushClip() {
    // Not implemented for HTML renderer
  }

  popClip() {
    // Not implemented for HTML renderer
  }

  measureText(text, { font = '16px Arial' }) {
    const element = this.base.getElement('texts');
    element.style.visibility = 'hidden';
    element.style.display = 'block';
    element.style.font = font;
    element.textContent = text;

    const rect = element.getBoundingClientRect();
    element.style.display = 'none';

    return { width: rect.width, height: rect.height };
  }

  hitTest(x, y, shape) {
    const { left, top, width, height } = shape;
    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  setCursor(style) {
    this.base.container.style.cursor = style;
  }

  getFPS() {
    return this.base.getFPS();
  }

  getAverageFPS() {
    return this.base.getAverageFPS();
  }

  getStats() {
    return this.base.getStats();
  }
}
