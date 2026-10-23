import { describe, it, expect } from 'vitest';

import {
  createRenderer,
  registerRenderer,
  BaseRenderer,
  CanvasRenderer,
  UIRenderer
} from '../src/core/renderers/index.js';

describe('renderer registry', () => {
  it('resolves the built-in canvas backend by name', () => {
    expect(createRenderer('canvas')).toBeInstanceOf(CanvasRenderer);
  });

  it('defaults to the canvas backend', () => {
    expect(createRenderer()).toBeInstanceOf(CanvasRenderer);
  });

  it('accepts a renderer class', () => {
    class CustomRenderer extends CanvasRenderer {}
    expect(createRenderer(CustomRenderer)).toBeInstanceOf(CustomRenderer);
  });

  it('passes an existing instance straight through', () => {
    const instance = new CanvasRenderer();
    expect(createRenderer(instance)).toBe(instance);
  });

  it('registers and resolves a new backend', () => {
    class WebGLStub extends BaseRenderer {}
    registerRenderer('webgl-stub', WebGLStub);

    expect(createRenderer('webgl-stub')).toBeInstanceOf(WebGLStub);
  });

  it('throws a helpful error for an unknown backend', () => {
    expect(() => createRenderer('nope')).toThrowError(/Unknown renderer: 'nope'/);
    expect(() => createRenderer('nope')).toThrowError(/canvas/);
  });

  it('exports the pieces a backend author needs', () => {
    expect(BaseRenderer).toBeTypeOf('function');
    expect(UIRenderer).toBeTypeOf('function');
  });
});

describe('BaseRenderer contract', () => {
  it('cannot be instantiated directly', () => {
    expect(() => new BaseRenderer()).toThrowError(/abstract/);
  });

  it('allows subclasses to be instantiated', () => {
    class Subclass extends BaseRenderer {}
    expect(() => new Subclass()).not.toThrow();
  });

  it('throws a clear error for each unimplemented method', () => {
    class Bare extends BaseRenderer {}
    const bare = new Bare();

    const required = [
      ['init', [{}, {}]],
      ['destroy', []],
      ['resize', [1, 1]],
      ['clear', ['#000']],
      ['clearScreen', ['#000']],
      ['endFrame', []],
      ['beginScreenFrame', []],
      ['endScreenFrame', []],
      ['applyCamera', [{}]],
      ['drawSprite', [{}]],
      ['drawImage', [{}]],
      ['drawRect', [{}]],
      ['drawLine', [{}]],
      ['drawArc', [{}]],
      ['drawPath', [{}]],
      ['drawText', [{}]],
      ['pushTransform', [{}]],
      ['popTransform', []],
      ['pushClip', [{}]],
      ['popClip', []],
      ['measureText', ['x', {}]],
      ['setCursor', ['default']]
    ];

    for (const [method, args] of required) {
      expect(() => bare[method](...args), `${method} should report as unimplemented`)
        .toThrowError(/not implemented/i);
    }
  });

  it('provides working shared behaviour without a backend', () => {
    class Bare extends BaseRenderer {}
    const bare = new Bare();

    // hitTest, debug flags, stats and FPS are backend-agnostic.
    expect(bare.hitTest(5, 5, { type: 'rect', x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(bare.isDebugEnabled()).toBe(true);
    expect(bare.getDebugLayer()).toBe('default');
    expect(bare.getStats().drawCalls).toBe(0);
    expect(() => bare.beginFrame()).not.toThrow();
  });

  it('keeps private debug state isolated per instance', () => {
    class Bare extends BaseRenderer {}
    const a = new Bare();
    const b = new Bare();

    a.setDebugEnabled(false);
    a.setDebugLayer('physics');

    expect(b.isDebugEnabled()).toBe(true);
    expect(b.getDebugLayer()).toBe('default');
  });
});
