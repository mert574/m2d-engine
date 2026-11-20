// The part of Binomial's vendored Basis Universal transcoder that
// `../basis.js` calls. This describes third-party code, not the engine;
// it exists so the vendored script is never compiled and is shipped as is.

export interface KTX2File {
  isValid(): boolean;
  getWidth(): number;
  getHeight(): number;
  getLevels(): number;
  startTranscoding(): boolean;
  getImageTranscodedSizeInBytes(level: number, layer: number, face: number, format: number): number;
  transcodeImage(
    dst: Uint8Array, level: number, layer: number, face: number, format: number,
    getAlphaForOpaqueFormats: number, channel0: number, channel1: number
  ): boolean;
  close(): void;
  delete(): void;
}

export interface BasisModule {
  initializeBasis(): void;
  KTX2File: new (bytes: Uint8Array) => KTX2File;
}

export interface BasisOptions {
  locateFile?: (file: string) => string;
}

declare function BASIS(options?: BasisOptions): Promise<BasisModule>;
export default BASIS;
