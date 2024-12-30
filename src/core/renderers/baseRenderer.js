/**
 * Base renderer interface that all renderers must implement.
 * This is an abstract class and cannot be instantiated directly.
 */
export class BaseRenderer {
  constructor() {
    if (this.constructor === BaseRenderer) {
      throw new Error('BaseRenderer is an abstract class and cannot be instantiated directly');
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
   * Draw a sprite.
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Image to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} options.tileX - Tile X position in spritesheet
   * @param {number} options.tileY - Tile Y position in spritesheet
   * @param {number} options.tileWidth - Tile width
   * @param {number} options.tileHeight - Tile height
   * @param {number} [options.width] - Destination width
   * @param {number} [options.height] - Destination height
   * @param {number} [options.rotation=0] - Rotation in radians
   * @param {boolean} [options.flipX=false] - Flip horizontally
   * @param {boolean} [options.flipY=false] - Flip vertically
   * @param {boolean} [options.isScreenSpace=false] - Whether to draw in screen space
   */
  drawSprite(options) { throw new Error('Method not implemented'); }

  /**
   * Draw an animation.
   * @param {Object} options - Drawing options
   * @param {Object} options.sprite - The sprite to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string} options.animation - Animation name
   * @param {number} [options.frame=0] - Animation frame
   * @param {Object} [options.transform] - Transform options
   */
  drawAnimation(options) { throw new Error('Method not implemented'); }

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
   * @param {boolean} [options.isScreenSpace=false] - Whether to draw in screen space
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
   * @param {boolean} [options.isScreenSpace=false] - Whether to draw in screen space
   */
  drawText(options) { throw new Error('Method not implemented'); }

  /**
   * Apply camera transformation.
   * @param {Object} camera - Camera object with position and dimensions
   */
  applyCamera(camera) { throw new Error('Method not implemented'); }

  /**
   * Set the cursor style.
   * @param {string} style - CSS cursor style
   */
  setCursor(style) { throw new Error('Method not implemented'); }

  /**
   * Enable/disable debug rendering
   * @param {boolean} enabled - Whether debug rendering should be enabled
   */
  setDebugEnabled(enabled) {
    throw new Error('setDebugEnabled not implemented');
  }

  /**
   * Check if debug rendering is enabled
   * @returns {boolean} Whether debug rendering is enabled
   */
  isDebugEnabled() {
    throw new Error('isDebugEnabled not implemented');
  }

  /**
   * Set debug rendering layer
   * @param {string} layer - Debug layer name
   */
  setDebugLayer(layer) {
    throw new Error('setDebugLayer not implemented');
  }

  /**
   * Get current debug layer
   * @returns {string} Current debug layer name
   */
  getDebugLayer() {
    throw new Error('getDebugLayer not implemented');
  }
} 