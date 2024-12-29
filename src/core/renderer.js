export class Renderer {
  constructor(canvas) {
    // Main canvas
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    // World buffer (for camera view)
    this.worldBuffer = document.createElement('canvas');
    this.worldContext = this.worldBuffer.getContext('2d');
    this.resize();
  }

  resize() {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this.worldBuffer.width = this.canvas.width;
    this.worldBuffer.height = this.canvas.height;
  }

  clear(color = '#000') {
    this.context.fillStyle = color;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.worldContext.fillStyle = color;
    this.worldContext.fillRect(0, 0, this.worldBuffer.width, this.worldBuffer.height);
  }

  drawWorld(callback) {
    this.worldContext.clearRect(0, 0, this.worldBuffer.width, this.worldBuffer.height);
    
    this.worldContext.save();
    callback(this.worldContext);
    this.worldContext.restore();

    // Copy world buffer to main canvas
    this.context.drawImage(this.worldBuffer, 0, 0);
  }

  drawScreen(callback) {
    this.context.save();
    callback(this.context);
    this.context.restore();
  }

  drawDebugRect(x, y, width, height, color = '#f00', camera = null) {
    const ctx = camera ? this.worldContext : this.context;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - width/2, y - height/2, width, height);
    ctx.restore();
  }

  drawDebugCircle(x, y, radius, color = '#f00', camera = null) {
    const ctx = camera ? this.worldContext : this.context;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawDebugLine(x1, y1, x2, y2, color = '#f00', camera = null) {
    const ctx = camera ? this.worldContext : this.context;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  drawDebugText(text, x, y, color = '#f00', camera = null) {
    const ctx = camera ? this.worldContext : this.context;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
} 