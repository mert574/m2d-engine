import { UIElement } from './uiElement.js';

/**
 * A clickable button.
 *
 * It fires on *release*, not on press: a press that slides off the button
 * before letting go is a cancelled press and does nothing, which is what
 * every other button the player has ever used does — and what makes a button
 * usable on a touchscreen, where the finger covers the thing it is aiming
 * at. `isPressed` is tracked by `UIElement` so the button can show the state
 * while it is held.
 */
export class UIButton extends UIElement {
  constructor(x, y, width, height, text, onClick, style = {}) {
    super(x, y, undefined, undefined, style);
    this.width = width;
    this.height = height;
    this.text = text;
    this.handleClick = onClick;
    this.backgroundColor = style.backgroundColor || '#000';
    this.hoverColor = style.hoverColor || '#333';
    this.pressedColor = style.pressedColor || '#555';
    this.textColor = style.textColor || '#fff';
    this.fontSize = style.fontSize || '16px';
    this.fontFamily = style.fontFamily || 'system-ui';
  }

  draw() {
    if (!this.game) return;

    const fillStyle = this.isPressed
      ? this.pressedColor
      : this.isHovered ? this.hoverColor : this.backgroundColor;
    this.game.uiRenderer.drawRect({
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height,
      fillStyle
    });

    this.game.uiRenderer.drawText({
      text: this.text,
      x: this.x,
      y: this.y,
      fillStyle: this.textColor,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      textAlign: 'center',
      textBaseline: 'middle'
    });
  }

  onHover() {
    this.game.uiRenderer.setCursor('pointer');
  }

  onHoverEnd() {
    this.game.uiRenderer.setCursor('default');
  }

  onClick(event) {
    this.handleClick?.(event);
  }
}
