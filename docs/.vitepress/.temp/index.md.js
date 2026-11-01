import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"","description":"","frontmatter":{"layout":"home","hero":{"name":"M2D Engine","text":"A lightweight 2D game engine","tagline":"Rapier 2D physics, batched WebGL2 rendering with a Canvas 2D fallback, JSON scenes, and one input API for keyboard, mouse, touch and pen.","actions":[{"theme":"brand","text":"Get Started","link":"/guide/getting-started"},{"theme":"alt","text":"Play the Demos","link":"https://mert574.github.io/m2d-engine/examples/"}]},"features":[{"title":"Physics that speaks pixels","details":"Fixed-timestep simulation on Rapier 2D (WASM) behind a solver-agnostic contract — velocities in px/s, gravity in px/s², with render interpolation and continuous collision detection for fast movers."},{"title":"Two renderers, one contract","details":"A batched WebGL2 backend and a Canvas 2D fallback validated by the same conformance suite. Optional capabilities (tint, particles, lights, post effects) degrade gracefully."},{"title":"Strictly validated scenes","details":"Levels and menus are JSON with prefabs, layers and per-object properties. Every cross-reference is checked on load, and a malformed scene fails with the exact path to the offending field."},{"title":"Input without the plumbing","details":"Pointer Events as the single source — clicks, drags, pinch, scroll and hover with world and UI coordinates on every event, plus layout-independent keyboard handling."},{"title":"Resolution done right","details":"View, world-render and UI resolutions are independent. Lower the render resolution for performance without changing how much world is visible or blurring the HUD."},{"title":"Batteries included","details":"Camera follow with bounds, sprite animation, sound, a screen-space UI system, a world overlay for crisp annotations, a debug overlay, and a ready-made settings menu."}]},"headers":[],"relativePath":"index.md","filePath":"index.md"}');
const _sfc_main = { name: "index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
