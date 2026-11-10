/**
 * Declarations for what the editor uses and TypeScript cannot see.
 *
 * The engine is plain JavaScript whose JSDoc nothing checks, so the
 * surface this app touches is declared precisely rather than inferred
 * loosely; when the engine gains checked types (the Types roadmap item)
 * this file goes away.
 */

declare module 'm2d-engine/core/m2d.js' {
  /** A scene registered with the manager; `fetch` may return anything. */
  interface SceneConfig {
    fetch: () => unknown | Promise<unknown>;
    [hook: string]: unknown;
  }

  interface SceneManager {
    addScene(name: string, scene: SceneConfig): void;
    switchTo(name: string): Promise<unknown>;
    getCurrentScene(): unknown;
  }

  export interface M2DOptions {
    dimensions?: number;
    editMode?: boolean;
    headless?: boolean;
    width?: number;
    height?: number;
    worldWidth?: number;
    worldHeight?: number;
    performanceStats?: boolean;
    devConsole?: boolean;
    renderer?: string;
    basePath?: string;
    initialScene?: string;
    [option: string]: unknown;
  }

  export class M2D {
    constructor(canvas: HTMLCanvasElement | null, options?: M2DOptions);
    readonly sceneManager: SceneManager;
    readonly editMode: boolean;
    readonly options: Record<string, unknown>;
    readonly camera: Record<string, unknown>;
    readonly renderer: { dimensions: number };
    readonly input: { on(type: string, handler: (event: never) => void): () => void };
    readonly actors: Map<string, unknown>;
    readonly constraintTypes: Map<string, unknown>;
    registerActor(name: string, ActorClass: unknown): void;
    registerConstraint(name: string, ConstraintClass: unknown): void;
    addView(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; camera: unknown; dimensions: number };
    removeView(view: unknown): void;
    start(): Promise<void>;
    destroy(): void;
  }
}

declare module 'm2d-engine/core/entity.js' {
  export class Entity {
    constructor(body: unknown, sprite: unknown, game: unknown, options?: unknown);
    static properties: Record<string, unknown> | null;
  }
}

declare module 'm2d-engine/core/constraint.js' {
  export class Constraint {
    constructor(entity: unknown, options?: unknown);
    static params: Record<string, unknown> | null;
  }
}

declare module 'm2d-engine/core/physics/index.js' {
  export function initPhysics(options?: { dimensions?: number }): Promise<unknown>;
}

declare module 'm2d-engine/core/renderers/index.js' {
  export function initWebGPU(): Promise<unknown>;
  export function webgpuSupported(): boolean;
}
