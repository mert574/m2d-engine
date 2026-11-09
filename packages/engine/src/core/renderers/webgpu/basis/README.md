# Basis Universal transcoder (vendored)

`basis_transcoder.js` and `basis_transcoder.wasm` are Binomial LLC's
Basis Universal transcoder, Apache-2.0 (see
`LICENSES/Apache-2.0-basis_universal.txt` at the repository root). They
turn the KTX2 textures the model compiler writes into whichever
GPU-compressed format the adapter has (BC7, ASTC, ETC2), or RGBA8 as the
last resort. `basis.js` beside this directory is the engine's wrapper.

Taken from the build three.js ships, which is the widely-exercised one:

- Source: npm package `three@0.187.0`, `examples/jsm/libs/basis/`
- sha256 `basis_transcoder.js` (before the export footer):
  `8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1`
- sha256 `basis_transcoder.wasm`:
  `6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a`

The one local change: an `export default BASIS;` footer appended to the
`.js`, marked by a comment, so it imports as an ES module. To update,
copy both files from a newer three release, re-append the footer, and
refresh the checksums here.
