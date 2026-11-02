/**
 * How a screen arrives and leaves.
 *
 * A transition is a pair of functions: one that sets a screen's starting
 * state and animates it to rest, one that animates it away. Both are handed
 * the screen and the motion manager and return the tween to wait on.
 *
 * They are kept out of `UIScreen` because the choice is editorial, not
 * structural — the same pause menu might slide up in one game and scale in
 * another — and out of the motion system because motion should not know
 * what a screen is.
 *
 * ## What they animate
 *
 * Only `opacity`, `offsetY`/`offsetX` and `scale`, all of which `drawTree`
 * already applies to a whole subtree. That is deliberate: a transition never
 * touches the contents, so a screen full of a layout the author arranged
 * keeps its arrangement while moving as one piece.
 *
 * The *resting* values are the truth. An entrance animates **from** an
 * offset back to wherever the layout put things, so adding a transition can
 * never shift where a screen ends up.
 */

/** Distance a sliding screen travels, in UI units. */
const SLIDE_DISTANCE = 48;

/** How much a scaling screen starts or ends away from its true size. */
const SCALE_AMOUNT = 0.96;

/**
 * Built-in transitions, by name.
 *
 * Each is `{ enter(screen, motion, options), exit(screen, motion, options) }`
 * returning a tween, or `null` for an instant change.
 */
export const TRANSITIONS = Object.freeze({
  none: {
    enter: () => null,
    exit: () => null
  },

  fade: {
    enter: (screen, motion, o) => motion.from(screen, { opacity: 0 }, {
      duration: o.duration, easing: o.enterEasing
    }),
    exit: (screen, motion, o) => motion.to(screen, { opacity: 0 }, {
      duration: o.exitDuration, easing: o.exitEasing
    })
  },

  'slide-up': {
    enter: (screen, motion, o) => motion.from(screen, {
      opacity: 0, offsetY: screen.offsetY + SLIDE_DISTANCE
    }, { duration: o.duration, easing: o.enterEasing }),
    exit: (screen, motion, o) => motion.to(screen, {
      opacity: 0, offsetY: screen.offsetY + SLIDE_DISTANCE
    }, { duration: o.exitDuration, easing: o.exitEasing })
  },

  'slide-down': {
    enter: (screen, motion, o) => motion.from(screen, {
      opacity: 0, offsetY: screen.offsetY - SLIDE_DISTANCE
    }, { duration: o.duration, easing: o.enterEasing }),
    exit: (screen, motion, o) => motion.to(screen, {
      opacity: 0, offsetY: screen.offsetY - SLIDE_DISTANCE
    }, { duration: o.exitDuration, easing: o.exitEasing })
  },

  scale: {
    enter: (screen, motion, o) => motion.from(screen, {
      opacity: 0, scaleX: SCALE_AMOUNT, scaleY: SCALE_AMOUNT
    }, { duration: o.duration, easing: o.enterEasing }),
    exit: (screen, motion, o) => motion.to(screen, {
      opacity: 0, scaleX: SCALE_AMOUNT, scaleY: SCALE_AMOUNT
    }, { duration: o.exitDuration, easing: o.exitEasing })
  }
});

/**
 * Resolve a transition to run.
 * @param {string|Object|null} transition - A name from `TRANSITIONS`, a
 *   custom `{enter, exit}` pair, or null for none
 * @returns {{enter: Function, exit: Function}}
 */
export function resolveTransition(transition) {
  if (!transition) return TRANSITIONS.none;
  if (typeof transition === 'string') return TRANSITIONS[transition] ?? TRANSITIONS.none;
  return {
    enter: transition.enter ?? TRANSITIONS.none.enter,
    exit: transition.exit ?? TRANSITIONS.none.exit
  };
}

/**
 * Timing for a transition, filled in from the theme.
 *
 * Entering decelerates and leaving accelerates, which is the convention
 * every platform's motion guidance lands on: arriving things settle, leaving
 * things get out of the way. Exits are shorter than entrances for the same
 * reason — waiting for a menu you have already dismissed feels broken.
 */
export function transitionTiming(theme, options = {}) {
  return {
    duration: options.duration ?? theme?.get('motion.duration.normal') ?? 0.22,
    exitDuration: options.exitDuration ?? options.duration
      ?? theme?.get('motion.duration.fast') ?? 0.12,
    enterEasing: options.enterEasing ?? theme?.get('motion.easing.decelerate'),
    exitEasing: options.exitEasing ?? theme?.get('motion.easing.accelerate')
  };
}
