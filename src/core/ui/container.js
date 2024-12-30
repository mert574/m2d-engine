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

  addElement(element) {
    element.setGame(this.game);
    this.elements.add(element);
    return element;
  }

  onMouseMove(x, y) {
    let newHovered = null;
    const hitElements = Array.from(this.elements)
      .filter(element => element.contains(x, y))
      .reverse(); // Process from top to bottom

    // Handle hover states
    hitElements.forEach(element => {
      element.onMouseMove(x, y);
      if (element.isHovered) {
        newHovered = element;
      }
    });

    if (this.hoveredElement !== newHovered) {
      if (this.hoveredElement) {
        this.hoveredElement.isHovered = false;
        this.hoveredElement.onMouseLeave();
      }
      this.hoveredElement = newHovered;
      if (newHovered) {
        newHovered.onMouseEnter();
      }
    }
  }

  onMouseDown(x, y) {
    const hitElements = Array.from(this.elements)
      .filter(element => element.contains(x, y))
      .reverse(); // Process from top to bottom

    for (const element of hitElements) {
      const shouldStopPropagation = element.onMouseDown(x, y);
      if (shouldStopPropagation) {
        break;
      }
    }
  }

  update(deltaTime) {
    for (const element of this.elements) {
      element.update(deltaTime);
    }
  }

  draw(deltaTime) {
    for (const element of this.elements) {
      element.draw(deltaTime);
    }
  }
} 