import { Constraint } from '../core/constraint.js';

export class Debug extends Constraint {
    constructor(entity, options = {}) {
        super(entity);
        this.showWireframe = options.wireframe ?? false;
        this.wireframeColor = options.wireframeColor || '#00ff00';
        this.wireframeWidth = options.wireframeWidth || 1;
        this.showFPS = options.showFPS ?? true;
        this.fpsUpdateInterval = 500; // Update FPS display every 500ms
        this.lastFPSUpdate = 0;
        this.frameCount = 0;
        this.currentFPS = 0;
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
        const ctx = this.entity.context;

        if (this.showWireframe) {
            const bounds = this.entity.body.bounds;
            ctx.save();
            ctx.strokeStyle = this.wireframeColor;
            ctx.lineWidth = this.wireframeWidth;
            ctx.strokeRect(
                bounds.min.x,
                bounds.min.y,
                bounds.max.x - bounds.min.x,
                bounds.max.y - bounds.min.y
            );
            ctx.restore();
        }

        if (this.showFPS) {
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.font = '16px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`FPS: ${this.currentFPS}`, 10, 10);
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