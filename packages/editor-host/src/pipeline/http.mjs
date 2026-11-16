/**
 * Fetching that survives the network: one helper for every file the asset
 * pipeline and the build scripts pull from the web.
 *
 * A download of gigabytes meets a dropped connection sooner or later, and
 * a build that treats the first one as fatal throws away everything it
 * had fetched. Here a transport failure and the server's own 408, 429 and
 * 5xx are asked again after a widening pause, while a 404 is answered at
 * once: waiting will not produce the file.
 */

const ATTEMPTS = 5;
const FIRST_PAUSE_MS = 1000;

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/** What a transport failure gives: the socket's code, or the message. */
const reason = (what, error) =>
  new Error(`${what}: ${error.cause?.code ?? error.message}`, { cause: error });

/** Whether a failure came from the wire (a reset, a timeout, a body cut short) rather than from what arrived. */
const fromTheWire = (error) => error?.cause?.code !== undefined || error?.name === 'TypeError';

/** Whether the server's own answer is worth asking for again. */
const worthRepeating = (status) => status === 408 || status === 429 || status >= 500;

/**
 * Ask for a URL and read the answer, retried as described above. The body
 * is read inside the attempt, because a connection lost partway through a
 * 300 MB download fails the read rather than the request.
 *
 * @param {string} url
 * @param {(response: Response) => Promise<T>} read `(response) => response.json()`, and such
 * @param {{ what?: string, headers?: Record<string, string> }} [options] `what` names the URL in an error
 * @returns {Promise<T>}
 * @template T
 */
export async function request(url, read, { what = url, headers } = {}) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await pause(FIRST_PAUSE_MS * 2 ** (attempt - 2));
    let response;
    try {
      response = await fetch(url, headers ? { headers } : undefined);
    } catch (error) {
      last = reason(what, error);
      continue;
    }
    if (!response.ok) {
      // The body is not wanted; left unread it would pin the connection.
      void response.body?.cancel();
      const refused = new Error(`${what}: ${response.status}`);
      if (!worthRepeating(response.status)) throw refused;
      last = refused;
      continue;
    }
    try {
      return await read(response);
    } catch (error) {
      // A body cut short is the wire; malformed content will not improve.
      if (!fromTheWire(error)) throw reason(what, error);
      last = reason(what, error);
    }
  }
  throw new Error(`${last.message}, after ${ATTEMPTS} attempts`, { cause: last });
}

/** The bytes at a URL, as a Buffer-ready ArrayBuffer. */
export const bytes = (url, options) => request(url, (response) => response.arrayBuffer(), options);
