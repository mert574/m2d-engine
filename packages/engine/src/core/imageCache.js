/**
 * The game's decoded images, by URL.
 *
 * A level's sprite sheets used to be fetched and decoded again every time
 * the level was entered: a death and a retry paid for the whole art set a
 * second time, and a hub a game walks in and out of paid every trip. The
 * image itself is the same file either way, so it is kept here for the
 * game's life, while what a scene builds on top — the `SpriteSheet` with
 * its animations — stays the scene's own.
 *
 * The invariants, since this crosses the scene boundary:
 * - The cache belongs to the game and is cleared with it (`destroy`), so
 *   two games on a page share nothing and a reload keeps nothing.
 * - The key is the fetched URL, `basePath` included, so two games under
 *   different base paths cannot collide.
 * - An entry is the *promise*, so two scenes asking at once decode once.
 * - A failed load is dropped rather than cached, so a retry can succeed.
 * - Nothing is evicted during a session: a game's art set is bounded and
 *   an image is kept precisely because the game comes back to it.
 * - Headless there are no images at all and nothing reaches this.
 */
export class ImageCache {
  constructor() {
    /** @type {Map<string, Promise<HTMLImageElement>>} */
    this.images = new Map();
    /** How many images this cache has actually decoded; a hit does not raise it. */
    this.decodes = 0;
  }

  /**
   * The decoded image at `url`, decoding it the first time it is asked for.
   * @param {string} url
   * @returns {Promise<HTMLImageElement>}
   */
  load(url) {
    const cached = this.images.get(url);
    if (cached) return cached;
    this.decodes++;
    const pending = new Promise((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = (error) => reject(error);
      image.src = url;
    }).catch((error) => {
      // A broken URL is not a decision: forget it so the next ask retries.
      this.images.delete(url);
      throw error;
    });
    this.images.set(url, pending);
    return pending;
  }

  /** How many images are held. */
  get size() {
    return this.images.size;
  }

  clear() {
    this.images.clear();
  }
}
