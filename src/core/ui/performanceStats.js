import { UIElement } from './uiElement.js';

export class PerformanceStats extends UIElement {
  constructor(game, x, y, options = {}) {
    super(x, y);
    this.options = {
      show: options.show ?? false,
      textColor: options.textColor ?? '#00ff00',
      font: {
        size: options.fontSize ?? '14px',
        family: options.fontFamily ?? 'monospace'
      }
    };
    this.game = game;
  }

  draw() {
    if (!this.game || !this.options.show) return;

    const renderer = this.game.renderer;
    const fps = renderer.getFPS();
    const avgFps = renderer.getAverageFPS();
    const stats = renderer.getStats();

    const text = 'FPS: ' + fps 
    + ' · Avg FPS: ' + avgFps 
    + ' · Draw Calls: ' + stats.drawCalls 
    + ' · State Changes: ' + stats.stateChanges 
    + ' · Sprites: ' + stats.spritesDrawn 
    + ' · Text: ' + stats.textDrawn 
    + ' · Shapes: ' + stats.shapesDrawn;

    this.game.uiRenderer.drawText({
      text,
      x: this.x,
      y: this.y,
      fillStyle: this.options.textColor,
      fontSize: this.options.font.size,
      fontFamily: this.options.font.family,
      textAlign: 'left',
      textBaseline: 'top'
    });
  }
} 