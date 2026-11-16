/**
 * Fetching that survives the network, for every file the asset pipeline
 * and the build scripts pull from the web: a transport failure and the
 * server's own 408, 429 and 5xx are asked again after a widening pause; a
 * 404 and malformed content are answered at once.
 */

const ATTEMPTS = 5;
const FIRST_PAUSE_MS = 1000;
/** How long one attempt may take, body and all: a connection that goes quiet is not a connection. */
const TIMEOUT_MS = 10 * 60 * 1000;

/** The wait before attempt `n` (2 and up): one second, doubling. */
const backOff = (attempt) => new Promise((done) => setTimeout(done, FIRST_PAUSE_MS * 2 ** (attempt - 2)));

/** What a transport failure gives: the socket's code, or the message. */
const reason = (what, error) =>
  new Error(`${what}: ${error.cause?.code ?? error.message}`, { cause: error });

/** Whether a failure came from the wire (a reset, a timeout, a body cut short) rather than from what arrived. */
const fromTheWire = (error) =>
  error?.cause?.code !== undefined || error?.message === 'terminated' || error?.name === 'TimeoutError';

/** Whether the server's own answer is worth asking for again. */
const worthRepeating = (status) => status === 408 || status === 429 || status >= 500;

/**
 * Ask for a URL and read the answer. The body is read inside the attempt:
 * a connection lost partway through a download fails the read, not the request.
 *
 * @param {string} url
 * @param {(response: Response) => Promise<T>} read `(response) => response.json()`, and such
 * @param {{ what?: string, headers?: Record<string, string>, pause?: (attempt: number) => Promise<void>, timeoutMs?: number }} [options]
 *   `what` names the URL in an error; `pause` is the wait before a retry and `timeoutMs` the limit on one attempt, both for a test that has no time to wait
 * @returns {Promise<T>}
 * @template T
 */
export async function request(url, read, { what = url, headers, pause = backOff, timeoutMs = TIMEOUT_MS } = {}) {
  // Not a URL at all is not the network's fault; asking five times would not help.
  new URL(url);
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await pause(attempt);
    let response;
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      response = await fetch(url, { signal, ...(headers && { headers }) });
    } catch (error) {
      last = reason(what, error);
      continue;
    }
    if (!response.ok) {
      // The body is not wanted; left unread it would pin the connection.
      void response.body?.cancel().catch(() => {});
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
