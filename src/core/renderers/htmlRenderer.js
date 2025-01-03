import { BaseRenderer } from './baseRenderer';

export class HTMLRenderer extends BaseRenderer {
  constructor() {
    super();
    this.container = null;
    this.layers = new Map();
    this.camera = { x: 0, y: 0, width: 0, height: 0 };
    this.debugEnabled = false;
    this.debugLayer = 'default';
    this.elementPool = {
      sprites: new Map(),
      rects: new Map(),
      texts: new Map()
    };
    this.activeElements = new Set();

    // Performance tracking
    this.lastTime = performance.now();
    this.frames = 0;
    this.currentFPS = 0;
    this.fpsUpdateInterval = 1000; // Update FPS every second
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
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.imageRendering = 'pixelated';
    this.container.style.backgroundColor = '#000';
    this.width = options.width || element.clientWidth;
    this.height = options.height || element.clientHeight;

    // Pre-create pools of elements
    this.initElementPools(options.poolSize || 100);
  }

  initElementPools(poolSize) {
    // Create sprite elements
    for (let i = 0; i < poolSize; i++) {
      const element = document.createElement('div');
      element.style.position = 'absolute';
      element.style.display = 'none';
      element.style.backgroundRepeat = 'no-repeat';
      element.style.imageRendering = 'pixelated';
      this.container.appendChild(element);
      this.elementPool.sprites.set(`sprite-${i}`, element);
    }

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
  }

  destroy() {
    // Remove all elements
    Object.values(this.elementPool).forEach(pool => {
      pool.forEach(element => element.remove());
      pool.clear();
    });
    this.layers.clear();
    this.activeElements.clear();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.container.style.width = `${width}px`;
    this.container.style.height = `${height}px`;
  }

  clear() {
    // Hide all previously active elements
    this.activeElements.forEach(element => {
      element.style.display = 'none';
    });
    this.activeElements.clear();
  }

  beginFrame() {
    // Reset frame stats
    this.stats.drawCalls = 0;
    this.stats.stateChanges = 0;
    this.stats.spritesDrawn = 0;
    this.stats.textDrawn = 0;
    this.stats.shapesDrawn = 0;
    this.stats.activeElements = this.activeElements.size;

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
    // No cleanup needed as we're reusing elements
  }

  getNextFreeElement(type) {
    const pool = this.elementPool[type];
    for (const [key, element] of pool) {
      if (element.style.display === 'none') {
        // Reset all styles when reusing an element
        element.style.cssText = 'position: absolute; display: none;';
        if (type === 'sprites') {
          element.style.backgroundRepeat = 'no-repeat';
          element.style.imageRendering = 'pixelated';
        } else if (type === 'texts') {
          element.style.whiteSpace = 'nowrap';
        }
        return element;
      }
    }
    // If no free element, create a new one
    const element = document.createElement('div');
    element.style.position = 'absolute';
    element.style.display = 'none';
    if (type === 'sprites') {
      element.style.backgroundRepeat = 'no-repeat';
      element.style.imageRendering = 'pixelated';
    } else if (type === 'texts') {
      element.style.whiteSpace = 'nowrap';
    }
    this.container.appendChild(element);
    pool.set(`${type}-${pool.size}`, element);
    return element;
  }

  drawSprite({ image, x, y, tileX, tileY, tileWidth, tileHeight, width, height, rotation = 0, flipX = false, flipY = false, isScreenSpace = false }) {
    const element = this.getNextFreeElement('sprites');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y);

    const finalWidth = (width || tileWidth) * scale;
    const finalHeight = (height || tileHeight) * scale;

    element.style.display = 'block';
    element.style.position = 'absolute';
    element.style.left = `${screenX - finalWidth/2}px`;
    element.style.top = `${screenY - finalHeight/2}px`;
    element.style.width = `${finalWidth}px`;
    element.style.height = `${finalHeight}px`;
    element.style.backgroundImage = `url(${image.src})`;
    element.style.backgroundPosition = `-${tileX}px -${tileY}px`;
    element.style.backgroundSize = `${image.width}px ${image.height}px`;
    element.style.imageRendering = 'pixelated';
    element.style.transform = `${rotation ? `rotate(${rotation}rad)` : ''} ${flipX ? 'scaleX(-1)' : ''} ${flipY ? 'scaleY(-1)' : ''}`;
    element.style.transformOrigin = 'center';
    element.style.backfaceVisibility = 'hidden';
    element.style.willChange = 'transform';

    this.activeElements.add(element);
    this.stats.drawCalls++;
    this.stats.spritesDrawn++;
    this.stats.stateChanges += 6;
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

  drawRect({ x, y, width, height, fillStyle, strokeStyle, lineWidth = 1, fill = true, isScreenSpace = false }) {
    const element = this.getNextFreeElement('rects');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y, isScreenSpace);

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
    this.stats.stateChanges += 4;
  }

  drawText({ text, x, y, color = '#000', font = '16px Arial', align = 'left', baseline = 'top', isScreenSpace = false }) {
    const element = this.getNextFreeElement('texts');
    const { x: screenX, y: screenY, scale } = this._convertCoordinates(x, y, isScreenSpace);

    // Parse font string to scale the font size
    const [fontSizeStr, ...fontRest] = font.split('px ');
    const fontSize = parseFloat(fontSizeStr);
    const scaledFont = `${fontSize * scale}px ${fontRest.join('px ')}`;

    element.style.display = 'block';
    element.style.left = `${screenX}px`;
    element.style.top = `${screenY}px`;
    element.style.color = color;
    element.style.font = scaledFont;
    element.style.textAlign = align;
    element.textContent = text;

    // Apply alignment offset
    if (align === 'center') {
      element.style.transform = 'translate(-50%, 0)';
    } else if (align === 'right') {
      element.style.transform = 'translate(-100%, 0)';
    }

    this.activeElements.add(element);
    this.stats.drawCalls++;
    this.stats.textDrawn++;
    this.stats.stateChanges += 5;
  }

  applyCamera(camera) {
    this.camera = camera;
  }

  setCursor(style) {
    this.container.style.cursor = style;
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
    return this.currentFPS;
  }

  getAverageFPS() {
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.fpsHistory.length);
  }

  getStats() {
    return { ...this.stats };
  }

  drawArc({ x, y, radius, startAngle = 0, endAngle = Math.PI * 2, fillStyle, strokeStyle, fill = true, isScreenSpace = false }) {
    const segments = 32; // Number of segments to approximate the arc
    const angleStep = (endAngle - startAngle) / segments;
    const finalX = isScreenSpace ? x : x - this.camera.x;
    const finalY = isScreenSpace ? y : y - this.camera.y;

    // Create a container for the arc segments
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = `${finalX}px`;
    container.style.top = `${finalY}px`;
    container.style.width = '0';
    container.style.height = '0';
    container.style.transform = 'translate(-50%, -50%)';
    this.container.appendChild(container);
    
    // Create segments to approximate the arc
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i * angleStep);
      const segX = Math.cos(angle) * radius;
      const segY = Math.sin(angle) * radius;
      
      const segment = document.createElement('div');
      segment.style.position = 'absolute';
      segment.style.width = '4px';
      segment.style.height = '4px';
      segment.style.left = `${segX}px`;
      segment.style.top = `${segY}px`;
      segment.style.transform = 'translate(-50%, -50%)';
      
      if (fill && fillStyle) {
        segment.style.backgroundColor = fillStyle;
      }
      if (strokeStyle) {
        segment.style.border = `1px solid ${strokeStyle}`;
      }
      
      container.appendChild(segment);
    }

    this.activeElements.add(container);
    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
  }

  // Helper method to convert game coordinates to screen coordinates
  _convertCoordinates(x, y, isScreenSpace = false) {
    // Calculate scale based on container size vs game size
    const containerRect = this.container.getBoundingClientRect();
    const scaleX = containerRect.width / this.width;
    const scaleY = containerRect.height / this.height;
    const scale = Math.min(scaleX, scaleY);

    // For screen space coordinates, don't apply camera offset
    if (isScreenSpace) {
      // Calculate offset to center the game in the container
      const offsetX = (containerRect.width - this.width * scale) / 2;
      const offsetY = (containerRect.height - this.height * scale) / 2;
      return {
        x: x * scale + offsetX,
        y: y * scale + offsetY,
        scale
      };
    }

    // For world space coordinates:
    // 1. Apply camera offset (centered on camera)
    // 2. Scale the coordinates
    // 3. Center in container
    const screenX = (x - (this.camera.x - this.width/2)) * scale + (containerRect.width - this.width * scale) / 2;
    const screenY = (y - (this.camera.y - this.height/2)) * scale + (containerRect.height - this.height * scale) / 2;

    return {
      x: screenX,
      y: screenY,
      scale
    };
  }
} 