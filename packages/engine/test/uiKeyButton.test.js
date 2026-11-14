import { describe, it, expect } from 'vitest';
import { Container } from '../src/core/ui/container.js';
import { UIKeyButton } from '../src/core/ui/keyButton.js';
import { makeTestGame } from './helpers/testGame.js';
import { pointerDown, pointerUp } from './helpers/input.js';

/**
 * An on-screen key: a press puts its code down through the input seam, the
 * pointer that pressed it lets it up wherever it lifts, and two fingers on
 * two buttons hold two keys.
 */
describe('UIKeyButton', () => {
  function mount() {
    const game = makeTestGame();
    const root = new Container(game);
    game.input.router.uiContainer = root;
    const left = root.add(new UIKeyButton({ code: 'ArrowLeft', x: 100, y: 500, pivot: 'center' }));
    const jump = root.add(new UIKeyButton({ code: 'Space', x: 700, y: 500, pivot: 'center', label: 'JUMP' }));
    root.updateTree(0.016);
    return { game, root, left, jump };
  }

  it('holds its key from press to the same pointer\'s release, wherever that lands', () => {
    const { game, left } = mount();
    pointerDown(game, 100, 500, { pointerId: 7, pointerType: 'touch' });
    expect(left.held).toBe(true);
    expect(game.input.isDown('ArrowLeft')).toBe(true);

    // The finger slid off before lifting.
    pointerUp(game, 300, 300, { pointerId: 7, pointerType: 'touch' });
    expect(left.held).toBe(false);
    expect(game.input.isDown('ArrowLeft')).toBe(false);
  });

  it('is held per pointer, so another finger lifting leaves it down', () => {
    const { game, left, jump } = mount();
    pointerDown(game, 100, 500, { pointerId: 1, pointerType: 'touch' });
    pointerDown(game, 700, 500, { pointerId: 2, pointerType: 'touch' });
    expect(game.input.isDown('ArrowLeft')).toBe(true);
    expect(game.input.isDown('Space')).toBe(true);

    pointerUp(game, 700, 500, { pointerId: 2, pointerType: 'touch' });
    expect(jump.held).toBe(false);
    expect(left.held).toBe(true);
    expect(game.input.isDown('ArrowLeft')).toBe(true);

    pointerUp(game, 100, 500, { pointerId: 1, pointerType: 'touch' });
    expect(game.input.isDown('ArrowLeft')).toBe(false);
  });

  it('lets go when it leaves the tree', () => {
    const { game, root, left } = mount();
    pointerDown(game, 100, 500, { pointerId: 1, pointerType: 'touch' });
    expect(game.input.isDown('ArrowLeft')).toBe(true);
    root.remove(left);
    expect(game.input.isDown('ArrowLeft')).toBe(false);
  });

  it('refuses to exist without a code', () => {
    expect(() => new UIKeyButton({})).toThrow(/key code/);
  });
});
