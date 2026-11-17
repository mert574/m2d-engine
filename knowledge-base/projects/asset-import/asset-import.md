# Asset import

Goal: people bring their own 3D models and 2D art into a project easily. Roadmap line: "Asset import".

## Decisions

- **Asset importers, not map importers** (owner, 17 Nov 2026): the editor stays the way levels are made.
- Imports land as manifest assets through the existing compiler (quality levels, KTX2), so an imported model is the same as a fetched one ([[3d]]).

## Plan

**0. Investigation.** Done; see the record.

**Open before planning:** sprite sheets are equal frames on a grid (`docs/guide/sprites.md`), while Aseprite and TexturePacker sheets are trimmed, rotated and variable-sized. Either importers repack into a grid, or sheets learn per-frame rectangles. Decide first; it shapes every 2D importer.

## Record

- Investigation, 17 Nov 2026. The compiler (`packages/editor-host/src/pipeline/compile.mjs`, gltf-transform, meshoptimizer, sharp, the Basis encoder) takes glTF and GLB only, so every 3D importer only has to reach glTF. Picks per format:
  - **glTF/GLB:** gltf-transform as now.
  - **OBJ and MTL:** `obj2gltf` (Cesium, Apache-2.0), in the host: the most faithful MTL to PBR.
  - **FBX, DAE, STL, PLY, 3DS:** assimp through WebAssembly (`@taucad/assimpjs`, MIT over BSD-3 assimp; the original `assimpjs` is stale since 2023). Its FBX materials and animation are to be tested on our own models before relying on it. Longer term for FBX: `ufbx` (MIT, the reader in Blender and Godot) compiled to WebAssembly with our own glTF writer.
  - **USD and USDZ:** experimental only; `@openusd-wasm` (MIT, 0.0.x) through a glTF export in the editor, or Blender when installed.
  - **.blend:** Blender headless, only as an external tool the user installed (GPL: never bundled). Also the fallback for anything the others import badly.
  - **Aseprite:** `ase-parser` (MIT, no dependencies), layers composited with sharp; the Aseprite CLI when the user owns it.
  - **TexturePacker and similar JSON:** our own parser, a hundred lines.
  - **Packing loose frames:** `maxrects-packer` (MIT) with sharp.
  - **PSD:** `ag-psd` (MIT, very active).
  - **Not taken:** FBX2glTF (bundles Autodesk's proprietary FBX SDK, unmaintained); Needle's USD (non-commercial licence); Spine (proprietary runtime licence); DragonBones (abandoned); `free-tex-packer-core` (pulls Jimp beside sharp).

Related: [[3d]], [[editor]]
