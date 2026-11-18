/**
 * Where a draw pass actually put its ink, in world units.
 *
 * The engine's renderers are immediate-mode: an entity submits geometry
 * whatever the camera is doing, and the view cull is what decides whether
 * to ask it at all. So "does this entity draw beyond its body" cannot be
 * answered by moving the camera — it has to be answered by looking at the
 * coordinates the entity submits, through whatever transform it pushed.
 *
 * `extentOf(renderer.calls)` replays a recording renderer's calls, keeps
 * the transform and clip stacks, and returns the world-space box they
 * covered, or null for a pass that drew nothing. Screen-space calls are
 * ignored: they are not in the world and the cull never governs them.
 *
 * Clips matter as much as the ink: tiling a texture over a rectangle lays
 * whole tiles that overhang it and clips them away, so counting the ink
 * alone would report a wall twice its size.
 */

/** One point through a transform: scale, then rotate, then translate. */
function place(transform, x, y) {
  const sx = x * (transform.scaleX ?? 1);
  const sy = y * (transform.scaleY ?? 1);
  const rotation = transform.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: (transform.x ?? 0) + sx * cos - sy * sin,
    y: (transform.y ?? 0) + sx * sin + sy * cos
  };
}

/** The points a call puts ink at, in the space the call was made in. */
function pointsOf(method, options) {
  if (!options) return [];
  const box = (x, y, width, height) => [{ x, y }, { x: x + width, y: y + height }];
  switch (method) {
    case 'drawRect':
    case 'drawImage':
      return box(options.x, options.y, options.width ?? 0, options.height ?? 0);
    case 'drawSprite':
    case 'drawAnimation': {
      // Centred on its point; `drawImage` is the top-left-anchored one.
      const width = options.width ?? options.tileWidth ?? 0;
      const height = options.height ?? options.tileHeight ?? 0;
      return box(options.x - width / 2, options.y - height / 2, width, height);
    }
    case 'drawArc':
    case 'drawLight':
      return box(options.x - options.radius, options.y - options.radius, options.radius * 2, options.radius * 2);
    case 'drawLine':
      return [{ x: options.x1, y: options.y1 }, { x: options.x2, y: options.y2 }];
    case 'drawPath':
      return options.points ?? [];
    case 'drawText':
      return [{ x: options.x, y: options.y }];
    default:
      return [];
  }
}

/**
 * The world box a recording renderer's calls covered.
 * @param {Array<{method: string, args: any[]}>} calls
 * @returns {{left: number, top: number, right: number, bottom: number}|null}
 */
export function extentOf(calls) {
  const stack = [];
  const clips = [];
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  /** A point in the space of the calls, carried out to the world. */
  const toWorld = (point) => {
    let at = { x: point.x, y: point.y };
    for (let i = stack.length - 1; i >= 0; i--) at = place(stack[i], at.x, at.y);
    return at;
  };
  for (const { method, args } of calls) {
    const options = args[0];
    if (method === 'pushTransform') { stack.push(options ?? {}); continue; }
    if (method === 'popTransform') { stack.pop(); continue; }
    if (method === 'pushClip') {
      const a = toWorld({ x: options.x, y: options.y });
      const b = toWorld({ x: options.x + (options.width ?? 0), y: options.y + (options.height ?? 0) });
      clips.push({
        left: Math.min(a.x, b.x), right: Math.max(a.x, b.x),
        top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y)
      });
      continue;
    }
    if (method === 'popClip') { clips.pop(); continue; }
    if (options?.isScreenSpace) continue;
    const clip = clips[clips.length - 1];
    for (const point of pointsOf(method, options)) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const at = toWorld(point);
      // Nothing is drawn outside the clip, so that is where the ink stops.
      const x = clip ? Math.min(clip.right, Math.max(clip.left, at.x)) : at.x;
      const y = clip ? Math.min(clip.bottom, Math.max(clip.top, at.y)) : at.y;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, right, bottom };
}
