import { UIScreen } from 'm2d-engine/core/ui/screen.js';
import { UIBackdrop } from 'm2d-engine/core/ui/backdrop.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIRectangle } from 'm2d-engine/core/ui/Rectangle.js';
import { UIMenuItem } from 'm2d-engine/core/ui/menuItem.js';
import { Stack, Spacer } from 'm2d-engine/core/ui/layout/stack.js';

/**
 * The main menu every example shares.
 *
 * ## Why it looks the way it does
 *
 * The first version of this was a centred column of filled, rounded buttons
 * on a graded wash. That is a *web* composition — a hero section — and it
 * read as one. Three things move it towards a game:
 *
 * 1. **The items are type, not chrome.** `UIMenuItem` draws a tracked-out
 *    uppercase label with a bar in the margin, not a pill you click. Almost
 *    no shipped game puts its main menu in rounded rectangles.
 * 2. **The composition is off-centre.** Game menus sit to one side and let
 *    the art breathe on the other; dead-centre with even margins is a
 *    landing page. This one anchors to the left third, with the title and a
 *    rule above the list and the hint pinned to the bottom edge.
 * 3. **The type does the work.** A large, light display title against small
 *    tracked caps, rather than everything at body weight.
 *
 * ## The entrance
 *
 * The column slides in from the left while the items light up one after
 * another. The slide is on the *stack*, not the items, because a layout
 * owns its children's offsets and would overwrite anything animating them —
 * opacity is what is safe to stagger.
 */
/**
 * Darkness behind the column, fading out towards the art.
 *
 * Every shipped menu with a picture behind it does this somewhere: Control
 * keeps its list on a near-black panel, Portal 2 lets the environment go
 * dark on the left. Without it a bright skyline or a sweep passing under
 * the title makes the type flicker in and out of legibility.
 *
 * @param {number} strength - Opacity at the left edge
 * @returns {import('m2d-engine/core/ui/backdrop.js').BackdropLayer}
 */
function readabilityWash(strength) {
  return {
    draw(paint, { width, height }) {
      paint.drawRect({
        x: 0, y: 0, width, height,
        fillStyle: {
          type: 'linear',
          x0: 0, y0: 0, x1: width * 0.62, y1: 0,
          stops: [
            { offset: 0, color: `rgba(3, 5, 9, ${strength})` },
            { offset: 0.5, color: `rgba(3, 5, 9, ${strength * 0.55})` },
            { offset: 1, color: 'rgba(3, 5, 9, 0)' }
          ]
        }
      });
    }
  };
}

class MainMenuScreen extends UIScreen {
  /**
   * @param {Object} options
   * @param {string} options.title
   * @param {string} [options.subtitle]
   * @param {string} [options.hint] - Controls line along the bottom
   * @param {Array<{text: string, onSelect: Function}>} options.items
   * @param {Object} [options.backdrop] - `UIBackdrop` options. Each example
   *   brings its own scene as `layers` (see its `menuBackdrop.js`)
   * @param {number} [options.wash=0.8] - Strength of the darkening behind
   *   the column, 0 for none
   */
  constructor({ title, subtitle, hint, items, backdrop = {}, wash = 0.8 }) {
    super({
      name: 'mainMenu',
      blocking: true,
      // The menu *is* the screen here, so there is nothing behind it worth
      // dimming and no scene to pause.
      scrim: false,
      transition: 'fade',
      closeOnEscape: false
    });

    this.add(new UIBackdrop({
      gradient: { from: '$color.bg.base', to: '$color.palette.ink.800', angle: 110 },
      motes: 70,
      vignette: 0.6,
      ...backdrop,
      // The wash goes on top of the scene and under the motes: the art can
      // be as busy as it likes on the right, and the type still reads.
      layers: [...(backdrop.layers ?? []), ...(wash > 0 ? [readabilityWash(wash)] : [])]
    }));

    // Anchored to the left edge and a little above centre: the classic
    // placement, and it leaves the right two thirds to the art.
    this.column = this.add(new Stack({
      anchor: 'left',
      pivot: 'left',
      x: 96,
      direction: 'column',
      width: 340,
      gap: 0,
      align: 'stretch'
    }));

    this.column.add(new UIText({
      text: title,
      fontSize: '$font.size.display',
      // A light cut at display size, pulled in slightly: large type needs
      // tracking taken *out*, not added.
      fontWeight: '$font.weight.thin',
      letterSpacing: '$font.tracking.tight',
      color: '$color.text.primary'
    }));

    if (subtitle) {
      this.column.add(new UIText({
        text: subtitle.toUpperCase(),
        fontSize: '$font.size.caption',
        fontWeight: '$font.weight.medium',
        letterSpacing: '$font.tracking.widest',
        color: '$color.text.accent'
      }));
    }

    this.column.add(new Spacer({ size: '$space.lg' }));
    // A hairline rule: the cheapest way to separate a title from a list
    // without drawing a box around either.
    this.column.add(new UIRectangle({
      height: 1,
      color: '$color.border.default',
      pivot: 'top-left'
    }));
    this.column.add(new Spacer({ size: '$space.md' }));

    /** The lines, kept for the staggered entrance. */
    this.items = items.map((item) => this.column.add(new UIMenuItem({
      text: item.text,
      onSelect: () => item.onSelect()
    })));

    if (hint) {
      this.add(new UIText({
        text: hint,
        anchor: 'bottom-left',
        x: 96,
        // Clear of the frame-rate readout, which the engine pins to the
        // bottom-left corner of the same screen.
        y: -76,
        fontSize: '$font.size.caption',
        letterSpacing: '$font.tracking.wide',
        color: '$color.text.muted'
      }));
    }
  }

  onEnter() {
    const motion = this.game.motion;

    // The column arrives from the left as one piece...
    motion.from(this.column, { offsetX: this.column.offsetX - 32 }, {
      duration: '$motion.duration.slow',
      easing: '$motion.easing.decelerate'
    });

    // ...and the lines light up in sequence. Opacity only: the stack owns
    // their offsets and would overwrite a positional tween every frame.
    motion.stagger(this.items, { opacity: 1 }, {
      from: { opacity: 0 },
      duration: '$motion.duration.normal',
      delay: '$motion.duration.fast',
      stagger: 0.07
    });
  }
}

/**
 * Build the shared main menu.
 * @param {import('m2d-engine/core/m2d.js').M2D} game
 * @param {Object} options - See `MainMenuScreen`
 * @returns {MainMenuScreen}
 */
export function createMainMenu(game, options) {
  return new MainMenuScreen(options);
}

/**
 * Register a `mainMenu` scene that is only a shell for the screen.
 *
 * The engine always has a current scene, and this one draws nothing: the
 * menu above it is the whole picture. Entering pushes the screen, leaving
 * pops it, so switching to a level tears the menu down on the way out.
 *
 * @param {import('m2d-engine/core/m2d.js').M2D} game
 * @param {Object} options - See `MainMenuScreen`, minus `items`
 * @param {(game) => Array} options.items - Built per entry, so a menu item
 *   can close over the game without a load-order problem
 * @param {() => void} [options.onEnter] - Runs alongside the screen going up
 * @param {() => void} [options.onExit] - Runs alongside it coming down
 */
export function registerMainMenu(game, { items, onEnter, onExit, ...options }) {
  let screen = null;

  game.sceneManager.addScene('mainMenu', {
    fetch: async () => ({
      version: 1, name: 'mainMenu', type: 'ui', title: 'Main Menu', assets: {}, elements: []
    }),
    onEnter() {
      screen = createMainMenu(game, { ...options, items: items(game) });
      game.ui.push(screen);
      onEnter?.();
    },
    onExit() {
      if (screen) game.ui.remove(screen);
      screen = null;
      onExit?.();
    }
  });
}
