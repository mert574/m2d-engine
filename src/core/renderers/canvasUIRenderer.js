import { BaseUIRenderer } from './baseUIRenderer.js';

/**
 * Canvas-based implementation of the UI renderer.
 */
export class CanvasUIRenderer extends BaseUIRenderer {
  constructor() {
    super();
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this.context = null;
    /** @type {number} */
    this.width = 800;
    /** @type {number} */
    this.height = 600;
    /** @type {Array<{x: number, y: number, width: number, height: number}>} */
    this.clipStack = [];
  }

  /**
   * Initialize the UI renderer.
   * @param {HTMLCanvasElement} element - The canvas element to render to
   * @param {Object} options - Renderer options
   */
  init(element, options = {}) {
    this.canvas = element;
    this.context = this.canvas.getContext('2d');
    this.width = options.width || this.width;
    this.height = options.height || this.height;
    this.resize(this.width, this.height);
  }

  /**
   * Clean up renderer resources.
   */
  destroy() {
    this.canvas = null;
    this.context = null;
    this.clipStack = [];
  }

  /**
   * Resize canvas to match container size or use fixed dimensions.
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    if (!this.canvas) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Clear the canvas.
   * @param {string} [color] - Background color
   */
  clear(color) {
    if (!this.context) return;
    if (color) {
      this.context.fillStyle = color;
      this.context.fillRect(0, 0, this.width, this.height);
    } else {
      this.context.clearRect(0, 0, this.width, this.height);
    }
  }

  /**
   * Begin a new frame.
   */
  beginFrame() {
    if (!this.context) return;
    this.context.save();
  }

  /**
   * End the current frame.
   */
  endFrame() {
    if (!this.context) return;
    this.context.restore();
  }

  /**
   * Draw a rectangle.
   * @param {Object} options - Drawing options
   */
  drawRect(options) {
    if (!this.context) return;
    this.context.save();

    if (options.globalAlpha !== undefined) {
      this.context.globalAlpha = options.globalAlpha;
    }

    if (options.strokeStyle) {
      this.context.strokeStyle = options.strokeStyle;
      this.context.lineWidth = options.lineWidth || 1;
    }

    if (options.fillStyle) {
      this.context.fillStyle = options.fillStyle;
    }

    if (options.fill !== false && options.fillStyle) {
      this.context.fillRect(options.x, options.y, options.width, options.height);
    }

    if (options.strokeStyle) {
      this.context.strokeRect(options.x, options.y, options.width, options.height);
    }

    this.context.restore();
  }

  /**
   * Draw text.
   * @param {Object} options - Drawing options
   */
  drawText(options) {
    if (!this.context) return;
    this.context.save();

    if (options.globalAlpha !== undefined) {
      this.context.globalAlpha = options.globalAlpha;
    }

    this.context.fillStyle = options.fillStyle || '#000';
    this.context.font = `${options.fontSize || '16px'} ${options.fontFamily || 'system-ui'}`;
    this.context.textAlign = options.textAlign || 'left';
    this.context.textBaseline = options.textBaseline || 'top';

    this.context.fillText(options.text, options.x, options.y);

    this.context.restore();
  }

  /**
   * Draw an image.
   * @param {Object} options - Drawing options
   */
  drawImage(options) {
    if (!this.context || !options.image) return;
    this.context.save();

    if (options.globalAlpha !== undefined) {
      this.context.globalAlpha = options.globalAlpha;
    }

    this.context.drawImage(
      options.image,
      options.x,
      options.y,
      options.width || options.image.width,
      options.height || options.image.height
    );

    this.context.restore();
  }

  /**
   * Draw a path.
   * @param {Object} options - Drawing options
   */
  drawPath(options) {
    if (!this.context || !options.points || options.points.length < 2) return;
    this.context.save();

    if (options.globalAlpha !== undefined) {
      this.context.globalAlpha = options.globalAlpha;
    }

    this.context.beginPath();
    this.context.moveTo(options.points[0].x, options.points[0].y);

    for (let i = 1; i < options.points.length; i++) {
      this.context.lineTo(options.points[i].x, options.points[i].y);
    }

    if (options.closed) {
      this.context.closePath();
    }

    if (options.fillStyle) {
      this.context.fillStyle = options.fillStyle;
      this.context.fill();
    }

    if (options.strokeStyle) {
      this.context.strokeStyle = options.strokeStyle;
      this.context.lineWidth = options.lineWidth || 1;
      this.context.stroke();
    }

    this.context.restore();
  }

  /**
   * Push a clipping rectangle.
   * @param {Object} rect - Clipping rectangle
   */
  pushClip(rect) {
    if (!this.context) return;
    this.clipStack.push(rect);
    this.context.save();
    this.context.beginPath();
    this.context.rect(rect.x, rect.y, rect.width, rect.height);
    this.context.clip();
  }

  /**
   * Pop the last clipping rectangle.
   */
  popClip() {
    if (!this.context || this.clipStack.length === 0) return;
    this.clipStack.pop();
    this.context.restore();
  }

  /**
   * Measure text dimensions.
   * @param {string} text - Text to measure
   * @param {Object} style - Text style options
   * @returns {{width: number, height: number}} Text dimensions
   */
  measureText(text, style = {}) {
    if (!this.context) return { width: 0, height: 0 };

    this.context.save();
    this.context.font = style.font || '16px Arial';
    const metrics = this.context.measureText(text);
    this.context.restore();

    return {
      width: metrics.width,
      height: parseInt(style.font) || 16
    };
  }

  /**
   * Test if a point hits a shape.
   * @param {number} x - X position to test
   * @param {number} y - Y position to test
   * @param {Object} shape - Shape to test against
   * @returns {boolean} Whether the point hits the shape
   */
  hitTest(x, y, shape) {
    if (!this.context) return false;

    switch (shape.type) {
      case 'rect': {
        const left = shape.x;
        const right = shape.x + shape.width;
        const top = shape.y;
        const bottom = shape.y + shape.height;
        return x >= left && x <= right && y >= top && y <= bottom;
      }

      case 'circle': {
        const dx = x - shape.x;
        const dy = y - shape.y;
        return dx * dx + dy * dy <= shape.radius * shape.radius;
      }

      default:
        return false;
    }
  }

  /**
   * Set the cursor style.
   * @param {string} style - CSS cursor style
   */
  setCursor(style) {
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }
} 