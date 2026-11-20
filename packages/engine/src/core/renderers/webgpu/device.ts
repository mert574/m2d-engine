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

let device: GPUDevice | null = null;
let adapter: GPUAdapter | null = null;
let pending: Promise<GPUDevice> | null = null;

/** Whether this browser exposes WebGPU at all. */
export function webgpuSupported() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/**
 * Acquire the device. Resolves at once when it already exists; concurrent
 * callers share one request.
 */
export function initWebGPU({ powerPreference = 'high-performance' }: { powerPreference?: GPUPowerPreference } = {}): Promise<GPUDevice> {
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
    const gpu = adapter;
    // Indirect draws that start at an instance offset, which the 3D
    // renderer's GPU culling relies on, and GPU timestamps for its
    // statistics; the renderer checks `device.features` for both. The
    // compressed-texture families decide what KTX2 textures transcode
    // to (basis.js picks the best one present).
    const requiredFeatures = ([
      'timestamp-query', 'indirect-first-instance',
      'texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc'
    ] as GPUFeatureName[]).filter((f) => gpu.features.has(f));
    // The buffer limits the adapter offers rather than the spec's
    // defaults: a resident scene of tens of thousands of props lays one
    // record per drawn primitive into the instance buffer, which passes
    // the default 128 MB storage binding long before the GPU runs out.
    // The renderer reads `device.limits` and never grows a buffer past it.
    const requiredLimits = {
      maxBufferSize: gpu.limits.maxBufferSize,
      maxStorageBufferBindingSize: gpu.limits.maxStorageBufferBindingSize
    };
    const acquired = await gpu.requestDevice({ requiredFeatures, requiredLimits });
    device = acquired;
    // Validation errors are asynchronous; without this they vanish silently.
    acquired.addEventListener('uncapturederror', (event) => {
      console.error(`M2D: WebGPU error: ${(event as GPUUncapturedErrorEvent).error.message}`);
    });
    acquired.lost.then((info) => {
      // A lost device never comes back; the next initWebGPU() asks for a new one.
      if (info.reason !== 'destroyed') console.warn(`M2D: WebGPU device lost (${info.message})`);
      device = null;
      pending = null;
    });
    return acquired;
  })();
  pending.catch(() => { pending = null; });
  return pending;
}

/** The acquired device, for a renderer's synchronous `init`. */
export function webgpuDevice(): GPUDevice {
  if (!device) {
    throw new Error('M2D: WebGPU is not initialized — await initWebGPU() before constructing M2D');
  }
  return device;
}
