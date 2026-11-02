# UI components

Screen-space components from `m2d-engine/core/ui/`. Every component takes a single options object. Positions are offsets from the element's anchor, in UI units. See [UI](../guide/ui) for usage and [Theme tokens](#theme-tokens) for the `$token` syntax every colour and size accepts.

## UIElement

`new UIElement(options)` from `uiElement.js`. The base class: a box in a tree.

### Box

| Option | Default | Meaning |
| --- | --- | --- |
| `x`, `y` | `0` | Offset from the anchor |
| `width`, `height` | — | Size in UI units |
| `anchor` | `'top-left'` | Point **in the parent's content box** the offset is measured from |
| `pivot` | `'center'` | Point **of this element** that lands on the resolved position |
| `padding` | `0` | Content inset. A number, `[vertical, horizontal]`, `[top, right, bottom, left]`, or `{top, right, bottom, left}` |

Both `anchor` and `pivot` take the nine names `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`.

### Appearance

| Option | Default | Meaning |
| --- | --- | --- |
| `visible` | `true` | Skips the element and its descendants in drawing and hit testing |
| `enabled` | `true` | A disabled element still consumes input but runs no handlers |
| `opacity` | `1` | Compounds down the tree |
| `scale` / `scaleX` / `scaleY` | `1` | Scale about the pivot, applied to descendants too |
| `rotation` | `0` | Radians about the pivot |
| `clipChildren` | `false` | Clip descendants to this frame, and stop hit testing outside it |
| `theme` | inherited | Theme override for this subtree |

### Input

| Option | Default | Meaning |
| --- | --- | --- |
| `consume` | `true` | Consume handled events |
| `focusable` | `false` | Whether focus navigation can land here |

### Members

| Member | Meaning |
| --- | --- |
| `x`, `y` | Resolved position of the pivot. Writing them writes the offset |
| `offsetX`, `offsetY` | The stored offset |
| `frame` | `{x, y, width, height}` the element covers, derived from position and pivot |
| `contentBox` | `frame` minus `padding`: where children are laid out |
| `parentBox` | The box this element's anchor resolves against |
| `alpha` | `opacity` times every ancestor's |
| `state` | `'normal'`, `'hovered'`, `'pressed'` or `'disabled'`. **Focus renders as hover** — a keyboard-selected control and a pointer-hovered one mean the same thing to a player, so there is no separate focused state and nothing draws a ring |
| `isHovered`, `isPressed`, `isFocused` | State tracked by the router |
| `parent`, `children` | The tree. Later children draw on top and hit-test first |
| `game`, `theme`, `paint` | Context; see [Writing a component](../guide/ui#writing-a-component) |
| `mounted` | Whether the element is attached to a live tree |

### Methods

| Method | Meaning |
| --- | --- |
| `add(child)` | Append a child, re-parenting it if needed. Returns the child |
| `remove(child)`, `clear()`, `removeFromParent()` | |
| `update(deltaTime)`, `draw(deltaTime)` | Per-frame hooks to override. `draw` draws only this element |
| `layout()` | Place this element's children. Called after they have updated, so nested layouts resolve innermost-first |
| `updateTree(dt)`, `drawTree(dt)` | Traversals the engine calls. `drawTree` applies opacity, transform, clipping and the focus ring |
| `onMount()`, `onUnmount()` | Called when the element joins or leaves a live tree. Unmount runs children first |
| `contains(x, y)` | Hit test against `frame` |
| `hitTest(x, y, exclude)` | Topmost element in this subtree at a point |
| `wants(...types)` | Declare interest in event types outside the default set of `pointerdown`, `pointerup`, `click`, `hover` and `hoverend`. Switches on recognition of `doubleclick`, touch `rightclick` and the drag events, and makes the element consume the types it names |
| `handles(type)`, `treeHandles(type)` | Whether this element, or anything under it, wants an event type |
| `styleFor(style)` | Flatten a style declaration against the current `state` |
| `destroy()` | Tear down the subtree and detach |

An element is a hit target only when it has a positive `width` and `height`.

## UIPanel

`new UIPanel(options)` from `panel.js`. A themed surface: the box other chrome sits on.

| Option | Default |
| --- | --- |
| `surface` | `'default'`. One of `'default'`, `'raised'`, `'sunken'`, `'none'` |
| `background` | — Explicit fill, overriding `surface`. Colour, token, or gradient descriptor |
| `borderColor` | `'$color.border.subtle'`. `null` for none |
| `borderWidth` | `'$border.hairline'` |
| `cornerRadius` | `'$radius.lg'` |
| `elevation` | `'none'`. One of `'none'`, `'low'`, `'medium'`, `'high'` |
| `fitContent` | `false`. Size to the bounding box of the children plus padding |
| `interactive` | `false` |
| `pivot` | `'center'` |

## UIButton

`new UIButton(options)` from `button.js`. Fires `onClick(event)` on release, so a press that slides off is cancelled.

| Option | Default |
| --- | --- |
| `text` | `''` |
| `onClick` | — |
| `variant` | `'secondary'`. One of `'primary'`, `'secondary'`, `'ghost'`, `'danger'` |
| `width`, `height` | `200`, `44` |
| `background`, `textColor`, `borderColor`, `fontWeight` | Override the variant's resting value; the hover and pressed states stay intact |
| `borderWidth` | `'$border.hairline'` |
| `cornerRadius` | `'$radius.md'` |
| `fontSize` | `'$font.size.body'` |
| `fontFamily` | The theme's UI face |
| `fontStyle` | `'normal'` |
| `elevation` | `'none'` |
| `styles` | Replace the variant declaration outright |
| `pivot` | `'center'` |

`BUTTON_VARIANTS` is exported, so a game can read or extend the declarations.

## UIMenuItem

`new UIMenuItem(options)` from `menuItem.js`. One line in a game menu: a tracked-out uppercase label with a bar in the margin, not a filled rectangle. A column of `UIButton`s is the clearest single reason a main menu reads as a web page; this is the alternative.

| Option | Default | Meaning |
| --- | --- | --- |
| `text` | `''` | |
| `onSelect` | — | Click, or Enter while selected |
| `height` | `44` | |
| `uppercase` | `true` | |
| `indent` | `14` | How far the line steps right when selected |
| `barWidth` | `3` | Width of the selection bar |
| `align` | `'left'` | `'left'` or `'center'`. A centred item draws no bar |
| `fontSize` | `'$font.size.subheading'` | |
| `fontWeight` | `'$font.weight.medium'` | |
| `letterSpacing` | `'$font.tracking.wide'` | |
| `color`, `selectedColor`, `barColor` | theme | |

`isSelected` is true when hovered **or** focused — the pointer and the d-pad light up the same line the same way. `selectedAmount` eases between 0 and 1 and drives the bar, the brightening and the step.

## UIText

`new UIText(options)` from `text.js`. Measures itself, so it has a real box and can be nested and hit-tested.

| Option | Default |
| --- | --- |
| `text` | `''` |
| `color` | `'$color.text.primary'` |
| `fontSize` | `'$font.size.body'` |
| `fontFamily` | The theme's UI face |
| `fontWeight` | `'$font.weight.regular'` |
| `fontStyle` | `'normal'`. `'italic'` for italic |
| `letterSpacing` | — Tracking, in units or a `$font.tracking.*` token. Counted in the measured width, so a tracked label lays out at the width it occupies |
| `align` | `'left'`. `'left'`, `'center'` or `'right'` |
| `baseline` | `'top'`. `'top'`, `'middle'` or `'bottom'` |
| `outlineColor`, `outlineWidth` | — , `3`. An outline drawn behind the fill, for text over busy art |
| `elevation` | `'none'` |
| `interactive` | `false` |

`text` and the font fields can be changed at any time; the box re-measures on the next frame. Setting `align` or `baseline` moves the `pivot` to match, unless a `pivot` was given explicitly. `measure()` re-measures immediately.

## UIImage

`new UIImage(options)` from `Image.js`.

| Option | Default |
| --- | --- |
| `image` | — |
| `width`, `height` | The image's size |
| `imageScale` | `1`. Multiplier on the drawn size, distinct from `UIElement`'s `scale` transform |
| `tint` | — Requires the `tint` capability |
| `interactive` | `false` |
| `pivot` | `'center'` |

## UIRectangle

`new UIRectangle(options)` from `Rectangle.js`. A flat shape. For chrome, use `UIPanel`.

| Option | Default | Meaning |
| --- | --- | --- |
| `color` | `'$color.surface.default'` | Colour, token, or gradient descriptor |
| `fill` | `false` | Cover the whole UI space every frame |
| `interactive` | `false` | Take part in hit testing |
| `borderColor`, `borderWidth`, `cornerRadius` | `null`, `'$border.hairline'`, `0` | |
| `pivot` | `'center'` | |

## Stack

`new Stack(options)` from `layout/stack.js`. Lays children out in a row or a column, writing their offsets and pinning their `anchor` and `pivot` to `top-left` — so setting a child's `x` inside a stack has no effect.

| Option | Default | Meaning |
| --- | --- | --- |
| `direction` | `'column'` | `'row'` or `'column'` |
| `gap` | `'$space.md'` | Space between children |
| `align` | `'stretch'` | Cross-axis placement: `'start'`, `'center'`, `'end'` or `'stretch'`. `'stretch'` gives every child the stack's cross size |
| `justify` | `'start'` | Main-axis distribution: `'start'`, `'center'`, `'end'`, `'space-between'` or `'space-around'`. Needs a fixed size on the main axis to have any free space to distribute |
| `width`, `height` | — | Fixed on that axis. An axis with no size given is sized to its content, plus padding |

| Member | Meaning |
| --- | --- |
| `measureContent()` | Natural size of the contents, before any fixed size applies |
| `laidOut` | Children taking part in layout. Invisible children are skipped, so a hidden row collapses rather than leaving a hole |
| `fixedWidth`, `fixedHeight` | The sizes given, kept apart from `width`/`height`, which `layout` writes |
| `setFixedSize({width, height})` | Change them; `null` returns an axis to content sizing |

## Spacer

`new Spacer(options)` from `layout/stack.js`. Blank space in a stack, sized by `size` (a number or token). Never a hit target.

## Grid

`new Grid(options)` from `layout/grid.js`. Uniform cells on a fixed column count, wrapping to new rows.

| Option | Default | Meaning |
| --- | --- | --- |
| `columns` | `2` | Cells per row |
| `gap` | `'$space.md'` | Both directions unless overridden |
| `rowGap`, `columnGap` | from `gap` | |
| `cellWidth`, `cellHeight` | widest / tallest child | |
| `align` | `'stretch'` | How a child sits in its cell |

`metrics()` returns the resolved `{width, height, columnGap, rowGap, rows, columns}`.

## UIScreen

`new UIScreen(options)` from `screen.js`. A named piece of UI above the game, pushed onto `game.ui`. Its frame is the whole display, and it is never itself a hit target.

| Option | Default | Meaning |
| --- | --- | --- |
| `name` | `'screen'` | Identifier for `popTo` and `has` |
| `blocking` | `true` | Consume input rather than letting it reach the scene and world below |
| `scrim` | `false` | Dim what is behind |
| `scrimColor` | `'$color.bg.scrim'` | |
| `pauseGame` | `false` | Freeze the simulation while on the stack, restoring the previous pause state on the way out |
| `closeOnEscape` | `true` | Escape pops the screen |
| `autoFocus` | `true` | Focus the first control on entry, so a controller can use it immediately |

| Member | Meaning |
| --- | --- |
| `focus` | The screen's own `FocusManager`, scoped to it |
| `owner` | The `ScreenStack` holding it, or `null` |
| `close()` | Remove from the stack |
| `onEnter()`, `onExit()` | Called around the push and pop |
| `handleInput(event)` | Routed input. The default walks the element tree, then handles Tab, the arrows, Enter, Space and Escape |

## ScreenStack

`game.ui` from `screenStack.js`. Holds the screens and the debug layer. Replaces the old `game.overlays`.

| Member | Meaning |
| --- | --- |
| `push(screen)` | Push on top. Returns the screen |
| `pop()` | Pop the top. Returns it, or `null` |
| `remove(screen)` | Remove one from anywhere in the stack |
| `replace(screen)` | Pop then push, for a sideways move |
| `popTo(name)` | Pop until that screen is on top |
| `clear()` | Pop everything |
| `top`, `screens` | The topmost screen; the array, bottom first |
| `has(name)`, `get(name)` | |
| `capturesInput` | Whether any screen blocks input — what "a menu is open" means |
| `debug` | A `UIElement` layer above every screen, outside the scene's container. The frame-rate readout lives here |
| `isEmpty` | Whether there is anything to draw |
| `update(dt)`, `draw(dt)` | Called by the engine loop |

Drawing runs bottom-up: scene UI, then screens from the bottom of the stack, then the debug layer, then the cursor. Input runs the other way: the debug layer first, then screens from the top down, stopping at the first `blocking` one.

## FocusManager

`screen.focus` from `focus.js`. Keyboard and gamepad navigation over one subtree.

| Member | Meaning |
| --- | --- |
| `focused` | The focused element, or `null` |
| `candidates()` | Every focusable element under the root, in draw order |
| `focus(element)`, `blur()`, `focusFirst()` | |
| `advance(step)` | Next or previous in draw order, wrapping. `-1` for Shift+Tab |
| `move(direction)` | Geometric movement: `'up'`, `'down'`, `'left'` or `'right'`. Prefers candidates that overlap the current element on the perpendicular axis, then nearer ones, so a straight press travels straight. Does not wrap |
| — | Hovering a focusable control hands focus to it, so the keyboard's selection and the pointer's are never two different highlights |
| `activate(makeEvent)` | Press, release and click the focused element |
| `prune()` | Drop focus if the focused element was hidden, disabled or removed |
| `keyboardMode` | Whether focus was last moved by a key rather than the pointer |

An element takes part only with `focusable: true`, and only while visible and enabled.

## MotionManager

`game.motion` from `motion.js`. The one place UI interpolates. Ticked by the engine loop outside the pause gate, so a menu over a frozen game still animates.

| Method | Meaning |
| --- | --- |
| `to(target, props, options)` | Animate numeric properties to new values. Returns a `Tween` |
| `from(target, props, options)` | Animate *from* given values to wherever the target already is — the usual shape of an entrance, since the resting layout stays the truth |
| `fromTo(target, from, to, options)` | Both ends explicit |
| `stagger(targets, props, options)` | The same animation across many targets, each delayed a little more. `stagger` is the per-target delay, `order: 'reverse'` flips it |
| `cancel(target, properties?)` | Stop tweens on a target, or just those writing the named properties |
| `finish(target)` | Jump every tween on a target to its end |
| `isAnimating(target)`, `activeCount` | |

| Option | Default | Meaning |
| --- | --- | --- |
| `duration` | `'$motion.duration.normal'` | Seconds, or a motion token |
| `delay` | `0` | Seconds, or a motion token |
| `easing` | `'$motion.easing.standard'` | A function, or a motion token naming one |
| `from` | the current values | Starting values |
| `onUpdate`, `onComplete` | | |

Starting a tween on a property that is already animating cancels the earlier one **for that property only**, so a fade taking over `opacity` leaves an entrance animating `offsetY` alone.

A `Tween` has `cancel()`, `finish()`, `whenComplete(fn)` (synchronous, unlike `then`) and `done`. It is thenable, so transitions can be awaited; it resolves with nothing, because resolving with the tween itself would make the promise adopt its own `then` and never settle. Cancelling resolves it too, so a waiter is never stranded.

A layout owns its children's offsets and overwrites them every frame, so animate `opacity`, `scale` and `rotation` on anything inside a `Stack` or `Grid` — not `offsetX`/`offsetY`. To move a laid-out group, animate the container.

## Screen transitions

A screen's `transition` names how it arrives and leaves. From `transitions.js`:

| Name | Effect |
| --- | --- |
| `'fade'` | Opacity. The default |
| `'slide-up'`, `'slide-down'` | Opacity and a 48-unit travel |
| `'scale'` | Opacity and a slight scale |
| `'none'` / `null` | Instant |

A custom `{enter, exit}` pair is accepted too; each takes `(screen, motion, timing)` and returns a tween or `null`. `TRANSITIONS` and `resolveTransition` are exported.

Entrances decelerate and exits accelerate, and exits are shorter — arriving things settle, leaving things get out of the way, and waiting for a menu you have already dismissed feels broken. Both read their timing from `$motion.duration.*` and `$motion.easing.*`.

Transitions only touch `opacity`, the offsets and `scale`, all of which `drawTree` applies to the whole subtree, so a screen moves as one piece and its contents keep the arrangement the author gave them. The resting values are the truth: an entrance animates *from* an offset back to the layout, so adding a transition can never change where a screen ends up.

A screen on its way out stays in `stack.exiting` — it still draws, beneath the live screens, but takes no input and is no longer `top`. `stack.isTransitioning` reports whether anything is still moving. Pushing a screen that is still leaving cancels its exit and brings it back.

## UIBackdrop

`new UIBackdrop(options)` from `backdrop.js`. The layered background a menu sits on, drawn back to front. Everything goes through the ordinary renderer contract, so it looks the same on both backends and needs no capability. Never a hit target.

| Option | Default | Meaning |
| --- | --- | --- |
| `gradient` | a wash from `$color.bg.base` | A gradient descriptor, a flat colour, or `{from, to, angle}` as shorthand. `null` for none |
| `image` | — | A still behind the gradient's transparency |
| `imageOpacity` | `1` | |
| `drift` | `true` | Slowly pan and zoom the image (a Ken Burns move) |
| `driftScale` | `1.08` | Baseline overscan. The pan is a fraction of the *current* overscan, so an edge can never come into view |
| `driftPeriod` | `24` | Seconds for one cycle |
| `motes` | `0` | Drifting particles, capped at 240 |
| `moteColor` | `'$color.text.accent'` | |
| `scanlines` | `0` | Opacity of a fine horizontal grille |
| `vignette` | `0` | Strength of the edge darkening |
| `seed` | `1` | Fixes the mote layout, so a menu looks the same every time it opens |

## Blurring the world behind a screen

`blurBehind` on a `UIScreen` defocuses the game beneath it. The world's post-effect pass runs between the world and screen passes, so the UI drawn over it stays sharp.

It needs the `postEffects` capability. WebGL2 has it; the Canvas backend does not and the screen's `scrim` carries the separation alone — a deliberate degradation, not an error. When screens stack, the strongest `blurBehind` wins, and other post effects already set (bloom, vignette) are left untouched.

## UIOptionRow

`new UIOptionRow(options)` from `optionRow.js`. A settings row: label on the left, current value on the right.

| Option | Default | Meaning |
| --- | --- | --- |
| `label` | `''` | |
| `value` | — | A function returning the current value as text. Read, not cached, so a setting changed elsewhere is reflected without telling the row |
| `onActivate` | — | Clicking, or Enter while focused |
| `height` | `40` | |
| `inset` | `'$space.md'` | Padding at each end |

## PerformanceStats

`new PerformanceStats(options)` from `performanceStats.js`. A themed readout on a surface.

| Option | Default | Meaning |
| --- | --- | --- |
| `expanded` | `false` | Collapsed is a pill with frame rate and frame time; expanded adds primitives, draw calls, per-call ratio, state changes, sprites, text and shapes |
| `graph` | `true` | Draw the frame-time trace when expanded |
| `visible` | `true` | |

`toggle()` switches between the two sizes, and so does **F3** (the `performanceStatsHotkey` engine option; `null` binds no key). The engine consumes that press, which also stops the browser opening its find bar. It lives in `game.ui.debug` as `game.stats`, above every screen and outside the scene's container, so switching scenes neither clears it nor hit-tests it. The frame rate is coloured against `$color.debug.good`, `warn` and `bad`. The engine adds one at the bottom-left unless the `performanceStats` engine option is `false`.

## Container

`scene.ui` from `container.js`. A `UIElement` whose box is the whole of UI space, and the root of a scene's tree. Everything it does beyond that is inherited — `add`, `hitTest`, `drawTree` and the rest are all `UIElement`'s. It is never itself a hit target.

## Theme tokens

`createTheme(overrides)` from `theme.js` builds the token tree. `game.theme` holds the game's; elements reach it by walking to the root, so replacing it restyles everything on the next frame.

Any string beginning with `$` is a dotted path into the tree, resolved wherever a colour, size, family, weight, radius, border width or shadow is accepted — including inside gradient stops. Anything else passes through, so a literal always works.

```javascript
new UIPanel({ background: '$color.surface.raised', cornerRadius: '$radius.lg' })
new UIPanel({ background: '#102030' })   // equally fine
```

| Group | Tokens |
| --- | --- |
| `color.palette` | The raw ramp: `ink.500`–`950`, `slate.50`–`400`, `cyan.200`–`600`, `green.400`, `amber.400`, `red.400` |
| `color.bg` | `base`, `scrim` |
| `color.surface` | `sunken`, `default`, `raised`, `hover`, `active`, `selected` |
| `color.border` | `subtle`, `default`, `strong`, `focus` |
| `color.text` | `primary`, `secondary`, `muted`, `inverse`, `accent` |
| `color.accent` | `default`, `hover`, `active`, `muted`, `contrast` |
| `color.status` | `success`, `warning`, `danger`, `info` |
| `color.debug` | `good`, `warn`, `bad`, `label`, `value`, `graph` |
| `font` | `family`, `mono`, `size.*`, `weight.*`, `style.*` |
| `font.size` | `display`, `title`, `heading`, `subheading`, `body`, `label`, `caption`, `micro` |
| `font.weight` | `thin`, `light`, `regular`, `medium`, `semibold`, `bold`, `black` |
| `font.tracking` | `tight`, `none`, `wide`, `wider`, `widest`. Letter spacing in UI units; `tight` is for large display type, which needs pulling in rather than opening up |
| `space` | `none`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl`, `xxxl` |
| `radius` | `none`, `sm`, `md`, `lg`, `xl`, `pill` |
| `border` | `hairline`, `thick` |
| `elevation` | `none`, `low`, `medium`, `high` |
| `motion` | `duration.*`, `easing.*` |
| `opacity` | `disabled`, `muted`, `full` |

Tokens may reference other tokens, which is how the semantic names are written in terms of the palette. Overriding one palette entry therefore moves everything built on it.

| Member | Meaning |
| --- | --- |
| `theme.get(path, fallback)` | Read a token by dotted path, without the `$` |
| `theme.resolve(value)` | Resolve a `$token`; anything else is returned unchanged |
| `theme.extend(overrides)` | A new theme layering further overrides |
| `resolveStateStyle(style, state)` | Flatten a declaration with per-state deltas |

## Typography

The engine ships [Exo](https://fonts.google.com/specimen/Exo) as a variable font covering weights 100–900 in upright and italic, so `fontWeight: '600'` is a real semibold rather than a synthesized one. `M2D.start()` awaits the load before the first frame, because the WebGL backend caches rasterized labels and one drawn in the fallback face would stay in it.

| Export | Meaning |
| --- | --- |
| `loadUIFonts()` | Loads the face. Memoized, and resolves (not rejects) when there is no document or the fetch fails |
| `uiFontsReady()` | Whether the face is available right now |
| `UI_FONT_FAMILY`, `UI_MONO_FAMILY` | The family stacks the default theme uses |

## SettingsMenu

`new SettingsMenu(game, options)` from `settingsMenu.js`. A `UIScreen` built from `UIOptionRow`s in a `Stack` inside a `UIPanel`. Constructing it registers the hotkey and sets `game.settings`; it shows nothing until opened. See [The settings menu](../guide/display#the-settings-menu).

| Member | Meaning |
| --- | --- |
| `open()`, `close()`, `toggle()` | Push and pop the screen |
| `isShowing` | Whether the screen is on the stack |
| `screen` | The `UIScreen`, built once and reused |
| `items()` | The row declarations: `{label, value, onActivate}` |
| `hotkey`, `resolutions`, `pauseWhenOpen` | The options as given |
| `destroy()` | Close, unsubscribe the hotkey and clear `game.settings` |

## WorldOverlay

`game.worldOverlay` from `worldOverlay.js`. See [The world overlay](../guide/display#the-world-overlay).

| Method | Meaning |
| --- | --- |
| `drawRect`, `drawArc`, `drawLine`, `drawPath`, `drawImage`, `drawSprite` | Renderer options in world coordinates and world sizes |
| `drawText(options)` | `x`, `y` in world coordinates. `offsetX`, `offsetY` and `fontSize` in UI units |

Submissions are cleared at the start of each world pass. At most 2000 per frame are kept, and the first overflow logs a warning. Text anchored more than 200 UI units outside the content area is skipped. Shapes are never skipped, only clipped.
