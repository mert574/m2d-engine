import { Constraint } from '../core/constraint.js';

export class Debug extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.showWireframe = options.wireframe ?? false;
    this.wireframeColor = options.wireframeColor || '#00ff00';
    this.wireframeWidth = options.wireframeWidth || 1;
    this.showFPS = options.showFPS ?? true;
    this.fpsUpdateInterval = 500;
    this.lastFPSUpdate = 0;
    this.frameCount = 0;
    this.currentFPS = 0;

    console.log('Debug constraint added to entity:', entity);
  }

  update(deltaTime) {
    if (this.showFPS) {
      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFPSUpdate > this.fpsUpdateInterval) {
        this.currentFPS = Math.round((this.frameCount * 1000) / (now - this.lastFPSUpdate));
        this.frameCount = 0;
        this.lastFPSUpdate = now;
      }
    }
  }

  draw(deltaTime) {
    if (this.showWireframe) {
      this.entity.game.renderer.drawWorld(ctx => {
        const bounds = this.entity.body.bounds;
        ctx.strokeStyle = this.wireframeColor;
        ctx.lineWidth = this.wireframeWidth;
        ctx.strokeRect(
          bounds.min.x,
          bounds.min.y,
          bounds.max.x - bounds.min.x,
          bounds.max.y - bounds.min.y
        );
      });
    }

    if (this.showFPS) {
      const ctx = this.entity.game.context;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.font = '16px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`FPS: ${this.currentFPS}`, 40, 15);
      ctx.restore();
    }
  }

  setWireframe(enabled) {
    this.showWireframe = enabled;
  }

  setShowFPS(enabled) {
    this.showFPS = enabled;
  }
} 