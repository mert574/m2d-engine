# Demo standards

The quality and art direction every example meets. How demos are coded is in [[idiomatic-m2d]].

- **The bar is native AAA, not the web.** Control and Portal 2 are the reference. Each game gets a scene that is its own.
- **Every demo is a showcase.** Nothing ships below Night Circuit's level of care. One careless demo (Ash Row's first version) undoes the others. Check every visual change with before/after screenshots on the real GPU ([[working-style]]).
- **New demos aim bright**: cozy, sunlit, distinctive. The set already leans nocturnal; don't add to that, and avoid cliché genre pastiches.
- **Menus are shipped game menus, each in its genre's convention.** Each is its own UI scene, and it differs from the others where its game does — composition, palette, type — never for the sake of differing. A brawler centres its title and choices, a racing game lists its events with the best time beside each, a terminal sets its type in monospace.
  - **Calm selection.** A bar, a band, an underline, brackets or a dot, with the label brightening. No shake or pulse on a hovered line.
  - **One straight column, row or centred stack.** No zig-zags, staggered grids or diagonal paths of items.
  - **Exact alignment.** Title, subtitle, items and hint share one edge or one centre line. A left- or right-aligned `menuItem` sets its label 13 in from its edge (its bar's margin), so the item sits 13 outside the edge the type shares.
  - **Not AI-looking, and not the "Claude" look.** No cream or parchment panels, no terracotta or burnt-orange accents, no italic storybook serif. One accent per game, taken from its art.
  - (14 Nov 2026: the first phase 4 menus — a zig-zag grid, items that shook and dropped in, a parchment page, orange accents — were rejected as indie-level and AI-looking.)
- **Assets are free and open**: OpenGameArt, ambientCG, Kenney, Poly Haven, under CC0 or CC BY. They are credited in `THIRD_PARTY_NOTICES.md` and enter as recipes, never as bytes. Art is never generated in scripts; the showcase's stress test is the one exception. In wording, say "free" or "open" and "released under CC0", never "licensed assets".

Related: [[3d]] for the asset library
