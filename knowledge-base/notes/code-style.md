# Code style

The rules for code itself. What a game's code should contain is in [[idiomatic-m2d]]; the hard engine rules (physics, renderer and input boundaries, determinism, headless) are in `AGENTS.md`.

- **Readable over commented.** Write modular code that is easy to follow: small functions named for what they do, one job per module, obvious data shapes. Keep comments few. When code seems to need a comment to be understood, refactor it first: rename, extract a function, split a module, or turn a magic number into a named property. Comment only what code can't say: why an odd choice was made, an outside constraint, a trap.
- **A lifecycle override calls its super.** An actor's `fixedUpdate`, `update` and `draw` tick and draw its constraints; an override that forgets `super` silently stops them, and the actor keeps working until the day it attaches one.
- **A field that names another thing is refused when it names nothing.** A rule's counter, a gravity binding's, an asset-reference property: the loader cross-checks the name so a typo fails at load with its path, rather than becoming behaviour that quietly never happens. A new field that names something adds its check in the same change — and so does a combination that cannot work, such as bounds on a tally nothing sets.
- **Don't shadow a built-in name.** `registerActor('Platform', Hedge)` hides the engine's actor of that name from every scene in the game. A game's own class registers under its own name; `core/builtins.js` is the list to check against.
- **State added to a long-lived object says what clears it.** A cache or counter hung on `Scene` (the ids `spawnPrefab` hands out, a lazily built lookup) is cleared where the scene unloads, or it leaks into the next one.
- **After splitting a module, chase the constants across the seam.** A conversion that moves drawing out of a page copies numbers with it: three wing hearts in the actor and another three in the HUD, a world size in the definition and in the scene, a scene id the builder emits and the headless entry looks up. One of the two is the source; the other reads it, or finds the thing by what it is.
- **An edit writes back only what it knows.** A tool that sets a whole object from what the pointer gave (a path point from `{x, y}`) erases the fields a game hangs on it; merge into the document's value instead. Night Circuit's road lost its widths this way and grew a wall across the start line.
- **Machine-local art is addressed by shape, and the seeder enforces it.** A scene that names frames of an ignored, built file must match what the seeder builds, and the seeder rebuilds a file of another shape rather than trusting whatever sits there.
- **Fixes come with a repro.** Pin a rendering fix with a small scene that reproduces it, rather than growing the showcase. Optional renderer features are declared through capabilities and aren't required of every backend.

Related: [[working-style]]
