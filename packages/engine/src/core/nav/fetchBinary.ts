/**
 * One way to read a binary asset everywhere the simulation runs. In a
 * browser it is a fetch, as every other asset is. In Node — a server's
 * match worker, a headless test — `fetch` cannot read files, so a URL
 * that is not http(s) is read from disk instead, relative to the working
 * directory as the server's scene reads are.
 */
// The engine's lib is the DOM's; the Node globals this one crossing uses
// are declared here, like the WebGPU flag namespaces — a platform
// declaration, not a description of the engine.
declare const process: { versions?: { node?: string } } | undefined;

export async function fetchBinary(url: string): Promise<Uint8Array> {
  const isNode = typeof process !== 'undefined' && process.versions?.node;
  if (isNode && !/^https?:/i.test(url) && !url.startsWith('blob:') && !url.startsWith('data:')) {
    // `import()` of a Node module cannot be *typed* without @types/node,
    // which would put Node's globals in a DOM-lib engine; the specifier is
    // computed so tsc resolves nothing and the shapes are declared here.
    const fs = 'node:fs/promises';
    const nodeUrl = 'node:url';
    const { readFile } = await (import(fs) as Promise<{
      readFile(path: string): Promise<{ buffer: ArrayBuffer; byteOffset: number; byteLength: number }>;
    }>);
    const { fileURLToPath } = await (import(nodeUrl) as Promise<{ fileURLToPath(url: string): string }>);
    const path = url.startsWith('file:') ? fileURLToPath(url) : url;
    const bytes = await readFile(path);
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
}
