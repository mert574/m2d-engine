/**
 * Draw velocity debug info
 */
export function drawVelocityDebug(renderer, entity, x, y, color) {
  const vx = Math.abs(entity.body.velocity.x) < 0.01 ? 0 : entity.body.velocity.x;
  const vy = Math.abs(entity.body.velocity.y) < 0.01 ? 0 : entity.body.velocity.y;
  renderer.drawText({
    text: `vel: ${vx.toFixed(1)}, ${vy.toFixed(1)}`,
    x,
    y,
    fillStyle: color,
    fontSize: '12px',
    fontFamily: 'monospace',
    textAlign: 'left',
    textBaseline: 'top'
  });
}

/**
 * Draw health debug info
 */
export function drawHealthDebug(renderer, entity, x, y, healthyColor, lowColor = '#ff4d4d', lowThreshold = 30) {
  const health = entity.getConstraint('health');
  if (!health) return;

  renderer.drawText({
    text: `hp: ${health.currentHealth}/${health.maxHealth}`,
    x,
    y,
    fillStyle: health.currentHealth > lowThreshold ? healthyColor : lowColor,
    fontSize: '12px',
    fontFamily: 'monospace',
    textAlign: 'left',
    textBaseline: 'top'
  });
}

/**
 * Draw collision bounds debug info
 */
export function drawBoundsDebug(renderer, entity, color, fillColor) {
  const bounds = entity.body.bounds;
  renderer.drawRect({
    x: bounds.min.x,
    y: bounds.min.y,
    width: bounds.max.x - bounds.min.x,
    height: bounds.max.y - bounds.min.y,
    strokeStyle: color,
    fillStyle: fillColor,
    lineWidth: 1
  });
}

/**
 * Draw center point debug info
 */
export function drawCenterDebug(renderer, entity, color) {
  renderer.drawArc({
    x: entity.position.x,
    y: entity.position.y,
    radius: 2,
    startAngle: 0,
    endAngle: Math.PI * 2,
    fillStyle: color
  });
} 