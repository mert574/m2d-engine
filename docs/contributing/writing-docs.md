# Writing documentation

Documentation lives in `docs/` and nowhere else. The README, the agent notes and the contributing file at the repository root point here. When a change alters behaviour, update the page that describes it in the same change.

## Structure

| Section | Holds |
| --- | --- |
| Guide | How to use each system, with short examples. One page per system |
| Reference | Every option, method and field, in tables. No narrative |
| Contributing | How the engine is built and tested, and how to change it |

Put the reasons behind a design decision in [Architecture](./architecture), and only when they constrain future changes. Guide and reference pages say what a thing does and how to use it.

## Style

Write for someone who knows how to program and has not read the rest of the site.

- Say what a thing does, how to call it and show one example. Stop there.
- Use short declarative sentences. One idea per sentence.
- Use tables for options, parameters and fields.
- Name the default for every option.
- Use the API's spelling. The code says `color`, so the documentation says color.
- Give units. Pixels, seconds, radians, px/s.
- Headings name the subject. "Body types", not "Physics that speaks pixels".
- Do not use em dashes. Use a comma, a period or parentheses.
- Do not use the serial comma. Write "a, b and c".
- Do not frame a point as a contrast. "X does Y" is enough. Avoid "not X, but Y", "X rather than Y" and "X, not Y" unless the reader would otherwise assume the wrong thing.
- Do not add asides. Avoid "that's all", "worth knowing", "the point is", "in other words".
- Do not sell. Avoid "powerful", "seamless", "simple", "just".
- Do not justify inline. If a design choice needs a reason, give it one sentence or move it to Architecture.
- Do not open a bullet with a bold phrase and a colon unless the list is a glossary.
- Keep code identifiers out of prose where a plain word works. "Set the body type" reads better than "set `body.bodyType`" when the code sample shows it anyway.

Example. Before:

> **Click fires on release**, and needs the press and release on the same target — so sliding off a button cancels it.

After:

> A click fires on release, and only when the press and the release land on the same target. Releasing somewhere else cancels it.

## Embedding a demo

Guide pages can run the engine inline. A demo is a module in `docs/demos/` that exports a default async function taking a canvas and resolving to the running `M2D` instance.

```js
// docs/demos/example.js
export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, performanceStats: false });
  // register actors and scenes
  await game.start();
  return game;
}
```

Place it in a page with the `Demo` component. The slot is the caption. An `aspect` prop sets the canvas aspect ratio and defaults to `16 / 9`. The component shows a loading line until the module resolves, and the error message if the module is missing or throws.

```md
<Demo name="example">
What the reader is looking at, and what they can do with it.
</Demo>
```

Show the source with a snippet import so the code on the page is the code that runs. Put it under a `## Demo source` heading at the end of the page, or inline where the page walks through the code.

```md
<<< @/demos/example.js
```

A demo that spans several files lives in `docs/demos/<name>/` with a `main.js` entry, and `<Demo name="<name>">` finds it. The first-game walkthrough is one.

Rules for demo modules:

- Leave `pointerLock` off. A page must not capture the pointer.
- Pass `performanceStats: false` unless the readout is the point.
- Draw with primitives or build textures at runtime. Image files are not committed.
- Keep it under about 150 lines. A demo illustrates one page.
- Prefer pointer input. The canvas receives keys only after it is clicked, and touch readers have no keyboard. A demo that needs keys says so in its caption.
- Keep it running unattended. Anything the reader can remove or use up should come back on its own.

The component pauses the game while it is scrolled out of view and destroys it when the reader leaves the page. While it runs, the instance is reachable from the browser console as the canvas element's `m2d` property. The component itself is `docs/.vitepress/theme/Demo.vue`.

## Previewing

```bash
npm run docs:dev
```

Run `npm run build:docs` before opening a change. The build fails on dead links.
