# Code style

The rules for code itself. What a game's code should contain is in [[idiomatic-m2d]]; the hard engine rules (physics, renderer and input boundaries, determinism, headless) are in `AGENTS.md`.

- **Readable over commented.** Write modular code that is easy to follow: small functions named for what they do, one job per module, obvious data shapes. Keep comments few. When code seems to need a comment to be understood, refactor it first: rename, extract a function, split a module, or turn a magic number into a named property. Comment only what code can't say: why an odd choice was made, an outside constraint, a trap.
- **Fixes come with a repro.** Pin a rendering fix with a small scene that reproduces it, rather than growing the showcase. Optional renderer features are declared through capabilities and aren't required of every backend.

Related: [[working-style]]
