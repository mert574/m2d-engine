import { BaseRenderer } from './baseRenderer.js';
import { HTMLRendererBase } from './htmlRendererBase.js';

export class HTMLRenderer extends BaseRenderer {
  constructor() {
    super();
    this.base = new HTMLRendererBase();
    this.camera = { x: 0, y: 0, width: 0, height: 0 };
    this.debugEnabled = false;
    this.debugLayer = 'default';
  }

  init(element, options = {}) {
    this.base.container = element;
    this.base.width = options.width || element.clientWidth;
    this.base.height = options.height || element.clientHeight;

    element.style.cssText = 'position:relative;overflow:hidden;width:100%;height:100%;image-rendering:pixelated;background-color:#000;';

    // Register element pools
    this.base.registerPool('sprites', 'position:absolute;display:none;background-repeat:no-repeat;image-rendering:pixelated;');
    this.base.registerPool('rects', 'position:absolute;display:none;');
    this.base.registerPool('texts', 'position:absolute;display:none;white-space:nowrap;');

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
    this.base.hideActiveElements();
    this.base.resetPools();
  }

  beginFrame() {
    this.base.beginFrameBase();
  }

  endFrame() {
    this.base.endFrameBase();
  }

  // Coordinate conversion with camera support
  _convertCoordinates(x, y, isScreenSpace = false) {
    const scale = this.base.cachedScale;

    if (isScreenSpace) {
      return {
        x: x * scale + this.base.cachedOffsetX,
        y: y * scale + this.base.cachedOffsetY,
        scale
      };
    }

    return {
      x: (x - (this.camera.x - this.base.width / 2)) * scale + this.base.cachedOffsetX,
      y: (y - (this.camera.y - this.base.height / 2)) * scale + this.base.cachedOffsetY,
      scale
    };
  }

  drawSprite({ image, x, y, tileX, tileY, tileWidth, tileHeight, width, height, rotation = 0, flipX = false, flipY = false }) {
    const element = this.base.getElement('sprites');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y);

    const finalWidth = (width || tileWidth) * scale;
    const finalHeight = (height || tileHeight) * scale;

    element.style.display = 'block';
    element.style.left = `${screenX - finalWidth / 2}px`;
    element.style.top = `${screenY - finalHeight / 2}px`;
    element.style.width = `${finalWidth}px`;
    element.style.height = `${finalHeight}px`;
    element.style.backgroundImage = `url(${image.src})`;
    element.style.backgroundPosition = `-${tileX * scale}px -${tileY * scale}px`;
    element.style.backgroundSize = `${image.width * scale}px ${image.height * scale}px`;
    element.style.transform = `${rotation ? `rotate(${rotation}rad)` : ''} ${flipX ? 'scaleX(-1)' : ''} ${flipY ? 'scaleY(-1)' : ''}`.trim() || 'none';
    element.style.transformOrigin = 'center';

    this.base.markActive(element);
  }

  drawAnimation({ sprite, x, y, animation, frame = 0, transform = {} }) {
    const { image, animations } = sprite;
    const anim = animations[animation];
    if (!anim) return;

    const frameData = anim.frames[frame % anim.frames.length];
    this.drawSprite({
      image,
      x,
      y,
      tileX: frameData.x,
      tileY: frameData.y,
      tileWidth: frameData.width,
      tileHeight: frameData.height,
      ...transform
    });
  }

  drawRect({ x, y, width, height, fillStyle, strokeStyle, lineWidth = 1, isScreenSpace = false }) {
    const element = this.base.getElement('rects');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y, isScreenSpace);

    element.style.display = 'block';
    element.style.left = `${screenX}px`;
    element.style.top = `${screenY}px`;
    element.style.width = `${width * scale}px`;
    element.style.height = `${height * scale}px`;
    element.style.backgroundColor = fillStyle || 'transparent';
    element.style.border = strokeStyle ? `${lineWidth * scale}px solid ${strokeStyle}` : 'none';
    element.style.borderRadius = '';
    element.style.boxSizing = 'border-box';

    this.base.markActive(element);
  }

  drawLine({ x1, y1, x2, y2, strokeStyle = '#000', lineWidth = 1, isScreenSpace = false }) {
    const element = this.base.getElement('rects');
    const { x: screenX1, y: screenY1, scale } = this._convertCoordinates(x1, y1, isScreenSpace);
    const { x: screenX2, y: screenY2 } = this._convertCoordinates(x2, y2, isScreenSpace);

    const dx = screenX2 - screenX1;
    const dy = screenY2 - screenY1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    element.style.display = 'block';
    element.style.left = `${screenX1}px`;
    element.style.top = `${screenY1}px`;
    element.style.width = `${length}px`;
    element.style.height = `${lineWidth * scale}px`;
    element.style.backgroundColor = strokeStyle;
    element.style.border = 'none';
    element.style.borderRadius = '';
    element.style.transformOrigin = '0 50%';
    element.style.transform = `rotate(${angle}rad)`;

    this.base.markActive(element);
  }

  drawArc({ x, y, radius, startAngle = 0, endAngle = Math.PI * 2, fillStyle, strokeStyle, lineWidth = 1, fill = true, isScreenSpace = false }) {
    const element = this.base.getElement('rects');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y, isScreenSpace);
    const scaledRadius = radius * scale;
    const scaledLineWidth = lineWidth * scale;

    const isFullCircle = Math.abs(endAngle - startAngle - Math.PI * 2) < 0.01;

    element.style.display = 'block';
    element.style.left = `${screenX - scaledRadius}px`;
    element.style.top = `${screenY - scaledRadius}px`;
    element.style.width = `${scaledRadius * 2}px`;
    element.style.height = `${scaledRadius * 2}px`;
    element.style.borderRadius = '50%';
    element.style.boxSizing = 'border-box';
    element.style.transform = 'none';
    element.style.transformOrigin = 'center';

    if (isFullCircle) {
      element.style.backgroundColor = (fill && fillStyle) ? fillStyle : 'transparent';
      element.style.border = strokeStyle ? `${scaledLineWidth}px solid ${strokeStyle}` : 'none';
      element.style.background = '';
      element.style.mask = '';
      element.style.webkitMask = '';
    } else {
      element.style.backgroundColor = 'transparent';
      element.style.border = 'none';

      const startDeg = (startAngle * 180 / Math.PI) + 90;
      const endDeg = (endAngle * 180 / Math.PI) + 90;
      const arcColor = (fill && fillStyle) ? fillStyle : strokeStyle;

      element.style.background = `conic-gradient(from ${startDeg}deg, ${arcColor} 0deg, ${arcColor} ${endDeg - startDeg}deg, transparent ${endDeg - startDeg}deg)`;

      if (!fill && strokeStyle) {
        const innerRadius = scaledRadius - scaledLineWidth;
        element.style.mask = `radial-gradient(circle, transparent ${innerRadius}px, black ${innerRadius}px)`;
        element.style.webkitMask = element.style.mask;
      }
    }

    this.base.markActive(element);
  }

  drawText({ text, x, y, color, fillStyle, font = '16px Arial', align, textAlign, baseline, textBaseline, fontSize, fontFamily, isScreenSpace = false }) {
    const element = this.base.getElement('texts');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y, isScreenSpace);

    const finalColor = color || fillStyle || '#000';
    const finalAlign = align || textAlign || 'left';

    let scaledFontSize, finalFontFamily;
    if (fontSize) {
      const size = typeof fontSize === 'string' ? parseFloat(fontSize) : fontSize;
      scaledFontSize = size * scale;
      finalFontFamily = fontFamily || 'Arial';
    } else {
      const [fontSizeStr, ...fontRest] = font.split('px ');
      scaledFontSize = parseFloat(fontSizeStr) * scale;
      finalFontFamily = fontRest.join('px ') || 'Arial';
    }

    element.style.display = 'block';
    element.style.left = `${screenX}px`;
    element.style.top = `${screenY}px`;
    element.style.color = finalColor;
    element.style.fontSize = `${scaledFontSize}px`;
    element.style.fontFamily = finalFontFamily;
    element.textContent = text;

    element.style.transform = finalAlign === 'center' ? 'translate(-50%, 0)' :
                              finalAlign === 'right' ? 'translate(-100%, 0)' : 'none';

    this.base.markActive(element);
  }

  applyCamera(camera) {
    this.camera = camera;
  }

  setCursor(style) {
    this.base.container.style.cursor = style;
  }

  setDebugEnabled(enabled) {
    this.debugEnabled = enabled;
  }

  isDebugEnabled() {
    return this.debugEnabled;
  }

  setDebugLayer(layer) {
    this.debugLayer = layer;
  }

  getDebugLayer() {
    return this.debugLayer;
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
