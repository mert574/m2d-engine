/**
 * The soft ellipse a thing stands in.
 *
 * Every perspective that fakes a third axis needs one: it is the single
 * cue that says a sprite is on the ground, and when a sprite rises
 * (`elevation`) the shadow staying put while it shrinks and fades is what
 * sells the jump. Draw it at the entity's `renderAnchor`, under the sprite.
 *
 * @param {import('./baseRenderer.js').BaseRenderer} renderer
 * @param {number} x - Render-plane centre
 * @param {number} y - Render-plane centre, the feet
 * @param {number} width - Width of the thing casting it
 * @param {Object} [options]
 * @param {number} [options.spread=1] - Size multiplier; shrink with height
 * @param {number} [options.fade=1] - Opacity multiplier; thin with height
 * @param {number} [options.ratio=0.36] - Height over width of the ellipse
 * @param {string} [options.color='0, 0, 0'] - RGB channels of the shadow
 */
export function drawGroundShadow(renderer, x, y, width, { spread = 1, fade = 1, ratio = 0.36, color = '0, 0, 0' } = {}) {
  const rx = width * 0.55 * spread;
  if (rx <= 0) return;
  renderer.pushTransform({ x, y, scaleX: 1, scaleY: ratio });
  renderer.drawArc({
    x: 0, y: 0, radius: rx,
    fillStyle: {
      type: 'radial', x: 0, y: 0, r0: 0, r1: rx,
      stops: [
        { offset: 0, color: `rgba(${color}, ${0.42 * fade})` },
        { offset: 0.7, color: `rgba(${color}, ${0.22 * fade})` },
        { offset: 1, color: `rgba(${color}, 0)` }
      ]
    }
  });
  renderer.popTransform();
}

/**
 * Shadow parameters for an entity at a given lift: the spread pulls in and
 * the fade thins as it rises, saturating at `maxLift`.
 */
export function shadowForLift(lift, maxLift = 90) {
  const k = Math.min(1, Math.max(0, lift / maxLift));
  return { spread: 1 - k * 0.35, fade: 1 - k * 0.45 };
}
