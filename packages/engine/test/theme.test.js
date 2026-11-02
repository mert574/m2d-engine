import { describe, it, expect, vi } from 'vitest';
import { createTheme, DEFAULT_THEME, resolveStateStyle } from '../src/core/ui/theme.js';

/**
 * Design tokens. The point of the theme is that a component never names a
 * colour, so these tests are about resolution and layering rather than about
 * any particular palette.
 */
describe('Theme', () => {
  describe('resolution', () => {
    it('resolves a dotted token path', () => {
      const theme = createTheme();
      expect(theme.resolve('$color.surface.default'))
        .toBe(DEFAULT_THEME.color.surface.default);
    });

    it('passes literals through untouched', () => {
      const theme = createTheme();
      // A component is never forced through the theme: a game with one
      // bespoke colour should not have to register it first.
      expect(theme.resolve('#ff0000')).toBe('#ff0000');
      expect(theme.resolve('rgba(0,0,0,0.5)')).toBe('rgba(0,0,0,0.5)');
      expect(theme.resolve(12)).toBe(12);
      expect(theme.resolve(undefined)).toBe(undefined);
    });

    it('follows a token that points at another token', () => {
      // This is what lets the semantic layer be written in terms of the raw
      // ramp, so overriding one palette entry moves everything built on it.
      const theme = createTheme();
      expect(theme.resolve('$color.text.primary'))
        .toBe(DEFAULT_THEME.color.palette.slate[50]);
    });

    it('warns and yields null for an unknown token', () => {
      const theme = createTheme();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(theme.resolve('$color.nope')).toBe(null);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('$color.nope'));
      warn.mockRestore();
    });

    it('gives up on a reference cycle instead of hanging', () => {
      const theme = createTheme({ color: { a: '$color.b', b: '$color.a' } });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(theme.resolve('$color.a')).toBe(null);
      warn.mockRestore();
    });

    it('caches, so the hot path does not re-walk the tree', () => {
      const theme = createTheme();
      const first = theme.resolve('$color.accent.default');
      expect(theme.cache.get('$color.accent.default')).toBe(first);
      expect(theme.resolve('$color.accent.default')).toBe(first);
    });
  });

  describe('overrides', () => {
    it('merges deeply, leaving siblings alone', () => {
      const theme = createTheme({ color: { accent: { default: '#ff6600' } } });

      expect(theme.resolve('$color.accent.default')).toBe('#ff6600');
      expect(theme.resolve('$color.accent.hover'))
        .toBe(DEFAULT_THEME.color.palette.cyan[400]);
      expect(theme.get('font.size.body')).toBe(DEFAULT_THEME.font.size.body);
    });

    it('re-pointing a palette entry moves everything built on it', () => {
      const theme = createTheme({ color: { palette: { slate: { 50: '#ffffff' } } } });
      expect(theme.resolve('$color.text.primary')).toBe('#ffffff');
    });

    it('replaces non-object values wholesale', () => {
      const linear = (t) => t;
      const theme = createTheme({ motion: { easing: { standard: linear } } });
      expect(theme.get('motion.easing.standard')).toBe(linear);
      expect(theme.get('motion.easing.decelerate'))
        .toBe(DEFAULT_THEME.motion.easing.decelerate);
    });

    it('extend layers a second set of overrides without touching the first', () => {
      const base = createTheme({ color: { accent: { default: '#111111' } } });
      const variant = base.extend({ color: { accent: { hover: '#222222' } } });

      expect(variant.resolve('$color.accent.default')).toBe('#111111');
      expect(variant.resolve('$color.accent.hover')).toBe('#222222');
      expect(base.resolve('$color.accent.hover'))
        .toBe(DEFAULT_THEME.color.palette.cyan[400]);
    });

    it('does not mutate the frozen default', () => {
      createTheme({ color: { accent: { default: '#ff6600' } } });
      expect(DEFAULT_THEME.color.accent.default).toBe('$color.palette.cyan.500');
    });
  });

  describe('resolveStateStyle', () => {
    const style = {
      background: 'base',
      textColor: 'baseText',
      hovered: { background: 'hover' },
      pressed: { background: 'press' },
      disabled: { background: 'off', textColor: 'offText' }
    };

    it('returns the base style with no state deltas applied', () => {
      expect(resolveStateStyle(style, 'normal'))
        .toEqual({ background: 'base', textColor: 'baseText' });
    });

    it('applies the matching delta over the base', () => {
      expect(resolveStateStyle(style, 'hovered'))
        .toEqual({ background: 'hover', textColor: 'baseText' });
    });

    it('layers pressed on top of hovered', () => {
      // A pressed control is still under the pointer, so it keeps whatever
      // the hover state changed unless `pressed` says otherwise.
      const layered = resolveStateStyle(
        { ...style, hovered: { background: 'hover', textColor: 'hoverText' } },
        'pressed'
      );
      expect(layered).toEqual({ background: 'press', textColor: 'hoverText' });
    });

    it('treats disabled as terminal', () => {
      expect(resolveStateStyle(style, 'disabled'))
        .toEqual({ background: 'off', textColor: 'offText' });
    });

    it('never leaks state keys into the flattened result', () => {
      for (const state of ['normal', 'hovered', 'pressed', 'focused', 'disabled']) {
        const flat = resolveStateStyle(style, state);
        expect(Object.keys(flat)).not.toContain('hovered');
        expect(Object.keys(flat)).not.toContain('disabled');
      }
    });
  });
});
