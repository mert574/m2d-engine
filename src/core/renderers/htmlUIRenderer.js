import { BaseUIRenderer } from './baseUIRenderer';

export class HTMLUIRenderer extends BaseUIRenderer {
  constructor() {
    super();
    this.container = null;
    this.elements = new Map();
    this.elementPool = {
      rects: new Map(),
      texts: new Map(),
      images: new Map(),
      buttons: new Map()
    };
    this.activeElements = new Set();

    // Performance tracking
    this.lastTime = performance.now();
    this.frames = 0;
    this.currentFPS = 0;
    this.fpsUpdateInterval = 1000;
    this.lastFPSUpdate = this.lastTime;
    this.fpsHistory = new Array(60).fill(0);
    this.fpsHistoryIndex = 0;
    this.stats = {
      drawCalls: 0,
      stateChanges: 0,
      spritesDrawn: 0,
      textDrawn: 0,
      shapesDrawn: 0,
      activeElements: 0
    };
  }

  init(element, options = {}) {
    this.container = element;
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.width = options.width || element.clientWidth;
    this.height = options.height || element.clientHeight;

    // Pre-create element pools
    this.initElementPools(options.poolSize || 100);
  }

  initElementPools(poolSize) {
    // Create rect elements
    for (let i = 0; i < poolSize; i++) {
      const element = document.createElement('div');
      element.style.position = 'absolute';
      element.style.display = 'none';
      this.container.appendChild(element);
      this.elementPool.rects.set(`rect-${i}`, element);
    }

    // Create text elements
    for (let i = 0; i < poolSize; i++) {
      const element = document.createElement('div');
      element.style.position = 'absolute';
      element.style.display = 'none';
      element.style.whiteSpace = 'nowrap';
      this.container.appendChild(element);
      this.elementPool.texts.set(`text-${i}`, element);
    }

    // Create button elements
    for (let i = 0; i < poolSize; i++) {
      const element = document.createElement('button');
      element.style.position = 'absolute';
      element.style.display = 'none';
      element.style.cursor = 'pointer';
      element.style.border = 'none';
      element.style.outline = 'none';
      element.style.pointerEvents = 'auto';
      this.container.appendChild(element);
      this.elementPool.buttons.set(`button-${i}`, element);
    }

    // Create image elements
    for (let i = 0; i < poolSize; i++) {
      const element = document.createElement('div');
      element.style.position = 'absolute';
      element.style.display = 'none';
      element.style.backgroundSize = 'contain';
      element.style.backgroundRepeat = 'no-repeat';
      this.container.appendChild(element);
      this.elementPool.images.set(`image-${i}`, element);
    }
  }

  destroy() {
    Object.values(this.elementPool).forEach(pool => {
      pool.forEach(element => element.remove());
      pool.clear();
    });
    this.activeElements.clear();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.container.style.width = `${width}px`;
    this.container.style.height = `${height}px`;
  }

  clear() {
    // Reset all elements to initial state
    Object.values(this.elementPool).forEach(pool => {
      pool.forEach(element => {
        element.style.display = 'none';
        // Reset event listeners
        element.onclick = null;
        element.onmouseenter = null;
        element.onmouseleave = null;
        // Reset styles
        element.style.cssText = 'position: absolute; display: none;';
        // Reset text
        element.textContent = '';
      });
    });
    this.activeElements.clear();
  }

  beginFrame() {
    // Hide all previously active elements first
    this.activeElements.forEach(element => {
      element.style.display = 'none';
      // Reset event listeners
      element.onclick = null;
      element.onmouseenter = null;
      element.onmouseleave = null;
      // Reset styles
      element.style.cssText = 'position: absolute; display: none;';
      // Reset text
      element.textContent = '';
    });
    this.activeElements.clear();

    // Reset frame stats
    this.stats.drawCalls = 0;
    this.stats.stateChanges = 0;
    this.stats.spritesDrawn = 0;
    this.stats.textDrawn = 0;
    this.stats.shapesDrawn = 0;
    this.stats.activeElements = 0;

    // Update FPS
    const now = performance.now();
    this.frames++;

    if (now >= this.lastFPSUpdate + this.fpsUpdateInterval) {
      this.currentFPS = Math.round((this.frames * 1000) / (now - this.lastFPSUpdate));
      this.fpsHistory[this.fpsHistoryIndex] = this.currentFPS;
      this.fpsHistoryIndex = (this.fpsHistoryIndex + 1) % this.fpsHistory.length;
      this.frames = 0;
      this.lastFPSUpdate = now;
    }
  }

  endFrame() {
    // Update active elements count
    this.stats.activeElements = this.activeElements.size;

    // Log warning if we're creating too many elements
    if (this.stats.activeElements > 1000) {
      console.warn(`High element count: ${this.stats.activeElements}`);
    }
  }

  getNextFreeElement(type) {
    const pool = this.elementPool[type];
    
    // First try to find an inactive element from the active set
    for (const element of this.activeElements) {
      if (element.style.display === 'none') {
        return element;
      }
    }
    
    // Then try to find one from the pool
    for (const [key, element] of pool) {
      if (element.style.display === 'none') {
        return element;
      }
    }

    // If no free element, create a new one
    console.warn(`Creating new ${type} element. Current pool size: ${pool.size}`);
    const element = type === 'buttons' ? document.createElement('button') : document.createElement('div');
    element.style.position = 'absolute';
    element.style.display = 'none';

    // Apply type-specific styles
    switch (type) {
      case 'texts':
        element.style.whiteSpace = 'nowrap';
        break;
      case 'images':
        element.style.backgroundSize = 'contain';
        element.style.backgroundRepeat = 'no-repeat';
        break;
      case 'buttons':
        element.style.cursor = 'pointer';
        element.style.border = 'none';
        element.style.outline = 'none';
        element.style.pointerEvents = 'auto';
        break;
    }

    this.container.appendChild(element);
    pool.set(`${type}-${pool.size}`, element);
    return element;
  }

  drawRect({ x, y, width, height, fillStyle, strokeStyle, lineWidth = 1, fill = true }) {
    const element = this.getNextFreeElement('rects');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y);

    element.style.display = 'block';
    element.style.left = `${screenX - (width * scale)/2}px`;
    element.style.top = `${screenY - (height * scale)/2}px`;
    element.style.width = `${width * scale}px`;
    element.style.height = `${height * scale}px`;
    
    if (fill && fillStyle) {
      element.style.backgroundColor = fillStyle;
    }
    
    if (strokeStyle) {
      element.style.border = `${lineWidth * scale}px solid ${strokeStyle}`;
    }

    this.activeElements.add(element);
    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
  }

  drawText({ text, x, y, color = '#000', font = '16px Arial', align = 'left', baseline = 'top', fontSize, fontFamily = 'Arial', properties = {} }) {
    const element = this.getNextFreeElement('texts');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y);

    element.style.display = 'block';
    element.style.position = 'absolute';
    // Use color from properties if available, fallback to color parameter
    element.style.color = properties.color || color;
    // Use fontSize from properties if available, fallback to fontSize parameter or parse from font
    element.style.fontSize = properties.fontSize || fontSize || font.split('px')[0] + 'px';
    element.style.fontFamily = fontFamily;
    element.style.whiteSpace = 'nowrap';

    // Set text content first so we can measure it
    element.textContent = text;

    // Measure text width for alignment
    const rect = element.getBoundingClientRect();
    const width = rect.width;

    // Adjust position based on alignment
    switch (align) {
      case 'center':
        element.style.left = `${screenX - width/2}px`;
        element.style.textAlign = 'center';
        break;
      case 'right':
        element.style.left = `${screenX - width}px`;
        element.style.textAlign = 'right';
        break;
      default: // 'left'
        element.style.left = `${screenX}px`;
        element.style.textAlign = 'left';
    }

    // Adjust position based on baseline
    switch (baseline) {
      case 'middle':
        element.style.top = `${screenY - rect.height/2}px`;
        break;
      case 'bottom':
        element.style.top = `${screenY - rect.height}px`;
        break;
      default: // 'top'
        element.style.top = `${screenY}px`;
    }

    this.activeElements.add(element);
    this.stats.drawCalls++;
    this.stats.textDrawn++;
  }

  drawButton({ x, y, width, height, text, style = {}, onClick }) {
    const element = this.getNextFreeElement('buttons');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y);

    // Reset any previous state
    element.onclick = null;
    element.onmouseenter = null;
    element.onmouseleave = null;

    element.style.display = 'block';
    element.style.left = `${screenX - (width * scale)/2}px`;
    element.style.top = `${screenY - (height * scale)/2}px`;
    element.style.width = `${width * scale}px`;
    element.style.height = `${height * scale}px`;
    element.textContent = text;
    element.onclick = onClick;

    // Apply styles
    element.style.backgroundColor = style.backgroundColor || '#ffffff';
    element.style.color = style.textColor || '#000000';
    element.style.fontSize = `${(style.fontSize || 16) * scale}px`;
    element.style.fontFamily = style.fontFamily || 'Arial';
    element.style.borderRadius = `${(style.borderRadius || 4) * scale}px`;
    element.style.cursor = 'pointer';
    element.style.transition = 'background-color 0.2s';

    // Hover effect
    if (style.hoverColor) {
      const defaultColor = style.backgroundColor;
      const hoverColor = style.hoverColor;
      element.onmouseenter = () => element.style.backgroundColor = hoverColor;
      element.onmouseleave = () => element.style.backgroundColor = defaultColor;
    }

    this.activeElements.add(element);
    this.stats.drawCalls++;
  }

  drawImage({ image, x, y, width, height }) {
    const element = this.getNextFreeElement('images');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y);

    element.style.display = 'block';
    element.style.left = `${screenX - (width * scale)/2}px`;
    element.style.top = `${screenY - (height * scale)/2}px`;
    element.style.width = `${width * scale}px`;
    element.style.height = `${height * scale}px`;
    element.style.backgroundImage = `url(${image.src})`;

    this.activeElements.add(element);
    this.stats.drawCalls++;
    this.stats.spritesDrawn++;
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
    const element = this.getNextFreeElement('texts');
    element.style.visibility = 'hidden';
    element.style.display = 'block';
    element.style.font = font;
    element.textContent = text;
    
    const rect = element.getBoundingClientRect();
    element.style.display = 'none';
    
    return {
      width: rect.width,
      height: rect.height
    };
  }

  hitTest(x, y, shape) {
    const { left, top, width, height } = shape;
    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  setCursor(style) {
    this.container.style.cursor = style;
  }

  getFPS() {
    return this.currentFPS;
  }

  getAverageFPS() {
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.fpsHistory.length);
  }

  getStats() {
    return { ...this.stats };
  }

  // Helper method to convert game coordinates to screen coordinates
  _convertCoordinates(x, y) {
    const containerRect = this.container.getBoundingClientRect();
    const scaleX = containerRect.width / this.width;
    const scaleY = containerRect.height / this.height;
    const scale = Math.min(scaleX, scaleY);

    // Calculate the offset to center the game in the container
    const offsetX = (containerRect.width - this.width * scale) / 2;
    const offsetY = (containerRect.height - this.height * scale) / 2;

    return {
      x: x * scale + offsetX,
      y: y * scale + offsetY,
      scale
    };
  }
} 