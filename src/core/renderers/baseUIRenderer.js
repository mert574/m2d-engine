/**
 * Base UI renderer interface that all UI renderers must implement.
 * This is an abstract class and cannot be instantiated directly.
 */
export class BaseUIRenderer {
  constructor() {
    if (this.constructor === BaseUIRenderer) {
      throw new Error('BaseUIRenderer is an abstract class and cannot be instantiated directly');
    }
  }

  /**
   * Initialize the renderer with a target element and options.
   * @param {HTMLElement} element - The target element to render to
   * @param {Object} options - Renderer-specific options
   */
  init(element, options) { throw new Error('Method not implemented'); }

  /**
   * Clean up renderer resources.
   */
  destroy() { throw new Error('Method not implemented'); }

  /**
   * Resize the renderer to match its container.
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) { throw new Error('Method not implemented'); }

  /**
   * Clear the renderer.
   * @param {string} [color] - Background color
   */
  clear(color) { throw new Error('Method not implemented'); }

  /**
   * Begin a new frame.
   */
  beginFrame() { throw new Error('Method not implemented'); }

  /**
   * End the current frame.
   */
  endFrame() { throw new Error('Method not implemented'); }

  /**
   * Draw a rectangle.
   * @param {Object} options - Drawing options
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} options.width - Rectangle width
   * @param {number} options.height - Rectangle height
   * @param {string} [options.fillStyle] - Fill color
   * @param {string} [options.strokeStyle] - Stroke color
   * @param {number} [options.lineWidth] - Stroke width
   * @param {boolean} [options.fill=true] - Whether to fill the rectangle
   */
  drawRect(options) { throw new Error('Method not implemented'); }

  /**
   * Draw text.
   * @param {Object} options - Drawing options
   * @param {string} options.text - Text to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string} [options.color='#000'] - Text color
   * @param {string} [options.font='16px Arial'] - Font settings
   * @param {string} [options.align='left'] - Text alignment
   * @param {string} [options.baseline='top'] - Text baseline
   */
  drawText(options) { throw new Error('Method not implemented'); }

  /**
   * Draw an image.
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Image to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} [options.width] - Destination width
   * @param {number} [options.height] - Destination height
   */
  drawImage(options) { throw new Error('Method not implemented'); }

  /**
   * Draw a path.
   * @param {Object} options - Drawing options
   * @param {Array<{x: number, y: number}>} options.points - Path points
   * @param {string} [options.strokeStyle='#000'] - Stroke color
   * @param {number} [options.lineWidth=1] - Line width
   * @param {string} [options.fillStyle] - Fill color
   * @param {boolean} [options.closed=false] - Whether to close the path
   */
  drawPath(options) { throw new Error('Method not implemented'); }

  /**
   * Push a clipping rectangle.
   * @param {Object} rect - Clipping rectangle
   * @param {number} rect.x - X position
   * @param {number} rect.y - Y position
   * @param {number} rect.width - Rectangle width
   * @param {number} rect.height - Rectangle height
   */
  pushClip(rect) { throw new Error('Method not implemented'); }

  /**
   * Pop the last clipping rectangle.
   */
  popClip() { throw new Error('Method not implemented'); }

  /**
   * Measure text dimensions.
   * @param {string} text - Text to measure
   * @param {Object} style - Text style options
   * @returns {{width: number, height: number}} Text dimensions
   */
  measureText(text, style) { throw new Error('Method not implemented'); }

  /**
   * Test if a point hits a shape.
   * @param {number} x - X position to test
   * @param {number} y - Y position to test
   * @param {Object} shape - Shape to test against
   * @returns {boolean} Whether the point hits the shape
   */
  hitTest(x, y, shape) { throw new Error('Method not implemented'); }

  /**
   * Set the cursor style.
   * @param {string} style - CSS cursor style
   */
  setCursor(style) { throw new Error('Method not implemented'); }
} 