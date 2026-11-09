/**
 * The WebGPU device, acquired once per page.
 *
 * Getting a `GPUDevice` is asynchronous and a renderer's `init` is not, so
 * the device is requested up front, the way `initPhysics` compiles the WASM
 * module before any world exists:
 *
 *     await initWebGPU();
 *     const game = new M2D(canvas, { dimensions: 3 });
 *
 * One device serves every renderer on the page. Nothing here knows about
 * the renderer contract.
 */

/** @type {GPUDevice|null} */
let device = null;
/** @type {GPUAdapter|null} */
let adapter = null;
/** @type {Promise<GPUDevice>|null} */
let pending = null;

/** Whether this browser exposes WebGPU at all. */
export function webgpuSupported() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/**
 * Acquire the device. Resolves at once when it already exists; concurrent
 * callers share one request.
 * @param {object} [options]
 * @param {GPUPowerPreference} [options.powerPreference='high-performance']
 * @returns {Promise<GPUDevice>}
 */
export function initWebGPU({ powerPreference = 'high-performance' } = {}) {
  if (device) return Promise.resolve(device);
  if (pending) return pending;
  pending = (async () => {
    if (!webgpuSupported()) {
      throw new Error('M2D: WebGPU is not available in this browser. 3D games need a Chromium browser with WebGPU enabled');
    }
    adapter = await navigator.gpu.requestAdapter({ powerPreference });
    if (!adapter) {
      throw new Error('M2D: no WebGPU adapter. The GPU may be blocklisted, or the browser is running without hardware acceleration');
    }
    // Indirect draws that start at an instance offset, which the 3D
    // renderer's GPU culling relies on, and GPU timestamps for its
    // statistics; the renderer checks `device.features` for both. The
    // compressed-texture families decide what KTX2 textures transcode
    // to (basis.js picks the best one present).
    const requiredFeatures = [
      'timestamp-query', 'indirect-first-instance',
      'texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc'
    ].filter((f) => adapter.features.has(f));
    device = await adapter.requestDevice({ requiredFeatures });
    // Validation errors are asynchronous; without this they vanish silently.
    device.addEventListener('uncapturederror', (event) => {
      console.error(`M2D: WebGPU error: ${event.error.message}`);
    });
    device.lost.then((info) => {
      // A lost device never comes back; the next initWebGPU() asks for a new one.
      if (info.reason !== 'destroyed') console.warn(`M2D: WebGPU device lost (${info.message})`);
      device = null;
      pending = null;
    });
    return device;
  })();
  pending.catch(() => { pending = null; });
  return pending;
}

/**
 * The acquired device, for a renderer's synchronous `init`.
 * @returns {GPUDevice}
 */
export function webgpuDevice() {
  if (!device) {
    throw new Error('M2D: WebGPU is not initialized — await initWebGPU() before constructing M2D');
  }
  return device;
}
