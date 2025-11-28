/**
 * Base class for HTML-based renderers.
 * Handles element pooling, coordinate caching, and FPS tracking.
 */
export class HTMLRendererBase {
  constructor() {
    this.container = null;
    this.width = 0;
    this.height = 0;

    // Element pooling
    this.elementPools = {};
    this.poolIndices = {};
    this.activeElements = new Set();

    // Cached layout values (updated once per frame)
    this.cachedScale = 1;
    this.cachedOffsetX = 0;
    this.cachedOffsetY = 0;

    // FPS tracking
    this.lastTime = performance.now();
    this.frames = 0;
    this.currentFPS = 0;
    this.fpsUpdateInterval = 1000;
    this.lastFPSUpdate = this.lastTime;
    this.fpsHistory = new Array(60).fill(0);
    this.fpsHistoryIndex = 0;

    // Stats
    this.stats = {
      drawCalls: 0,
      activeElements: 0
    };
  }

  /**
   * Register an element pool type with its creation function
   * @param {string} type - Pool type name
   * @param {string} cssText - Default CSS for elements in this pool
   * @param {string} [tagName='div'] - HTML tag to create
   */
  registerPool(type, cssText, tagName = 'div') {
    this.elementPools[type] = {
      elements: [],
      cssText,
      tagName
    };
    this.poolIndices[type] = 0;
  }

  /**
   * Initialize pools with pre-created elements
   * @param {number} poolSize - Number of elements per pool
   */
  initPools(poolSize) {
    for (const [type, pool] of Object.entries(this.elementPools)) {
      for (let i = 0; i < poolSize; i++) {
        const element = document.createElement(pool.tagName);
        element.style.cssText = pool.cssText;
        this.container.appendChild(element);
        pool.elements.push(element);
      }
    }
  }

  /**
   * Get the next available element from a pool
   * @param {string} type - Pool type
   * @returns {HTMLElement}
   */
  getElement(type) {
    const pool = this.elementPools[type];
    const index = this.poolIndices[type]++;

    if (index < pool.elements.length) {
      return pool.elements[index];
    }

    // Create new element if pool exhausted
    const element = document.createElement(pool.tagName);
    element.style.cssText = pool.cssText;
    this.container.appendChild(element);
    pool.elements.push(element);
    return element;
  }

  /**
   * Mark an element as active for this frame
   * @param {HTMLElement} element
   */
  markActive(element) {
    this.activeElements.add(element);
    this.stats.drawCalls++;
  }

  /**
   * Update cached layout values - call once per frame
   */
  updateLayoutCache() {
    const rect = this.container.getBoundingClientRect();
    const scaleX = rect.width / this.width;
    const scaleY = rect.height / this.height;
    this.cachedScale = Math.min(scaleX, scaleY);
    this.cachedOffsetX = (rect.width - this.width * this.cachedScale) / 2;
    this.cachedOffsetY = (rect.height - this.height * this.cachedScale) / 2;
  }

  /**
   * Convert coordinates using cached values
   * @param {number} x
   * @param {number} y
   * @returns {{x: number, y: number, scale: number}}
   */
  convertCoordinates(x, y) {
    return {
      x: x * this.cachedScale + this.cachedOffsetX,
      y: y * this.cachedScale + this.cachedOffsetY,
      scale: this.cachedScale
    };
  }

  /**
   * Reset pools for new frame
   */
  resetPools() {
    for (const type of Object.keys(this.poolIndices)) {
      this.poolIndices[type] = 0;
    }
  }

  /**
   * Hide all active elements and clear tracking
   * @param {Function} [onHide] - Optional callback for each hidden element
   */
  hideActiveElements(onHide) {
    this.activeElements.forEach(element => {
      element.style.display = 'none';
      if (onHide) onHide(element);
    });
    this.activeElements.clear();
  }

  /**
   * Update FPS tracking
   */
  updateFPS() {
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

  /**
   * Common beginFrame logic
   */
  beginFrameBase() {
    this.updateLayoutCache();
    this.hideActiveElements();
    this.resetPools();
    this.stats.drawCalls = 0;
    this.updateFPS();
  }

  /**
   * Common endFrame logic
   */
  endFrameBase() {
    this.stats.activeElements = this.activeElements.size;
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

  destroy() {
    for (const pool of Object.values(this.elementPools)) {
      pool.elements.forEach(el => el.remove());
      pool.elements.length = 0;
    }
    this.activeElements.clear();
  }
}
