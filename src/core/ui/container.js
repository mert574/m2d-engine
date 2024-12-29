export class Container {
  constructor(game) {
    this.game = game;
    this.elements = new Set();
    this.hoveredElement = null;
  }

  clear() {
    this.elements.clear();
    this.hoveredElement = null;
  }

  addButton(x, y, text, onClick) {
    const button = {
      type: 'button',
      x,
      y,
      text,
      onClick,
      width: 200,
      height: 40,
      isHovered: false,
      contains: (px, py) => {
        return px >= x - 100 && px <= x + 100 &&
               py >= y - 20 && py <= y + 20;
      }
    };
    this.elements.add(button);
    return button;
  }

  addText(x, y, text, options = {}) {
    const textElement = {
      type: 'text',
      x,
      y,
      text,
      fontSize: options.fontSize || 16,
      color: options.color || '#fff',
      align: options.align || 'left'
    };
    this.elements.add(textElement);
    return textElement;
  }

  addImage(x, y, image, options = {}) {
    const imageElement = {
      type: 'image',
      x,
      y,
      image,
      width: options.width || image.width,
      height: options.height || image.height,
      scale: options.scale || 1
    };
    this.elements.add(imageElement);
    return imageElement;
  }

  addRect(x, y, width, height, color) {
    const rectElement = {
      type: 'rect',
      x,
      y,
      width,
      height,
      color
    };
    this.elements.add(rectElement);
  }

  onMouseMove(x, y) {
    let newHovered = null;

    for (const element of this.elements) {
      if (element.type === 'button') {
        const isHovered = element.contains(x, y);
        element.isHovered = isHovered;
        if (isHovered) {
          newHovered = element;
        }
      }
    }

    if (this.hoveredElement !== newHovered) {
      if (this.hoveredElement) {
        this.hoveredElement.isHovered = false;
      }
      this.hoveredElement = newHovered;
    }
  }

  onMouseDown(x, y) {
    for (const element of this.elements) {
      if (element.type === 'button' && element.contains(x, y)) {
        element.onClick();
        break;
      }
    }
  }

  update(deltaTime) {
    // For future animations or state updates
  }

  draw(ctx) {
    ctx.save();

    for (const element of this.elements) {
      switch (element.type) {
        case 'button':
          this.drawButton(ctx, element);
          break;
        case 'text':
          this.drawText(ctx, element);
          break;
        case 'image':
          this.drawImage(ctx, element);
          break;
        case 'rect':
          this.drawRect(ctx, element);
          break;
      }
    }

    ctx.restore();
  }

  drawButton(ctx, button) {
    ctx.fillStyle = button.isHovered ? '#4CAF50' : '#2E7D32';
    ctx.beginPath();
    ctx.roundRect(button.x - 100, button.y - 20, 200, 40, 8);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.text, button.x, button.y);
  }

  drawText(ctx, text) {
    ctx.fillStyle = text.color;
    ctx.font = `${text.fontSize}px Arial`;
    ctx.textAlign = text.align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text.text, text.x, text.y);
  }

  drawImage(ctx, image) {
    const width = image.width * image.scale;
    const height = image.height * image.scale;
    ctx.drawImage(
      image.image,
      image.x - width / 2,
      image.y - height / 2,
      width,
      height
    );
  }

  drawRect(ctx, rect) {
    ctx.fillStyle = rect.color;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
} 