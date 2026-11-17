# Upscaling

Goal: render below the output size and resolve to full quality, for frame rate on weak GPUs and at high resolutions. Roadmap line: "Temporal upscaling".

## Decisions

- **The FSR 3 series, not 2** (owner, 17 Nov 2026). Which implementation, an existing web port or our own port of AMD's MIT source, is chosen by comparison. Today's TAA stage already has the jitter, velocity and history it needs.
- **Vendor `@pmndrs/upscaler`'s WGSL, not the package** (MIT, 0.5.0, crediting AMD's MIT licence). Its eleven compute passes are plain WGSL on a raw device; three.js is only its integration layer (a peer dependency we do not take). It follows FSR 3.1.5's pass graph but ships a simplified path, by measurement: its source-faithful graphs cost 36 to 76% more GPU time for under 4% RMSE (`docs/research/PARITY.md`). AMD's FSR 3.1.5 source is the reference for checking each pass; a port of it from scratch only if our scenes show that simplification hurts.
- **No frame generation** (17 Nov 2026). WebGPU has no swap-chain or present-timing control (a canvas presents once per animation frame, on the compositor's timing), interpolation adds at least a frame of input latency with no web counterpart to Anti-Lag, and the only web implementation found interpolates video. Revisit if gpuweb ships presentation timing or interpolator primitives (gpuweb issue 11088).
- FSR 4 is machine-learned and needs ML hardware: not portable.

## Plan

**0. Investigation.** Done 17 Nov 2026 (the decisions above).

What the port has to settle, from reading `post.js` against FSR's inputs:
- render without MSAA when upscaling: FSR is the anti-aliaser, and the vendored passes take no MSAA input;
- the jitter sequence becomes Halton with 8·ratio² phases, from today's `frame.jitter`;
- depth: feed our linear depth (`normalDepth.w`) or convert to device depth;
- velocity: check its sign and units against FSR's convention and motion-vector scale;
- exposure: auto exposure runs after TAA today, so feed last frame's value or use the upscaler's own;
- reactive and transparency masks for particles and blended surfaces (none today);
- AO and resolve stay at render resolution; depth of field, motion blur, bloom and the composite move to display resolution;
- the mip bias follows the scale ratio.
The upscaler replaces stage 3 (TAA); at ratio 1 it can run at native resolution or the TAA stays.

## Backlog

## Record

Related: [[3d]]
