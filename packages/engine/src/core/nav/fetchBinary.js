/**
 * One way to read a binary asset everywhere the simulation runs. In a
 * browser it is a fetch, as every other asset is. In Node — a server's
 * match worker, a headless test — `fetch` cannot read files, so a URL
 * that is not http(s) is read from disk instead, relative to the working
 * directory as the server's scene reads are.
 */
export async function fetchBinary(url) {
  const isNode = typeof process !== 'undefined' && process.versions?.node;
  if (isNode && !/^https?:/i.test(url) && !url.startsWith('blob:') && !url.startsWith('data:')) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = url.startsWith('file:') ? fileURLToPath(url) : url;
    const bytes = await readFile(path);
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
}
