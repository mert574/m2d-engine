/**
 * Put a line of text in the canvas's place for a browser without the GPU
 * API a game needs, so the visitor reads why instead of seeing nothing.
 * The caller throws afterwards; no loop ever starts.
 *
 * @param {HTMLCanvasElement|null} canvas - The game's canvas, in a document
 * @param {string|false|null|undefined} text - The game's own line, `false`
 *   to leave the page as it is, or nothing for the engine's wording
 * @param {'WebGL 2'|'WebGPU'} api - What the browser lacks
 */
export function showUnsupported(canvas, text, api) {
  if (text === false) return;
  const document = canvas?.ownerDocument;
  if (!document || typeof canvas.replaceWith !== 'function') return;
  const notice = document.createElement('p');
  notice.className = 'm2d-unsupported';
  notice.textContent = text ?? `This game needs a modern browser with ${api}.`;
  canvas.replaceWith(notice);
}
