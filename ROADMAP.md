# M2D Engine roadmap

The engine already has a renderer interface, a Canvas backend, scenes, entities
and constraints, a camera, a UI layer, and playable examples. Renderer abstraction
is existing work; a working WebGL backend is the next rendering milestone.

These are proposed development slices. Confirm scope against the current
implementation before starting.

## Next priorities

| Work | Done when |
| --- | --- |
| WebGL renderer | Sprite, rectangle, text, camera, and UI behavior match the Canvas backend for the supported examples; unsupported operations have explicit fallbacks and clear errors. |
| Renderer comparison harness | Deterministic scenes can run through both backends; checks cover camera transforms, clipping, resize, and asset readiness; frame-time summaries use the same workload. |
| Fullscreen and resize lifecycle | Enter/exit and repeated resizes preserve aspect ratio, camera coordinates, input mapping, and UI hit testing. |
| Public extension guide | A minimal example demonstrates a new actor, constraint, scene, and renderer; the documented commands work from a fresh checkout. |

Keep a small reproducible scene with each rendering fix rather than relying
on one large demo.

## Later

- Particle effects and tilemap tooling.
- More reusable UI components, actors, and constraints.
- Evaluate networking only after simulation timing and renderer behavior are
  stable; multiplayer is not part of the first milestone.

## Example quality

Keep demos runnable from a fresh checkout.
Record asset origins and license notices alongside any new assets.
